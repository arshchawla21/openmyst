/**
 * Tiny namespaced logger for the main process. Shows up in the terminal
 * where `npm run dev` is running. Set MYST_LOG=off to silence.
 *
 * Usage:
 *   log('chat', 'received', { doc: 'notes.md', userText: '...' });
 *   log('pending', 'accept', { id: 'abc-123' });
 */

const enabled = process.env['MYST_LOG'] !== 'off';
const MAX_STRING = 600;

function fmtValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') {
    if (v.length > MAX_STRING) {
      return JSON.stringify(v.slice(0, MAX_STRING)) + `…[+${v.length - MAX_STRING}ch]`;
    }
    return JSON.stringify(v);
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    if (s.length > MAX_STRING) return s.slice(0, MAX_STRING) + `…[+${s.length - MAX_STRING}ch]`;
    return s;
  } catch {
    return String(v);
  }
}

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

export function log(scope: string, event: string, data?: Record<string, unknown>): void {
  if (!enabled) return;
  const head = `[${ts()}] [myst:${scope}] ${event}`;
  if (!data || Object.keys(data).length === 0) {
    console.log(head);
    return;
  }
  const pairs = Object.entries(data).map(([k, v]) => `${k}=${fmtValue(v)}`);
  console.log(head + ' ' + pairs.join(' '));
}

export function logError(scope: string, event: string, err: unknown, data?: Record<string, unknown>): void {
  if (!enabled) return;
  const head = `[${ts()}] [myst:${scope}] ✗ ${event}`;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const pairs = [`error=${JSON.stringify(message)}`];
  if (data) {
    for (const [k, v] of Object.entries(data)) pairs.push(`${k}=${fmtValue(v)}`);
  }
  console.log(head + ' ' + pairs.join(' '));
  if (stack) console.log(stack);
}
