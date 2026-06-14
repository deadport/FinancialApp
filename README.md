# FinancialApp 💜

App desktop local-first de análise financeira (Electron + React + TypeScript + SQLite).

## Como abrir
Faz **duplo clique em `FinancialApp.app`** (há uma cópia no Desktop e outra na pasta do projeto).
Ao fechar a janela, a app termina por completo — não fica nada a correr em segundo plano.

## Onde ficam os dados
Tudo o que importares fica guardado permanentemente em SQLite:
`~/Library/Application Support/FinancialApp/financialapp.db`
Fechar e reabrir a app não apaga nada.

## Funcionalidades
- **Dashboard** — receitas, despesas, saldo, gráficos mensais e por categoria, filtro por datas
- **Importar** — arrasta extratos `.csv`, `.tsv` ou `.xlsx` (deteta colunas Data/Descrição/Valor ou Débito/Crédito, datas PT, vírgulas decimais); duplicados são ignorados automaticamente
- **Transações** — pesquisa, filtros, paginação, mudar categoria, apagar
- **Categorias** — categorias com cor + regras de palavras-chave (ex.: "uber" → Transporte)
- **Subscrições** — deteção de pagamentos recorrentes (Netflix, Spotify, …) com estimativa mensal
