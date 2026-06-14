import { useEffect, useRef, useState } from 'react';
import iconUrl from '../../../assets/icon.png';
import { api } from '../api';
import { useAppStore } from '../store';
import type { CategoryTemplate } from '../../shared/defaultConfig';
import type { ImportProgress } from '../../shared/types';

interface OnboardingProps {
  onDone: () => void;
}

export default function Onboarding({ onDone }: OnboardingProps) {
  const bumpRefresh = useAppStore((s) => s.bumpRefresh);
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<CategoryTemplate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.listOnboardingCategories().then((items) => {
      setCategories(items);
      setSelected(new Set(items.map((item) => item.name)));
    });
  }, []);

  useEffect(() => {
    const off = api.onImportProgress((p) => {
      setProgress(p);
      if (p.done) bumpRefresh();
    });
    return off;
  }, [bumpRefresh]);

  const toggleCategory = (name: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const sendFiles = async (files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => /\.(csv|tsv|xlsx|xls)$/i.test(f.name));
    if (valid.length === 0) {
      setProgress({ percent: 100, done: true, message: 'Formato não suportado.', error: 'Usa ficheiros .csv, .tsv, .xlsx ou .xls' });
      return;
    }
    for (let i = 0; i < valid.length; i++) {
      setProgress({ percent: 0, message: `Ficheiro ${i + 1} de ${valid.length}: ${valid[i].name}...` });
      const buf = await valid[i].arrayBuffer();
      await api.importFile(valid[i].name, buf);
    }
  };

  const finish = async () => {
    setSaving(true);
    await api.completeOnboarding(Array.from(selected));
    await api.applyRules();
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
            {[1, 2, 3, 4].map((n) => (
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
            <div className="onboarding-actions">
              <button className="btn" onClick={() => setStep(2)}>Começar</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-content">
            <h1>Escolhe as categorias iniciais.</h1>
            <p>Podes ativar só as que fazem sentido agora e criar mais categorias mais tarde.</p>
            <div className="category-picker">
              {categories.map((category) => (
                <button
                  type="button"
                  key={category.name}
                  className={`category-option ${selected.has(category.name) ? 'selected' : ''}`}
                  onClick={() => toggleCategory(category.name)}
                >
                  <span className="color-dot" style={{ background: category.color }} />
                  <span>{category.name}</span>
                  <span className="checkmark">{selected.has(category.name) ? '✓' : ''}</span>
                </button>
              ))}
            </div>
            <div className="onboarding-actions">
              <button className="btn ghost" onClick={() => setStep(1)}>Voltar</button>
              <button className="btn" disabled={selected.size === 0} onClick={() => setStep(3)}>
                Continuar
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
              <button className="btn" onClick={() => setStep(4)}>Continuar</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="onboarding-content">
            <h1>Tudo pronto.</h1>
            <p>
              A app vai criar apenas as categorias selecionadas e abrir o dashboard.
              Podes alterar categorias, importar mais extratos e personalizar gráficos quando quiseres.
            </p>
            <div className="onboarding-summary">
              <div><strong>{selected.size}</strong><span>Categorias selecionadas</span></div>
              <div><strong>{progress?.done && !progress.error ? 'Sim' : 'Opcional'}</strong><span>Importação inicial</span></div>
            </div>
            <div className="onboarding-actions">
              <button className="btn ghost" onClick={() => setStep(3)}>Voltar</button>
              <button className="btn" disabled={saving} onClick={finish}>
                {saving ? 'A finalizar...' : 'Abrir aplicação'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
