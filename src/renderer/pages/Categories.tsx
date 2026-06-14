import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAppStore } from '../store';
import type { Category, CategoryRule } from '../../shared/types';

export default function Categories() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);
  const [cats, setCats] = useState<Category[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [newCat, setNewCat] = useState('');
  const [newColor, setNewColor] = useState('#10b981');
  const [newKeyword, setNewKeyword] = useState('');
  const [newRuleCat, setNewRuleCat] = useState('');
  const [newRuleDir, setNewRuleDir] = useState('any');
  const [applyMsg, setApplyMsg] = useState('');

  const load = () => {
    api.listCategories().then(setCats);
    api.listRules().then(setRules);
  };
  useEffect(load, []);

  return (
    <>
      <div className="page-header">
        <h1>Categorias e regras</h1>
        <button className="btn ghost" onClick={async () => {
          const n = await api.applyRules();
          setApplyMsg(`${n} transações categorizadas.`);
          bumpRefresh();
        }}>Aplicar regras às não categorizadas</button>
      </div>
      <div className="page-body">
        {applyMsg && <div className="import-msg ok" style={{ marginBottom: 14 }}>{applyMsg}</div>}
        <div className="charts-row">
          <div className="panel">
            <h2>Categorias</h2>
            <div className="toolbar">
              <input type="text" placeholder="Nova categoria…" value={newCat} onChange={(e) => setNewCat(e.target.value)} style={{ flex: 1 }} />
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 42, height: 36, border: 'none', background: 'none', cursor: 'pointer' }} />
              <button className="btn" onClick={async () => {
                if (!newCat.trim()) return;
                try { await api.addCategory(newCat, newColor); setNewCat(''); load(); bumpRefresh(); } catch { /* duplicada */ }
              }}>Adicionar</button>
            </div>
            <div className="table-wrap">
              <table>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.id}>
                      <td><span className="row-flex"><span className="color-dot" style={{ background: c.color }} />{c.name}</span></td>
                      <td style={{ width: 150 }}>
                        <button
                          className="btn ghost"
                          style={{ padding: '4px 10px', fontSize: 12, opacity: c.excluded ? 1 : 0.6 }}
                          title={c.excluded
                            ? 'Excluída das estatísticas (ex.: transferências para contas próprias). Clica para voltar a contar.'
                            : 'Conta nas estatísticas. Clica para excluir (ex.: poupança, transferências próprias).'}
                          onClick={async () => { await api.setCategoryExcluded(c.id, !c.excluded); load(); bumpRefresh(); }}
                        >{c.excluded ? '🚫 não conta' : '📊 conta'}</button>
                      </td>
                      <td style={{ width: 130 }}>
                        <button
                          className="btn ghost"
                          style={{ padding: '4px 10px', fontSize: 12, opacity: c.is_fixed ? 1 : 0.6 }}
                          title={c.is_fixed
                            ? 'Despesa fixa (renda, ginásio, barbeiro…) — entra nas "Fixas" do gráfico de Análise. Clica para tornar variável.'
                            : 'Despesa variável. Clica para marcar como fixa (renda, ginásio, barbeiro…).'}
                          onClick={async () => { await api.setCategoryFixed(c.id, !c.is_fixed); load(); bumpRefresh(); }}
                        >{c.is_fixed ? '🔒 fixa' : '💧 variável'}</button>
                      </td>
                      <td style={{ width: 40 }}>
                        <button className="btn danger" onClick={async () => { await api.deleteCategory(c.id); load(); bumpRefresh(); }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>Regras de categorização (palavra-chave → categoria)</h2>
            <div className="toolbar">
              <input type="text" placeholder="Palavra-chave (ex.: uber)" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} style={{ flex: 1 }} />
              <select value={newRuleDir} onChange={(e) => setNewRuleDir(e.target.value)} title="A que movimentos se aplica">
                <option value="any">Entradas e saídas</option>
                <option value="expense">Só saídas</option>
                <option value="income">Só entradas</option>
              </select>
              <select value={newRuleCat} onChange={(e) => setNewRuleCat(e.target.value)}>
                <option value="">Categoria…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn" onClick={async () => {
                if (!newKeyword.trim() || !newRuleCat) return;
                await api.addRule(newKeyword, Number(newRuleCat), newRuleDir as 'any' | 'expense' | 'income');
                setNewKeyword('');
                load();
              }}>Adicionar</button>
            </div>
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table>
                <thead><tr><th>Palavra-chave</th><th>Aplica-se a</th><th>Categoria</th><th></th></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>{r.keyword}</td>
                      <td><span className="badge">{r.direction === 'expense' ? '↓ saídas' : r.direction === 'income' ? '↑ entradas' : '↕ ambas'}</span></td>
                      <td><span className="badge">{r.category_name}</span></td>
                      <td style={{ width: 40 }}>
                        <button className="btn danger" onClick={async () => { await api.deleteRule(r.id); load(); }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
