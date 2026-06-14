import { app, BrowserWindow, ipcMain, dialog, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import {
  completeFirstRun,
  createInitialCategories,
  finishOnboarding,
  getAppState,
  getDb,
  getDefaultCategoryCatalog,
  getPreference,
  initDb,
  setPreference,
} from './db';
import { importFile, matchNorm } from './importer';
import { configureAutoUpdates, registerUpdaterIpc } from './updater';
import type { BalanceState, ManualTransactionInput, TransactionMetadata, TxFilters } from '../shared/types';

// Garante que a BD fica sempre em ~/Library/Application Support/FinancialApp
app.setName('FinancialApp');
app.setPath('userData', path.join(app.getPath('appData'), 'FinancialApp'));

// Instância única: segundo duplo clique foca a janela existente em vez de abrir outra
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'FinancialApp',
    backgroundColor: '#0f1512',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '../dist/index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  initDb();
  createInternalBackup('startup');

  // Ícone próprio na Dock (em vez do ícone genérico do Electron)
  const iconPath = path.join(__dirname, '../assets/icon.png');
  if (fs.existsSync(iconPath)) app.dock?.setIcon(iconPath);

  // Modo de teste headless: --import-test <ficheiro> importa e termina
  const testIdx = process.argv.indexOf('--import-test');
  if (testIdx > -1 && process.argv[testIdx + 1]) {
    const f = process.argv[testIdx + 1];
    importFile(path.basename(f), fs.readFileSync(f), (p) => {
      console.log(JSON.stringify(p));
      if (p.done) {
        const db = getDb();
        console.log('TOTAL:', JSON.stringify(db.prepare('SELECT COUNT(*) AS c FROM transactions').get()));
        console.log('SAMPLE:', JSON.stringify(db.prepare('SELECT t.date, t.description, t.amount, c.name AS cat FROM transactions t LEFT JOIN categories c ON c.id=t.category_id ORDER BY t.id DESC LIMIT 5').all()));
        app.quit();
      }
    });
    return;
  }

  registerIpc();
  createWindow();
  configureAutoUpdates(win);
  startReminderScheduler();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Fechar a janela termina a app (inclusive em macOS) — "fechar o local fecha o host"
app.on('window-all-closed', () => {
  app.quit();
});

function sendProgress(p: unknown) {
  win?.webContents.send('import:progress', p);
}

// Exclui das estatísticas as transações de categorias marcadas como excluídas
// (ex.: transferências para a própria poupança não são despesa nem receita)
const EXCL = "(t.category_id IS NULL OR t.category_id NOT IN (SELECT id FROM categories WHERE excluded = 1))";
const BALANCE_ANCHOR_AMOUNT_KEY = 'balance_anchor_amount';
const BALANCE_ANCHOR_DATE_KEY = 'balance_anchor_date';
const BALANCE_ANCHOR_SET_KEY = 'balance_anchor_set';
const BALANCE_PROMPT_SEEN_KEY = 'balance_prompt_seen';

function getKnownBalance() {
  const row = getDb().prepare('SELECT COALESCE(SUM(amount), 0) AS balance, COUNT(*) AS count FROM transactions')
    .get() as { balance: number; count: number };
  return {
    computedBalance: Math.round(row.balance * 100) / 100,
    transactionCount: row.count,
  };
}

function getBalanceState(): BalanceState {
  const known = getKnownBalance();
  const anchorAmountRaw = getPreference<number | null>(BALANCE_ANCHOR_AMOUNT_KEY, null);
  const anchorDate = getPreference<string | null>(BALANCE_ANCHOR_DATE_KEY, null);
  const anchorAmount = typeof anchorAmountRaw === 'number' && Number.isFinite(anchorAmountRaw) ? anchorAmountRaw : null;
  const hasAnchor = getPreference<boolean>(BALANCE_ANCHOR_SET_KEY, false) === true && anchorAmount != null && !!anchorDate;
  const promptSeen = getPreference<boolean>(BALANCE_PROMPT_SEEN_KEY, false) === true;
  const afterAnchor = hasAnchor
    ? getDb().prepare('SELECT COALESCE(SUM(amount), 0) AS balance, COUNT(*) AS count FROM transactions WHERE date > ?')
      .get(anchorDate) as { balance: number; count: number }
    : { balance: known.computedBalance, count: known.transactionCount };
  const displayedBalance = hasAnchor
    ? anchorAmount + afterAnchor.balance
    : known.computedBalance;
  return {
    ...known,
    anchorAmount,
    anchorDate: hasAnchor ? anchorDate : null,
    displayedBalance: Math.round(displayedBalance * 100) / 100,
    hasAnchor,
    promptSeen,
    transactionsAfterAnchor: afterAnchor.count,
  };
}

function saveBalanceAnchor(amount: number, date: string) {
  const rounded = Math.round(amount * 100) / 100;
  setPreference(BALANCE_ANCHOR_AMOUNT_KEY, rounded);
  setPreference(BALANCE_ANCHOR_DATE_KEY, date);
  setPreference(BALANCE_ANCHOR_SET_KEY, true);
  setPreference(BALANCE_PROMPT_SEEN_KEY, true);
  return getBalanceState();
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayBefore(value: string) {
  const d = new Date(`${value}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function registerIpc() {
  registerUpdaterIpc(() => win);

  ipcMain.handle('app:state', () => getAppState());

  ipcMain.handle('onboarding:categories', () => getDefaultCategoryCatalog());

  ipcMain.handle('onboarding:complete', (_e, selectedCategoryNames: string[]) => {
    return completeFirstRun(selectedCategoryNames);
  });

  // Cria categorias + regras já a meio do onboarding (antes do import, para auto-categorizar)
  ipcMain.handle('onboarding:createCategories', (_e, selectedCategoryNames: string[]) => {
    return createInitialCategories(selectedCategoryNames);
  });

  // Marca o onboarding como concluído (passo final)
  ipcMain.handle('onboarding:finish', () => {
    finishOnboarding();
    return true;
  });

  // Resumo para o ecrã final do onboarding
  ipcMain.handle('onboarding:summary', () => {
    const db = getDb();
    const txn = db.prepare('SELECT COUNT(*) AS c, MIN(date) AS minD, MAX(date) AS maxD FROM transactions').get() as { c: number; minD: string | null; maxD: string | null };
    const uncat = (db.prepare('SELECT COUNT(*) AS c FROM transactions WHERE category_id IS NULL').get() as { c: number }).c;
    const categories = (db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }).c;
    const rules = (db.prepare('SELECT COUNT(*) AS c FROM category_rules').get() as { c: number }).c;
    return { transactions: txn.c, uncategorized: uncat, from: txn.minD, to: txn.maxD, categories, rules };
  });

  ipcMain.handle('prefs:get', (_e, key: string, fallback: unknown) => {
    return getPreference(key, fallback);
  });

  ipcMain.handle('prefs:set', (_e, key: string, value: unknown) => {
    setPreference(key, value);
    return true;
  });

  ipcMain.handle('balance:get', () => getBalanceState());

  ipcMain.handle('balance:align', (_e, realBalance: number, anchorDate: string) => {
    const target = Number(realBalance);
    if (!Number.isFinite(target)) throw new Error('Saldo inválido.');
    const cleanDate = String(anchorDate ?? '').trim();
    if (!isIsoDate(cleanDate)) throw new Error('Data do saldo inválida.');
    return saveBalanceAnchor(target, cleanDate);
  });

  ipcMain.handle('balance:setInitial', (_e, initialBalance: number) => {
    const value = Number(initialBalance);
    if (!Number.isFinite(value)) throw new Error('Saldo inicial inválido.');
    const first = getDb().prepare('SELECT MIN(date) AS firstDate FROM transactions').get() as { firstDate: string | null };
    const anchorDate = first.firstDate ? dayBefore(first.firstDate) : new Date().toISOString().slice(0, 10);
    return saveBalanceAnchor(value, anchorDate);
  });

  ipcMain.handle('balance:dismissPrompt', () => {
    setPreference(BALANCE_PROMPT_SEEN_KEY, true);
    return true;
  });

  ipcMain.handle('balance:series', () => {
    const db = getDb();
    const state = getBalanceState();
    const rows = state.hasAnchor
      ? db.prepare(`
        SELECT STRFTIME('%Y-%m', date) AS month, SUM(amount) AS net
        FROM transactions WHERE date > ?
        GROUP BY month ORDER BY month
      `).all(state.anchorDate) as { month: string; net: number }[]
      : db.prepare(`
        SELECT STRFTIME('%Y-%m', date) AS month, SUM(amount) AS net
        FROM transactions
        GROUP BY month ORDER BY month
      `).all() as { month: string; net: number }[];
    let acc = state.hasAnchor && state.anchorAmount != null ? state.anchorAmount : 0;
    return rows.map((row) => {
      acc += row.net;
      return { month: row.month, saldo: Math.round(acc * 100) / 100 };
    });
  });

  ipcMain.handle('import:pick', async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Escolher extratos',
      filters: [{ name: 'Extratos', extensions: ['csv', 'tsv', 'xlsx', 'xls'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    for (const filePath of res.filePaths) {
      await importFile(path.basename(filePath), fs.readFileSync(filePath), sendProgress);
    }
    return res.filePaths.length;
  });

  ipcMain.handle('import:file', async (_e, fileName: string, data: ArrayBuffer, project?: string) => {
    await importFile(fileName, Buffer.from(data), sendProgress, project);
    return true;
  });

  ipcMain.handle('tx:list', (_e, filters: TxFilters = {}) => {
    const db = getDb();
    const { clause: w, params } = buildTxWhere(filters);
    const limit = Math.min(filters.limit ?? 200, 500);
    const offset = filters.offset ?? 0;
    const rows = (db.prepare(`
      SELECT t.*, c.name AS category_name FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      ${w} ORDER BY t.date DESC, t.id DESC LIMIT ${limit} OFFSET ${offset}
    `).all(params) as Record<string, unknown>[]).map(withParsedMetadata);
    const agg = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(t.amount), 0) AS s FROM transactions t ${w}`).get(params) as { c: number; s: number };
    return { rows, total: agg.c, sum: agg.s };
  });

  ipcMain.handle('tx:addManual', (_e, input: ManualTransactionInput) => {
    const db = getDb();
    const date = String(input?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data inválida.');

    const rawAmount = Number(input?.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) throw new Error('Valor inválido.');

    const kind = input?.kind === 'income' ? 'income' : 'expense';
    const amount = kind === 'income' ? Math.abs(rawAmount) : -Math.abs(rawAmount);
    const description = String(input?.description ?? '').trim() || 'Transação manual';
    const categoryId = input?.categoryId == null ? null : Number(input.categoryId);
    if (categoryId != null) {
      const exists = db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId);
      if (!exists) throw new Error('Categoria inválida.');
    }

    const subCatId = (db.prepare("SELECT id FROM categories WHERE name = 'Subscrições'").get() as { id: number } | undefined)?.id ?? null;
    const res = db.prepare(`
      INSERT INTO transactions (date, description, amount, currency, category_id, source_file, tx_source, dedup_hash, is_income, is_subscription)
      VALUES (?, ?, ?, 'EUR', ?, NULL, 'manual', NULL, ?, ?)
    `).run(
      date,
      description,
      amount,
      categoryId,
      kind === 'income' ? 1 : 0,
      kind === 'expense' && categoryId != null && categoryId === subCatId ? 1 : 0,
    );

    return { id: Number(res.lastInsertRowid) };
  });

  // Guarda/limpa a metadata opcional (tags + projeto) de uma transação
  ipcMain.handle('tx:setMetadata', (_e, id: number, metadata: TransactionMetadata | null) => {
    const clean = normalizeMetadata(metadata);
    getDb().prepare('UPDATE transactions SET metadata = ? WHERE id = ?')
      .run(clean ? JSON.stringify(clean) : null, id);
    return true;
  });

  // Valores de tags/projetos existentes — para mostrar filtros só quando há dados
  ipcMain.handle('tx:metaFacets', () => {
    const db = getDb();
    const tags = (db.prepare(`
      SELECT DISTINCT je.value AS v FROM transactions t, json_each(t.metadata, '$.tags') je
      WHERE t.metadata IS NOT NULL ORDER BY v
    `).all() as { v: string }[]).map((r) => r.v).filter(Boolean);
    const fromTx = (db.prepare(`
      SELECT DISTINCT json_extract(t.metadata, '$.project') AS p FROM transactions t
      WHERE p IS NOT NULL AND p != '' ORDER BY p
    `).all() as { p: string }[]).map((r) => r.p).filter(Boolean);
    // Inclui também projetos criados sem transações ainda associadas
    const projects = Array.from(new Set([...fromTx, ...getProjectRegistry()])).sort((a, b) => a.localeCompare(b));
    return { tags, projects };
  });

  // Lista de projetos com agregados (inclui projetos criados ainda sem transações)
  ipcMain.handle('project:list', () => {
    const rows = getDb().prepare(`
      SELECT json_extract(t.metadata, '$.project') AS name,
        COUNT(*) AS n,
        COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount END), 0) AS income,
        COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount END), 0) AS expenses
      FROM transactions t
      WHERE name IS NOT NULL AND name != ''
      GROUP BY name
    `).all() as { name: string; n: number; income: number; expenses: number }[];
    const map = new Map(rows.map((r) => [r.name, r]));
    for (const name of getProjectRegistry()) {
      if (!map.has(name)) map.set(name, { name, n: 0, income: 0, expenses: 0 });
    }
    return Array.from(map.values()).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  });

  // Cria um projeto vazio (fica no registo até ter transações)
  ipcMain.handle('project:create', (_e, name: string) => {
    const clean = String(name ?? '').trim();
    if (!clean) return { created: false };
    addToProjectRegistry(clean);
    return { created: true, name: clean };
  });

  // Remove um projeto: tira-o do registo e desassocia-o das transações (mantém as transações e as tags)
  ipcMain.handle('project:delete', (_e, name: string) => {
    const res = getDb().prepare(`
      UPDATE transactions
      SET metadata = CASE
        WHEN json_remove(metadata, '$.project') = '{}' THEN NULL
        ELSE json_remove(metadata, '$.project')
      END
      WHERE json_extract(metadata, '$.project') = @name
    `).run({ name });
    setPreference('project_registry', getProjectRegistry().filter((n) => n !== name));
    return { cleared: res.changes };
  });

  // Detalhe de um projeto: série mensal (receitas/despesas) + repartição por categoria
  ipcMain.handle('project:detail', (_e, name: string) => {
    const db = getDb();
    const monthly = db.prepare(`
      SELECT substr(t.date, 1, 7) AS month,
        COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount END), 0) AS income,
        COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount END), 0) AS expenses
      FROM transactions t
      WHERE json_extract(t.metadata, '$.project') = @name
      GROUP BY month ORDER BY month
    `).all({ name });
    const byCategory = db.prepare(`
      SELECT COALESCE(c.name, 'Sem categoria') AS name, COALESCE(c.color, '#a3a3a3') AS color,
        COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount END), 0) AS total
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE json_extract(t.metadata, '$.project') = @name
      GROUP BY c.id HAVING total > 0 ORDER BY total DESC
    `).all({ name });
    return { monthly, byCategory };
  });

  // Renomeia um projeto em todas as transações que o usam
  ipcMain.handle('project:rename', (_e, oldName: string, newName: string) => {
    const next = String(newName ?? '').trim();
    if (!next) return { updated: 0 };
    const res = getDb().prepare(`
      UPDATE transactions
      SET metadata = json_set(COALESCE(metadata, '{}'), '$.project', @next)
      WHERE json_extract(metadata, '$.project') = @old
    `).run({ next, old: oldName });
    renameInProjectRegistry(oldName, next);
    return { updated: res.changes };
  });

  ipcMain.handle('tx:exportCsv', async (_e, filters: TxFilters = {}) => {
    if (!win) return null;
    const db = getDb();
    const { clause: w, params } = buildTxWhere(filters);
    const rows = db.prepare(`
      SELECT t.date, t.description, COALESCE(c.name, '') AS category, t.amount, t.currency, COALESCE(t.tx_source, 'bank') AS source
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      ${w} ORDER BY t.date DESC, t.id DESC
    `).all(params) as { date: string; description: string; category: string; amount: number; currency: string; source: string }[];
    const res = await dialog.showSaveDialog(win, {
      title: 'Exportar transações',
      defaultPath: `transacoes-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return null;
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = ['Data;Descrição;Categoria;Valor;Moeda;Origem',
      ...rows.map((r) => [r.date, esc(r.description), esc(r.category), String(r.amount).replace('.', ','), r.currency, r.source === 'manual' ? 'Manual' : 'Banco'].join(';'))];
    // BOM para o Excel abrir com acentos corretos
    fs.writeFileSync(res.filePath, '﻿' + lines.join('\r\n'), 'utf-8');
    return { path: res.filePath, count: rows.length };
  });

  ipcMain.handle('backup:db', async () => {
    if (!win) return null;
    const db = getDb();
    db.pragma('wal_checkpoint(TRUNCATE)');
    const res = await dialog.showSaveDialog(win, {
      title: 'Guardar backup da base de dados',
      defaultPath: `financialapp-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Base de dados', extensions: ['db'] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.copyFileSync(path.join(app.getPath('userData'), 'financialapp.db'), res.filePath);
    return res.filePath;
  });

  ipcMain.handle('backup:restore', async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Restaurar backup da base de dados',
      filters: [{ name: 'Base de dados', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const backupPath = res.filePaths[0];
    const dbPath = path.join(app.getPath('userData'), 'financialapp.db');
    validateBackupFile(backupPath);

    const currentDb = getDb();
    currentDb.pragma('wal_checkpoint(TRUNCATE)');
    createInternalBackup('before-restore');
    currentDb.close();

    fs.copyFileSync(backupPath, dbPath);
    initDb();
    createInternalBackup('after-restore');

    return { path: backupPath };
  });

  // Bundle portável (JSON): categorias, regras, transações, definições e layout dos gráficos
  ipcMain.handle('bundle:export', async () => {
    if (!win) return null;
    const db = getDb();
    const dump = (table: string) => db.prepare(`SELECT * FROM ${table}`).all();
    const bundle = {
      app: 'FinancialApp',
      kind: 'bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      schemaVersion: getAppState().schemaVersion,
      tables: {
        categories: dump('categories'),
        category_rules: dump('category_rules'),
        transactions: dump('transactions'),
        imports: dump('imports'),
        dismissed_subscriptions: dump('dismissed_subscriptions'),
        app_settings: dump('app_settings'),
        user_preferences: dump('user_preferences'),
      },
    };
    const res = await dialog.showSaveDialog(win, {
      title: 'Exportar backup completo (JSON)',
      defaultPath: `financialapp-bundle-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Backup FinancialApp', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
    return { path: res.filePath, count: bundle.tables.transactions.length };
  });

  ipcMain.handle('bundle:import', async () => {
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Importar backup completo (JSON)',
      filters: [{ name: 'Backup FinancialApp', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const raw = fs.readFileSync(res.filePaths[0], 'utf-8');
    let bundle: any;
    try {
      bundle = JSON.parse(raw);
    } catch {
      throw new Error('Ficheiro inválido: não é um JSON válido.');
    }
    if (!bundle || bundle.app !== 'FinancialApp' || bundle.kind !== 'bundle' || !bundle.tables) {
      throw new Error('Ficheiro inválido: não é um backup FinancialApp.');
    }

    const db = getDb();
    // Cópia interna antes de substituir, por segurança
    db.pragma('wal_checkpoint(TRUNCATE)');
    createInternalBackup('before-bundle-import');

    // Substituir tudo: ordem respeita as foreign keys
    const order = [
      'transactions',
      'category_rules',
      'dismissed_subscriptions',
      'imports',
      'app_settings',
      'user_preferences',
      'categories',
    ];
    const replaceAll = db.transaction(() => {
      db.pragma('foreign_keys = OFF');
      for (const table of order) db.prepare(`DELETE FROM ${table}`).run();
      // Reinserir (categorias primeiro para satisfazer FKs)
      for (const table of [...order].reverse()) {
        const rows = bundle.tables[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
        const insertCols = Object.keys(rows[0]).filter((k) => cols.includes(k));
        if (insertCols.length === 0) continue;
        const stmt = db.prepare(
          `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})`,
        );
        for (const row of rows) stmt.run(insertCols.map((c) => row[c]));
      }
      db.pragma('foreign_keys = ON');
    });
    replaceAll();
    createInternalBackup('after-bundle-import');

    const count = Array.isArray(bundle.tables.transactions) ? bundle.tables.transactions.length : 0;
    return { path: res.filePaths[0], count };
  });

  ipcMain.handle('tx:setCategory', (_e, id: number, categoryId: number | null) => {
    getDb().prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(categoryId, id);
    return true;
  });

  // Categorização em massa por ids (aba Transações)
  ipcMain.handle('tx:setCategoryBulk', (_e, ids: number[], categoryId: number | null) => {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
    const db = getDb();
    const stmt = db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?');
    let updated = 0;
    db.transaction(() => {
      for (const id of ids) updated += stmt.run(categoryId, id).changes;
    })();
    return { updated };
  });

  // Categorização em massa por descrição, só nas ainda sem categoria (aba Por categorizar)
  ipcMain.handle('tx:categorizeByDescriptions', (_e, descriptions: string[], categoryId: number) => {
    if (!Array.isArray(descriptions) || descriptions.length === 0 || categoryId == null) return { updated: 0 };
    const db = getDb();
    const stmt = db.prepare('UPDATE transactions SET category_id = ? WHERE category_id IS NULL AND LOWER(description) = LOWER(?)');
    let updated = 0;
    db.transaction(() => {
      for (const d of descriptions) updated += stmt.run(categoryId, d).changes;
    })();
    return { updated };
  });

  ipcMain.handle('tx:delete', (_e, id: number) => {
    getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id);
    return true;
  });

  ipcMain.handle('stats:summary', (_e, from?: string, to?: string) => {
    const db = getDb();
    const w = `WHERE t.date >= COALESCE(?, t.date) AND t.date <= COALESCE(?, t.date) AND ${EXCL}`;
    const r = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN t.is_income=1 THEN t.amount END), 0) AS income,
        COALESCE(SUM(CASE WHEN t.is_income=0 THEN -t.amount END), 0) AS expenses,
        COUNT(*) AS count
      FROM transactions t ${w}
    `).get(from ?? null, to ?? null) as { income: number; expenses: number; count: number };
    const balance = getBalanceState();
    return {
      ...r,
      balance: balance.displayedBalance,
      computedBalance: balance.computedBalance,
      balanceAnchorAmount: balance.anchorAmount,
      balanceAnchorDate: balance.anchorDate,
      balanceAdjusted: balance.hasAnchor,
    };
  });

  ipcMain.handle('stats:monthly', () => {
    return getDb().prepare(`
      SELECT STRFTIME('%Y-%m', t.date) AS month,
        COALESCE(SUM(CASE WHEN t.is_income=1 THEN t.amount END), 0) AS income,
        COALESCE(SUM(CASE WHEN t.is_income=0 THEN -t.amount END), 0) AS expenses
      FROM transactions t WHERE ${EXCL} GROUP BY month ORDER BY month
    `).all();
  });

  ipcMain.handle('stats:byCategory', (_e, from?: string, to?: string) => {
    return getDb().prepare(`
      SELECT t.category_id AS id, COALESCE(c.name, 'Não categorizado') AS name, COALESCE(c.color, '#52525b') AS color, SUM(-t.amount) AS total
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.is_income = 0 AND t.date >= COALESCE(?, t.date) AND t.date <= COALESCE(?, t.date) AND ${EXCL}
      GROUP BY t.category_id ORDER BY total DESC
    `).all(from ?? null, to ?? null);
  });

  ipcMain.handle('categories:list', () => {
    return getDb().prepare('SELECT * FROM categories ORDER BY name').all();
  });

  ipcMain.handle('categories:add', (_e, name: string, color: string) => {
    getDb().prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(name.trim(), color);
    return true;
  });

  ipcMain.handle('categories:setExcluded', (_e, id: number, excluded: boolean) => {
    getDb().prepare('UPDATE categories SET excluded = ? WHERE id = ?').run(excluded ? 1 : 0, id);
    return true;
  });

  ipcMain.handle('categories:setFixed', (_e, id: number, fixed: boolean) => {
    getDb().prepare('UPDATE categories SET is_fixed = ? WHERE id = ?').run(fixed ? 1 : 0, id);
    return true;
  });

  ipcMain.handle('categories:delete', (_e, id: number) => {
    getDb().prepare('DELETE FROM categories WHERE id = ?').run(id);
    return true;
  });

  ipcMain.handle('rules:list', () => {
    return getDb().prepare(`
      SELECT r.*, c.name AS category_name FROM category_rules r
      JOIN categories c ON c.id = r.category_id ORDER BY r.priority DESC, r.keyword
    `).all();
  });

  ipcMain.handle('rules:add', (_e, keyword: string, categoryId: number, direction: string = 'any') => {
    getDb().prepare('INSERT INTO category_rules (keyword, category_id, direction) VALUES (?, ?, ?)')
      .run(keyword.trim().toLowerCase(), categoryId, direction);
    return true;
  });

  ipcMain.handle('rules:delete', (_e, id: number) => {
    getDb().prepare('DELETE FROM category_rules WHERE id = ?').run(id);
    return true;
  });

  ipcMain.handle('rules:apply', () => {
    // Reaplica regras a transações não categorizadas (respeitando a direção da regra)
    const db = getDb();
    const rules = db.prepare('SELECT keyword, category_id, direction FROM category_rules ORDER BY priority DESC, LENGTH(keyword) DESC').all() as { keyword: string; category_id: number; direction: string }[];
    const txs = db.prepare('SELECT id, description, amount FROM transactions WHERE category_id IS NULL').all() as { id: number; description: string; amount: number }[];
    const upd = db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?');
    let updated = 0;
    const run = db.transaction(() => {
      for (const t of txs) {
        const d = matchNorm(t.description ?? '');
        for (const r of rules) {
          if (r.direction === 'expense' && t.amount >= 0) continue;
          if (r.direction === 'income' && t.amount < 0) continue;
          if (d.includes(matchNorm(r.keyword))) { upd.run(r.category_id, t.id); updated++; break; }
        }
      }
    });
    run();
    return updated;
  });

  ipcMain.handle('tx:uncategorized', () => {
    return getDb().prepare(`
      SELECT description, COUNT(*) AS n, SUM(amount) AS total,
             MIN(amount) AS min_amount, MAX(amount) AS max_amount, MAX(date) AS last_date
      FROM transactions WHERE category_id IS NULL
      GROUP BY LOWER(description)
      ORDER BY n DESC, ABS(total) DESC
    `).all();
  });

  ipcMain.handle('subscriptions:detect', () => {
    // Despesas com a mesma descrição em meses diferentes e valor estável → subscrição
    const db = getDb();
    const groups = db.prepare(`
      SELECT LOWER(description) AS k, COUNT(*) AS n,
             COUNT(DISTINCT STRFTIME('%Y-%m', date)) AS months,
             AVG(amount) AS avg, MIN(amount) AS min, MAX(amount) AS max
      FROM transactions
      WHERE is_income = 0 AND is_subscription = 0
      GROUP BY LOWER(description)
      HAVING n >= 2 AND months >= 2
         AND LOWER(description) NOT IN (SELECT key FROM dismissed_subscriptions)
    `).all() as { k: string; n: number; months: number; avg: number; min: number; max: number }[];

    const subCatId = (db.prepare("SELECT id FROM categories WHERE name = 'Subscrições'").get() as { id: number } | undefined)?.id ?? null;
    const upd = db.prepare(`
      UPDATE transactions SET is_subscription = 1, category_id = COALESCE(category_id, ?)
      WHERE LOWER(description) = ? AND is_income = 0
    `);
    let services = 0, marked = 0;
    const run = db.transaction(() => {
      for (const g of groups) {
        const spread = Math.abs(g.max - g.min);
        const tolerance = Math.max(1, Math.abs(g.avg) * 0.15);
        if (spread <= tolerance) {
          marked += upd.run(subCatId, g.k).changes;
          services++;
        }
      }
    });
    run();
    return { services, marked };
  });

  ipcMain.handle('stats:topMerchants', (_e, from?: string, to?: string) => {
    return getDb().prepare(`
      SELECT t.description, SUM(-t.amount) AS total, COUNT(*) AS n
      FROM transactions t
      WHERE t.is_income = 0 AND t.date >= COALESCE(?, t.date) AND t.date <= COALESCE(?, t.date) AND ${EXCL}
      GROUP BY LOWER(t.description) ORDER BY total DESC LIMIT 10
    `).all(from ?? null, to ?? null);
  });

  ipcMain.handle('stats:weekday', (_e, from?: string, to?: string) => {
    return getDb().prepare(`
      SELECT CAST(STRFTIME('%w', t.date) AS INTEGER) AS wd, SUM(-t.amount) AS total, COUNT(*) AS n
      FROM transactions t
      WHERE t.is_income = 0 AND t.date >= COALESCE(?, t.date) AND t.date <= COALESCE(?, t.date) AND ${EXCL}
      GROUP BY wd ORDER BY wd
    `).all(from ?? null, to ?? null);
  });

  ipcMain.handle('stats:daily', (_e, days: number = 119) => {
    return getDb().prepare(`
      SELECT t.date, SUM(-t.amount) AS total
      FROM transactions t
      WHERE t.is_income = 0 AND t.date >= DATE('now', '-' || ? || ' days') AND ${EXCL}
      GROUP BY t.date ORDER BY t.date
    `).all(days);
  });

  ipcMain.handle('stats:fixedVar', () => {
    // Fixas = subscrições + categorias marcadas como fixas; variáveis = resto
    return getDb().prepare(`
      SELECT STRFTIME('%Y-%m', t.date) AS month,
        COALESCE(SUM(CASE WHEN t.is_subscription = 1 OR c.is_fixed = 1 THEN -t.amount END), 0) AS fixas,
        COALESCE(SUM(CASE WHEN NOT (t.is_subscription = 1 OR COALESCE(c.is_fixed, 0) = 1) THEN -t.amount END), 0) AS variaveis
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.is_income = 0 AND ${EXCL}
      GROUP BY month ORDER BY month
    `).all();
  });

  ipcMain.handle('stats:savingsMonthly', () => {
    // Movimentos da categoria Poupança: saídas do banco que representam depósitos de poupança
    return getDb().prepare(`
      SELECT STRFTIME('%Y-%m', t.date) AS month, SUM(-t.amount) AS net
      FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE c.name = 'Poupança'
      GROUP BY month ORDER BY month
    `).all();
  });

  ipcMain.handle('stats:biggestExpenses', () => {
    return getDb().prepare(`
      SELECT t.date, t.description, -t.amount AS total
      FROM transactions t
      WHERE t.is_income = 0 AND ${EXCL}
      ORDER BY t.amount ASC LIMIT 10
    `).all();
  });

  ipcMain.handle('stats:incomeSplit', () => {
    return getDb().prepare(`
      SELECT COALESCE(c.name, 'Não categorizado') AS name, COALESCE(c.color, '#52525b') AS color, SUM(t.amount) AS total
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.is_income = 1 AND ${EXCL}
      GROUP BY t.category_id HAVING total > 0 ORDER BY total DESC
    `).all();
  });

  ipcMain.handle('stats:momCompare', () => {
    const db = getDb();
    const months = (db.prepare(`
      SELECT DISTINCT STRFTIME('%Y-%m', date) AS m FROM transactions WHERE is_income = 0 ORDER BY m DESC LIMIT 2
    `).all() as { m: string }[]).map((r) => r.m);
    if (months.length < 2) return null;
    const [cur, prev] = months;
    const rows = db.prepare(`
      SELECT COALESCE(c.name, 'Não categorizado') AS name, COALESCE(c.color, '#52525b') AS color,
             SUM(CASE WHEN STRFTIME('%Y-%m', t.date) = ? THEN -t.amount ELSE 0 END) AS current,
             SUM(CASE WHEN STRFTIME('%Y-%m', t.date) = ? THEN -t.amount ELSE 0 END) AS previous
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.is_income = 0 AND STRFTIME('%Y-%m', t.date) IN (?, ?) AND ${EXCL}
      GROUP BY t.category_id
      HAVING current > 0 OR previous > 0
      ORDER BY current DESC
    `).all(cur, prev, cur, prev);
    return { currentMonth: cur, previousMonth: prev, rows };
  });

  ipcMain.handle('subscriptions:remove', (_e, description: string) => {
    // Marca como cancelada: sai da lista e não volta a ser detetada
    const db = getDb();
    const key = description.toLowerCase();
    const run = db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO dismissed_subscriptions (key) VALUES (?)').run(key);
      db.prepare('UPDATE transactions SET is_subscription = 0 WHERE LOWER(description) = ?').run(key);
    });
    run();
    return true;
  });

  ipcMain.handle('subscriptions:list', () => {
    return getDb().prepare(`
      SELECT description, COUNT(*) AS occurrences, AVG(-amount) AS avg_amount,
             MIN(date) AS first_date, MAX(date) AS last_date
      FROM transactions WHERE is_subscription = 1 AND is_income = 0
      GROUP BY LOWER(description) ORDER BY avg_amount DESC
    `).all();
  });

  ipcMain.handle('imports:delete', (_e, id: number) => {
    const db = getDb();
    const imp = db.prepare('SELECT file_name FROM imports WHERE id = ?').get(id) as { file_name: string } | undefined;
    if (!imp) return { removed: 0 };
    let removed = 0;
    const run = db.transaction(() => {
      removed = db.prepare('DELETE FROM transactions WHERE source_file = ?').run(imp.file_name).changes;
      db.prepare('DELETE FROM imports WHERE file_name = ?').run(imp.file_name);
    });
    run();
    return { removed };
  });

  ipcMain.handle('imports:list', () => {
    return getDb().prepare('SELECT * FROM imports ORDER BY id DESC LIMIT 30').all();
  });
}

// Lembrete mensal opcional: notificação local a partir do dia escolhido.
interface ReminderConfig { enabled: boolean; day: number }

function checkReminder() {
  const cfg = getPreference<ReminderConfig>('reminder', { enabled: false, day: 1 });
  if (!cfg.enabled || !Notification.isSupported()) return;
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const day = Math.min(Math.max(Math.round(cfg.day) || 1, 1), 28);
  if (now.getDate() < day) return;
  if (getPreference<string>('reminder_last_month', '') === monthKey) return;

  setPreference('reminder_last_month', monthKey);
  new Notification({
    title: 'FinancialApp',
    body: 'Lembrete: importa os teus extratos para manter as contas atualizadas.',
  }).show();
}

function startReminderScheduler() {
  checkReminder();
  // Reavalia periodicamente enquanto a app está aberta (a cada 6 horas)
  setInterval(checkReminder, 6 * 60 * 60 * 1000);
}

// Registo de projetos: permite criar/manter projetos mesmo sem transações associadas.
function getProjectRegistry(): string[] {
  return getPreference<string[]>('project_registry', [])
    .filter((s) => typeof s === 'string' && s.trim());
}

function addToProjectRegistry(name: string) {
  const reg = getProjectRegistry();
  if (!reg.includes(name)) setPreference('project_registry', [...reg, name]);
}

function renameInProjectRegistry(oldName: string, newName: string) {
  const reg = getProjectRegistry();
  if (!reg.includes(oldName) && reg.includes(newName)) return;
  const next = reg.map((n) => (n === oldName ? newName : n));
  setPreference('project_registry', Array.from(new Set(next)));
}

// Constrói a cláusula WHERE partilhada por tx:list e tx:exportCsv (inclui tags/projeto via JSON1)
function buildTxWhere(filters: TxFilters) {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.search) { where.push('t.description LIKE @search'); params.search = `%${filters.search}%`; }
  if (filters.categoryId != null) { where.push('t.category_id = @categoryId'); params.categoryId = filters.categoryId; }
  if (filters.kind === 'expense') where.push('t.is_income = 0');
  if (filters.kind === 'income') where.push('t.is_income = 1');
  if (filters.from) { where.push('t.date >= @from'); params.from = filters.from; }
  if (filters.to) { where.push('t.date <= @to'); params.to = filters.to; }
  if (filters.project) { where.push("json_extract(t.metadata, '$.project') = @project"); params.project = filters.project; }
  if (filters.tag) {
    where.push("t.metadata IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(t.metadata, '$.tags') WHERE value = @tag)");
    params.tag = filters.tag;
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

// Normaliza metadata: remove vazios e devolve null se não houver conteúdo útil
function normalizeMetadata(metadata: TransactionMetadata | null): TransactionMetadata | null {
  if (!metadata) return null;
  const tags = Array.isArray(metadata.tags)
    ? Array.from(new Set(metadata.tags.map((t) => String(t).trim()).filter(Boolean)))
    : [];
  const project = typeof metadata.project === 'string' ? metadata.project.trim() : '';
  const clean: TransactionMetadata = {};
  if (tags.length) clean.tags = tags;
  if (project) clean.project = project;
  return clean.tags || clean.project ? clean : null;
}

// Converte a coluna metadata (texto JSON) num objeto para o renderer
function withParsedMetadata(row: Record<string, unknown>): Record<string, unknown> {
  let metadata: TransactionMetadata | null = null;
  if (typeof row.metadata === 'string' && row.metadata) {
    try { metadata = JSON.parse(row.metadata); } catch { metadata = null; }
  }
  return { ...row, metadata };
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function createInternalBackup(label: string) {
  const dbPath = path.join(app.getPath('userData'), 'financialapp.db');
  if (!fs.existsSync(dbPath)) return null;

  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');

  const dir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `financialapp-${label}-${timestampForFile()}.db`);
  fs.copyFileSync(dbPath, dest);
  rotateInternalBackups(dir, 12);
  return dest;
}

function rotateInternalBackups(dir: string, keep: number) {
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.db'))
    .map((name) => ({ name, path: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(keep)) {
    fs.unlinkSync(file.path);
  }
}

function validateBackupFile(filePath: string) {
  const candidate = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const tables = candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const names = new Set(tables.map((table) => table.name));
    for (const required of ['categories', 'transactions', 'imports', 'category_rules']) {
      if (!names.has(required)) {
        throw new Error(`Backup inválido: tabela "${required}" não encontrada.`);
      }
    }
  } finally {
    candidate.close();
  }
}
