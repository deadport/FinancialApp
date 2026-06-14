import { useEffect, useState } from 'react';
import iconUrl from '../../assets/icon.png';
import { useAppStore, Page } from './store';
import { api, setActiveCurrency } from './api';
import type { UpdateStatus } from '../shared/types';
import { LATEST_CHANGELOG } from '../shared/changelog';
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

  useEffect(() => {
    api.getAppState().then((state) => {
      setOnboardingCompleted(state.onboardingCompleted);
      setAppVersion(state.appVersion);
    });
    api.getPreference('currency', 'EUR').then((c) => setActiveCurrency(c));
  }, []);

  useEffect(() => {
    if (!onboardingCompleted || !appVersion) return;
    api.getPreference('release_notes_seen_version', '').then((seen) => {
      if (seen !== appVersion) setChangelogOpen(true);
    });
  }, [appVersion, onboardingCompleted]);

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
      {changelogOpen && (
        <ChangelogModal
          version={appVersion}
          onClose={async () => {
            if (appVersion) await api.setPreference('release_notes_seen_version', appVersion);
            setChangelogOpen(false);
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

function ChangelogModal({ version, onClose }: { version: string; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal changelog-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-kicker">FinancialApp v{version || '...'}</div>
        <h2>Novidades</h2>
        <div className="modal-desc muted">Uma visão rápida do que mudou nesta versão.</div>
        <div className="changelog-list">
          {LATEST_CHANGELOG.map((item) => (
            <div className="changelog-item" key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Entendi</button>
        </div>
      </div>
    </div>
  );
}
