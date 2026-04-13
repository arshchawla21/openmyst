import { create } from 'zustand';
import type { PendingEdit } from '@shared/types';
import { bridge } from '../api/bridge';

interface PendingEditsState {
  edits: PendingEdit[];
  loading: boolean;
  activeDoc: string | null;

  load: (docFilename: string) => Promise<void>;
  accept: (id: string, override?: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  patch: (id: string, newString: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const usePendingEdits = create<PendingEditsState>((set, get) => ({
  edits: [],
  loading: false,
  activeDoc: null,

  load: async (docFilename) => {
    set({ loading: true, activeDoc: docFilename });
    try {
      const edits = await bridge.pendingEdits.list(docFilename);
      set({ edits, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  accept: async (id, override) => {
    await bridge.pendingEdits.accept(id, override);
    const doc = get().activeDoc;
    if (doc) {
      const edits = await bridge.pendingEdits.list(doc);
      set({ edits });
    }
  },

  reject: async (id) => {
    await bridge.pendingEdits.reject(id);
    const doc = get().activeDoc;
    if (doc) {
      const edits = await bridge.pendingEdits.list(doc);
      set({ edits });
    }
  },

  patch: async (id, newString) => {
    const doc = get().activeDoc;
    if (!doc) return;
    // Optimistic update so the widget doesn't flash during the round-trip.
    set({ edits: get().edits.map((e) => (e.id === id ? { ...e, newString } : e)) });
    try {
      await bridge.pendingEdits.patch(doc, id, newString);
    } catch (err) {
      console.error('[myst] pending patch failed', err);
      const edits = await bridge.pendingEdits.list(doc);
      set({ edits });
    }
  },

  clearAll: async () => {
    const doc = get().activeDoc;
    if (!doc) return;
    await bridge.pendingEdits.clear(doc);
    set({ edits: [] });
  },
}));
