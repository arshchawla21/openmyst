import { BrowserWindow } from 'electron';

/**
 * Broadcast a message to every open renderer window. Used for
 * "something changed, refresh your UI" notifications — e.g. new sources
 * ingested, pending edits updated, document rewritten on disk.
 *
 * Channel names live in `src/shared/ipc-channels.ts`; pass one of the
 * `*.Changed` constants here.
 */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args);
  }
}
