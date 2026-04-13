import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import { createComment, deleteComment, listComments } from '../features/comments';

export function registerCommentsIpc(): void {
  ipcMain.handle(IpcChannels.Comments.List, (_event, docFilename: unknown) => {
    if (typeof docFilename !== 'string' || docFilename.trim().length === 0) {
      throw new Error('docFilename must be a non-empty string.');
    }
    return listComments(docFilename.trim());
  });
  ipcMain.handle(
    IpcChannels.Comments.Create,
    async (_event, docFilename: unknown, data: unknown) => {
      if (typeof docFilename !== 'string' || docFilename.trim().length === 0) {
        throw new Error('docFilename must be a non-empty string.');
      }
      const d = data as {
        text?: string;
        contextBefore?: string;
        contextAfter?: string;
        message?: string;
      };
      if (!d || typeof d.text !== 'string' || typeof d.message !== 'string') {
        throw new Error('Invalid comment data.');
      }
      return createComment(docFilename.trim(), {
        text: d.text,
        contextBefore: d.contextBefore ?? '',
        contextAfter: d.contextAfter ?? '',
        message: d.message,
      });
    },
  );
  ipcMain.handle(IpcChannels.Comments.Delete, async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Comment id must be a string.');
    await deleteComment(id);
  });
}
