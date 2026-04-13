import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { IpcChannels } from '@shared/ipc-channels';
import type { Comment } from '@shared/types';
import { projectPath, ensureDir, broadcast } from '../../platform';

/**
 * Inline comments that anchor to a span of document text. Stored per-document
 * at `.myst/comments/<doc>.json`. Not to be confused with pending edits, which
 * are a separate machine-managed artefact.
 *
 * Anchoring is intentionally dumb: we store the selected text + a short
 * context window (contextBefore / contextAfter). On render, the UI locates
 * the span by string match. If the text has been rewritten, the comment is
 * marked orphaned client-side — this module doesn't know or care.
 */

function commentsPath(docFilename: string): string {
  return projectPath('.myst', 'comments', `${docFilename}.json`);
}

async function readComments(docFilename: string): Promise<Comment[]> {
  try {
    const raw = await fs.readFile(commentsPath(docFilename), 'utf-8');
    return JSON.parse(raw) as Comment[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeComments(docFilename: string, comments: Comment[]): Promise<void> {
  await ensureDir(projectPath('.myst', 'comments'));
  await fs.writeFile(commentsPath(docFilename), JSON.stringify(comments, null, 2), 'utf-8');
}

function notifyChanged(): void {
  broadcast(IpcChannels.Comments.Changed);
}

export async function listComments(docFilename: string): Promise<Comment[]> {
  return readComments(docFilename);
}

export async function createComment(
  docFilename: string,
  data: { text: string; contextBefore: string; contextAfter: string; message: string },
): Promise<Comment> {
  const comments = await readComments(docFilename);
  const comment: Comment = {
    id: randomUUID(),
    docFilename,
    text: data.text,
    contextBefore: data.contextBefore,
    contextAfter: data.contextAfter,
    message: data.message,
    createdAt: new Date().toISOString(),
  };
  comments.push(comment);
  await writeComments(docFilename, comments);
  notifyChanged();
  return comment;
}

async function findCommentDocFile(id: string): Promise<string | null> {
  const commentsDir = projectPath('.myst', 'comments');
  let entries: string[];
  try {
    entries = await fs.readdir(commentsDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const docFilename = entry.replace(/\.json$/, '');
    const comments = await readComments(docFilename);
    if (comments.some((c) => c.id === id)) return docFilename;
  }
  return null;
}

export async function deleteComment(id: string): Promise<void> {
  const docFilename = await findCommentDocFile(id);
  if (!docFilename) return;
  const comments = await readComments(docFilename);
  await writeComments(docFilename, comments.filter((c) => c.id !== id));
  notifyChanged();
}
