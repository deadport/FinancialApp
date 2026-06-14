import { useEffect, useState } from 'react';
import iconUrl from '../../assets/icon.png';
import { useAppStore, Page } from './store';
import { api } from './api';
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
  const [uncatCount, setUncatCount] = useState(0);
  const [backupMsg, setBackupMsg] = useState('');
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    api.getAppState().then((state) => setOnboardingCompleted(state.onboardingCompleted));
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
    </div>
  );
}
