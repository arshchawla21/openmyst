import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import { clearHistory, loadHistory, sendMessage } from '../features/chat';

export function registerChatIpc(): void {
  ipcMain.handle(
    IpcChannels.Chat.Send,
    async (_event, message: unknown, activeDocument: unknown, displayText: unknown) => {
      if (typeof message !== 'string' || message.trim().length === 0) {
        throw new Error('Message must be a non-empty string.');
      }
      if (typeof activeDocument !== 'string' || activeDocument.trim().length === 0) {
        throw new Error('Active document must be specified.');
      }
      const display =
        typeof displayText === 'string' && displayText.trim().length > 0 ? displayText : undefined;
      return sendMessage(message.trim(), activeDocument.trim(), display);
    },
  );
  ipcMain.handle(IpcChannels.Chat.History, () => loadHistory());
  ipcMain.handle(IpcChannels.Chat.Clear, () => clearHistory());
}
