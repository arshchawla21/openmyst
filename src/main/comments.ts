import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { Comment } from '@shared/types';
import { getCurrentProject } from './projects';

function projectRoot(): string {
  const project = getCurrentProject();
  if (!project) throw new Error('No project is open.');
  return project.path;
}

function commentsPath(docFilename: string): string {
  return join(projectRoot(), '.myst', 'comments', `${docFilename}.json`);
}

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

async function readComments(docFilename: string): Promise<Comment[]> {
  const path = commentsPath(docFilename);
  try {
    const raw = await fs.readFile(path, 'utf-8');
    return JSON.parse(raw) as Comment[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeComments(docFilename: string, comments: Comment[]): Promise<void> {
  const path = commentsPath(docFilename);
  await ensureDir(join(projectRoot(), '.myst', 'comments'));
  await fs.writeFile(path, JSON.stringify(comments, null, 2), 'utf-8');
}

function notifyChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.Comments.Changed);
  }
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
  const commentsDir = join(projectRoot(), '.myst', 'comments');
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
