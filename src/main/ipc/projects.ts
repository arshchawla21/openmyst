import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import { closeProject, createNewProject, getCurrentProject, openProject } from '../features/projects';
import { getSettings } from '../features/settings';

export function registerProjectsIpc(): void {
  ipcMain.handle(IpcChannels.Projects.CreateNew, () => createNewProject());
  ipcMain.handle(IpcChannels.Projects.Open, () => openProject());
  ipcMain.handle(IpcChannels.Projects.GetCurrent, () => getCurrentProject());
  ipcMain.handle(IpcChannels.Projects.Close, () => {
    closeProject();
  });
  ipcMain.handle(IpcChannels.Projects.ListRecent, async () => {
    const s = await getSettings();
    return s.recentProjects;
  });
}
