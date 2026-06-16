import { useEffect, useState } from 'react';
import iconUrl from '../../assets/icon.png';
import { useAppStore, Page } from './store';
import { api, fmtMoney, setActiveCurrency } from './api';
import type { BalanceState, CloudSyncStatus, UpdateStatus } from '../shared/types';
import { RELEASE_GUIDE_TOKEN } from '../shared/changelog';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import ImportPage from './pages/ImportPage';
import Transactions from './pages/Transactions';
import Uncategorized from './pages/Uncategorized';
import Categories from './pages/Categories';
import Subscriptions from './pages/Subscriptions';
import Projects from './pages/Projects';
import Onboarding from './pages/Onboarding';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'analysis', label: 'Análise', icon: '📈' },
  { id: 'import', label: 'Importar', icon: '📥' },
  { id: 'transactions', label: 'Transações', icon: '💳' },
  { id: 'uncategorized', label: 'Por categorizar', icon: '🧩' },
  { id: 'categories', label: 'Categorias', icon: '🏷️' },
  { id: 'subscriptions', label: 'Subscrições', icon: '🔁' },
  { id: 'projects', label: 'Projetos', icon: '📁' },
];

export default function App() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const refreshKey = useAppStore((s) => s.refreshKey);
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);
  const [uncatCount, setUncatCount] = useState(0);
  const [backupMsg, setBackupMsg] = useState('');
  const [bundleMsg, setBundleMsg] = useState('');
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceState, setBalanceState] = useState<BalanceState | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus | null>(null);

  useEffect(() => {
    api.getAppState().then((state) => {
      setOnboardingCompleted(state.onboardingCompleted);
      setAppVersion(state.appVersion);
    });
    api.getPreference('currency', 'EUR').then((c) => setActiveCurrency(c));
  }, []);

  useEffect(() => {
    if (!onboardingCompleted) return;
    api.cloudStatus().then(setCloudStatus);
  }, [onboardingCompleted, refreshKey]);

  useEffect(() => {
    if (!onboardingCompleted || !appVersion) return;
    api.getPreference('release_guide_seen_token', '').then((seen) => {
      if (seen !== RELEASE_GUIDE_TOKEN) setChangelogOpen(true);
    });
  }, [appVersion, onboardingCompleted]);

  useEffect(() => {
    if (!onboardingCompleted) return;
    api.getBalanceState().then((state) => {
      setBalanceState(state);
      if (state.transactionCount > 0 && !state.hasAnchor && !state.promptSeen) {
        setBalanceOpen(true);
      }
    });
  }, [onboardingCompleted, refreshKey]);

  useEffect(() => {
    if (!onboardingCompleted) return;
    api.listUncategorized().then((gs) => setUncatCount(gs.reduce((a, g) => a + g.n, 0)));
  }, [refreshKey, onboardingCompleted]);

  useEffect(() => {
    if (!onboardingCompleted) return;
    api.getUpdateStatus().then(setUpdateStatus);
    return api.onUpdateStatus((status) => {
      setUpdateStatus(status);
      if (status.state === 'available' || status.state === 'downloaded') setUpdateDismissed(false);
    });
  }, [onboardingCompleted]);

  const showUpdatePopup = updateStatus && !updateDismissed && (
    updateStatus.state === 'available' ||
    updateStatus.state === 'downloading' ||
    updateStatus.state === 'downloaded' ||
    updateStatus.state === 'error'
  );

  if (onboardingCompleted === null) {
    return (
      <div className="app-loading">
        <img src={iconUrl} alt="" />
        <span>FinancialApp</span>
      </div>
    );
  }

  if (!onboardingCompleted) {
    return <Onboarding appVersion={appVersion} onDone={() => setOnboardingCompleted(true)} />;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo"><img src={iconUrl} alt="" /> FinancialApp</div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${page === n.id ? 'active' : ''}`}
            onClick={() => setPage(n.id)}
          >
            <span>{n.icon}</span> {n.label}
            {n.id === 'uncategorized' && uncatCount > 0 && <span className="nav-badge">{uncatCount}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div className="sidebar-tools">
          <div className="sidebar-tools-head">
            <span>Ferramentas</span>
            {(backupMsg || bundleMsg) && <strong>{backupMsg || bundleMsg}</strong>}
          </div>
          <div className="sidebar-tool-grid">
            <button className="tool-btn" aria-label="Backup" title="Guardar backup da base de dados" onClick={async () => {
              const p = await api.backupDb();
              setBackupMsg(p ? 'Backup guardado' : '');
              if (p) setTimeout(() => setBackupMsg(''), 4000);
            }}>💾</button>
            <button className="tool-btn" aria-label="Restaurar" title="Restaurar backup completo da base de dados" onClick={async () => {
              const ok = window.confirm('Restaurar um backup vai substituir a base de dados atual. A app cria primeiro uma cópia de segurança interna. Continuar?');
              if (!ok) return;
              const restored = await api.restoreDb();
              if (restored) {
                setPage('dashboard');
                bumpRefresh();
                window.alert('Backup restaurado. A aplicação vai recarregar para aplicar os dados.');
                window.location.reload();
              }
            }}>↩</button>
            <button className="tool-btn" aria-label="Exportar bundle" title="Exportar bundle portável em JSON" onClick={async () => {
              const res = await api.exportBundle();
              setBundleMsg(res ? `Bundle: ${res.count} mov.` : '');
              if (res) setTimeout(() => setBundleMsg(''), 4000);
            }}>📦</button>
            <button className="tool-btn" aria-label="Importar bundle" title="Importar bundle portável em JSON" onClick={async () => {
              const ok = window.confirm('Importar um bundle vai SUBSTITUIR todos os dados atuais (transações, categorias, regras, definições e layout). A app cria primeiro uma cópia de segurança interna. Continuar?');
              if (!ok) return;
              const res = await api.importBundle();
              if (res) {
                setPage('dashboard');
                bumpRefresh();
                window.alert(`Bundle importado (${res.count} movimentos). A aplicação vai recarregar.`);
                window.location.reload();
              }
            }}>⇪</button>
            <button className="tool-btn" aria-label="Alinhar saldo" title="Alinhar saldo atual com o banco" onClick={async () => {
              const state = await api.getBalanceState();
              setBalanceState(state);
              setBalanceOpen(true);
            }}>≈</button>
            <button className={`tool-btn ${cloudStatus?.linked ? 'active' : ''}`} aria-label="Sincronização" title="Ligar conta e enviar dados locais para a cloud" onClick={async () => {
              const status = await api.cloudStatus();
              setCloudStatus(status);
              setCloudOpen(true);
            }}>☁</button>
            <button className="tool-btn" aria-label="Lembrete" title="Lembrete mensal para importar extratos" onClick={() => setReminderOpen(true)}>🔔</button>
            <button className="tool-btn" aria-label="Atualizações" title="Procurar atualizações da aplicação" onClick={() => api.checkForUpdates().then(setUpdateStatus)}>↻</button>
          </div>
        </div>
        <button className="nav-item version-item" title="Ver novidades desta versão" onClick={() => setChangelogOpen(true)}>
          <span>ⓘ</span> v{appVersion || '...'}
        </button>
      </aside>
      <main className="content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'analysis' && <Analysis />}
        {page === 'import' && <ImportPage />}
        {page === 'transactions' && <Transactions />}
        {page === 'uncategorized' && <Uncategorized />}
        {page === 'categories' && <Categories />}
        {page === 'subscriptions' && <Subscriptions />}
        {page === 'projects' && <Projects />}
      </main>
      {showUpdatePopup && (
        <div className="update-popup" role="dialog" aria-live="polite">
          <div>
            <strong>
              {updateStatus.state === 'available' && 'Atualização disponível'}
              {updateStatus.state === 'downloading' && 'A descarregar atualização'}
              {updateStatus.state === 'downloaded' && 'Atualização pronta'}
              {updateStatus.state === 'error' && 'Atualização indisponível'}
            </strong>
            <p>{updateStatus.message}</p>
            {updateStatus.state === 'downloading' && (
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${updateStatus.percent ?? 0}%` }} />
              </div>
            )}
          </div>
          <div className="update-actions">
            {updateStatus.state === 'available' && (
              <button className="btn" onClick={() => api.downloadUpdate().then(setUpdateStatus)}>Atualizar</button>
            )}
            {updateStatus.state === 'downloaded' && (
              <button className="btn" onClick={() => api.installUpdate()}>Reiniciar</button>
            )}
            {updateStatus.state !== 'downloading' && (
              <button className="btn ghost" onClick={() => setUpdateDismissed(true)}>Agora não</button>
            )}
          </div>
        </div>
      )}
      {reminderOpen && <ReminderModal onClose={() => setReminderOpen(false)} />}
      {cloudOpen && cloudStatus && (
        <CloudSyncModal
          status={cloudStatus}
          onClose={() => setCloudOpen(false)}
          onSynced={(status) => {
            setCloudStatus(status);
            bumpRefresh();
          }}
        />
      )}
      {changelogOpen && !balanceOpen && (
        <ChangelogModal
          version={appVersion}
          cloudStatus={cloudStatus}
          onSynced={(status) => {
            setCloudStatus(status);
            bumpRefresh();
          }}
          onClose={async () => {
            await api.setPreference('release_guide_seen_token', RELEASE_GUIDE_TOKEN);
            setChangelogOpen(false);
          }}
        />
      )}
      {balanceOpen && balanceState && (
        <BalanceAlignModal
          state={balanceState}
          onStateChange={(state) => {
            setBalanceState(state);
            bumpRefresh();
          }}
          onClose={async () => {
            await api.dismissBalancePrompt();
            setBalanceOpen(false);
          }}
          onSaved={(state) => {
            setBalanceState(state);
            setBalanceOpen(false);
            bumpRefresh();
          }}
        />
      )}
    </div>
  );
}

// Configuração do lembrete mensal (notificação local para importar extratos).
function ReminderModal({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [day, setDay] = useState(1);

  useEffect(() => {
    api.getPreference('reminder', { enabled: false, day: 1 }).then((cfg) => {
      setEnabled(!!cfg.enabled);
      setDay(Math.min(Math.max(cfg.day || 1, 1), 28));
    });
  }, []);

  const save = async () => {
    await api.setPreference('reminder', { enabled, day });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Lembrete mensal</h2>
        <div className="modal-desc muted">Recebe uma notificação para importar os teus extratos.</div>
        <label className="modal-checkrow">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Ativar lembrete</span>
        </label>
        <label className="modal-field">
          <span>Dia do mês</span>
          <input type="number" min={1} max={28} value={day} disabled={!enabled}
            onChange={(e) => setDay(Math.min(Math.max(Number(e.target.value) || 1, 1), 28))} />
        </label>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function CloudSyncModal({
  status,
  onClose,
  onSynced,
}: {
  status: CloudSyncStatus;
  onClose: () => void;
  onSynced: (status: CloudSyncStatus) => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>(status.linked ? 'login' : 'signup');
  const [email, setEmail] = useState(status.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const counts = status.localCounts;

  const upload = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const next = await api.cloudLinkAndUpload({ email, password, mode });
      onSynced(next);
      setNotice('Dados enviados para a cloud. Já podes testar a web com esta conta.');
      setPassword('');
    } catch (err) {
      const message = cleanIpcError(err);
      if (message.startsWith('Conta criada.')) {
        setNotice(message);
        setMode('login');
        setPassword('');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cloud-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">Sincronização privada</div>
        <h2>Ligar dados locais</h2>
        <div className="modal-desc muted">
          Envia uma cópia dos dados deste desktop para a tua conta. A base local continua intacta.
        </div>

        <div className="cloud-summary">
          <div><strong>{counts.transactions}</strong><span>Transações</span></div>
          <div><strong>{counts.categories}</strong><span>Categorias</span></div>
          <div><strong>{counts.rules}</strong><span>Regras</span></div>
          <div><strong>{counts.imports}</strong><span>Importações</span></div>
          <div><strong>{counts.preferences}</strong><span>Definições</span></div>
          <div><strong>{counts.projects}</strong><span>Projetos</span></div>
        </div>

        {status.linked && (
          <div className="cloud-linked">
            <span>Conta ligada</span>
            <strong>{status.email}</strong>
            {status.lastSyncAt && <small>Último envio: {new Date(status.lastSyncAt).toLocaleString('pt-PT')}</small>}
          </div>
        )}

        <div className="segmented cloud-mode">
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Criar conta</button>
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Entrar</button>
        </div>

        <label className="modal-field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="modal-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <div className="cloud-note">
          Antes do envio a app cria um backup interno automático. Repetir este envio não duplica os dados.
        </div>
        {error && <div className="import-msg error">{error}</div>}
        {notice && <div className="import-msg ok">{notice}</div>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Fechar</button>
          <button className="btn" disabled={busy || !status.configured} onClick={upload}>
            {busy ? 'A enviar...' : status.linked ? 'Reenviar dados' : 'Ligar e enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function cleanIpcError(err: unknown) {
  const fallback = 'Não foi possível ativar a sincronização.';
  const raw = err instanceof Error ? err.message : String(err || fallback);
  return raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || fallback;
}

function ChangelogModal({
  version,
  cloudStatus,
  onSynced,
  onClose,
}: {
  version: string;
  cloudStatus: CloudSyncStatus | null;
  onSynced: (status: CloudSyncStatus) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState<CloudSyncStatus | null>(cloudStatus);
  const [mode, setMode] = useState<'login' | 'signup'>(cloudStatus?.linked ? 'login' : 'signup');
  const [email, setEmail] = useState(cloudStatus?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (status) return;
    api.cloudStatus().then((next) => {
      setStatus(next);
      if (next.email) setEmail(next.email);
      if (next.linked) setMode('login');
    });
  }, [status]);

  const canSubmit = !!status?.configured && email.trim().length > 0 && password.length > 0;

  const linkAccount = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const next = await api.cloudLinkAndUpload({ email: email.trim(), password, mode });
      setStatus(next);
      onSynced(next);
      setPassword('');
      setNotice('Dados enviados. Usa esta conta na versão web.');
      setStep(3);
    } catch (err) {
      const message = cleanIpcError(err);
      if (message.startsWith('Conta criada.')) {
        setNotice(message);
        setMode('login');
        setPassword('');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const linkedEmail = status?.email || email;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal changelog-modal web-setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">FinancialApp v{version || '...'}</div>
        <div className="setup-progress" aria-label={`Passo ${step} de 3`}>
          {[1, 2, 3].map((n) => <span key={n} className={n <= step ? 'active' : ''} />)}
        </div>

        {step === 1 && (
          <div className="setup-step">
            <h2>Nova versão web</h2>
            <div className="modal-desc muted">
              Agora podes consultar os teus dados no telemóvel ou browser. O desktop continua a guardar os dados locais.
            </div>
            <div className="setup-note">
              <strong>Como funciona</strong>
              <p>Ligas uma conta, a app envia uma cópia dos dados atuais para a tua área privada, e depois usas essa conta na versão web.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="setup-step">
            <h2>{status?.linked ? 'Conta ligada' : 'Liga a tua conta'}</h2>
            <div className="modal-desc muted">
              {status?.linked
                ? 'Podes reenviar os dados locais para atualizar a cloud, ou avançar para o próximo passo.'
                : 'Cria conta ou entra. Depois enviamos uma cópia dos dados deste desktop.'}
            </div>

            {status?.linked && (
              <div className="cloud-linked">
                <span>Conta atual</span>
                <strong>{status.email}</strong>
                {status.lastSyncAt && <small>Último envio: {new Date(status.lastSyncAt).toLocaleString('pt-PT')}</small>}
              </div>
            )}

            <div className="segmented cloud-mode">
              <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Criar conta</button>
              <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Entrar</button>
            </div>

            <label className="modal-field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </label>
            <label className="modal-field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>

            <div className="cloud-note">Antes do envio a app cria um backup interno automático.</div>
            {error && <div className="import-msg error">{error}</div>}
            {notice && <div className="import-msg ok">{notice}</div>}
          </div>
        )}

        {step === 3 && (
          <div className="setup-step">
            <h2>Próximo passo</h2>
            <div className="modal-desc muted">
              Abre a versão web e entra com a mesma conta para veres os dados sincronizados.
            </div>
            <div className="setup-note">
              <strong>fwebapp.vercel.app</strong>
              <p>{linkedEmail ? `Usa ${linkedEmail} para entrar no telemóvel, tablet ou browser.` : 'Usa a conta que acabaste de ligar no desktop.'}</p>
            </div>
            <div className="setup-note subtle">
              <strong>O desktop não muda</strong>
              <p>A base local continua neste computador. A cloud recebe só uma cópia para consulta fora do desktop.</p>
            </div>
          </div>
        )}

        <div className="modal-actions">
          {step === 1 && <button className="btn ghost" onClick={onClose}>Agora não</button>}
          {step > 1 && <button className="btn ghost" disabled={busy} onClick={() => setStep((s) => s - 1)}>Voltar</button>}
          {step === 1 && <button className="btn" onClick={() => setStep(2)}>Próximo</button>}
          {step === 2 && status?.linked && <button className="btn ghost" disabled={busy} onClick={() => setStep(3)}>Saltar envio</button>}
          {step === 2 && (
            <button className="btn" disabled={busy || !canSubmit} onClick={linkAccount}>
              {busy ? 'A enviar...' : status?.linked ? 'Reenviar dados' : mode === 'signup' ? 'Criar e enviar' : 'Entrar e enviar'}
            </button>
          )}
          {step === 3 && <button className="btn" onClick={onClose}>Concluir</button>}
        </div>
      </div>
    </div>
  );
}

function BalanceAlignModal({
  state,
  onStateChange,
  onClose,
  onSaved,
}: {
  state: BalanceState;
  onStateChange: (state: BalanceState) => void;
  onClose: () => void;
  onSaved: (state: BalanceState) => void;
}) {
  const [value, setValue] = useState('');
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().slice(0, 10));
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const realBalance = Number(value.replace(',', '.'));
    if (!Number.isFinite(realBalance)) {
      setError('Indica um saldo válido.');
      return;
    }
    try {
      const next = await api.alignBalance(realBalance, anchorDate);
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alinhar o saldo.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal balance-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">Saldo atual</div>
        <h2>Alinhar com o banco</h2>
        <div className="modal-desc muted">Importa primeiro os extratos recentes que já estão refletidos nesse saldo.</div>
        <div className="balance-current">
          <span>Saldo calculado com os dados conhecidos</span>
          <strong>{fmtMoney(state.computedBalance)}</strong>
        </div>
        <button className="btn ghost balance-import" disabled={importing} onClick={async () => {
          setImporting(true);
          try {
            await api.pickAndImport();
            const next = await api.getBalanceState();
            onStateChange(next);
            setValue('');
          } finally {
            setImporting(false);
          }
        }}>
          {importing ? 'A importar...' : 'Importar extratos recentes'}
        </button>
        <label className="modal-field">
          <span>Qual é o saldo atual da tua conta?</span>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0,00"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </label>
        <label className="modal-field">
          <span>Esse saldo inclui movimentos até</span>
          <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
        </label>
        {error && <div className="import-msg error">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Agora não</button>
          <button className="btn" onClick={save}>Alinhar saldo</button>
        </div>
      </div>
    </div>
  );
}
