// Camada opcional de organização avançada. Ausente/null para quem não a usa.
export interface TransactionMetadata {
  tags?: string[];
  project?: string;
}

export interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  currency: string;
  category_id: number | null;
  category_name?: string | null;
  source_file: string | null;
  is_income: number;
  is_subscription: number;
  imported_at: string;
  metadata?: TransactionMetadata | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  excluded: number;
  is_fixed: number;
}

export type RuleDirection = 'any' | 'expense' | 'income';

export interface CategoryRule {
  id: number;
  keyword: string;
  category_id: number;
  category_name?: string;
  priority: number;
  direction: RuleDirection;
}

export interface UncategorizedGroup {
  description: string;
  n: number;
  total: number;
  min_amount: number;
  max_amount: number;
  last_date: string;
}

export interface ImportProgress {
  percent: number;
  message: string;
  done?: boolean;
  inserted?: number;
  skipped?: number;
  errors?: number;
  error?: string;
}

export interface TxFilters {
  search?: string;
  categoryId?: number | null;
  kind?: 'expense' | 'income';
  from?: string;
  to?: string;
  tag?: string;
  project?: string;
  limit?: number;
  offset?: number;
}

export interface Summary {
  income: number;
  expenses: number;
  balance: number;
  count: number;
}

export interface ProjectStat {
  name: string;
  n: number;
  income: number;
  expenses: number;
}

export interface ProjectDetail {
  monthly: { month: string; income: number; expenses: number }[];
  byCategory: { name: string; color: string; total: number }[];
}

export interface MonthlyStat {
  month: string;
  income: number;
  expenses: number;
}

export interface CategoryStat {
  name: string;
  color: string;
  total: number;
}

export interface ImportRecord {
  id: number;
  file_name: string;
  inserted: number;
  skipped: number;
  created_at: string;
}

export interface DashboardWidgetPreference {
  order: string[];
  visible: string[];
}

export type UpdateStatus =
  | { state: 'idle'; message: string }
  | { state: 'disabled'; message: string }
  | { state: 'checking'; message: string }
  | { state: 'available'; message: string; version?: string }
  | { state: 'not-available'; message: string }
  | { state: 'downloading'; message: string; percent?: number }
  | { state: 'downloaded'; message: string; version?: string }
  | { state: 'error'; message: string };
