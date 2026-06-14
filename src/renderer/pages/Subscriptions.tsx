import { useEffect, useState } from 'react';
import { api, fmtDate, fmtMoney } from '../api';
import { useAppStore } from '../store';

interface Sub {
  description: string;
  occurrences: number;
  avg_amount: number;
  first_date: string;
  last_date: string;
}

export default function Subscriptions() {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [detectMsg, setDetectMsg] = useState('');

  useEffect(() => { api.listSubscriptions().then(setSubs); }, [refreshKey]);

  const totalMonthly = subs.reduce((acc, s) => acc + s.avg_amount, 0);

  return (
    <>
      <div className="page-header">
        <h1>Subscrições ativas</h1>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <span className="muted">Estimativa mensal: <strong style={{ color: '#34d399' }}>{fmtMoney(totalMonthly)}</strong></span>
          <button className="btn ghost" onClick={async () => {
            const r = await api.detectSubscriptions();
            setDetectMsg(r.services > 0
              ? `🔍 ${r.services} serviços recorrentes detetados (${r.marked} transações marcadas).`
              : '🔍 Nenhum novo pagamento recorrente detetado.');
            bumpRefresh();
          }}>🔍 Detetar automaticamente</button>
        </div>
      </div>
      <div className="page-body">
        {detectMsg && <div className="import-msg ok" style={{ marginBottom: 14 }}>{detectMsg}</div>}
        {subs.length === 0 ? (
          <div className="empty">
            Nenhuma subscrição detetada. As transações da categoria <strong>Subscrições</strong> aparecem aqui
            (ex.: Netflix, Spotify — geridas pelas regras na página Categorias).
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Serviço</th><th>Ocorrências</th><th style={{ textAlign: 'right' }}>Valor médio</th><th>Primeira</th><th>Última</th><th></th></tr>
              </thead>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={i}>
                    <td title={s.description}>{s.description}</td>
                    <td>{s.occurrences}×</td>
                    <td className="amount neg">{fmtMoney(s.avg_amount)}</td>
                    <td>{fmtDate(s.first_date)}</td>
                    <td>{fmtDate(s.last_date)}</td>
                    <td style={{ width: 120 }}>
                      <button className="btn danger" title="Cancelei esta subscrição — remover da lista (as transações antigas mantêm-se)" onClick={async () => {
                        if (!window.confirm(`Remover "${s.description}" das subscrições ativas? As transações antigas mantêm-se no histórico e não volta a ser detetada automaticamente.`)) return;
                        await api.removeSubscription(s.description);
                        setDetectMsg(`"${s.description}" removida das subscrições ativas.`);
                        bumpRefresh();
                      }}>✕ Cancelei</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
