import path from 'path';
import crypto from 'crypto';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { getDb } from './db';
import type { ImportProgress } from '../shared/types';

type Cell = unknown;
type Matrix = Cell[][];
type ProgressFn = (p: ImportProgress) => void;

const txSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  amount: z.number().finite(),
  currency: z.string().min(1),
});

const DATE_KEYS = ['data', 'date', 'data lanc', 'data mov', 'data movimento', 'dt'];
const DESC_KEYS = ['descricao', 'descrição', 'description', 'descritivo', 'memo', 'detalhe', 'movimento', 'historico', 'histórico'];
const AMOUNT_KEYS = ['valor', 'amount', 'montante', 'importancia', 'importância', 'value', 'quantia'];
const CURRENCY_KEYS = ['moeda', 'currency', 'divisa'];
const DEBIT_KEYS = ['debito', 'débito', 'debit', 'despesa'];
const CREDIT_KEYS = ['credito', 'crédito', 'credit', 'receita'];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Normalização para matching de regras: além de acentos, colapsa espaços múltiplos
// (descrições de banco vêm com padding: "DD SOLINCA LIGHT,  00931522122")
export function matchNorm(s: string): string {
  return norm(s).replace(/\s+/g, ' ');
}

function findCol(headers: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const c = norm(cand);
    let idx = headers.findIndex((h) => norm(h) === c);
    if (idx === -1) idx = headers.findIndex((h) => norm(h).includes(c));
    if (idx > -1) return idx;
  }
  return -1;
}

export function parseAmount(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).trim().replace(/[€$£\s]/g, '');
  if (!s) return null;
  const negParen = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals <= 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return negParen ? -n : n;
}

export function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    // Data em formato serial do Excel
    if (v > 25569 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  if (v == null) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    let d = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10);
    const y = m[3];
    // formato PT: dia primeiro; se inválido, troca
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

function readMatrix(fileName: string, buffer: Buffer): Matrix {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    // SheetJS lê variantes não-standard de bancos que o ExcelJS rejeita
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as Matrix;
  }
  const text = buffer.toString('utf-8');
  const result = Papa.parse<Cell[]>(text, { skipEmptyLines: true });
  return result.data;
}

// Procura nas primeiras linhas aquela que contém os cabeçalhos reais
// (extratos de banco costumam ter metadados antes da tabela)
function findHeaderRow(matrix: Matrix): { headerIdx: number; headers: string[] } | null {
  const scan = Math.min(matrix.length, 25);
  for (let i = 0; i < scan; i++) {
    const headers = (matrix[i] ?? []).map((c) => String(c ?? '').trim());
    if (headers.filter(Boolean).length < 2) continue;
    const hasDate = findCol(headers, DATE_KEYS) > -1;
    const hasAmount =
      findCol(headers, AMOUNT_KEYS) > -1 ||
      findCol(headers, DEBIT_KEYS) > -1 ||
      findCol(headers, CREDIT_KEYS) > -1;
    if (hasDate && hasAmount) return { headerIdx: i, headers };
  }
  return null;
}

export async function importFile(fileName: string, buffer: Buffer, onProgress: ProgressFn, project?: string): Promise<void> {
  const db = getDb();
  // Extrato dedicado a um projeto: todas as linhas inseridas ficam com metadata.project
  const projectMeta = project && project.trim() ? JSON.stringify({ project: project.trim() }) : null;
  try {
    onProgress({ percent: 5, message: `A ler ${fileName}…` });
    const matrix = readMatrix(fileName, buffer);
    if (matrix.length === 0) {
      onProgress({ percent: 100, message: `${fileName}: ficheiro vazio ou formato não reconhecido.`, done: true, inserted: 0, skipped: 0, errors: 0, error: 'Sem linhas para importar' });
      return;
    }

    const header = findHeaderRow(matrix);
    if (!header) {
      const firstRow = (matrix[0] ?? []).map((c) => String(c ?? '')).filter(Boolean).join(', ');
      onProgress({
        percent: 100, message: `${fileName}: colunas obrigatórias não encontradas.`, done: true, inserted: 0, skipped: 0, errors: matrix.length,
        error: `Não encontrei uma linha de cabeçalho com Data + Valor (ou Débito/Crédito). Primeira linha do ficheiro: ${firstRow || '(vazia)'}`,
      });
      return;
    }

    const { headerIdx, headers } = header;
    const rows = matrix.slice(headerIdx + 1);
    onProgress({ percent: 20, message: `${rows.length} linhas lidas (cabeçalho na linha ${headerIdx + 1}). A processar…` });

    const dateCol = findCol(headers, DATE_KEYS);
    const descCol = findCol(headers, DESC_KEYS);
    const amountCol = findCol(headers, AMOUNT_KEYS);
    const currencyCol = findCol(headers, CURRENCY_KEYS);
    const debitCol = findCol(headers, DEBIT_KEYS);
    const creditCol = findCol(headers, CREDIT_KEYS);

    const rules = db.prepare(
      'SELECT keyword, category_id, direction FROM category_rules ORDER BY priority DESC, LENGTH(keyword) DESC'
    ).all() as { keyword: string; category_id: number; direction: string }[];
    const subCatId = (db.prepare("SELECT id FROM categories WHERE name = 'Subscrições'").get() as { id: number } | undefined)?.id;

    const insert = db.prepare(`
      INSERT OR IGNORE INTO transactions (date, description, amount, currency, category_id, source_file, tx_source, dedup_hash, is_income, is_subscription, metadata)
      VALUES (@date, @description, @amount, @currency, @category_id, @source_file, @tx_source, @dedup_hash, @is_income, @is_subscription, @metadata)
    `);

    let inserted = 0, skipped = 0, errors = 0;
    const run = db.transaction(() => {
      rows.forEach((row, i) => {
        if (!row || row.every((c) => c == null || String(c).trim() === '')) return;
        const date = parseDate(row[dateCol]);
        const description = String(descCol > -1 ? row[descCol] ?? '' : '').trim() || '(sem descrição)';
        let amount: number | null = null;
        if (amountCol > -1) amount = parseAmount(row[amountCol]);
        if (amount == null) {
          const deb = debitCol > -1 ? parseAmount(row[debitCol]) : null;
          const cred = creditCol > -1 ? parseAmount(row[creditCol]) : null;
          if (deb != null && deb !== 0) amount = -Math.abs(deb);
          else if (cred != null && cred !== 0) amount = Math.abs(cred);
        }
        const currency = String(currencyCol > -1 ? row[currencyCol] ?? '' : '').trim() || 'EUR';

        if (!date || amount == null) { errors++; return; }
        const parsed = txSchema.safeParse({ date, description, amount, currency });
        if (!parsed.success) { errors++; return; }

        const descNorm = norm(description);
        const descMatch = matchNorm(description);
        let category_id: number | null = null;
        for (const r of rules) {
          if (r.direction === 'expense' && amount >= 0) continue;
          if (r.direction === 'income' && amount < 0) continue;
          if (descMatch.includes(matchNorm(r.keyword))) { category_id = r.category_id; break; }
        }
        const is_subscription = category_id != null && category_id === subCatId ? 1 : 0;
        const dedup_hash = crypto.createHash('sha1').update(`${date}|${amount}|${descNorm}`).digest('hex');

        const res = insert.run({
          date, description, amount, currency, category_id,
          source_file: fileName, tx_source: 'bank', dedup_hash,
          is_income: amount > 0 ? 1 : 0, is_subscription,
          metadata: projectMeta,
        });
        if (res.changes > 0) inserted++; else skipped++;

        if (i % 100 === 0) {
          onProgress({ percent: 20 + Math.round((i / rows.length) * 75), message: `${fileName}: a processar ${i + 1}/${rows.length}…` });
        }
      });
    });
    run();

    db.prepare('INSERT INTO imports (file_name, inserted, skipped) VALUES (?, ?, ?)').run(fileName, inserted, skipped);
    onProgress({
      percent: 100, done: true, inserted, skipped, errors,
      message: `${fileName}: ${inserted} inseridas, ${skipped} duplicadas ignoradas, ${errors} linhas inválidas.`,
    });
  } catch (err) {
    onProgress({ percent: 100, done: true, inserted: 0, skipped: 0, errors: 0, message: `Erro ao importar ${fileName}.`, error: String(err instanceof Error ? err.message : err) });
  }
}
