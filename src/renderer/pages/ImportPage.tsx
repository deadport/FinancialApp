import { useEffect, useRef, useState } from 'react';
import { api, fmtDate } from '../api';
import { useAppStore } from '../store';
import type { ImportProgress, ImportRecord } from '../../shared/types';

export default function ImportPage() {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [removeMsg, setRemoveMsg] = useState('');
  const [project, setProject] = useState('');
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadHistory = () => { api.listImports().then(setHistory); };
  useEffect(loadHistory, []);
  useEffect(() => { api.txMetaFacets().then((f) => setProjectOptions(f.projects)); }, []);

  useEffect(() => {
    const off = api.onImportProgress((p) => {
      setProgress(p);
      if (p.done) { loadHistory(); bumpRefresh(); }
    });
    return off;
  }, [bumpRefresh]);

  const sendFiles = async (files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => /\.(csv|tsv|xlsx|xls)$/i.test(f.name));
    if (valid.length === 0) {
      setProgress({ percent: 100, done: true, message: 'Formato não suportado.', error: 'Usa ficheiros .csv, .tsv, .xlsx ou .xls' });
      return;
    }
    const targetProject = project.trim() || undefined;
    for (let i = 0; i < valid.length; i++) {
      setProgress({ percent: 0, message: `Ficheiro ${i + 1} de ${valid.length}: ${valid[i].name}…` });
      const buf = await valid[i].arrayBuffer();
      await api.importFile(valid[i].name, buf, targetProject);
    }
    if (targetProject) api.txMetaFacets().then((f) => setProjectOptions(f.projects));
  };

  return (
    <>
      <div className="page-header">
        <h1>Importar extratos</h1>
      </div>
      <div className="page-body">
        <div className="panel import-project">
          <label className="import-project-field">
            <span>Atribuir a um projeto <span className="muted">(opcional)</span></span>
            <input
              type="text"
              list="import-project-options"
              value={project}
              placeholder="ex: extrato só do negócio — deixa vazio para importação normal"
              onChange={(e) => setProject(e.target.value)}
            />
            <datalist id="import-project-options">
              {projectOptions.map((p) => <option key={p} value={p} />)}
            </datalist>
          </label>
          {project.trim() && (
            <div className="import-project-hint">
              📁 Todas as transações deste extrato vão ser atribuídas ao projeto <strong>{project.trim()}</strong>.
            </div>
          )}
        </div>
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) sendFiles(e.dataTransfer.files);
          }}
        >
          <div className="dz-title">📥 Arrasta um ou mais extratos para aqui</div>
          <div>ou clica para escolher ficheiros (.csv, .tsv, .xlsx, .xls)</div>
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
          <div className="panel">
            <h2>Progresso da importação</h2>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
            <div className={`import-msg ${progress.error ? 'error' : progress.done ? 'ok' : ''}`}>
              {progress.error ? `⚠️ ${progress.error}` : progress.message}
            </div>
          </div>
        )}

        <div className="panel">
          <h2>Histórico de importações</h2>
          {removeMsg && <div className="import-msg ok" style={{ marginBottom: 10 }}>{removeMsg}</div>}
          {history.length === 0 ? (
            <div className="empty">Ainda não importaste nenhum ficheiro.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Ficheiro</th><th>Inseridas</th><th>Duplicadas</th><th>Data</th><th></th></tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td title={h.file_name}>{h.file_name}</td>
                      <td>{h.inserted}</td>
                      <td>{h.skipped}</td>
                      <td>{fmtDate(h.created_at.slice(0, 10))}</td>
                      <td style={{ width: 110 }}>
                        <button className="btn danger" onClick={async () => {
                          if (!window.confirm(`Remover "${h.file_name}" e todas as transações importadas desse ficheiro?`)) return;
                          const { removed } = await api.deleteImport(h.id);
                          setRemoveMsg(`"${h.file_name}" removido — ${removed} transações apagadas.`);
                          loadHistory();
                          bumpRefresh();
                        }}>🗑 Remover</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
