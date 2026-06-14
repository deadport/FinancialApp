import type {
  Category, CategoryRule, CategoryStat, ImportProgress, ImportRecord,
  MonthlyStat, RuleDirection, Summary, Transaction, TxFilters, UncategorizedGroup,
  UpdateStatus,
} from '../shared/types';
import type { CategoryTemplate } from '../shared/defaultConfig';

export interface Api {
  getAppState(): Promise<{ onboardingCompleted: boolean; schemaVersion: number; userDataPath: string }>;
  listOnboardingCategories(): Promise<CategoryTemplate[]>;
  completeOnboarding(selectedCategoryNames: string[]): Promise<number>;
  getPreference<T>(key: string, fallback: T): Promise<T>;
  setPreference(key: string, value: unknown): Promise<boolean>;
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<boolean>;
  onUpdateStatus(cb: (p: UpdateStatus) => void): () => void;
  pickAndImport(): Promise<string | null>;
  importFile(fileName: string, data: ArrayBuffer): Promise<boolean>;
  onImportProgress(cb: (p: ImportProgress) => void): () => void;
  listTransactions(filters: TxFilters): Promise<{ rows: Transaction[]; total: number; sum: number }>;
  exportCsv(filters: TxFilters): Promise<{ path: string; count: number } | null>;
  backupDb(): Promise<string | null>;
  restoreDb(): Promise<{ path: string } | null>;
  savingsMonthly(): Promise<{ month: string; net: number }[]>;
  biggestExpenses(): Promise<{ date: string; description: string; total: number }[]>;
  setTxCategory(id: number, categoryId: number | null): Promise<boolean>;
  deleteTx(id: number): Promise<boolean>;
  summary(from?: string, to?: string): Promise<Summary>;
  monthly(): Promise<MonthlyStat[]>;
  byCategory(from?: string, to?: string): Promise<(CategoryStat & { id: number | null })[]>;
  listCategories(): Promise<Category[]>;
  addCategory(name: string, color: string): Promise<boolean>;
  deleteCategory(id: number): Promise<boolean>;
  listRules(): Promise<CategoryRule[]>;
  addRule(keyword: string, categoryId: number, direction?: RuleDirection): Promise<boolean>;
  listUncategorized(): Promise<UncategorizedGroup[]>;
  deleteRule(id: number): Promise<boolean>;
  applyRules(): Promise<number>;
  listSubscriptions(): Promise<{ description: string; occurrences: number; avg_amount: number; first_date: string; last_date: string }[]>;
  listImports(): Promise<ImportRecord[]>;
  deleteImport(id: number): Promise<{ removed: number }>;
  detectSubscriptions(): Promise<{ services: number; marked: number }>;
  removeSubscription(description: string): Promise<boolean>;
  setCategoryFixed(id: number, fixed: boolean): Promise<boolean>;
  momCompare(): Promise<{ currentMonth: string; previousMonth: string; rows: { name: string; color: string; current: number; previous: number }[] } | null>;
  topMerchants(from?: string, to?: string): Promise<{ description: string; total: number; n: number }[]>;
  weekdaySpending(from?: string, to?: string): Promise<{ wd: number; total: number; n: number }[]>;
  dailySpending(days?: number): Promise<{ date: string; total: number }[]>;
  fixedVar(): Promise<{ month: string; fixas: number; variaveis: number }[]>;
  incomeSplit(): Promise<{ name: string; color: string; total: number }[]>;
  setCategoryExcluded(id: number, excluded: boolean): Promise<boolean>;
}

declare global {
  interface Window { api: Api }
}

export const api = window.api;

export function fmtMoney(v: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(v);
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
