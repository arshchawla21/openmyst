import { create } from 'zustand';
import type { SourceMeta } from '@shared/types';

interface SourcePreviewState {
  source: SourceMeta | null;
  open: (source: SourceMeta) => void;
  close: () => void;
}

export const useSourcePreview = create<SourcePreviewState>((set) => ({
  source: null,
  open: (source) => set({ source }),
  close: () => set({ source: null }),
}));
