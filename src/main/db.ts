import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import {
  DEFAULT_CATEGORY_CATALOG,
  DEFAULT_DASHBOARD_WIDGET_ORDER,
  DEFAULT_RULE_CATALOG,
  type CategoryTemplate,
} from '../shared/defaultConfig';

let db: Database.Database;

const ONBOARDING_COMPLETED_KEY = 'onboarding_completed';
const SCHEMA_VERSION_KEY = 'schema_version';
const DASHBOARD_WIDGETS_KEY = 'dashboard_widgets';

function upsertSetting(key: string, value: string) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function upsertPreference(key: string, value: unknown) {
  db.prepare(`
    INSERT INTO user_preferences (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(value));
}

function ensurePreference(key: string, value: unknown) {
  db.prepare('INSERT OR IGNORE INTO user_preferences (key, value) VALUES (?, ?)')
    .run(key, JSON.stringify(value));
}

export function initDb(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'financialapp.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#8b5cf6'
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      source_file TEXT,
      tx_source TEXT NOT NULL DEFAULT 'bank',
      dedup_hash TEXT UNIQUE,
      is_income INTEGER DEFAULT 0,
      is_subscription INTEGER DEFAULT 0,
      imported_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS category_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      priority INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT,
      inserted INTEGER DEFAULT 0,
      skipped INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS dismissed_subscriptions (
      key TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_txn_cat ON transactions(category_id);
  `);

  // Migração: coluna de direção nas regras (any | expense | income)
  const ruleCols = db.prepare("PRAGMA table_info(category_rules)").all() as { name: string }[];
  if (!ruleCols.some((c) => c.name === 'direction')) {
    db.exec("ALTER TABLE category_rules ADD COLUMN direction TEXT NOT NULL DEFAULT 'any'");
  }

  // Migração: categorias excluídas das estatísticas (transferências entre contas próprias, poupança)
  const catCols = db.prepare("PRAGMA table_info(categories)").all() as { name: string }[];
  if (!catCols.some((c) => c.name === 'excluded')) {
    db.exec("ALTER TABLE categories ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE categories SET excluded = 1 WHERE name IN ('Transferências', 'Poupança')");
  }

  // Migração: categorias de despesa fixa (renda, ginásio, barbeiro, …)
  const catCols2 = db.prepare("PRAGMA table_info(categories)").all() as { name: string }[];
  if (!catCols2.some((c) => c.name === 'is_fixed')) {
    db.exec("ALTER TABLE categories ADD COLUMN is_fixed INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE categories SET is_fixed = 1 WHERE name IN ('Casa', 'Subscrições')");
  }

  // Migração: metadata opcional nas transações (tags + projeto), JSON nullable.
  // Retrocompatível: transações antigas ficam com metadata = NULL.
  const txCols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[];
  if (!txCols.some((c) => c.name === 'metadata')) {
    db.exec('ALTER TABLE transactions ADD COLUMN metadata TEXT');
  }
  if (!txCols.some((c) => c.name === 'tx_source')) {
    db.exec("ALTER TABLE transactions ADD COLUMN tx_source TEXT NOT NULL DEFAULT 'bank'");
    db.exec("UPDATE transactions SET tx_source = 'bank' WHERE tx_source IS NULL OR tx_source = ''");
  }

  upsertSetting(SCHEMA_VERSION_KEY, '1');
  ensureFirstRunState();
  ensurePreference(DASHBOARD_WIDGETS_KEY, {
    order: DEFAULT_DASHBOARD_WIDGET_ORDER,
    visible: DEFAULT_DASHBOARD_WIDGET_ORDER,
  });

  return db;
}

export function getDb(): Database.Database {
  return db;
}

export function getDefaultCategoryCatalog(): CategoryTemplate[] {
  return DEFAULT_CATEGORY_CATALOG;
}

export function getAppState() {
  return {
    onboardingCompleted: getSetting(ONBOARDING_COMPLETED_KEY) === 'true',
    schemaVersion: Number(getSetting(SCHEMA_VERSION_KEY) ?? '1'),
    userDataPath: app.getPath('userData'),
    appVersion: app.getVersion(),
  };
}

export function setPreference(key: string, value: unknown) {
  upsertPreference(key, value);
}

export function getPreference<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM user_preferences WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

// Cria as categorias escolhidas + regras automáticas correspondentes, sem
// marcar o onboarding como concluído (permite importar/categorizar antes do fim).
export function createInitialCategories(selectedCategoryNames: string[]) {
  const selected = new Set(selectedCategoryNames.map((name) => name.trim()).filter(Boolean));
  const templates = DEFAULT_CATEGORY_CATALOG.filter((category) => selected.has(category.name));
  const insertCategory = db.prepare(`
    INSERT INTO categories (name, color, excluded, is_fixed) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO NOTHING
  `);
  const getCategoryId = db.prepare('SELECT id FROM categories WHERE name = ?');
  const insertRule = db.prepare(`
    INSERT INTO category_rules (keyword, category_id, priority, direction)
    SELECT ?, ?, 0, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM category_rules WHERE keyword = ? AND category_id = ?
    )
  `);

  const run = db.transaction(() => {
    const ids = new Map<string, number>();
    for (const category of templates) {
      insertCategory.run(
        category.name,
        category.color,
        category.excluded ? 1 : 0,
        category.isFixed ? 1 : 0,
      );
      const row = getCategoryId.get(category.name) as { id: number } | undefined;
      if (row) ids.set(category.name, row.id);
    }
    for (const rule of DEFAULT_RULE_CATALOG) {
      const categoryId = ids.get(rule.category);
      if (categoryId) {
        insertRule.run(rule.keyword, categoryId, rule.direction ?? 'any', rule.keyword, categoryId);
      }
    }
  });

  run();
  return templates.length;
}

// Marca o onboarding como concluído.
export function finishOnboarding() {
  upsertSetting(ONBOARDING_COMPLETED_KEY, 'true');
}

// Compatibilidade: cria categorias e conclui de uma só vez.
export function completeFirstRun(selectedCategoryNames: string[]) {
  const count = createInitialCategories(selectedCategoryNames);
  finishOnboarding();
  return count;
}

function ensureFirstRunState() {
  if (getSetting(ONBOARDING_COMPLETED_KEY) != null) return;

  const categoryCount = (db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }).c;
  const transactionCount = (db.prepare('SELECT COUNT(*) AS c FROM transactions').get() as { c: number }).c;
  const importCount = (db.prepare('SELECT COUNT(*) AS c FROM imports').get() as { c: number }).c;
  const hasExistingUserData = categoryCount > 0 || transactionCount > 0 || importCount > 0;

  upsertSetting(ONBOARDING_COMPLETED_KEY, hasExistingUserData ? 'true' : 'false');
}
