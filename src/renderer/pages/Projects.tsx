import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import { api, fmtDate, fmtMoney } from '../api';
import { useAppStore } from '../store';
import type { ProjectDetail, ProjectStat, Transaction } from '../../shared/types';

export default function Projects() {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);
  const [projects, setProjects] = useState<ProjectStat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    api.listProjects().then((ps) => {
      setProjects(ps);
      setSelected((cur) => (cur && ps.some((p) => p.name === cur) ? cur : (ps[0]?.name ?? null)));
    });
  }, [refreshKey]);

  useEffect(() => {
    if (!selected) { setDetail(null); setRows([]); return; }
    api.projectDetail(selected).then(setDetail);
    api.listTransactions({ project: selected, limit: 500 }).then((r) => setRows(r.rows));
  }, [selected, refreshKey]);

  const active = projects.find((p) => p.name === selected);

  // Série de lucro mensal + lucro acumulado (orientado a negócio)
  const profitSeries = useMemo(() => {
    if (!detail) return [];
    let running = 0;
    return detail.monthly.map((m) => {
      const profit = m.income - m.expenses;
      running += profit;
      return { month: m.month, profit, cumulative: running };
    });
  }, [detail]);

  if (projects.length === 0) {
    return (
      <>
        <div className="page-header"><h1>Projetos</h1></div>
        <div className="page-body">
          <div className="empty">
            Ainda não tens projetos. Abre uma transação em <strong>Transações</strong>, clica em 🏷
            e atribui um projeto — ele aparece aqui com lucro, margem e gráficos próprios.
          </div>
        </div>
      </>
    );
  }

  const income = active?.income ?? 0;
  const expenses = active?.expenses ?? 0;
  const profit = income - expenses;
  const margin = income > 0 ? (profit / income) * 100 : 0;

  return (
    <>
      <div className="page-header">
        <h1>Projetos</h1>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <span className="muted">{projects.length} projeto{projects.length === 1 ? '' : 's'}</span>
          {active && (
            <button className="btn ghost" title="Editar nome do projeto" onClick={() => setRenaming(true)}>✏️ Editar nome</button>
          )}
        </div>
      </div>
      <div className="page-body">
        {/* Seletor compacto de projetos (pills horizontais) */}
        <div className="project-pills">
          {projects.map((p) => (
            <button
              key={p.name}
              className={`project-pill ${p.name === selected ? 'active' : ''}`}
              onClick={() => setSelected(p.name)}
            >
              📁 {p.name}
              <span className={(p.income - p.expenses) >= 0 ? 'pill-amount pos' : 'pill-amount neg'}>
                {fmtMoney(p.income - p.expenses)}
              </span>
            </button>
          ))}
        </div>

        {active && (
          <>
            <div className="cards">
              <div className="kpi-card"><div className="kpi-title">Receitas</div><div className="kpi-value" style={{ color: '#34d399' }}>{fmtMoney(income)}</div></div>
              <div className="kpi-card"><div className="kpi-title">Despesas</div><div className="kpi-value" style={{ color: '#f87171' }}>{fmtMoney(expenses)}</div></div>
              <div className="kpi-card"><div className="kpi-title">Lucro</div><div className="kpi-value" style={{ color: profit >= 0 ? '#34d399' : '#f87171' }}>{fmtMoney(profit)}</div></div>
              <div className="kpi-card"><div className="kpi-title">Margem</div><div className="kpi-value purple">{margin.toFixed(0)}%</div></div>
            </div>

            <div className="charts-row">
              <div className="panel">
                <h2>Lucro por mês</h2>
                {profitSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={profitSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#25332b" />
                      <XAxis dataKey="month" stroke="#93ab9d" fontSize={12} />
                      <YAxis stroke="#93ab9d" fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: '#16201a', border: '1px solid #25332b', borderRadius: 8 }}
                        formatter={(v: number) => [fmtMoney(v), 'Lucro']}
                      />
                      <Bar dataKey="profit" name="Lucro" radius={[4, 4, 0, 0]}>
                        {profitSeries.map((d, i) => (
                          <Cell key={i} fill={d.profit >= 0 ? '#34d399' : '#f87171'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="empty">Sem dados para o gráfico.</div>}
              </div>

              <div className="panel">
                <h2>Lucro acumulado</h2>
                {profitSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={profitSeries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#25332b" />
                      <XAxis dataKey="month" stroke="#93ab9d" fontSize={12} />
                      <YAxis stroke="#93ab9d" fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: '#16201a', border: '1px solid #25332b', borderRadius: 8 }}
                        formatter={(v: number) => [fmtMoney(v), 'Acumulado']}
                      />
                      <Area type="monotone" dataKey="cumulative" name="Acumulado" stroke="#34d399" strokeWidth={2} fill="url(#cumFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div className="empty">Sem dados para o gráfico.</div>}
              </div>
            </div>

            {detail && detail.byCategory.length > 0 && (
              <div className="panel" style={{ marginTop: 16 }}>
                <h2>Onde vai o dinheiro (despesas por categoria)</h2>
                <div className="cat-bars">
                  {(() => {
                    const max = Math.max(...detail.byCategory.map((c) => c.total));
                    return detail.byCategory.map((c) => (
                      <div key={c.name} className="cat-bar-row">
                        <span className="cat-bar-label" title={c.name}>
                          <span className="color-dot" style={{ background: c.color }} />{c.name}
                        </span>
                        <div className="cat-bar-track">
                          <div className="cat-bar-fill" style={{ width: `${(c.total / max) * 100}%`, background: c.color }} />
                        </div>
                        <span className="cat-bar-value">{fmtMoney(c.total)}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            <div className="panel" style={{ marginTop: 16 }}>
              <h2>Transações do projeto</h2>
              {rows.length === 0 ? (
                <div className="empty">Sem transações.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style={{ textAlign: 'right' }}>Valor</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((t) => (
                        <tr key={t.id}>
                          <td>{fmtDate(t.date)}</td>
                          <td title={t.description}>{t.description}</td>
                          <td>{t.category_name ?? '—'}</td>
                          <td className={`amount ${t.amount >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(t.amount, t.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {renaming && active && (
        <RenameModal
          current={active.name}
          existing={projects.map((p) => p.name)}
          onClose={() => setRenaming(false)}
          onRename={async (newName) => {
            await api.renameProject(active.name, newName);
            setRenaming(false);
            setSelected(newName);
            bumpRefresh();
          }}
        />
      )}
    </>
  );
}

function RenameModal({
  current,
  existing,
  onClose,
  onRename,
}: {
  current: string;
  existing: string[];
  onClose: () => void;
  onRename: (newName: string) => void;
}) {
  const [name, setName] = useState(current);
  const trimmed = name.trim();
  const clash = trimmed !== current && existing.includes(trimmed);
  const valid = trimmed.length > 0 && trimmed !== current && !clash;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Editar nome do projeto</h2>
        <div className="modal-desc muted">Atualiza o nome em todas as transações deste projeto.</div>
        <label className="modal-field">
          <span>Nome</span>
          <input type="text" value={name} autoFocus onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && valid) onRename(trimmed); }} />
        </label>
        {clash && <div className="import-msg error">Já existe um projeto com esse nome.</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" disabled={!valid} onClick={() => onRename(trimmed)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
