import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';
import { api, fmtMoney } from '../api';
import { useAppStore } from '../store';
import type { CategoryStat, MonthlyStat, Summary } from '../../shared/types';

export default function Dashboard() {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const openTxForCategory = useAppStore((s) => s.openTransactionsForCategory);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
  const [byCat, setByCat] = useState<(CategoryStat & { id: number | null })[]>([]);
  const [mom, setMom] = useState<Awaited<ReturnType<typeof api.momCompare>>>(null);

  useEffect(() => {
    api.summary(from || undefined, to || undefined).then(setSummary);
    api.monthly().then(setMonthly);
    api.byCategory(from || undefined, to || undefined).then((cats) =>
      setByCat(cats.filter((c) => c.total > 0))
    );
    api.momCompare().then(setMom);
  }, [from, to, refreshKey]);

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {(from || to) && (
            <button className="btn ghost" onClick={() => { setFrom(''); setTo(''); }}>Limpar</button>
          )}
        </div>
      </div>
      <div className="page-body">
        <div className="cards">
          <div className="kpi-card">
            <div className="kpi-title">Receitas</div>
            <div className="kpi-value green">{summary ? fmtMoney(summary.income) : '—'}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Despesas</div>
            <div className="kpi-value red">{summary ? fmtMoney(summary.expenses) : '—'}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Saldo</div>
            <div className={`kpi-value ${summary && summary.balance >= 0 ? 'green' : 'red'}`}>
              {summary ? fmtMoney(summary.balance) : '—'}
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Transações</div>
            <div className="kpi-value purple">{summary?.count ?? '—'}</div>
          </div>
        </div>

        {summary?.count === 0 ? (
          <div className="panel empty">
            Ainda não há dados. Vai a <strong>Importar</strong> e adiciona um extrato (CSV ou XLSX).
          </div>
        ) : (
          <div className="charts-row">
            <div className="panel">
              <h2>Receitas vs Despesas por mês</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthly} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="#25332b" vertical={false} />
                  <XAxis dataKey="month" stroke="#93ab9d" fontSize={11} />
                  <YAxis stroke="#93ab9d" fontSize={11} width={70} />
                  <Tooltip
                    cursor={{ fill: 'rgba(52, 211, 153, 0.08)' }}
                    contentStyle={{ background: '#16201a', border: '1px solid #25332b', borderRadius: 8 }}
                    labelStyle={{ color: '#e6f2ea' }}
                    itemStyle={{ color: '#e6f2ea' }}
                    formatter={(v) => fmtMoney(Number(v))}
                  />
                  <Legend />
                  <Bar dataKey="income" name="Receitas" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Despesas" fill="#f87171" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="panel">
              <h2>Despesas por categoria <span className="muted">(clica numa fatia para ver as transações)</span></h2>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={byCat} dataKey="total" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}
                    onClick={(d: { id?: number | null }) => { if (d?.id != null) openTxForCategory(d.id); }}
                  >
                    {byCat.map((c, i) => <Cell key={i} fill={c.color} cursor={c.id != null ? 'pointer' : 'default'} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#16201a', border: '1px solid #25332b', borderRadius: 8 }}
                    labelStyle={{ color: '#e6f2ea' }}
                    itemStyle={{ color: '#e6f2ea' }}
                    formatter={(v) => fmtMoney(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#e6f2ea' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {mom && mom.rows.length > 0 && (
          <div className="panel">
            <h2>Comparação com o mês anterior ({mom.previousMonth} → {mom.currentMonth})</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th style={{ textAlign: 'right' }}>{mom.previousMonth}</th>
                    <th style={{ textAlign: 'right' }}>{mom.currentMonth}</th>
                    <th style={{ textAlign: 'right' }}>Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {mom.rows.map((r, i) => {
                    const delta = r.current - r.previous;
                    const pct = r.previous > 0 ? (delta / r.previous) * 100 : null;
                    return (
                      <tr key={i}>
                        <td><span className="row-flex"><span className="color-dot" style={{ background: r.color }} />{r.name}</span></td>
                        <td className="amount">{fmtMoney(r.previous)}</td>
                        <td className="amount">{fmtMoney(r.current)}</td>
                        <td className="amount" style={{ color: delta > 0 ? '#f87171' : '#34d399' }}>
                          {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {fmtMoney(Math.abs(delta))}
                          {pct != null && ` (${pct > 0 ? '+' : ''}${pct.toFixed(0)}%)`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
