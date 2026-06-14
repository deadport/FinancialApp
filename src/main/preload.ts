import { contextBridge, ipcRenderer } from 'electron';
import type { ImportProgress, TxFilters } from '../shared/types';

contextBridge.exposeInMainWorld('api', {
  getAppState: () => ipcRenderer.invoke('app:state'),
  listOnboardingCategories: () => ipcRenderer.invoke('onboarding:categories'),
  completeOnboarding: (selectedCategoryNames: string[]) => ipcRenderer.invoke('onboarding:complete', selectedCategoryNames),
  getPreference: (key: string, fallback: unknown) => ipcRenderer.invoke('prefs:get', key, fallback),
  setPreference: (key: string, value: unknown) => ipcRenderer.invoke('prefs:set', key, value),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb: (p: unknown) => void) => {
    const handler = (_e: unknown, p: unknown) => cb(p);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  pickAndImport: () => ipcRenderer.invoke('import:pick'),
  importFile: (fileName: string, data: ArrayBuffer) => ipcRenderer.invoke('import:file', fileName, data),
  onImportProgress: (cb: (p: ImportProgress) => void) => {
    const handler = (_e: unknown, p: ImportProgress) => cb(p);
    ipcRenderer.on('import:progress', handler);
    return () => ipcRenderer.removeListener('import:progress', handler);
  },
  listTransactions: (filters: TxFilters) => ipcRenderer.invoke('tx:list', filters),
  setTxCategory: (id: number, categoryId: number | null) => ipcRenderer.invoke('tx:setCategory', id, categoryId),
  deleteTx: (id: number) => ipcRenderer.invoke('tx:delete', id),
  summary: (from?: string, to?: string) => ipcRenderer.invoke('stats:summary', from, to),
  monthly: () => ipcRenderer.invoke('stats:monthly'),
  byCategory: (from?: string, to?: string) => ipcRenderer.invoke('stats:byCategory', from, to),
  listCategories: () => ipcRenderer.invoke('categories:list'),
  addCategory: (name: string, color: string) => ipcRenderer.invoke('categories:add', name, color),
  deleteCategory: (id: number) => ipcRenderer.invoke('categories:delete', id),
  listRules: () => ipcRenderer.invoke('rules:list'),
  addRule: (keyword: string, categoryId: number, direction?: string) => ipcRenderer.invoke('rules:add', keyword, categoryId, direction ?? 'any'),
  listUncategorized: () => ipcRenderer.invoke('tx:uncategorized'),
  deleteRule: (id: number) => ipcRenderer.invoke('rules:delete', id),
  applyRules: () => ipcRenderer.invoke('rules:apply'),
  listSubscriptions: () => ipcRenderer.invoke('subscriptions:list'),
  detectSubscriptions: () => ipcRenderer.invoke('subscriptions:detect'),
  removeSubscription: (description: string) => ipcRenderer.invoke('subscriptions:remove', description),
  setCategoryFixed: (id: number, fixed: boolean) => ipcRenderer.invoke('categories:setFixed', id, fixed),
  momCompare: () => ipcRenderer.invoke('stats:momCompare'),
  topMerchants: (from?: string, to?: string) => ipcRenderer.invoke('stats:topMerchants', from, to),
  weekdaySpending: (from?: string, to?: string) => ipcRenderer.invoke('stats:weekday', from, to),
  dailySpending: (days?: number) => ipcRenderer.invoke('stats:daily', days ?? 119),
  fixedVar: () => ipcRenderer.invoke('stats:fixedVar'),
  incomeSplit: () => ipcRenderer.invoke('stats:incomeSplit'),
  savingsMonthly: () => ipcRenderer.invoke('stats:savingsMonthly'),
  biggestExpenses: () => ipcRenderer.invoke('stats:biggestExpenses'),
  exportCsv: (filters: TxFilters) => ipcRenderer.invoke('tx:exportCsv', filters),
  backupDb: () => ipcRenderer.invoke('backup:db'),
  restoreDb: () => ipcRenderer.invoke('backup:restore'),
  setCategoryExcluded: (id: number, excluded: boolean) => ipcRenderer.invoke('categories:setExcluded', id, excluded),
  listImports: () => ipcRenderer.invoke('imports:list'),
  deleteImport: (id: number) => ipcRenderer.invoke('imports:delete', id),
});
