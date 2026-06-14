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

Há ficheiros de exemplo em `exemplos/` para testares a importação.

## Desenvolvimento
```bash
npm install
npm run rebuild    # compila o better-sqlite3 para o Electron
npm run build      # compila main + renderer
npm start          # abre a app
```

## Builds distribuíveis
Os instaladores públicos são gerados com Electron Builder:

```bash
npm install
npm run dist:mac   # gera .dmg em release/
npm run dist:win   # gera .exe em release/
```

No Windows, o instalador NSIS permite escolher a pasta de instalação. Em macOS, o `.dmg`
permite copiar a app para a pasta pretendida, normalmente `Applications`.

Os dados do utilizador não ficam dentro da app instalada. Ficam em:

- macOS: `~/Library/Application Support/FinancialApp/financialapp.db`
- Windows: `%APPDATA%/FinancialApp/financialapp.db`

Isto permite atualizar a aplicação sem apagar extratos, categorias, preferências ou ordem dos gráficos.

## Atualizações
A app está preparada para `electron-updater` e usa GitHub Releases do repositório
`deadport/FinancialApp`.

Fluxo previsto:

1. A app instalada verifica updates ao abrir.
2. Se existir uma nova versão, mostra um popup.
3. O utilizador pode descarregar e reiniciar para instalar.
4. A atualização troca apenas os ficheiros da aplicação; a base de dados do utilizador permanece em `userData`.

Para publicar uma nova versão:

```bash
npm version patch
git push origin main --tags
```

O workflow `.github/workflows/release.yml` cria os instaladores e publica os ficheiros
de update no GitHub Release correspondente à tag `v*`.
