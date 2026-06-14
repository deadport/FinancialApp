import { useEffect, useState } from 'react';
import { api, fmtDate, fmtMoney } from '../api';
import { useAppStore } from '../store';
import type { Category, RuleDirection, UncategorizedGroup } from '../../shared/types';

// Remove prefixos genéricos de banco para sugerir a palavra-chave útil
// (ex.: "TRF MB WAY P/ MARCO DUARTE" → "marco duarte")
function suggestKeyword(desc: string): string {
  return desc
    .replace(/^COMPRA\s+\d+\s+/i, '')
    .replace(/^TRF\.?\s*(MB\s*WAY\s*)?(P\/?O?|DE)\s*/i, '')
    .replace(/^(PAG(AMENTO)?|DD|DEB\.?\s*DIR\.?)\s*(DE\s*SERVICOS\s*)?/i, '')
    .replace(/\s+CONTACTLESS\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase() || desc.trim().toLowerCase();
}

function GroupRow({ g, cats, onDone }: { g: UncategorizedGroup; cats: Category[]; onDone: (msg: string) => void }) {
  const [keyword, setKeyword] = useState(() => suggestKeyword(g.description));
  const [catId, setCatId] = useState('');
  // Pré-seleciona a direção pelo sinal dos valores do grupo
  const [direction, setDirection] = useState<RuleDirection>(
    g.max_amount < 0 ? 'expense' : g.min_amount > 0 ? 'income' : 'any'
  );

  return (
    <div className="uncat-card">
      <div className="uncat-info">
        <div className="uncat-desc" title={g.description}>{g.description}</div>
        <div className="muted">
          {g.n}× · total {fmtMoney(g.total)} · última {fmtDate(g.last_date)}
          {g.min_amount > 0 ? ' · só entradas' : g.max_amount < 0 ? ' · só saídas' : ' · entradas e saídas'}
        </div>
      </div>
      <div className="uncat-form">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          title="Se a descrição contiver este texto, a regra aplica-se"
          style={{ flex: '1 1 140px' }}
        />
        <select value={direction} onChange={(e) => setDirection(e.target.value as RuleDirection)} title="A que movimentos se aplica">
          <option value="any">Entradas e saídas</option>
          <option value="expense">Só saídas (despesas)</option>
          <option value="income">Só entradas (recebimentos)</option>
        </select>
        <select value={catId} onChange={(e) => setCatId(e.target.value)}>
          <option value="">Categoria…</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn" disabled={!catId || !keyword.trim()} onClick={async () => {
          await api.addRule(keyword, Number(catId), direction);
          const n = await api.applyRules();
          onDone(`Regra "${keyword}" criada — ${n} transações categorizadas.`);
        }}>Criar regra</button>
      </div>
    </div>
  );
}

export default function Uncategorized() {
  const refreshKey = useAppStore((s) => s.refreshKey);
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);
  const [groups, setGroups] = useState<UncategorizedGroup[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.listUncategorized().then(setGroups);
    api.listCategories().then(setCats);
  }, [refreshKey]);

  const totalTx = groups.reduce((a, g) => a + g.n, 0);
  const filtered = search
    ? groups.filter((g) => g.description.toLowerCase().includes(search.toLowerCase()))
    : groups;

  return (
    <>
      <div className="page-header">
        <h1>Por categorizar</h1>
        <span className="muted">{totalTx} transações em {groups.length} grupos</span>
      </div>
      <div className="page-body">
        <div className="panel" style={{ padding: '12px 18px' }}>
          <span className="muted">
            💡 Estas transações não bateram em nenhuma regra. Para cada grupo, ajusta a palavra-chave
            (ex.: só o nome da pessoa — "marco duarte"), escolhe se se aplica a saídas, entradas ou ambas,
            e a categoria. A regra fica guardada e aplica-se já e em importações futuras.
          </span>
        </div>
        {msg && <div className="import-msg ok" style={{ marginBottom: 14 }}>{msg}</div>}
        <div className="toolbar">
          <input type="text" placeholder="Filtrar descrições…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 220px' }} />
        </div>
        {filtered.length === 0 ? (
          <div className="empty">🎉 {groups.length === 0 ? 'Tudo categorizado!' : 'Nada corresponde ao filtro.'}</div>
        ) : (
          filtered.map((g, i) => (
            <GroupRow key={`${g.description}-${i}`} g={g} cats={cats} onDone={(m) => { setMsg(m); bumpRefresh(); }} />
          ))
        )}
      </div>
    </>
  );
}
