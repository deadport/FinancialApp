import { useEffect, useState } from 'react';
import { api, fmtDate, fmtMoney } from '../api';
import { useAppStore } from '../store';
import type { Category, Transaction } from '../../shared/types';

const PAGE_SIZE = 100;

export default function Transactions() {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState(0);
  const [cats, setCats] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  // Se viemos de um clique num gráfico, abre já filtrado por essa categoria
  const [catFilter, setCatFilter] = useState(() => {
    const preset = useAppStore.getState().consumeTxPreset();
    return preset != null ? String(preset) : '';
  });
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => { api.listCategories().then(setCats); }, [refreshKey]);

  useEffect(() => {
    const t = setTimeout(() => {
      api.listTransactions({
        search: search || undefined,
        categoryId: catFilter ? Number(catFilter) : undefined,
        kind: (kind || undefined) as 'expense' | 'income' | undefined,
        from: from || undefined,
        to: to || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }).then((r) => { setRows(r.rows); setTotal(r.total); setSum(r.sum); });
    }, 200);
    return () => clearTimeout(t);
  }, [search, catFilter, kind, from, to, page, refreshKey]);

  useEffect(() => { setPage(0); }, [search, catFilter, kind, from, to]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeCat = async (id: number, value: string) => {
    await api.setTxCategory(id, value ? Number(value) : null);
    setRows((rs) => rs.map((r) => r.id === id
      ? { ...r, category_id: value ? Number(value) : null, category_name: cats.find((c) => c.id === Number(value))?.name ?? null }
      : r));
  };

  return (
    <>
      <div className="page-header">
        <h1>Transações</h1>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <span className="muted">
            {total} resultados · total <strong style={{ color: sum >= 0 ? '#34d399' : '#f87171' }}>{fmtMoney(sum)}</strong>
          </span>
          <button className="btn ghost" title="Exporta as transações com os filtros atuais para CSV (abre no Excel)" onClick={async () => {
            const r = await api.exportCsv({
              search: search || undefined,
              categoryId: catFilter ? Number(catFilter) : undefined,
              kind: (kind || undefined) as 'expense' | 'income' | undefined,
              from: from || undefined,
              to: to || undefined,
            });
            if (r) window.alert(`${r.count} transações exportadas para:\n${r.path}`);
          }}>📤 Exportar CSV</button>
        </div>
      </div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="toolbar">
          <input type="text" placeholder="Pesquisar descrição…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 180px' }} />
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Entradas e saídas</option>
            <option value="expense">↓ Só saídas</option>
            <option value="income">↑ Só entradas</option>
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
            <option value="">Todas as categorias</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        {rows.length === 0 ? (
          <div className="empty">Sem transações para mostrar.</div>
        ) : (
          <div className="table-wrap" style={{ flex: 1, minHeight: 0 }}>
            <table>
              <thead>
                <tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style={{ textAlign: 'right' }}>Valor</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.date)}</td>
                    <td title={t.description}>{t.description}</td>
                    <td>
                      <select value={t.category_id ?? ''} onChange={(e) => changeCat(t.id, e.target.value)} style={{ maxWidth: 170 }}>
                        <option value="">— Sem categoria —</option>
                        {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className={`amount ${t.amount >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(t.amount, t.currency)}</td>
                    <td>
                      <button className="btn danger" title="Apagar" onClick={async () => {
                        await api.deleteTx(t.id);
                        setRows((rs) => rs.filter((r) => r.id !== t.id));
                        setTotal((n) => n - 1);
                      }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="toolbar" style={{ marginTop: 14, marginBottom: 0, justifyContent: 'center' }}>
            <button className="btn ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Anterior</button>
            <span className="muted">Página {page + 1} de {pages}</span>
            <button className="btn ghost" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Seguinte →</button>
          </div>
        )}
      </div>
    </>
  );
}
