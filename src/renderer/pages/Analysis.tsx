import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine, ComposedChart, Line, Legend,
  PieChart, Pie,
} from 'recharts';
import { api, fmtMoney } from '../api';
import { useAppStore } from '../store';
import type { DashboardWidgetPreference, MonthlyStat } from '../../shared/types';
import { DEFAULT_DASHBOARD_WIDGET_ORDER } from '../../shared/defaultConfig';

const PREF_KEY = 'dashboard_widgets';

const tooltipStyle = {
  contentStyle: { background: '#16201a', border: '1px solid #25332b', borderRadius: 8 },
  labelStyle: { color: '#e6f2ea' },
  itemStyle: { color: '#e6f2ea' },
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const WIDGET_TITLES: Record<string, string> = {
  balance_evolution: 'Evolução do saldo acumulado',
  savings_rate: 'Taxa de poupança mensal',
  top_merchants: 'Top 10 onde o dinheiro vai',
  weekday_spending: 'Gastos por dia da semana',
  fixed_vs_variable: 'Despesas fixas vs variáveis',
  savings_projection: 'Poupança + projeção',
  income_split: 'De onde vem o dinheiro',
  biggest_expenses: 'Maiores despesas individuais',
  daily_heatmap: 'Mapa de calor diário',
};

export default function Analysis() {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
  const [top, setTop] = useState<{ description: string; total: number; n: number }[]>([]);
  const [weekday, setWeekday] = useState<{ wd: number; total: number; n: number }[]>([]);
  const [daily, setDaily] = useState<{ date: string; total: number }[]>([]);
  const [fixedVar, setFixedVar] = useState<{ month: string; fixas: number; variaveis: number }[]>([]);
  const [incomeSplit, setIncomeSplit] = useState<{ name: string; color: string; total: number }[]>([]);
  const [savingsM, setSavingsM] = useState<{ month: string; net: number }[]>([]);
  const [biggest, setBiggest] = useState<{ date: string; description: string; total: number }[]>([]);
  const [prefs, setPrefs] = useState<DashboardWidgetPreference>({
    order: DEFAULT_DASHBOARD_WIDGET_ORDER,
    visible: DEFAULT_DASHBOARD_WIDGET_ORDER,
  });
  const [customizing, setCustomizing] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  useEffect(() => {
    api.monthly().then(setMonthly);
    api.topMerchants().then(setTop);
    api.weekdaySpending().then(setWeekday);
    api.dailySpending().then(setDaily);
    api.fixedVar().then(setFixedVar);
    api.incomeSplit().then(setIncomeSplit);
    api.savingsMonthly().then(setSavingsM);
    api.biggestExpenses().then(setBiggest);
  }, [refreshKey]);

  useEffect(() => {
    api.getPreference<DashboardWidgetPreference>(PREF_KEY, {
      order: DEFAULT_DASHBOARD_WIDGET_ORDER,
      visible: DEFAULT_DASHBOARD_WIDGET_ORDER,
    }).then((saved) => {
      const known = new Set(DEFAULT_DASHBOARD_WIDGET_ORDER);
      const order = [...saved.order.filter((id) => known.has(id)), ...DEFAULT_DASHBOARD_WIDGET_ORDER.filter((id) => !saved.order.includes(id))];
      const visible = saved.visible.filter((id) => known.has(id));
      setPrefs({ order, visible });
    });
  }, []);

  const savePrefs = (next: DashboardWidgetPreference) => {
    setPrefs(next);
    api.setPreference(PREF_KEY, next);
  };

  const hideWidget = (id: string) => {
    savePrefs({ ...prefs, visible: prefs.visible.filter((item) => item !== id) });
  };

  const showWidget = (id: string) => {
    savePrefs({ ...prefs, visible: [...prefs.visible, id] });
  };

  const moveWidget = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = prefs.order.indexOf(sourceId);
    const targetIndex = prefs.order.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextOrder = [...prefs.order];
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, sourceId);
    savePrefs({ ...prefs, order: nextOrder });
  };

  // Saldo acumulado mês a mês
  const cumulative = useMemo(() => {
    let acc = 0;
    return monthly.map((m) => {
      acc += m.income - m.expenses;
      return { month: m.month, saldo: Math.round(acc * 100) / 100 };
    });
  }, [monthly]);

  // Taxa de poupança: % do rendimento que sobra em cada mês
  const savings = useMemo(() => monthly
    .filter((m) => m.income > 0)
    .map((m) => ({
      month: m.month,
      taxa: Math.round(((m.income - m.expenses) / m.income) * 1000) / 10,
    })), [monthly]);

  const weekdayData = useMemo(() => WEEKDAYS.map((name, i) => ({
    name,
    total: Math.round((weekday.find((w) => w.wd === i)?.total ?? 0) * 100) / 100,
  })), [weekday]);

  const projection = useMemo(() => {
    if (savingsM.length === 0) return [];
    let acc = 0;
    const real = savingsM.map((m) => {
      acc += m.net;
      return { month: m.month, saldo: Math.round(acc * 100) / 100, projecao: null as number | null };
    });
    const lastMonths = savingsM.slice(-3);
    const avgNet = lastMonths.reduce((a, m) => a + m.net, 0) / lastMonths.length;
    const last = real[real.length - 1];
    last.projecao = last.saldo;
    let [y, mo] = last.month.split('-').map(Number);
    let proj = last.saldo;
    const out = [...real];
    for (let i = 1; i <= 6; i++) {
      mo++; if (mo > 12) { mo = 1; y++; }
      proj += avgNet;
      out.push({ month: `${y}-${String(mo).padStart(2, '0')}`, saldo: null as unknown as number, projecao: Math.round(proj * 100) / 100 });
    }
    return out;
  }, [savingsM]);

  const heatmap = useMemo(() => {
    const map = new Map(daily.map((d) => [d.date, d.total]));
    const today = new Date();
    const days: { date: string; total: number }[] = [];
    for (let i = 118; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ date: iso, total: map.get(iso) ?? 0 });
    }
    const firstWd = new Date(days[0].date + 'T12:00').getDay();
    const padded: ({ date: string; total: number } | null)[] = [...Array(firstWd).fill(null), ...days];
    const max = Math.max(1, ...days.map((d) => d.total));
    return { padded, max };
  }, [daily]);

  const avgSavings = savings.length
    ? Math.round(savings.reduce((a, s) => a + s.taxa, 0) / savings.length * 10) / 10
    : null;
  const trend = cumulative.length >= 2
    ? cumulative[cumulative.length - 1].saldo - cumulative[0].saldo
    : null;
  const topWeekday = weekdayData.reduce((a, b) => (b.total > a.total ? b : a), weekdayData[0]);

  const widgetBodies: Record<string, JSX.Element> = {
    balance_evolution: (
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={cumulative} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#25332b" vertical={false} />
          <XAxis dataKey="month" stroke="#93ab9d" fontSize={11} />
          <YAxis stroke="#93ab9d" fontSize={11} width={70} />
          <Tooltip {...tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
          <ReferenceLine y={0} stroke="#f87171" strokeDasharray="4 4" />
          <Area type="monotone" dataKey="saldo" name="Saldo" stroke="#34d399" strokeWidth={2} fill="url(#saldoGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    ),
    savings_rate: (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={savings} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke="#25332b" vertical={false} />
          <XAxis dataKey="month" stroke="#93ab9d" fontSize={11} />
          <YAxis stroke="#93ab9d" fontSize={11} width={45} unit="%" />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(52, 211, 153, 0.08)' }} formatter={(v) => `${v}%`} />
          <ReferenceLine y={0} stroke="#93ab9d" />
          <ReferenceLine y={20} stroke="#34d399" strokeDasharray="4 4" label={{ value: 'meta 20%', fill: '#34d399', fontSize: 11, position: 'insideTopRight' }} />
          <Bar dataKey="taxa" name="Poupança" radius={[4, 4, 0, 0]}>
            {savings.map((s, i) => <Cell key={i} fill={s.taxa >= 0 ? '#34d399' : '#f87171'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    ),
    top_merchants: (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={top} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid stroke="#25332b" horizontal={false} />
          <XAxis type="number" stroke="#93ab9d" fontSize={11} />
          <YAxis
            type="category" dataKey="description" stroke="#93ab9d" fontSize={10} width={170}
            tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 24)}...` : v)}
          />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(52, 211, 153, 0.08)' }} formatter={(v, _n, p) => [`${fmtMoney(Number(v))} (${(p.payload as { n: number }).n}x)`, 'Total']} />
          <Bar dataKey="total" fill="#f87171" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    ),
    weekday_spending: (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={weekdayData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke="#25332b" vertical={false} />
          <XAxis dataKey="name" stroke="#93ab9d" fontSize={11} />
          <YAxis stroke="#93ab9d" fontSize={11} width={70} />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(52, 211, 153, 0.08)' }} formatter={(v) => fmtMoney(Number(v))} />
          <Bar dataKey="total" name="Gasto" radius={[4, 4, 0, 0]}>
            {weekdayData.map((d, i) => (
              <Cell key={i} fill={topWeekday && d.name === topWeekday.name && d.total > 0 ? '#f87171' : '#10b981'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    ),
    fixed_vs_variable: (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={fixedVar} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke="#25332b" vertical={false} />
          <XAxis dataKey="month" stroke="#93ab9d" fontSize={11} />
          <YAxis stroke="#93ab9d" fontSize={11} width={70} />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(52, 211, 153, 0.08)' }} formatter={(v) => fmtMoney(Number(v))} />
          <Legend />
          <Bar dataKey="fixas" name="Fixas" stackId="a" fill="#8b5cf6" />
          <Bar dataKey="variaveis" name="Variáveis" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    ),
    savings_projection: projection.length === 0 ? (
      <div className="empty">Sem movimentos na categoria Poupança ainda.</div>
    ) : (
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={projection} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke="#25332b" vertical={false} />
          <XAxis dataKey="month" stroke="#93ab9d" fontSize={11} />
          <YAxis stroke="#93ab9d" fontSize={11} width={70} />
          <Tooltip {...tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
          <ReferenceLine y={0} stroke="#f87171" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="saldo" name="Poupança" stroke="#34d399" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="projecao" name="Projeção" stroke="#fbbf24" strokeWidth={2} strokeDasharray="6 4" dot={false} />
          <Legend />
        </ComposedChart>
      </ResponsiveContainer>
    ),
    income_split: incomeSplit.length === 0 ? (
      <div className="empty">Sem receitas categorizadas ainda.</div>
    ) : (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={incomeSplit} dataKey="total" nameKey="name" innerRadius={50} outerRadius={88} paddingAngle={2}>
            {incomeSplit.map((c, i) => <Cell key={i} fill={c.color} />)}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    ),
    biggest_expenses: (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={biggest} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
          <CartesianGrid stroke="#25332b" horizontal={false} />
          <XAxis type="number" stroke="#93ab9d" fontSize={11} />
          <YAxis
            type="category" dataKey="description" stroke="#93ab9d" fontSize={10} width={170}
            tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 24)}...` : v)}
          />
          <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(52, 211, 153, 0.08)' }} formatter={(v, _n, p) => [`${fmtMoney(Number(v))} em ${(p.payload as { date: string }).date}`, 'Despesa']} />
          <Bar dataKey="total" fill="#fbbf24" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    ),
    daily_heatmap: (
      <>
        <div className="heatmap">
          {heatmap.padded.map((d, i) =>
            d === null
              ? <div key={i} className="heat-cell empty-cell" />
              : (
                <div
                  key={i}
                  className="heat-cell"
                  title={`${d.date}: ${fmtMoney(d.total)}`}
                  style={{
                    background: d.total <= 0
                      ? '#1c2922'
                      : `rgba(248, 113, 113, ${0.15 + 0.85 * Math.sqrt(d.total / heatmap.max)})`,
                  }}
                />
              )
          )}
        </div>
        <div className="muted" style={{ marginTop: 8 }}>Cada coluna é uma semana. Passa o rato para ver o valor.</div>
      </>
    ),
  };

  const visibleWidgets = prefs.order.filter((id) => prefs.visible.includes(id));
  const hiddenWidgets = prefs.order.filter((id) => !prefs.visible.includes(id));

  if (monthly.length === 0) {
    return (
      <>
        <div className="page-header"><h1>Análise</h1></div>
        <div className="page-body"><div className="panel empty">Importa extratos primeiro para veres a análise.</div></div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Análise</h1>
          <span className="muted">
            {avgSavings != null && <>Poupança média: <strong style={{ color: avgSavings >= 0 ? '#34d399' : '#f87171' }}>{avgSavings}%</strong>{' · '}</>}
            {trend != null && <>Tendência: <strong style={{ color: trend >= 0 ? '#34d399' : '#f87171' }}>{trend >= 0 ? 'a acumular' : 'a perder'} {fmtMoney(Math.abs(trend))}</strong></>}
          </span>
        </div>
        <button className="btn ghost" onClick={() => setCustomizing((v) => !v)}>
          {customizing ? 'Concluir' : 'Personalizar'}
        </button>
      </div>
      <div className="page-body">
        {customizing && (
          <div className="panel customize-panel">
            <h2>Gráficos visíveis</h2>
            <div className="widget-toggle-grid">
              {prefs.order.map((id) => {
                const visible = prefs.visible.includes(id);
                return (
                  <button
                    key={id}
                    className={`widget-toggle ${visible ? 'selected' : ''}`}
                    onClick={() => visible ? hideWidget(id) : showWidget(id)}
                  >
                    <span>{WIDGET_TITLES[id]}</span>
                    <strong>{visible ? 'Visível' : 'Oculto'}</strong>
                  </button>
                );
              })}
            </div>
            {hiddenWidgets.length > 0 && <div className="muted" style={{ marginTop: 10 }}>Os gráficos ocultos podem ser repostos aqui a qualquer momento.</div>}
          </div>
        )}

        {visibleWidgets.length === 0 ? (
          <div className="panel empty">
            Todos os gráficos estão ocultos. Usa <strong>Personalizar</strong> para voltar a adicionar gráficos.
          </div>
        ) : (
          <div className="charts-row customizable">
            {visibleWidgets.map((id) => (
              <div
                key={id}
                className={`panel chart-widget ${draggedId === id ? 'dragging' : ''} ${id === 'daily_heatmap' ? 'wide' : ''}`}
                draggable
                onDragStart={() => setDraggedId(id)}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedId) moveWidget(draggedId, id);
                  setDraggedId(null);
                }}
              >
                <div className="chart-widget-head">
                  <h2>{WIDGET_TITLES[id]}</h2>
                  <div className="chart-widget-actions">
                    <span className="drag-handle" title="Arrastar para reorganizar">⋮⋮</span>
                    <button className="icon-btn" title="Esconder gráfico" onClick={() => hideWidget(id)}>×</button>
                  </div>
                </div>
                {widgetBodies[id]}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
