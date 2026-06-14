import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  completeFirstRun,
  getAppState,
  getDb,
  getDefaultCategoryCatalog,
  getPreference,
  initDb,
  setPreference,
} from './db';
import { importFile, matchNorm } from './importer';
import { configureAutoUpdates, registerUpdaterIpc } from './updater';
import type { TxFilters } from '../shared/types';

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

function registerIpc() {
  registerUpdaterIpc(() => win);

  ipcMain.handle('app:state', () => getAppState());

  ipcMain.handle('onboarding:categories', () => getDefaultCategoryCatalog());

  ipcMain.handle('onboarding:complete', (_e, selectedCategoryNames: string[]) => {
    return completeFirstRun(selectedCategoryNames);
  });

  ipcMain.handle('prefs:get', (_e, key: string, fallback: unknown) => {
    return getPreference(key, fallback);
  });

  ipcMain.handle('prefs:set', (_e, key: string, value: unknown) => {
    setPreference(key, value);
    return true;
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

  ipcMain.handle('import:file', async (_e, fileName: string, data: ArrayBuffer) => {
    await importFile(fileName, Buffer.from(data), sendProgress);
    return true;
  });

  ipcMain.handle('tx:list', (_e, filters: TxFilters = {}) => {
    const db = getDb();
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.search) { where.push('t.description LIKE @search'); params.search = `%${filters.search}%`; }
    if (filters.categoryId != null) { where.push('t.category_id = @categoryId'); params.categoryId = filters.categoryId; }
    if (filters.kind === 'expense') where.push('t.is_income = 0');
    if (filters.kind === 'income') where.push('t.is_income = 1');
    if (filters.from) { where.push('t.date >= @from'); params.from = filters.from; }
    if (filters.to) { where.push('t.date <= @to'); params.to = filters.to; }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(filters.limit ?? 200, 500);
    const offset = filters.offset ?? 0;
    const rows = db.prepare(`
      SELECT t.*, c.name AS category_name FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      ${w} ORDER BY t.date DESC, t.id DESC LIMIT ${limit} OFFSET ${offset}
    `).all(params);
    const agg = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(t.amount), 0) AS s FROM transactions t ${w}`).get(params) as { c: number; s: number };
    return { rows, total: agg.c, sum: agg.s };
  });

  ipcMain.handle('tx:exportCsv', async (_e, filters: TxFilters = {}) => {
    if (!win) return null;
    const db = getDb();
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.search) { where.push('t.description LIKE @search'); params.search = `%${filters.search}%`; }
    if (filters.categoryId != null) { where.push('t.category_id = @categoryId'); params.categoryId = filters.categoryId; }
    if (filters.kind === 'expense') where.push('t.is_income = 0');
    if (filters.kind === 'income') where.push('t.is_income = 1');
    if (filters.from) { where.push('t.date >= @from'); params.from = filters.from; }
    if (filters.to) { where.push('t.date <= @to'); params.to = filters.to; }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT t.date, t.description, COALESCE(c.name, '') AS category, t.amount, t.currency
      FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
      ${w} ORDER BY t.date DESC, t.id DESC
    `).all(params) as { date: string; description: string; category: string; amount: number; currency: string }[];
    const res = await dialog.showSaveDialog(win, {
      title: 'Exportar transações',
      defaultPath: `transacoes-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (res.canceled || !res.filePath) return null;
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = ['Data;Descrição;Categoria;Valor;Moeda',
      ...rows.map((r) => [r.date, esc(r.description), esc(r.category), String(r.amount).replace('.', ','), r.currency].join(';'))];
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

  ipcMain.handle('tx:setCategory', (_e, id: number, categoryId: number | null) => {
    getDb().prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(categoryId, id);
    return true;
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
    return { ...r, balance: r.income - r.expenses };
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
