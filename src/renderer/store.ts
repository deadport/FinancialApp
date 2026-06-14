import { create } from 'zustand';

export type Page = 'dashboard' | 'analysis' | 'import' | 'transactions' | 'uncategorized' | 'categories' | 'subscriptions' | 'projects';

interface AppState {
  page: Page;
  refreshKey: number;
  txPresetCategory: number | null; // filtro pré-aplicado ao abrir Transações (clique num gráfico)
  setPage: (p: Page) => void;
  bumpRefresh: () => void;
  openTransactionsForCategory: (categoryId: number) => void;
  consumeTxPreset: () => number | null;
}

export const useAppStore = create<AppState>((set, get) => ({
  page: 'dashboard',
  refreshKey: 0,
  txPresetCategory: null,
  setPage: (page) => set({ page }),
  bumpRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  openTransactionsForCategory: (categoryId) => set({ txPresetCategory: categoryId, page: 'transactions' }),
  consumeTxPreset: () => {
    const v = get().txPresetCategory;
    if (v != null) set({ txPresetCategory: null });
    return v;
  },
}));
