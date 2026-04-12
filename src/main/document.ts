import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getCurrentProject } from './projects';

function documentPath(): string {
  const project = getCurrentProject();
  if (!project) throw new Error('No project is open.');
  return join(project.path, 'document.md');
}

export async function readDocument(): Promise<string> {
  const path = documentPath();
  try {
    return await fs.readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw err;
  }
}

export async function writeDocument(content: string): Promise<void> {
  const path = documentPath();
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, path);
}
