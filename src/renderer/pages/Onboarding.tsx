import { useEffect, useRef, useState } from 'react';
import iconUrl from '../../../assets/icon.png';
import { api, fmtMoney, setActiveCurrency } from '../api';
import { useAppStore } from '../store';
import type { CategoryTemplate } from '../../shared/defaultConfig';
import type { Category, ImportProgress, UncategorizedGroup } from '../../shared/types';

interface OnboardingProps {
  onDone: () => void;
}

const TOTAL_STEPS = 6;

const CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'USD', label: 'Dólar US ($)' },
  { code: 'GBP', label: 'Libra (£)' },
  { code: 'BRL', label: 'Real (R$)' },
];

const INCOME_NAMES = new Set(['Salário', 'Mesada', 'Investimentos']);

// Agrupa as categorias do catálogo por finalidade, para o passo de seleção.
function groupOf(cat: CategoryTemplate): string {
  if (cat.excluded) return 'Transferências e poupança';
  if (INCOME_NAMES.has(cat.name)) return 'Rendimento';
  if (cat.isFixed) return 'Despesas fixas';
  return 'Dia a dia';
}

const GROUP_ORDER = ['Dia a dia', 'Despesas fixas', 'Rendimento', 'Transferências e poupança'];

// Remove prefixos genéricos de banco para sugerir a palavra-chave útil.
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

interface Summary {
  transactions: number;
  uncategorized: number;
  from: string | null;
  to: string | null;
  categories: number;
  rules: number;
}

export default function Onboarding({ onDone }: OnboardingProps) {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<CategoryTemplate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState('EUR');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [over, setOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [initialBalance, setInitialBalanceValue] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const primaryBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.listOnboardingCategories().then((items) => {
      setCategories(items);
      setSelected(new Set(items.map((item) => item.name)));
    });
    api.getPreference('currency', 'EUR').then(setCurrency);
  }, []);

  useEffect(() => {
    const off = api.onImportProgress((p) => {
      setProgress(p);
      if (p.done) {
        setImporting(false);
        bumpRefresh();
      }
    });
    return off;
  }, [bumpRefresh]);

  // Foco automático no botão primário + Esc para voltar.
  useEffect(() => {
    primaryBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step > 1) setStep((s) => s - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const grouped = GROUP_ORDER
    .map((g) => ({ group: g, items: categories.filter((c) => groupOf(c) === g) }))
    .filter((entry) => entry.items.length > 0);

  const toggleCategory = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const chooseCurrency = (code: string) => {
    setCurrency(code);
    setActiveCurrency(code);
    api.setPreference('currency', code);
  };

  const sendFiles = async (files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => /\.(csv|tsv|xlsx|xls)$/i.test(f.name));
    if (valid.length === 0) {
      setProgress({ percent: 100, done: true, message: 'Formato não suportado.', error: 'Usa ficheiros .csv, .tsv, .xlsx ou .xls' });
      return;
    }
    setImporting(true);
    for (let i = 0; i < valid.length; i++) {
      setProgress({ percent: 0, message: `Ficheiro ${i + 1} de ${valid.length}: ${valid[i].name}...` });
      const buf = await valid[i].arrayBuffer();
      await api.importFile(valid[i].name, buf);
    }
    setImporting(false);
  };

  // Cria as categorias escolhidas (idempotente) antes de importar/categorizar.
  const ensureCategories = async () => {
    setCreating(true);
    await api.createOnboardingCategories(Array.from(selected));
    setCreating(false);
  };

  const goToImport = async () => {
    await ensureCategories();
    setStep(3);
  };

  const goToAssist = async () => {
    setStep(4);
  };

  const finish = async () => {
    setSaving(true);
    await api.applyRules();
    await api.finishOnboarding();
    bumpRefresh();
    onDone();
  };

  const restoreBundle = async () => {
    const ok = window.confirm('Importar um backup vai substituir quaisquer dados atuais e abrir a app. Continuar?');
    if (!ok) return;
    const res = await api.importBundle();
    if (res) {
      await api.finishOnboarding();
      bumpRefresh();
      window.location.reload();
    }
  };

  const skipSetup = async () => {
    setSaving(true);
    await api.createOnboardingCategories(Array.from(selected));
    await api.finishOnboarding();
    bumpRefresh();
    onDone();
  };

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-top">
          <img src={iconUrl} alt="" className="onboarding-logo" />
          <div>
            <div className="logo-text">FinancialApp</div>
            <div className="muted">Configuração inicial</div>
          </div>
          <div className="step-indicator">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
              <span key={n} className={n === step ? 'active' : n < step ? 'done' : ''} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="onboarding-content">
            <h1>Organiza o teu dinheiro num espaço local e privado.</h1>
            <p>
              Importa extratos, escolhe categorias, acompanha despesas e ajusta a análise ao teu ritmo.
              Os dados ficam guardados neste computador.
            </p>
            <label className="onboarding-field">
              <span>Moeda principal</span>
              <select value={currency} onChange={(e) => chooseCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </label>
            <div className="onboarding-actions">
              <button className="btn" ref={primaryBtn} onClick={() => setStep(2)}>Começar</button>
              <button className="btn ghost" disabled={saving} onClick={skipSetup}>Saltar configuração</button>
            </div>
            <div className="onboarding-restore">
              Já usavas a app noutro computador?{' '}
              <button type="button" className="linklike" onClick={restoreBundle}>Restaurar backup</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-content">
            <h1>Escolhe as categorias iniciais.</h1>
            <p>Podes ativar só as que fazem sentido agora e criar mais categorias mais tarde.</p>
            <div className="onboarding-subtoolbar">
              <span className="muted">{selected.size} de {categories.length} selecionadas</span>
              <div>
                <button type="button" className="linklike" onClick={() => setSelected(new Set(categories.map((c) => c.name)))}>Selecionar todas</button>
                {' · '}
                <button type="button" className="linklike" onClick={() => setSelected(new Set())}>Limpar</button>
              </div>
            </div>
            {grouped.map(({ group, items }) => (
              <div key={group} className="category-group">
                <div className="category-group-title">{group}</div>
                <div className="category-picker">
                  {items.map((category) => (
                    <button
                      type="button"
                      key={category.name}
                      className={`category-option ${selected.has(category.name) ? 'selected' : ''}`}
                      onClick={() => toggleCategory(category.name)}
                    >
                      <span className="color-dot" style={{ background: category.color }} />
                      <span>{category.name}</span>
                      {category.isFixed && <span className="cat-flag" title="Despesa fixa">🔒</span>}
                      {category.excluded && <span className="cat-flag" title="Não conta nas estatísticas">∅</span>}
                      <span className="checkmark">{selected.has(category.name) ? '✓' : ''}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="onboarding-legend muted">
              🔒 despesa fixa (renda, ginásio…) · ∅ não conta como despesa/receita (transferências, poupança)
            </div>
            <div className="onboarding-actions">
              <button className="btn ghost" onClick={() => setStep(1)}>Voltar</button>
              <button className="btn" ref={primaryBtn} disabled={selected.size === 0 || creating} onClick={goToImport}>
                {creating ? 'A preparar...' : 'Continuar'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-content">
            <h1>Importa os teus extratos.</h1>
            <p>Podes saltar este passo e importar ficheiros mais tarde a partir da app.</p>
            <div
              className={`dropzone compact ${over ? 'over' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                if (e.dataTransfer.files.length) sendFiles(e.dataTransfer.files);
              }}
            >
              <div className="dz-title">Arrasta extratos para aqui</div>
              <div>ou clica para escolher ficheiros .csv, .tsv, .xlsx ou .xls</div>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.xlsx,.xls"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files?.length) sendFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            {progress && (
              <div className="panel onboarding-progress">
                <h2>Importação</h2>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
                </div>
                <div className={`import-msg ${progress.error ? 'error' : progress.done ? 'ok' : ''}`}>
                  {progress.error ? progress.error : progress.message}
                </div>
              </div>
            )}
            <div className="onboarding-actions">
              <button className="btn ghost" onClick={() => setStep(2)}>Voltar</button>
              <button className="btn" ref={primaryBtn} disabled={importing} onClick={goToAssist}>
                {importing ? 'A importar...' : 'Continuar'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <AssistStep
            onBack={() => setStep(3)}
            onContinue={async () => {
              const s = await api.onboardingSummary();
              setSummary(s);
              setStep(s.transactions > 0 ? 5 : 6);
            }}
            onRefresh={bumpRefresh}
            primaryRef={primaryBtn}
          />
        )}

        {step === 5 && (
          <div className="onboarding-content">
            <h1>Alinha o saldo inicial.</h1>
            <p>
              Se os extratos não cobrem todo o histórico da conta, indica qual era aproximadamente
              o saldo antes do primeiro movimento conhecido. A app usa isto só para mostrar o saldo atual correto.
            </p>
            {summary && summary.from && (
              <div className="balance-current onboarding-balance-note">
                <span>Primeiro movimento conhecido</span>
                <strong>{summary.from}</strong>
              </div>
            )}
            <label className="modal-field onboarding-balance-field">
              <span>Saldo antes desse movimento</span>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="0,00"
                value={initialBalance}
                onChange={(e) => setInitialBalanceValue(e.target.value)}
              />
            </label>
            {balanceError && <div className="import-msg error">{balanceError}</div>}
            <div className="onboarding-actions">
              <button className="btn ghost" onClick={() => setStep(4)}>Voltar</button>
              <button className="btn ghost" onClick={() => setStep(6)}>Saltar</button>
              <button className="btn" ref={primaryBtn} onClick={async () => {
                const value = Number(initialBalance.replace(',', '.'));
                if (!Number.isFinite(value)) {
                  setBalanceError('Indica um saldo válido ou salta este passo.');
                  return;
                }
                await api.setInitialBalance(value);
                setStep(6);
              }}>
                Guardar saldo
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="onboarding-content">
            <h1>Tudo pronto.</h1>
            <p>Podes alterar categorias, importar mais extratos e personalizar gráficos quando quiseres.</p>
            <div className="onboarding-summary">
              <div><strong>{summary?.categories ?? selected.size}</strong><span>Categorias</span></div>
              <div><strong>{summary?.transactions ?? 0}</strong><span>Movimentos</span></div>
              <div><strong>{summary?.uncategorized ?? 0}</strong><span>Por categorizar</span></div>
            </div>
            {summary && summary.transactions > 0 && summary.from && summary.to && (
              <p className="muted onboarding-period">
                Período {summary.from} a {summary.to} · {summary.rules} regras automáticas ativas
              </p>
            )}
            <p className="muted">Moeda: {fmtMoney(1234.5, currency)}</p>
            <div className="onboarding-actions">
              <button className="btn ghost" onClick={() => setStep(summary && summary.transactions > 0 ? 5 : 4)}>Voltar</button>
              <button className="btn" ref={primaryBtn} disabled={saving} onClick={finish}>
                {saving ? 'A finalizar...' : 'Abrir aplicação'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Passo de categorização assistida: atribui as descrições mais frequentes
// que não bateram em nenhuma regra, criando uma regra para cada.
function AssistStep({
  onBack,
  onContinue,
  onRefresh,
  primaryRef,
}: {
  onBack: () => void;
  onContinue: () => void;
  onRefresh: () => void;
  primaryRef: React.RefObject<HTMLButtonElement>;
}) {
  const [groups, setGroups] = useState<UncategorizedGroup[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([api.listUncategorized(), api.listCategories()]).then(([gs, cs]) => {
      setGroups(gs);
      setCats(cs);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const top = groups.slice(0, 6);

  const assign = async (g: UncategorizedGroup, categoryId: number) => {
    const keyword = suggestKeyword(g.description);
    const direction = g.max_amount < 0 ? 'expense' : g.min_amount > 0 ? 'income' : 'any';
    await api.addRule(keyword, categoryId, direction);
    await api.applyRules();
    setDone((d) => new Set(d).add(g.description));
    onRefresh();
    load();
  };

  return (
    <div className="onboarding-content">
      <h1>Categoriza o que ficou por encaixar.</h1>
      <p>
        Estas são as descrições mais frequentes que nenhuma regra apanhou. Escolhe a categoria
        para cada uma — fica guardada como regra e aplica-se também a importações futuras.
      </p>
      {loading ? (
        <div className="muted">A analisar...</div>
      ) : top.length === 0 ? (
        <div className="empty">🎉 Está tudo categorizado!</div>
      ) : (
        <div className="assist-list">
          {top.map((g) => (
            <div key={g.description} className={`assist-row ${done.has(g.description) ? 'assigned' : ''}`}>
              <div className="assist-info">
                <div className="assist-desc" title={g.description}>{g.description}</div>
                <div className="muted">{g.n}× · {fmtMoney(g.total)}</div>
              </div>
              <select
                defaultValue=""
                disabled={done.has(g.description)}
                onChange={(e) => e.target.value && assign(g, Number(e.target.value))}
              >
                <option value="">{done.has(g.description) ? '✓ Atribuído' : 'Categoria…'}</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      <div className="onboarding-actions">
        <button className="btn ghost" onClick={onBack}>Voltar</button>
        <button className="btn" ref={primaryRef} onClick={onContinue}>
          {top.length === 0 ? 'Continuar' : 'Continuar (podes acabar depois)'}
        </button>
      </div>
    </div>
  );
}
