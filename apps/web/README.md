# FinancialApp Web

Primeira versão web/PWA para beta privada com Supabase.

## Configuração local

1. Copia `.env.example` para `.env.local`.
2. Preenche `VITE_SUPABASE_PUBLISHABLE_KEY` com a publishable key do Supabase.
3. Instala dependências:

```bash
npm --prefix apps/web install
```

4. Arranca localmente:

```bash
npm --prefix apps/web run dev
```

## Base de dados

A migração inicial está em:

```text
../../supabase/migrations/202606150001_initial_financialapp_cloud.sql
```

Ela cria as tabelas cloud iniciais e ativa RLS por utilizador.

## Vercel

Para deploy:

- Root directory: raiz do repositório
- Install command: `npm --prefix apps/web ci`
- Build command: `npm --prefix apps/web run build`
- Output directory: `apps/web/dist`
- Environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

O `vercel.json` na raiz já define estes comandos e inclui rewrite para SPA.
Usa apenas a publishable key no frontend; não configurar service role, secret key ou
outros segredos Supabase no projeto Vercel da web app.

## Próxima fase

Validar preview/produção em mobile e desktop depois do deploy, mantendo RLS ativa
e os dados locais do desktop fora do bundle/deploy.
