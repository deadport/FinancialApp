import { useEffect, useState } from 'react';
import { api, fmtDate, fmtMoney } from '../api';
import { useAppStore } from '../store';
import type { Category, Transaction, TransactionMetadata } from '../../shared/types';

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
  const [tagFilter, setTagFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [facets, setFacets] = useState<{ tags: string[]; projects: string[] }>({ tags: [], projects: [] });
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => { api.listCategories().then(setCats); }, [refreshKey]);
  useEffect(() => { api.txMetaFacets().then(setFacets); }, [refreshKey]);

  const filters = {
    search: search || undefined,
    categoryId: catFilter ? Number(catFilter) : undefined,
    kind: (kind || undefined) as 'expense' | 'income' | undefined,
    from: from || undefined,
    to: to || undefined,
    tag: tagFilter || undefined,
    project: projectFilter || undefined,
  };

  useEffect(() => {
    const t = setTimeout(() => {
      api.listTransactions({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
        .then((r) => { setRows(r.rows); setTotal(r.total); setSum(r.sum); });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, catFilter, kind, from, to, tagFilter, projectFilter, page, refreshKey]);

  useEffect(() => { setPage(0); }, [search, catFilter, kind, from, to, tagFilter, projectFilter]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeCat = async (id: number, value: string) => {
    await api.setTxCategory(id, value ? Number(value) : null);
    setRows((rs) => rs.map((r) => r.id === id
      ? { ...r, category_id: value ? Number(value) : null, category_name: cats.find((c) => c.id === Number(value))?.name ?? null }
      : r));
  };

  const saveMetadata = async (id: number, metadata: TransactionMetadata | null) => {
    await api.setTxMetadata(id, metadata);
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, metadata } : r));
    setEditing(null);
    api.txMetaFacets().then(setFacets);
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
            const r = await api.exportCsv(filters);
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
          {/* Filtros opcionais: só aparecem quando existem tags/projetos */}
          {facets.tags.length > 0 && (
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} title="Filtrar por tag">
              <option value="">Todas as tags</option>
              {facets.tags.map((t) => <option key={t} value={t}>🏷 {t}</option>)}
            </select>
          )}
          {facets.projects.length > 0 && (
            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} title="Filtrar por projeto">
              <option value="">Todos os projetos</option>
              {facets.projects.map((p) => <option key={p} value={p}>📁 {p}</option>)}
            </select>
          )}
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
                    <td title={t.description}>
                      {t.description}
                      {(t.metadata?.tags?.length || t.metadata?.project) && (
                        <div className="tag-chips">
                          {t.metadata?.project && <span className="chip project">📁 {t.metadata.project}</span>}
                          {t.metadata?.tags?.map((tag) => <span key={tag} className="chip">{tag}</span>)}
                        </div>
                      )}
                    </td>
                    <td>
                      <select value={t.category_id ?? ''} onChange={(e) => changeCat(t.id, e.target.value)} style={{ maxWidth: 170 }}>
                        <option value="">— Sem categoria —</option>
                        {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className={`amount ${t.amount >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(t.amount, t.currency)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn icon-flat" title="Tags e projeto" onClick={() => setEditing(t)}>🏷</button>
                        <button className="btn danger" title="Apagar" onClick={async () => {
                          await api.deleteTx(t.id);
                          setRows((rs) => rs.filter((r) => r.id !== t.id));
                          setTotal((n) => n - 1);
                        }}>✕</button>
                      </div>
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

      {editing && (
        <MetaEditor
          tx={editing}
          suggestions={facets.tags}
          projects={facets.projects}
          onClose={() => setEditing(null)}
          onSave={(meta) => saveMetadata(editing.id, meta)}
        />
      )}
    </>
  );
}

// Editor discreto de tags + projeto de uma transação.
function MetaEditor({
  tx,
  suggestions,
  projects,
  onClose,
  onSave,
}: {
  tx: Transaction;
  suggestions: string[];
  projects: string[];
  onClose: () => void;
  onSave: (meta: TransactionMetadata | null) => void;
}) {
  const [tags, setTags] = useState<string[]>(tx.metadata?.tags ?? []);
  const [project, setProject] = useState(tx.metadata?.project ?? '');
  const [input, setInput] = useState('');

  const addTag = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setTags((cur) => (cur.includes(value) ? cur : [...cur, value]));
    setInput('');
  };

  const save = () => {
    const tagsClean = tags.map((t) => t.trim()).filter(Boolean);
    const projectClean = project.trim();
    const meta: TransactionMetadata = {};
    if (tagsClean.length) meta.tags = tagsClean;
    if (projectClean) meta.project = projectClean;
    onSave(meta.tags || meta.project ? meta : null);
  };

  const free = suggestions.filter((s) => !tags.includes(s));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Organizar transação</h2>
        <div className="modal-desc muted" title={tx.description}>{tx.description}</div>

        <label className="modal-field">
          <span>Tags</span>
          <div className="tag-input">
            {tags.map((tag) => (
              <span key={tag} className="chip removable" onClick={() => setTags((cur) => cur.filter((t) => t !== tag))}>
                {tag} ✕
              </span>
            ))}
            <input
              type="text"
              value={input}
              placeholder="freelance, cliente A…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
                else if (e.key === 'Backspace' && !input && tags.length) setTags((cur) => cur.slice(0, -1));
              }}
            />
          </div>
        </label>
        {free.length > 0 && (
          <div className="tag-suggest">
            {free.slice(0, 8).map((s) => (
              <button key={s} type="button" className="chip suggest" onClick={() => addTag(s)}>+ {s}</button>
            ))}
          </div>
        )}

        <label className="modal-field">
          <span>Projeto</span>
          <input
            type="text"
            list="project-options"
            value={project}
            placeholder="Escolhe um existente ou escreve um novo"
            onChange={(e) => setProject(e.target.value)}
          />
          <datalist id="project-options">
            {projects.map((p) => <option key={p} value={p} />)}
          </datalist>
        </label>
        {projects.length > 0 && (
          <div className="tag-suggest">
            {projects.filter((p) => p !== project).slice(0, 8).map((p) => (
              <button key={p} type="button" className="chip project suggest" onClick={() => setProject(p)}>📁 {p}</button>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
