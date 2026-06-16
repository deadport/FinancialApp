import webOverviewImage from '../../assets/release-web-overview.svg';
import syncStepsImage from '../../assets/release-sync-steps.svg';
import mobileTabsImage from '../../assets/release-mobile-tabs.svg';

export interface ReleaseGuideSection {
  title: string;
  body: string;
  image: string;
  steps: string[];
}

export const RELEASE_GUIDE_TOKEN = 'web-launch-2026-06';

export const LATEST_RELEASE_GUIDE: ReleaseGuideSection[] = [
  {
    title: 'Nova versão web para telemóvel e browser',
    body: 'A FinancialApp passa a ter uma versão web/mobile ligada ao Supabase para consultares os dados sincronizados fora do desktop.',
    image: webOverviewImage,
    steps: [
      'Abre `fwebapp.vercel.app` no telemóvel, tablet ou browser.',
      'Entra com a mesma conta que ligares no desktop para veres os teus dados sincronizados.',
      'O desktop continua a guardar o SQLite local e não apaga os teus dados atuais.',
    ],
  },
  {
    title: 'Como ligar a sincronização pela primeira vez',
    body: 'A cloud é opcional. Primeiro ligas a conta no desktop, depois a app envia os dados locais atuais para a tua área privada.',
    image: syncStepsImage,
    steps: [
      'No desktop, abre o botão `☁` na barra lateral.',
      'Cria conta ou entra, e confirma a ligação da cloud.',
      'Depois abre a versão web e usa a mesma conta para continuar no telemóvel.',
    ],
  },
  {
    title: 'O que já consegues fazer na web',
    body: 'A experiência mobile foi pensada para consulta rápida, categorização e pequenos ajustes sem aumentar a confusão no ecrã.',
    image: mobileTabsImage,
    steps: [
      'Usa `Resumo` para KPIs, gráficos e subscrições recentes.',
      'Usa `Projetos`, `Importar` e `Categorias` no footer para as ações principais.',
      'Movimentos e Conta continuam acessíveis no topo para manter o footer limpo.',
    ],
  },
];
