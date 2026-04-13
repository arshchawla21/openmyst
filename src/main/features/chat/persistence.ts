import { promises as fs } from 'node:fs';
import type { ChatMessage } from '@shared/types';
import { projectPath } from '../../platform';

/**
 * Chat history persistence — JSONL append-only, one message per line, stored
 * at the project root as `chat.jsonl`. The file is small enough (a few KB per
 * turn) that a full read on every turn is fine; we're not optimizing here.
 */

const CHAT_FILE = 'chat.jsonl';

export async function loadHistory(): Promise<ChatMessage[]> {
  let raw: string;
  try {
    raw = await fs.readFile(projectPath(CHAT_FILE), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  if (!raw.trim()) return [];
  return raw
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as ChatMessage);
}

export async function appendMessage(msg: ChatMessage): Promise<void> {
  await fs.appendFile(projectPath(CHAT_FILE), JSON.stringify(msg) + '\n', 'utf-8');
}

export async function clearHistory(): Promise<void> {
  await fs.writeFile(projectPath(CHAT_FILE), '', 'utf-8');
}
