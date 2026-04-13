import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import {
  createDocument,
  deleteDocument,
  listDocuments,
  readDocument,
  writeDocument,
} from '../features/documents';

export function registerDocumentsIpc(): void {
  ipcMain.handle(IpcChannels.Document.Read, (_event, filename: unknown) => {
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      throw new Error('Filename must be a non-empty string.');
    }
    return readDocument(filename.trim());
  });
  ipcMain.handle(IpcChannels.Document.Write, async (_event, filename: unknown, content: unknown) => {
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      throw new Error('Filename must be a non-empty string.');
    }
    if (typeof content !== 'string') {
      throw new Error('Document content must be a string.');
    }
    await writeDocument(filename.trim(), content);
  });

  ipcMain.handle(IpcChannels.Documents.List, () => listDocuments());
  ipcMain.handle(IpcChannels.Documents.Create, async (_event, name: unknown) => {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Document name must be a non-empty string.');
    }
    return createDocument(name.trim());
  });
  ipcMain.handle(IpcChannels.Documents.Delete, async (_event, filename: unknown) => {
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      throw new Error('Filename must be a non-empty string.');
    }
    await deleteDocument(filename.trim());
  });
}
