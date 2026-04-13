import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import { computeWikiGraph } from '../features/wiki';
import { listSources } from '../features/sources';

export function registerWikiIpc(): void {
  ipcMain.handle(IpcChannels.Wiki.Graph, async () => {
    const sources = await listSources();
    return computeWikiGraph(sources);
  });
}
