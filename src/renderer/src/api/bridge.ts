import type { MystApi } from '@shared/api';

function getApi(): MystApi {
  const api = window.myst;
  if (!api) {
    throw new Error(
      'Preload bridge not initialized (window.myst is undefined). ' +
        'This means the preload script did not run. Check the main process logs.',
    );
  }
  return api;
}

export const bridge: MystApi = {
  get settings() {
    return getApi().settings;
  },
  get projects() {
    return getApi().projects;
  },
} as MystApi;
