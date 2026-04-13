import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { PendingEdit } from '@shared/types';
import { getCurrentProject } from './projects';
import { readDocument, writeDocument } from './document';
import { applyEditOccurrence, applyEditOccurrenceFuzzy, mergePendingEdits } from './editLogic';
import { log, logError } from './log';

function projectRoot(): string {
  const project = getCurrentProject();
  if (!project) throw new Error('No project is open.');
  return project.path;
}

function pendingPath(docFilename: string): string {
  return join(projectRoot(), '.myst', 'pending', `${docFilename}.json`);
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

async function readPending(docFilename: string): Promise<PendingEdit[]> {
  const path = pendingPath(docFilename);
  try {
    const raw = await fs.readFile(path, 'utf-8');
    return JSON.parse(raw) as PendingEdit[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writePending(docFilename: string, edits: PendingEdit[]): Promise<void> {
  const path = pendingPath(docFilename);
  await ensureDir(join(projectRoot(), '.myst', 'pending'));
  await fs.writeFile(path, JSON.stringify(edits, null, 2), 'utf-8');
}

function notifyChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.PendingEdits.Changed);
  }
}

function notifyDocumentChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.Document.Changed);
  }
}

export async function listPendingEdits(docFilename: string): Promise<PendingEdit[]> {
  return readPending(docFilename);
}

export async function addPendingEdits(
  docFilename: string,
  edits: Array<{ oldString: string; newString: string; occurrence?: number }>,
): Promise<void> {
  if (edits.length === 0) return;
  log('pending', 'add.request', {
    doc: docFilename,
    incomingCount: edits.length,
    previews: edits.map((e) => ({
      oldPreview: e.oldString.slice(0, 60),
      newPreview: e.newString.slice(0, 60),
      occ: e.occurrence ?? 1,
    })),
  });
  const existing = await readPending(docFilename);
  const batchId = randomUUID();
  const batchTotal = edits.length;
  const now = new Date().toISOString();

  const incoming = edits.map((e, idx) => ({
    oldString: e.oldString,
    newString: e.newString,
    occurrence: e.occurrence ?? 1,
    _idx: idx,
  }));

  const combined = mergePendingEdits(existing, incoming, (inc) => ({
    id: randomUUID(),
    docFilename,
    oldString: inc.oldString,
    newString: inc.newString,
    occurrence: inc.occurrence,
    createdAt: now,
    batchId,
    batchIndex: inc._idx + 1,
    batchTotal,
  }));

  await writePending(docFilename, combined);
  log('pending', 'add.committed', {
    doc: docFilename,
    existingCount: existing.length,
    combinedCount: combined.length,
    replacedInPlace: existing.length + edits.length - combined.length,
  });
  notifyChanged();
}

async function findPendingById(id: string): Promise<{ edit: PendingEdit; docFilename: string } | null> {
  const pendingDir = join(projectRoot(), '.myst', 'pending');
  let entries: string[];
  try {
    entries = await fs.readdir(pendingDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const docFilename = entry.replace(/\.json$/, '');
    const edits = await readPending(docFilename);
    const edit = edits.find((e) => e.id === id);
    if (edit) return { edit, docFilename };
  }
  return null;
}

export async function acceptPendingEdit(id: string, overrideNewString?: string): Promise<void> {
  log('pending', 'accept.request', { id, hasOverride: overrideNewString !== undefined });
  const found = await findPendingById(id);
  if (!found) {
    logError('pending', 'accept.notFound', new Error('pending edit not found'), { id });
    throw new Error(`Pending edit ${id} not found.`);
  }
  const { edit, docFilename } = found;

  const effectiveNewString = overrideNewString ?? edit.newString;
  const doc = await readDocument(docFilename);
  log('pending', 'accept.applying', {
    id,
    doc: docFilename,
    oldStringPreview: edit.oldString.slice(0, 120),
    occurrence: edit.occurrence,
    docChars: doc.length,
    oldStringInDoc: edit.oldString === '' ? 'append' : doc.includes(edit.oldString),
  });
  let newDoc = applyEditOccurrence(doc, edit.oldString, effectiveNewString, edit.occurrence);
  if (newDoc === null) {
    // Exact match failed — try whitespace-tolerant fallback. Handles the most
    // common failure mode: LLM's old_string has subtly different whitespace
    // (space vs newline, single vs double space) than the on-disk markdown.
    const fuzzy = applyEditOccurrenceFuzzy(doc, edit.oldString, effectiveNewString, edit.occurrence);
    if (fuzzy !== null) {
      log('pending', 'accept.fuzzyMatch', {
        id,
        doc: docFilename,
        oldStringPreview: edit.oldString.slice(0, 120),
      });
      newDoc = fuzzy;
    }
  }
  if (newDoc === null) {
    // Dump enough context to diagnose a mismatch without flooding the log.
    const oldStr = edit.oldString;
    const firstLine = oldStr.split('\n')[0] ?? '';
    const firstWordHit = firstLine.length > 0 ? doc.indexOf(firstLine.slice(0, 20)) : -1;
    logError(
      'pending',
      'accept.notLocated',
      new Error('applyEditOccurrence returned null'),
      {
        id,
        doc: docFilename,
        docLen: doc.length,
        oldStringLen: oldStr.length,
        oldStringFull: oldStr,
        occurrence: edit.occurrence,
        firstLineFuzzyHitAt: firstWordHit,
        docHead: doc.slice(0, 200),
        docTail: doc.slice(-200),
      },
    );
    throw new Error('Could not locate the original text to apply this edit. Reject it and ask the LLM to retry.');
  }
  await writeDocument(docFilename, newDoc);
  log('pending', 'accept.written', { id, doc: docFilename, newDocChars: newDoc.length });
  notifyDocumentChanged();

  const remaining = (await readPending(docFilename)).filter((e) => e.id !== id);
  await writePending(docFilename, remaining);
  log('pending', 'accept.cleared', { id, remainingCount: remaining.length });
  notifyChanged();
}

export async function rejectPendingEdit(id: string): Promise<void> {
  log('pending', 'reject.request', { id });
  const found = await findPendingById(id);
  if (!found) {
    log('pending', 'reject.notFound', { id });
    return;
  }
  const { docFilename } = found;
  const remaining = (await readPending(docFilename)).filter((e) => e.id !== id);
  await writePending(docFilename, remaining);
  log('pending', 'reject.cleared', { id, remainingCount: remaining.length });
  notifyChanged();
}

export async function patchPendingEditNewString(
  docFilename: string,
  id: string,
  newString: string,
): Promise<void> {
  log('pending', 'patch.request', {
    doc: docFilename,
    id,
    newLen: newString.length,
    newPreview: newString.slice(0, 120),
  });
  const edits = await readPending(docFilename);
  const idx = edits.findIndex((e) => e.id === id);
  if (idx === -1) {
    log('pending', 'patch.notFound', { id });
    return;
  }
  edits[idx] = { ...edits[idx]!, newString };
  await writePending(docFilename, edits);
  log('pending', 'patch.committed', { id, total: edits.length });
  notifyChanged();
}

export async function clearPendingEdits(docFilename: string): Promise<void> {
  await writePending(docFilename, []);
  notifyChanged();
}

export async function countPendingForDoc(docFilename: string): Promise<number> {
  const edits = await readPending(docFilename);
  return edits.length;
}
