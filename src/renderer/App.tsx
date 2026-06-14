import { useEffect, useState } from 'react';
import iconUrl from '../../assets/icon.png';
import { useAppStore, Page } from './store';
import { api, setActiveCurrency } from './api';
import type { UpdateStatus } from '../shared/types';
import Dashboard from './pages/Dashboard';
import Analysis from './pages/Analysis';
import ImportPage from './pages/ImportPage';
import Transactions from './pages/Transactions';
import Uncategorized from './pages/Uncategorized';
import Categories from './pages/Categories';
import Subscriptions from './pages/Subscriptions';
import Onboarding from './pages/Onboarding';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'analysis', label: 'Análise', icon: '📈' },
  { id: 'import', label: 'Importar', icon: '📥' },
  { id: 'transactions', label: 'Transações', icon: '💳' },
  { id: 'uncategorized', label: 'Por categorizar', icon: '🧩' },
  { id: 'categories', label: 'Categorias', icon: '🏷️' },
  { id: 'subscriptions', label: 'Subscrições', icon: '🔁' },
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

  useEffect(() => {
    api.getAppState().then((state) => setOnboardingCompleted(state.onboardingCompleted));
    api.getPreference('currency', 'EUR').then((c) => setActiveCurrency(c));
  }, []);

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
    return <Onboarding onDone={() => setOnboardingCompleted(true)} />;
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
        <button className="nav-item" title="Guarda uma cópia da base de dados (todas as transações, categorias e regras)" onClick={async () => {
          const p = await api.backupDb();
          setBackupMsg(p ? '✓ Backup guardado' : '');
          if (p) setTimeout(() => setBackupMsg(''), 4000);
        }}>
          <span>💾</span> {backupMsg || 'Backup'}
        </button>
        <button className="nav-item" title="Restaura um backup completo da base de dados" onClick={async () => {
          const ok = window.confirm('Restaurar um backup vai substituir a base de dados atual. A app cria primeiro uma cópia de segurança interna. Continuar?');
          if (!ok) return;
          const restored = await api.restoreDb();
          if (restored) {
            setPage('dashboard');
            bumpRefresh();
            window.alert('Backup restaurado. A aplicação vai recarregar para aplicar os dados.');
            window.location.reload();
          }
        }}>
          <span>↩</span> Restaurar
        </button>
        <button className="nav-item" title="Exporta um backup portável em JSON (categorias, regras, transações, definições e layout dos gráficos)" onClick={async () => {
          const res = await api.exportBundle();
          setBundleMsg(res ? `✓ Bundle (${res.count} mov.)` : '');
          if (res) setTimeout(() => setBundleMsg(''), 4000);
        }}>
          <span>📦</span> {bundleMsg || 'Exportar bundle'}
        </button>
        <button className="nav-item" title="Importa um backup portável em JSON e substitui todos os dados atuais" onClick={async () => {
          const ok = window.confirm('Importar um bundle vai SUBSTITUIR todos os dados atuais (transações, categorias, regras, definições e layout). A app cria primeiro uma cópia de segurança interna. Continuar?');
          if (!ok) return;
          const res = await api.importBundle();
          if (res) {
            setPage('dashboard');
            bumpRefresh();
            window.alert(`Bundle importado (${res.count} movimentos). A aplicação vai recarregar.`);
            window.location.reload();
          }
        }}>
          <span>⇪</span> Importar bundle
        </button>
        <button className="nav-item" title="Lembrete mensal para importar extratos" onClick={() => setReminderOpen(true)}>
          <span>🔔</span> Lembrete
        </button>
        <button className="nav-item" title="Procura atualizações da aplicação" onClick={() => api.checkForUpdates().then(setUpdateStatus)}>
          <span>↻</span> Atualizações
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
