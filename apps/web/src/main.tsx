import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import './styles.css';

type Page = 'dashboard' | 'transactions' | 'projects' | 'import' | 'categories' | 'settings';
type RuleDirection = 'any' | 'expense' | 'income';

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  excluded: boolean;
  is_fixed: boolean;
}

interface RuleRow {
  id: string;
  keyword: string;
  category_id: string;
  direction: RuleDirection;
}

interface TransactionRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  category_id: string | null;
  tx_source: 'bank' | 'manual';
  is_subscription: boolean;
  metadata: { tags?: string[]; project?: string } | null;
}

interface ImportRow {
  id: string;
  file_name: string | null;
  inserted: number;
  skipped: number;
  created_at: string;
}

interface PreferenceRow {
  key: string;
  value: unknown;
}

interface AppData {
  categories: CategoryRow[];
  rules: RuleRow[];
  transactions: TransactionRow[];
  imports: ImportRow[];
  preferences: PreferenceRow[];
}

const emptyData: AppData = {
  categories: [],
  rules: [],
  transactions: [],
  imports: [],
  preferences: [],
};

const nav: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Resumo', icon: '📊' },
  { id: 'projects', label: 'Projetos', icon: '📁' },
  { id: 'import', label: 'Importar', icon: '📥' },
  { id: 'categories', label: 'Categorias', icon: '🏷️' },
];

function fmtMoney(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(value);
}

function fmtDate(iso: string) {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function fmtMonthLabel(monthKey: string) {
  const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const month = Number(monthKey.slice(5, 7));
  return monthNames[month - 1] ?? monthKey.slice(5);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function pageTitle(page: Page) {
  if (page === 'dashboard') return 'Resumo';
  if (page === 'transactions') return 'Movimentos';
  if (page === 'projects') return 'Projetos';
  if (page === 'import') return 'Importar';
  if (page === 'categories') return 'Categorias';
  return 'Conta';
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loadingSession) return <div className="app-loading">FinancialApp</div>;
  return session ? <MobileApp session={session} /> : <Auth />;
}

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === 'signup') {
      setMessage('Conta criada. Se o Supabase pedir confirmação, confirma o email e entra novamente.');
      setMode('login');
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand with-icon"><img src="/icon.png" alt="" /> FinancialApp</div>
        <h1>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p>Acesso privado aos dados sincronizados do desktop, preparado para mobile.</p>
        <form onSubmit={submit}>
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>
          {message && <div className="message">{message}</div>}
          <button disabled={busy}>{busy ? 'Aguarda...' : mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        <button className="linklike" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Criar nova conta' : 'Já tenho conta'}
        </button>
      </section>
    </main>
  );
}

function MobileApp({ session }: { session: Session }) {
  const userId = session.user.id;
  const [page, setPage] = useState<Page>('dashboard');
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    const [tx, cats, rules, imports, prefs] = await Promise.all([
      supabase
        .from('transactions')
        .select('id,date,description,amount,currency,category_id,tx_source,is_subscription,metadata')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('date', { ascending: false })
        .limit(800),
      supabase
        .from('categories')
        .select('id,name,color,excluded,is_fixed')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('name'),
      supabase
        .from('category_rules')
        .select('id,keyword,category_id,direction')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('keyword'),
      supabase
        .from('imports')
        .select('id,file_name,inserted,skipped,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('user_preferences')
        .select('key,value')
        .eq('user_id', userId),
    ]);

    setData({
      transactions: (tx.data ?? []) as TransactionRow[],
      categories: (cats.data ?? []) as CategoryRow[],
      rules: (rules.data ?? []) as RuleRow[],
      imports: (imports.data ?? []) as ImportRow[],
      preferences: (prefs.data ?? []) as PreferenceRow[],
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const categoryMap = useMemo(() => new Map(data.categories.map((cat) => [cat.id, cat])), [data.categories]);
  const summary = useMemo(() => calculateSummary(data.transactions, data.categories, data.preferences), [data]);

  const refresh = async (nextMessage?: string) => {
    await load();
    if (nextMessage) {
      setMessage(nextMessage);
      window.setTimeout(() => setMessage(''), 3500);
    }
  };

  return (
    <div className="mobile-shell">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-small with-icon" aria-label="FinancialApp"><img src="/icon.png" alt="" /></span>
        </div>
        <h1>{pageTitle(page)}</h1>
        <div className="header-actions">
          <button className="ghost compact icon-only" aria-label="Movimentos" title="Movimentos" onClick={() => setPage('transactions')}>≡</button>
          <button className="ghost compact icon-only" aria-label="Conta" title="Conta" onClick={() => setPage('settings')}>◎</button>
        </div>
      </header>

      {message && <div className="toast">{message}</div>}

      <main className="screen">
        {loading ? (
          <div className="empty">A carregar...</div>
        ) : page === 'dashboard' ? (
          <Dashboard data={data} summary={summary} setPage={setPage} />
        ) : page === 'transactions' ? (
          <Transactions data={data} categoryMap={categoryMap} userId={userId} onChange={refresh} />
        ) : page === 'projects' ? (
          <Projects data={data} setPage={setPage} />
        ) : page === 'import' ? (
          <ImportPage data={data} userId={userId} onChange={refresh} />
        ) : page === 'categories' ? (
          <Categories data={data} userId={userId} onChange={refresh} />
        ) : (
          <Settings session={session} data={data} summary={summary} onRefresh={refresh} />
        )}
      </main>

      <nav className="bottom-nav">
        {nav.map((item) => (
          <button
            key={item.id}
            aria-label={item.label}
            className={page === item.id ? 'active' : ''}
            onClick={() => setPage(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Dashboard({
  data,
  summary,
  setPage,
}: {
  data: AppData;
  summary: ReturnType<typeof calculateSummary>;
  setPage: (page: Page) => void;
}) {
  const categoryStats = useMemo(() => categoryExpenseStats(data.transactions, data.categories), [data.transactions, data.categories]);
  const monthly = useMemo(() => monthlyStats(data.transactions).slice(-6), [data.transactions]);
  const fixedVar = useMemo(() => fixedVariableTotals(data.transactions, data.categories), [data.transactions, data.categories]);
  const subscriptions = useMemo(() => subscriptionStats(data.transactions, data.categories), [data.transactions, data.categories]);

  return (
    <div className="stack">
      <section className="kpis">
        <button className="kpi-card" onClick={() => setPage('transactions')}>
          <span>Receitas</span>
          <strong className="green">{fmtMoney(summary.income)}</strong>
        </button>
        <button className="kpi-card" onClick={() => setPage('transactions')}>
          <span>Despesas</span>
          <strong className="red">{fmtMoney(summary.expenses)}</strong>
        </button>
        <button className="kpi-card" onClick={() => setPage('settings')}>
          <span>Saldo</span>
          <strong>{fmtMoney(summary.balance)}</strong>
          {summary.adjusted && <em>Alinhado</em>}
        </button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Receitas vs despesas</h2>
          <button className="ghost compact" onClick={() => setPage('transactions')}>Movimentos</button>
        </div>
        <GroupedBars data={monthly} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Despesas por categoria</h2>
          <span className="muted">{categoryStats.length}</span>
        </div>
        <DonutChart rows={categoryStats} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Fixas vs variáveis</h2>
        </div>
        <SplitBar fixed={fixedVar.fixed} variable={fixedVar.variable} />
      </section>

      <section className="panel compact-panel">
        <div className="panel-head">
          <h2>Subscrições</h2>
          <span className="muted">{fmtMoney(subscriptions.monthlyTotal)}/mês</span>
        </div>
        <SubscriptionList rows={subscriptions.rows} />
      </section>
    </div>
  );
}

function Projects({ data, setPage }: { data: AppData; setPage: (page: Page) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const projects = useMemo(() => {
    const map = new Map<string, { name: string; income: number; expenses: number; count: number; lastDate: string }>();
    for (const tx of data.transactions) {
      const name = tx.metadata?.project?.trim();
      if (!name) continue;
      const item = map.get(name) ?? { name, income: 0, expenses: 0, count: 0, lastDate: '' };
      item.count += 1;
      if (tx.amount > 0) item.income += Number(tx.amount);
      if (tx.amount < 0) item.expenses += Math.abs(Number(tx.amount));
      if (!item.lastDate || tx.date > item.lastDate) item.lastDate = tx.date;
      map.set(name, item);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [data.transactions]);
  const active = projects.find((project) => project.name === selected) ?? projects[0];
  const projectRows = active
    ? data.transactions.filter((tx) => tx.metadata?.project?.trim() === active.name)
    : [];
  const projectMonthly = monthlyStats(projectRows).slice(-6);
  const projectCategories = categoryExpenseStats(projectRows, data.categories).slice(0, 5);

  if (projects.length === 0) {
    return (
      <section className="panel">
        <h2>Projetos</h2>
        <div className="empty">Ainda não há movimentos com projeto sincronizados.</div>
        <button className="ghost" onClick={() => setPage('transactions')}>Ver movimentos</button>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Projetos</h2>
          <span className="muted">{projects.length} ativos</span>
        </div>
        <div className="project-list">
          {projects.map((project) => (
            <article
              key={project.name}
              className={active?.name === project.name ? 'active' : ''}
              onClick={() => setSelected(project.name)}
            >
              <div>
                <strong>{project.name}</strong>
                <span>{project.count} movimentos · último {fmtDate(project.lastDate)}</span>
              </div>
              <div className="project-money">
                <b>{fmtMoney(project.income - project.expenses)}</b>
                <small>{fmtMoney(project.income)} / {fmtMoney(project.expenses)}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      {active && (
        <>
          <section className="kpis">
            <button className="kpi-card">
              <span>Receitas</span>
              <strong className="green">{fmtMoney(active.income)}</strong>
            </button>
            <button className="kpi-card">
              <span>Despesas</span>
              <strong className="red">{fmtMoney(active.expenses)}</strong>
            </button>
            <button className="kpi-card">
              <span>Saldo</span>
              <strong>{fmtMoney(active.income - active.expenses)}</strong>
            </button>
          </section>
          <section className="panel">
            <div className="panel-head"><h2>{active.name}: evolução</h2></div>
            <GroupedBars data={projectMonthly} />
          </section>
          <section className="panel">
            <div className="panel-head"><h2>{active.name}: categorias</h2></div>
            <DonutChart rows={projectCategories} />
          </section>
        </>
      )}
    </div>
  );
}

function Transactions({
  data,
  categoryMap,
  userId,
  onChange,
}: {
  data: AppData;
  categoryMap: Map<string, CategoryRow>;
  userId: string;
  onChange: (message?: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'expense' | 'income' | 'uncategorized'>('all');
  const [categoryId, setCategoryId] = useState('');
  const [manualOpen, setManualOpen] = useState(false);

  const rows = data.transactions.filter((tx) => {
    if (query && !tx.description.toLowerCase().includes(query.toLowerCase())) return false;
    if (categoryId && tx.category_id !== categoryId) return false;
    if (kind === 'expense' && tx.amount >= 0) return false;
    if (kind === 'income' && tx.amount <= 0) return false;
    if (kind === 'uncategorized' && tx.category_id) return false;
    return true;
  });

  const setCategory = async (txId: string, nextCategoryId: string) => {
    const { error } = await supabase
      .from('transactions')
      .update({ category_id: nextCategoryId || null })
      .eq('id', txId)
      .eq('user_id', userId);
    if (error) throw error;
    await onChange('Categoria atualizada.');
  };

  const deleteTx = async (txId: string) => {
    const ok = window.confirm('Apagar esta transação da cloud?');
    if (!ok) return;
    const { error } = await supabase
      .from('transactions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', txId)
      .eq('user_id', userId);
    if (error) throw error;
    await onChange('Transação apagada.');
  };

  return (
    <div className="stack">
      <section className="toolbar-card">
        <input placeholder="Pesquisar..." value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="filter-row">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">Todas</option>
            <option value="expense">Saídas</option>
            <option value="income">Entradas</option>
            <option value="uncategorized">Sem categoria</option>
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Categorias</option>
            {data.categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>
        <button onClick={() => setManualOpen(true)}>Adicionar manual</button>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{rows.length} movimentos</h2>
          <span className="muted">{fmtMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0))}</span>
        </div>
        <div className="tx-list editable">
          {rows.slice(0, 120).map((tx) => (
            <article key={tx.id}>
              <div className="tx-main">
                <strong>{tx.description}</strong>
                <span>{fmtDate(tx.date)} · {tx.tx_source === 'manual' ? 'Manual' : 'Banco'}</span>
                <select value={tx.category_id ?? ''} onChange={(e) => setCategory(tx.id, e.target.value)}>
                  <option value="">Sem categoria</option>
                  {data.categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div className="tx-side">
                <b className={tx.amount >= 0 ? 'green' : 'red'}>{fmtMoney(tx.amount, tx.currency)}</b>
                <button className="icon-danger" onClick={() => deleteTx(tx.id)}>×</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {manualOpen && (
        <ManualTransactionModal
          categories={data.categories}
          userId={userId}
          onClose={() => setManualOpen(false)}
          onSaved={async () => {
            setManualOpen(false);
            await onChange('Transação manual criada.');
          }}
        />
      )}
    </div>
  );
}

function ManualTransactionModal({
  categories,
  userId,
  onClose,
  onSaved,
}: {
  categories: CategoryRow[];
  userId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const raw = Number(amount.replace(',', '.'));
    if (!Number.isFinite(raw) || raw <= 0) {
      setError('Indica um valor válido.');
      return;
    }
    setBusy(true);
    const signed = kind === 'income' ? Math.abs(raw) : -Math.abs(raw);
    const { error: insertError } = await supabase.from('transactions').insert({
      user_id: userId,
      date,
      description: description.trim() || 'Transação manual',
      amount: signed,
      currency: 'EUR',
      category_id: categoryId || null,
      tx_source: 'manual',
      is_income: kind === 'income',
      is_subscription: false,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    await onSaved();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Transação manual</h2>
        <label><span>Data</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span>Descrição</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Almoço, venda, feira..." /></label>
        <label><span>Valor</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
        <div className="filter-row">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'expense' | 'income')}>
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
        </div>
        {error && <div className="message error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Cancelar</button>
          <button disabled={busy} onClick={save}>{busy ? 'A guardar...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}

function ImportPage({
  data,
  userId,
  onChange,
}: {
  data: AppData;
  userId: string;
  onChange: (message?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const importCsv = async (file: File) => {
    setBusy(true);
    setMessage('');
    const text = await file.text();
    const parsed = parseCsvTransactions(text);
    const txRows = parsed.rows.map((row) => ({
      user_id: userId,
      date: row.date,
      description: row.description,
      amount: row.amount,
      currency: 'EUR',
      tx_source: 'bank',
      is_income: row.amount > 0,
      is_subscription: false,
      dedup_hash: `${row.date}|${row.description}|${row.amount}`,
    }));

    let inserted = 0;
    if (txRows.length > 0) {
      const { data: upserted, error } = await supabase
        .from('transactions')
        .upsert(txRows, { onConflict: 'user_id,dedup_hash' })
        .select('id');
      if (error) {
        setMessage(error.message);
        setBusy(false);
        return;
      }
      inserted = upserted?.length ?? txRows.length;
    }

    await supabase.from('imports').insert({
      user_id: userId,
      file_name: file.name,
      inserted,
      skipped: parsed.skipped,
    });

    setBusy(false);
    await onChange(`${inserted} movimentos importados.`);
  };

  return (
    <div className="stack">
      <section className="upload-card">
        <h2>Importar extrato</h2>
        <p>Na web/mobile, nesta fase, importa CSV. XLSX continua recomendado no desktop.</p>
        <label className="file-btn">
          <input
            type="file"
            accept=".csv,.txt"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importCsv(file);
            }}
          />
          {busy ? 'A importar...' : 'Escolher CSV'}
        </label>
        {message && <div className="message">{message}</div>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Importações</h2></div>
        {data.imports.length === 0 ? <div className="empty">Sem importações na cloud.</div> : (
          <div className="simple-list">
            {data.imports.map((row) => (
              <article key={row.id}>
                <strong>{row.file_name || 'Importação'}</strong>
                <span>{row.inserted} inseridas · {fmtDate(row.created_at.slice(0, 10))}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Categories({
  data,
  userId,
  onChange,
}: {
  data: AppData;
  userId: string;
  onChange: (message?: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#10b981');
  const [keyword, setKeyword] = useState('');
  const [ruleCategory, setRuleCategory] = useState('');
  const [direction, setDirection] = useState<RuleDirection>('any');
  const [openSection, setOpenSection] = useState<'categories' | 'rules' | 'newRule' | null>(null);

  const addCategory = async () => {
    const clean = name.trim();
    if (!clean) return;
    const { error } = await supabase.from('categories').insert({
      user_id: userId,
      name: clean,
      color,
    });
    if (error) throw error;
    setName('');
    await onChange('Categoria criada.');
  };

  const updateCategory = async (id: string, values: Partial<CategoryRow>) => {
    const { error } = await supabase.from('categories').update(values).eq('id', id).eq('user_id', userId);
    if (error) throw error;
    await onChange('Categoria atualizada.');
  };

  const addRule = async () => {
    const clean = keyword.trim();
    if (!clean || !ruleCategory) return;
    const { error } = await supabase.from('category_rules').insert({
      user_id: userId,
      keyword: clean,
      category_id: ruleCategory,
      direction,
    });
    if (error) throw error;
    setKeyword('');
    await onChange('Regra criada.');
  };

  const applyRules = async () => {
    let updated = 0;
    for (const tx of data.transactions.filter((row) => !row.category_id)) {
      const match = data.rules.find((rule) => {
        const directionOk = rule.direction === 'any' || (rule.direction === 'income' ? tx.amount > 0 : tx.amount < 0);
        return directionOk && tx.description.toLowerCase().includes(rule.keyword.toLowerCase());
      });
      if (!match) continue;
      const { error } = await supabase
        .from('transactions')
        .update({ category_id: match.category_id })
        .eq('id', tx.id)
        .eq('user_id', userId);
      if (!error) updated += 1;
    }
    await onChange(`${updated} movimentos categorizados.`);
  };

  return (
    <div className="stack">
      <section className="toolbar-card">
        <input placeholder="Nova categoria" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="filter-row">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Cor" />
          <button onClick={addCategory}>Adicionar</button>
        </div>
      </section>

      <section className="panel">
        <button className="accordion-head" onClick={() => setOpenSection(openSection === 'categories' ? null : 'categories')}>
          <h2>Categorias</h2>
          <span>{data.categories.length}</span>
        </button>
        {openSection === 'categories' && (
          <div className="category-list">
            {data.categories.map((cat) => (
              <article key={cat.id}>
                <div><i style={{ background: cat.color }} /><strong>{cat.name}</strong></div>
                <div className="chip-row">
                  <button className={cat.excluded ? 'chip active' : 'chip'} onClick={() => updateCategory(cat.id, { excluded: !cat.excluded })}>
                    {cat.excluded ? 'Não conta' : 'Conta'}
                  </button>
                  <button className={cat.is_fixed ? 'chip active' : 'chip'} onClick={() => updateCategory(cat.id, { is_fixed: !cat.is_fixed })}>
                    {cat.is_fixed ? 'Fixa' : 'Variável'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <button className="accordion-head" onClick={() => setOpenSection(openSection === 'newRule' ? null : 'newRule')}>
          <h2>Nova regra</h2>
          <span>+</span>
        </button>
        {openSection === 'newRule' && (
          <div className="accordion-body">
            <input placeholder="Palavra-chave" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <div className="filter-row">
              <select value={direction} onChange={(e) => setDirection(e.target.value as RuleDirection)}>
                <option value="any">Ambas</option>
                <option value="expense">Saídas</option>
                <option value="income">Entradas</option>
              </select>
              <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)}>
                <option value="">Categoria</option>
                {data.categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
            <button onClick={addRule}>Adicionar regra</button>
          </div>
        )}
      </section>

      <section className="panel">
        <button className="accordion-head" onClick={() => setOpenSection(openSection === 'rules' ? null : 'rules')}>
          <h2>Regras</h2>
          <span>{data.rules.length}</span>
        </button>
        {openSection === 'rules' && (
          <>
            <button className="ghost apply-rules" onClick={applyRules}>Aplicar regras às sem categoria</button>
            <div className="simple-list">
              {data.rules.map((rule) => (
                <article key={rule.id}>
                  <strong>{rule.keyword}</strong>
                  <span>{directionLabel(rule.direction)} · {data.categories.find((cat) => cat.id === rule.category_id)?.name ?? 'Categoria'}</span>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Settings({
  session,
  data,
  summary,
  onRefresh,
}: {
  session: Session;
  data: AppData;
  summary: ReturnType<typeof calculateSummary>;
  onRefresh: (message?: string) => Promise<void>;
}) {
  return (
    <div className="stack">
      <section className="profile-card">
        <strong>{session.user.email}</strong>
        <span>{data.transactions.length} movimentos na cloud</span>
        <span>{summary.adjusted ? 'Saldo alinhado com desktop' : 'Saldo calculado por movimentos'}</span>
        <button className="ghost" onClick={() => onRefresh('Dados atualizados.')}>Atualizar dados</button>
        <button className="ghost" onClick={() => supabase.auth.signOut()}>Sair da conta</button>
      </section>
      <section className="panel">
        <h2>O que fica no desktop</h2>
        <p className="muted">
          Backups SQLite, atualizações Electron, instaladores e importação XLSX completa continuam no desktop.
          A web/mobile fica focada em consulta, categorização, transações manuais e importação CSV.
        </p>
      </section>
    </div>
  );
}

function TransactionList({ rows, categoryMap }: { rows: TransactionRow[]; categoryMap: Map<string, CategoryRow> }) {
  if (rows.length === 0) return <div className="empty">Sem movimentos.</div>;
  return (
    <div className="tx-list">
      {rows.map((row) => (
        <article key={row.id}>
          <div className="tx-main">
            <strong>{row.description}</strong>
            <span>{fmtDate(row.date)} · {row.category_id ? categoryMap.get(row.category_id)?.name ?? 'Categoria' : 'Sem categoria'}</span>
          </div>
          <b className={row.amount >= 0 ? 'green' : 'red'}>{fmtMoney(row.amount, row.currency)}</b>
        </article>
      ))}
    </div>
  );
}

function GroupedBars({ data }: { data: { month: string; income: number; expenses: number }[] }) {
  const max = Math.max(1, ...data.flatMap((row) => [row.income, row.expenses]));
  if (data.length === 0) return <div className="empty">Sem dados suficientes.</div>;
  return (
    <div className="grouped-bars">
      {data.map((row) => (
        <div key={row.month} className="grouped-month">
          <div className="grouped-columns">
            <span className="income" style={{ height: `${Math.max(10, (row.income / max) * 108)}px` }} />
            <span className="expense" style={{ height: `${Math.max(10, (row.expenses / max) * 108)}px` }} />
          </div>
          <strong>{fmtMonthLabel(row.month)}</strong>
          <small>{fmtMoney(row.income - row.expenses)}</small>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ rows }: { rows: { id: string; name: string; color: string; total: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (rows.length === 0 || total <= 0) return <div className="empty">Sem despesas para mostrar.</div>;
  const visibleRows = rows.slice(0, 5);
  const otherTotal = rows.slice(5).reduce((sum, row) => sum + row.total, 0);
  const legendRows = otherTotal > 0
    ? [...visibleRows, { id: 'other', name: 'Outras', color: '#64736b', total: otherTotal }]
    : visibleRows;
  let acc = 0;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="donut-wrap">
      <svg className="donut" viewBox="0 0 120 120" aria-label="Despesas por categoria">
        <circle className="donut-base" cx="60" cy="60" r={radius} />
        {rows.map((row) => {
          const fraction = row.total / total;
          const dash = fraction * circumference;
          const gap = circumference - dash;
          const offset = -acc * circumference;
          acc += fraction;
          return (
            <circle
              key={row.id}
              className="donut-slice"
              cx="60"
              cy="60"
              r={radius}
              stroke={row.color}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
            />
          );
        })}
        <text x="60" y="57" textAnchor="middle">{fmtMoney(total)}</text>
        <text x="60" y="72" textAnchor="middle">despesas</text>
      </svg>
      <div className="donut-legend">
        {legendRows.map((row) => (
          <div key={row.id}>
            <span className="color-dot" style={{ background: row.color }} />
            <strong>{row.name}</strong>
            <em>{fmtMoney(row.total)}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankedBars({ rows }: { rows: { id: string; name: string; color: string; total: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  if (rows.length === 0) return <div className="empty">Sem despesas para mostrar.</div>;
  return (
    <div className="rank-bars">
      {rows.map((row) => (
        <div key={row.id} className="rank-row">
          <div>
            <span className="rank-label">
              <span className="color-dot" style={{ background: row.color }} />
              <strong>{row.name}</strong>
            </span>
            <em>{fmtMoney(row.total)}</em>
          </div>
          <span className="rank-track">
            <i style={{ width: `${Math.max(4, (row.total / max) * 100)}%`, background: row.color }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function SplitBar({ fixed, variable }: { fixed: number; variable: number }) {
  const total = fixed + variable;
  const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
  return (
    <div className="split-card">
      <div className="split-track">
        <span style={{ width: `${fixedPct}%` }} />
      </div>
      <div className="split-legend">
        <span><i /> Fixas {fmtMoney(fixed)}</span>
        <span><i /> Variáveis {fmtMoney(variable)}</span>
      </div>
    </div>
  );
}

function SubscriptionList({
  rows,
}: {
  rows: { description: string; occurrences: number; avgAmount: number; lastDate: string }[];
}) {
  if (rows.length === 0) {
    return <div className="mini-empty">Ainda não há subscrições detetadas.</div>;
  }
  return (
    <div className="subscription-list">
      {rows.map((row) => (
        <article key={row.description}>
          <div>
            <strong>{row.description}</strong>
            <span>{row.occurrences} ocorrências · última {fmtDate(row.lastDate)}</span>
          </div>
          <b>{fmtMoney(row.avgAmount)}</b>
        </article>
      ))}
    </div>
  );
}

function monthlyStats(transactions: TransactionRow[]) {
  const map = new Map<string, { month: string; income: number; expenses: number }>();
  for (const tx of transactions) {
    const month = tx.date.slice(0, 7);
    const item = map.get(month) ?? { month, income: 0, expenses: 0 };
    if (tx.amount > 0) item.income += Number(tx.amount);
    if (tx.amount < 0) item.expenses += Math.abs(Number(tx.amount));
    map.set(month, item);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function subscriptionStats(transactions: TransactionRow[], categories: CategoryRow[]) {
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));
  const map = new Map<string, { description: string; occurrences: number; total: number; firstDate: string; lastDate: string }>();
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const category = tx.category_id ? categoryMap.get(tx.category_id) : null;
    const isSubscription = tx.is_subscription || category?.name.toLowerCase() === 'subscrições';
    if (!isSubscription) continue;
    const key = normalizeSubscriptionName(tx.description);
    const item = map.get(key) ?? {
      description: tx.description,
      occurrences: 0,
      total: 0,
      firstDate: tx.date,
      lastDate: tx.date,
    };
    item.occurrences += 1;
    item.total += Math.abs(Number(tx.amount));
    if (tx.date < item.firstDate) item.firstDate = tx.date;
    if (tx.date > item.lastDate) {
      item.lastDate = tx.date;
      item.description = tx.description;
    }
    map.set(key, item);
  }
  const rows = Array.from(map.values())
    .map((item) => ({ ...item, avgAmount: item.total / item.occurrences }))
    .sort((a, b) => b.avgAmount - a.avgAmount);
  const monthlyTotal = rows.reduce((sum, row) => sum + row.avgAmount, 0);
  return { rows, monthlyTotal };
}

function normalizeSubscriptionName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryExpenseStats(transactions: TransactionRow[], categories: CategoryRow[]) {
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));
  const map = new Map<string, { id: string; name: string; color: string; total: number }>();
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const cat = tx.category_id ? categoryMap.get(tx.category_id) : null;
    if (cat?.excluded) continue;
    const id = cat?.id ?? 'uncategorized';
    const item = map.get(id) ?? {
      id,
      name: cat?.name ?? 'Sem categoria',
      color: cat?.color ?? '#64736b',
      total: 0,
    };
    item.total += Math.abs(Number(tx.amount));
    map.set(id, item);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function fixedVariableTotals(transactions: TransactionRow[], categories: CategoryRow[]) {
  const categoryMap = new Map(categories.map((cat) => [cat.id, cat]));
  return transactions.reduce((acc, tx) => {
    if (tx.amount >= 0) return acc;
    const amount = Math.abs(Number(tx.amount));
    const cat = tx.category_id ? categoryMap.get(tx.category_id) : null;
    if (cat?.excluded) return acc;
    if (cat?.is_fixed) acc.fixed += amount;
    else acc.variable += amount;
    return acc;
  }, { fixed: 0, variable: 0 });
}

function calculateSummary(
  transactions: Pick<TransactionRow, 'date' | 'amount' | 'category_id'>[],
  categories: { id: string; excluded: boolean }[],
  preferences: PreferenceRow[],
) {
  const excluded = new Set(categories.filter((category) => category.excluded).map((category) => category.id));
  const includedRows = transactions.filter((row) => !row.category_id || !excluded.has(row.category_id));
  const income = includedRows.filter((row) => Number(row.amount) > 0).reduce((sum, row) => sum + Number(row.amount), 0);
  const expenses = includedRows.filter((row) => Number(row.amount) < 0).reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
  const pref = new Map(preferences.map((row) => [row.key, row.value]));
  const anchorSet = pref.get('balance_anchor_set') === true;
  const anchorAmount = typeof pref.get('balance_anchor_amount') === 'number' ? pref.get('balance_anchor_amount') as number : null;
  const anchorDate = typeof pref.get('balance_anchor_date') === 'string' ? pref.get('balance_anchor_date') as string : null;
  const rawBalance = transactions.reduce((sum, row) => sum + Number(row.amount), 0);
  const balance = anchorSet && anchorAmount != null && anchorDate
    ? anchorAmount + transactions.filter((row) => row.date > anchorDate).reduce((sum, row) => sum + Number(row.amount), 0)
    : rawBalance;
  return { income, expenses, balance: Math.round(balance * 100) / 100, adjusted: Boolean(anchorSet && anchorAmount != null && anchorDate) };
}

function directionLabel(direction: RuleDirection) {
  if (direction === 'expense') return 'Saídas';
  if (direction === 'income') return 'Entradas';
  return 'Entradas e saídas';
}

function parseCsvTransactions(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [] as { date: string; description: string; amount: number }[], skipped: 0 };
  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).map((header) => normalize(header));
  const dateIdx = headers.findIndex((header) => ['data', 'date', 'datamovimento'].includes(header));
  const descIdx = headers.findIndex((header) => ['descricao', 'descrição', 'description', 'movimento'].includes(header));
  const amountIdx = headers.findIndex((header) => ['valor', 'amount', 'montante', 'quantia'].includes(header));
  const rows: { date: string; description: string; amount: number }[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line, delimiter);
    const date = normalizeDate(cols[dateIdx] ?? '');
    const description = String(cols[descIdx] ?? '').trim();
    const amount = parseAmount(cols[amountIdx] ?? '');
    if (!date || !description || !Number.isFinite(amount)) {
      skipped += 1;
      continue;
    }
    rows.push({ date, description, amount });
  }
  return { rows, skipped };
}

function splitCsvLine(line: string, delimiter: string) {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((value) => value.trim());
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W/g, '').toLowerCase();
}

function normalizeDate(value: string) {
  const clean = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const match = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return '';
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function parseAmount(value: string) {
  const clean = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[€]/g, '');
  return Number(clean);
}

createRoot(document.getElementById('root')!).render(<App />);
