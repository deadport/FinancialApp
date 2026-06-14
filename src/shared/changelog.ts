export interface ChangelogItem {
  title: string;
  body: string;
}

export const LATEST_CHANGELOG: ChangelogItem[] = [
  {
    title: 'Transações manuais',
    body: 'Adiciona despesas ou receitas em dinheiro físico diretamente na lista de transações.',
  },
  {
    title: 'Projetos',
    body: 'Organiza movimentos de negócio numa área separada do dashboard principal, com detalhe próprio por projeto.',
  },
  {
    title: 'Categorização em massa',
    body: 'Seleciona várias transações ou grupos por categorizar e aplica uma categoria de uma só vez.',
  },
  {
    title: 'Backups e restauro',
    body: 'Exporta/importa bundles portáteis e restaura bases de dados completas sem depender da pasta da app.',
  },
  {
    title: 'Atualizações',
    body: 'A app mostra quando existe uma nova versão e preserva transações, categorias, definições e layout.',
  },
];
