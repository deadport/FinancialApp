export interface CategoryTemplate {
  name: string;
  color: string;
  excluded?: boolean;
  isFixed?: boolean;
}

export interface CategoryRuleTemplate {
  keyword: string;
  category: string;
  direction?: 'any' | 'expense' | 'income';
}

export const DEFAULT_CATEGORY_CATALOG: CategoryTemplate[] = [
  { name: 'Alimentação', color: '#f59e0b' },
  { name: 'Compras', color: '#06b6d4' },
  { name: 'Transporte', color: '#3b82f6' },
  { name: 'Saúde', color: '#ef4444' },
  { name: 'Casa', color: '#10b981', isFixed: true },
  { name: 'Lazer', color: '#ec4899' },
  { name: 'Salário', color: '#22c55e' },
  { name: 'Investimentos', color: '#14b8a6' },
  { name: 'Subscrições', color: '#8b5cf6', isFixed: true },
  { name: 'Educação', color: '#f97316' },
  { name: 'Transferências', color: '#64748b', excluded: true },
  { name: 'Poupança', color: '#84cc16', excluded: true },
  { name: 'Eletrónicos', color: '#38bdf8' },
  { name: 'Roupa', color: '#fb7185' },
  { name: 'Gaming', color: '#a78bfa' },
  { name: 'Barbeiro', color: '#d97706', isFixed: true },
  { name: 'Prendas', color: '#f472b6' },
  { name: 'Musica', color: '#22d3ee' },
  { name: 'Mesada', color: '#84cc16' },
  { name: 'Outros', color: '#a3a3a3' },
];

export const DEFAULT_RULE_CATALOG: CategoryRuleTemplate[] = [
  { keyword: 'uber', category: 'Transporte' },
  { keyword: 'bolt', category: 'Transporte' },
  { keyword: 'galp', category: 'Transporte' },
  { keyword: 'bp ', category: 'Transporte' },
  { keyword: 'continente', category: 'Alimentação' },
  { keyword: 'pingo doce', category: 'Alimentação' },
  { keyword: 'lidl', category: 'Alimentação' },
  { keyword: 'mercadona', category: 'Alimentação' },
  { keyword: 'auchan', category: 'Alimentação' },
  { keyword: 'mcdonald', category: 'Alimentação' },
  { keyword: 'uber eats', category: 'Alimentação' },
  { keyword: 'glovo', category: 'Alimentação' },
  { keyword: 'netflix', category: 'Subscrições' },
  { keyword: 'spotify', category: 'Subscrições' },
  { keyword: 'hbo', category: 'Subscrições' },
  { keyword: 'disney', category: 'Subscrições' },
  { keyword: 'youtube premium', category: 'Subscrições' },
  { keyword: 'amazon prime', category: 'Subscrições' },
  { keyword: 'icloud', category: 'Subscrições' },
  { keyword: 'edp', category: 'Casa' },
  { keyword: 'meo', category: 'Casa' },
  { keyword: 'nos ', category: 'Casa' },
  { keyword: 'vodafone', category: 'Casa' },
  { keyword: 'renda', category: 'Casa' },
  { keyword: 'farmacia', category: 'Saúde' },
  { keyword: 'farmácia', category: 'Saúde' },
  { keyword: 'clinica', category: 'Saúde' },
  { keyword: 'salario', category: 'Salário', direction: 'income' },
  { keyword: 'salário', category: 'Salário', direction: 'income' },
  { keyword: 'ordenado', category: 'Salário', direction: 'income' },
  { keyword: 'vencimento', category: 'Salário', direction: 'income' },
  { keyword: 'transferencia', category: 'Transferências' },
  { keyword: 'transferência', category: 'Transferências' },
  { keyword: 'mb way', category: 'Transferências' },
  { keyword: 'amazon', category: 'Compras' },
  { keyword: 'fnac', category: 'Eletrónicos' },
  { keyword: 'worten', category: 'Eletrónicos' },
  { keyword: 'microsoft', category: 'Eletrónicos' },
  { keyword: 'swappie', category: 'Eletrónicos' },
  { keyword: 'zara', category: 'Compras' },
  { keyword: 'pullandbear', category: 'Roupa' },
  { keyword: 'cinema', category: 'Lazer' },
  { keyword: 'steam', category: 'Gaming' },
  { keyword: 'g2a', category: 'Gaming' },
  { keyword: 'skinport', category: 'Gaming' },
  { keyword: 'tebex', category: 'Gaming' },
  { keyword: 'nexusmods', category: 'Gaming' },
  { keyword: 'apple.com/bill', category: 'Musica' },
  { keyword: 'paco instrumentos', category: 'Musica' },
  { keyword: 'revolut', category: 'Poupança' },
];

export const DEFAULT_DASHBOARD_WIDGET_ORDER = [
  'balance_evolution',
  'savings_rate',
  'top_merchants',
  'weekday_spending',
  'fixed_vs_variable',
  'savings_projection',
  'income_split',
  'biggest_expenses',
  'daily_heatmap',
];
