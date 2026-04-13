/**
 * Tiny namespaced logger for the main process. Shows up in the terminal
 * where `npm run dev` is running. Set `MYST_LOG=off` to silence.
 *
 * Usage:
 *   log('chat', 'received', { doc: 'notes.md', userText: '...' });
 *   logError('pending', 'accept.failed', err, { id });
 *
 * Scopes are free-form — pick one per feature folder. The current conventions:
 *   chat · pending · sources · wiki · projects · comments · llm
 *
 * Every logged line is also kept in an in-memory ring buffer so the bug
 * report feature can attach recent activity to a GitHub issue without the
 * user having to copy-paste from the terminal. The buffer is capped so it
 * can't grow unbounded in a long-running session.
 */

const enabled = process.env['MYST_LOG'] !== 'off';
const MAX_STRING = 600;
const RING_CAPACITY = 500;

interface LogEntry {
  time: string;
  scope: string;
  event: string;
  message: string;
}

const ring: LogEntry[] = [];

function remember(scope: string, event: string, message: string): void {
  ring.push({ time: new Date().toISOString(), scope, event, message });
  if (ring.length > RING_CAPACITY) ring.shift();
}

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
  const head = `[${ts()}] [myst:${scope}] ${event}`;
  let line: string;
  if (!data || Object.keys(data).length === 0) {
    line = head;
  } else {
    const pairs = Object.entries(data).map(([k, v]) => `${k}=${fmtValue(v)}`);
    line = head + ' ' + pairs.join(' ');
  }
  remember(scope, event, line);
  if (enabled) console.log(line);
}

export function logError(
  scope: string,
  event: string,
  err: unknown,
  data?: Record<string, unknown>,
): void {
  const head = `[${ts()}] [myst:${scope}] ✗ ${event}`;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const pairs = [`error=${JSON.stringify(message)}`];
  if (data) {
    for (const [k, v] of Object.entries(data)) pairs.push(`${k}=${fmtValue(v)}`);
  }
  const line = head + ' ' + pairs.join(' ');
  const full = stack ? line + '\n' + stack : line;
  remember(scope, event, full);
  if (enabled) {
    console.log(line);
    if (stack) console.log(stack);
  }
}

/**
 * Record a log line that came from the renderer process. Used by the bug
 * report feature so unhandled React errors and `window.onerror` events from
 * the UI end up in the same ring buffer as main-process activity.
 */
export function logFromRenderer(scope: string, event: string, message: string): void {
  const line = `[${ts()}] [myst:${scope}:renderer] ${event} ${message}`;
  remember(scope, event, line);
  if (enabled) console.log(line);
}

/**
 * Snapshot of the ring buffer, oldest first. Returns a copy — callers may
 * mutate it without affecting subsequent calls.
 */
export function getRecentLogs(): LogEntry[] {
  return ring.slice();
}

/**
 * Render the ring buffer as a single newline-joined string. Used by the
 * bug report feature to embed logs into the GitHub issue body.
 */
export function getRecentLogsText(): string {
  return ring.map((e) => e.message).join('\n');
}

export type { LogEntry };
