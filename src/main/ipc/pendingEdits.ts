import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import {
  acceptPendingEdit,
  clearPendingEdits,
  listPendingEdits,
  patchPendingEditNewString,
  rejectPendingEdit,
} from '../features/pendingEdits';

export function registerPendingEditsIpc(): void {
  ipcMain.handle(IpcChannels.PendingEdits.List, (_event, docFilename: unknown) => {
    if (typeof docFilename !== 'string' || docFilename.trim().length === 0) {
      throw new Error('docFilename must be a non-empty string.');
    }
    return listPendingEdits(docFilename.trim());
  });
  ipcMain.handle(IpcChannels.PendingEdits.Accept, async (_event, id: unknown, override: unknown) => {
    if (typeof id !== 'string') throw new Error('Pending edit id must be a string.');
    const overrideStr = typeof override === 'string' ? override : undefined;
    await acceptPendingEdit(id, overrideStr);
  });
  ipcMain.handle(IpcChannels.PendingEdits.Reject, async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Pending edit id must be a string.');
    await rejectPendingEdit(id);
  });
  ipcMain.handle(
    IpcChannels.PendingEdits.Patch,
    async (_event, docFilename: unknown, id: unknown, newString: unknown) => {
      if (typeof docFilename !== 'string' || docFilename.trim().length === 0) {
        throw new Error('docFilename must be a non-empty string.');
      }
      if (typeof id !== 'string') throw new Error('Pending edit id must be a string.');
      if (typeof newString !== 'string') throw new Error('newString must be a string.');
      await patchPendingEditNewString(docFilename.trim(), id, newString);
    },
  );
  ipcMain.handle(IpcChannels.PendingEdits.Clear, async (_event, docFilename: unknown) => {
    if (typeof docFilename !== 'string' || docFilename.trim().length === 0) {
      throw new Error('docFilename must be a non-empty string.');
    }
    await clearPendingEdits(docFilename.trim());
  });
}
