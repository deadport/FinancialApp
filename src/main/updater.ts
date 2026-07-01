import { app, BrowserWindow, ipcMain } from 'electron';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

type UpdateStatus =
  | { state: 'idle'; message: string }
  | { state: 'disabled'; message: string }
  | { state: 'checking'; message: string }
  | { state: 'available'; message: string; version?: string }
  | { state: 'not-available'; message: string }
  | { state: 'downloading'; message: string; percent?: number }
  | { state: 'downloaded'; message: string; version?: string }
  | { state: 'error'; message: string };

interface AutoUpdaterLike {
  autoDownload: boolean;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

let autoUpdater: AutoUpdaterLike | null = null;
let status: UpdateStatus = { state: 'idle', message: 'Atualizações prontas.' };
let registered = false;
let updatesDisabled = false;

function updatesDisabledReason(): string | null {
  if (updatesDisabled) return status.message;
  if (process.env.FINANCIALAPP_DISABLE_UPDATES === '1') {
    return 'Atualizações desativadas nesta build beta privada.';
  }
  if (process.platform === 'darwin') {
    return 'Atualizações automáticas no macOS ainda não estão disponíveis. Instala a versão mais recente manualmente.';
  }
  if (app.isPackaged) {
    const markerPath = path.join(process.resourcesPath, 'private-beta');
    if (fs.existsSync(markerPath)) {
      return 'Atualizações desativadas nesta build beta privada.';
    }
    const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
    if (!fs.existsSync(updateConfigPath)) {
      return 'Atualizações indisponíveis nesta build.';
    }
  }
  return null;
}

function disableUpdates(message: string) {
  updatesDisabled = true;
  status = { state: 'disabled', message };
}

function loadUpdater(): AutoUpdaterLike | null {
  if (autoUpdater) return autoUpdater;

  const disabledReason = updatesDisabledReason();
  if (disabledReason) {
    disableUpdates(disabledReason);
    return null;
  }

  try {
    const require = createRequire(__filename);
    autoUpdater = require('electron-updater').autoUpdater as AutoUpdaterLike;
    autoUpdater.autoDownload = false;
    return autoUpdater;
  } catch {
    status = {
      state: 'disabled',
      message: 'Atualizações indisponíveis neste ambiente. Instala electron-updater e usa uma build empacotada.',
    };
    return null;
  }
}

function send(win: BrowserWindow | null, next: UpdateStatus) {
  status = next;
  win?.webContents.send('update:status', next);
}

export function registerUpdaterIpc(getWindow: () => BrowserWindow | null) {
  if (registered) return;
  registered = true;

  ipcMain.handle('update:status', () => status);
  ipcMain.handle('update:check', async () => checkForUpdates(getWindow(), true));
  ipcMain.handle('update:download', async () => {
    const updater = loadUpdater();
    if (!updater) return status;
    send(getWindow(), { state: 'downloading', message: 'A descarregar atualização...', percent: 0 });
    await updater.downloadUpdate();
    return status;
  });
  ipcMain.handle('update:install', () => {
    const updater = loadUpdater();
    if (!updater) return false;
    updater.quitAndInstall();
    return true;
  });
}

export async function configureAutoUpdates(win: BrowserWindow | null) {
  const disabledReason = updatesDisabledReason();
  if (disabledReason) {
    disableUpdates(disabledReason);
    return;
  }

  const updater = loadUpdater();
  if (!updater) return;

  updater.on('checking-for-update', () => {
    send(win, { state: 'checking', message: 'A procurar atualizações...' });
  });
  updater.on('update-available', (rawInfo: unknown) => {
    const info = rawInfo as { version?: string } | undefined;
    send(win, {
      state: 'available',
      version: info?.version,
      message: info?.version ? `Atualização ${info.version} disponível.` : 'Existe uma atualização disponível.',
    });
  });
  updater.on('update-not-available', () => {
    send(win, { state: 'not-available', message: 'A aplicação está atualizada.' });
  });
  updater.on('download-progress', (rawProgress: unknown) => {
    const p = rawProgress as { percent?: number } | undefined;
    send(win, {
      state: 'downloading',
      percent: p?.percent,
      message: `A descarregar atualização${p?.percent != null ? ` (${Math.round(p.percent)}%)` : ''}...`,
    });
  });
  updater.on('update-downloaded', (rawInfo: unknown) => {
    const info = rawInfo as { version?: string } | undefined;
    send(win, {
      state: 'downloaded',
      version: info?.version,
      message: 'Atualização pronta para instalar.',
    });
  });
  updater.on('error', (rawErr: unknown) => {
    const message = rawErr instanceof Error ? rawErr.message : String(rawErr);
    send(win, { state: 'error', message });
  });

  setTimeout(() => {
    checkForUpdates(win, false);
  }, 4000);
}

async function checkForUpdates(win: BrowserWindow | null, manual: boolean) {
  const updater = loadUpdater();
  if (!updater) {
    send(win, status);
    return status;
  }

  if (!app.isPackaged) {
    const next: UpdateStatus = {
      state: 'disabled',
      message: manual
        ? 'As atualizações só são verificadas em builds instaladas.'
        : 'Atualizações inativas em desenvolvimento.',
    };
    send(win, next);
    return next;
  }

  try {
    send(win, { state: 'checking', message: 'A procurar atualizações...' });
    await updater.checkForUpdates();
    return status;
  } catch (err) {
    const next: UpdateStatus = {
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    send(win, next);
    return next;
  }
}
