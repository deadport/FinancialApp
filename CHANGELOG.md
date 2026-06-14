# Changelog

## 1.1.3

### Novidades
- **Criar projeto direto na aba Projetos:** botão **+ Adicionar projeto** ao lado dos projetos. Já não é preciso passar por uma transação — cria-se o projeto e depois importa-se um extrato ou atribuem-se transações.
- **Remover projeto:** botão 🗑 que desassocia o projeto das transações (mantendo-as) e o retira da lista.
- Projetos criados ficam guardados mesmo sem transações ainda associadas, e aparecem em todos os seletores (importar, filtros, editor 🏷).

## 1.1.2

### Novidades
- **Aba Projetos dedicada:** seletor compacto de projetos (pills) com KPIs de negócio — **Receitas, Despesas, Lucro e Margem** — e gráficos próprios de **Lucro por mês** e **Lucro acumulado**, repartição de custos por categoria e a lista de transações do projeto.
- **Importar para um projeto:** na aba Importar podes atribuir um extrato inteiro a um projeto (ex: extrato só do negócio) — todas as transações ficam logo associadas.
- **Editar nome do projeto:** renomear um projeto atualiza-o em todas as transações de uma só vez.
- **Editar tags/projeto de uma transação:** atribui tags e projeto pelo botão 🏷, escolhendo projetos já existentes sem reescrever.

### Correções
- Coluna de ações da tabela de Transações deixou de aparecer desalinhada/"colada" (o `<td>` já não usa `display:flex` diretamente).

## 1.1.1

### Novidades
- **Organização avançada (opcional):** cada transação pode ter **tags** e um **projeto**. Edita-os no botão 🏷 da lista de Transações. Os filtros por tag/projeto só aparecem quando existem dados — quem não usa não vê complexidade extra.
- **Lembrete mensal (opcional):** ativa no botão 🔔 e escolhe o dia do mês para receberes uma notificação local a lembrar de importar os extratos.

### Notas técnicas
- Coluna `metadata` (JSON) adicionada às transações com migração suave; dados antigos ficam intactos (`metadata = NULL`).
- Filtros de tag/projeto usam funções JSON1 do SQLite; lógica de filtros de transações unificada num helper partilhado.

## 1.1.0

### Novidades
- **Backup/Restauro portável (JSON):** exporta/importa um pacote completo (categorias, regras, transações, definições e layout dos gráficos), com cópia de segurança interna antes de substituir.
- **Onboarding renovado:** restauro de backup no arranque, seletor de moeda, categorias agrupadas com selecionar/limpar e indicadores de fixas/excluídas, categorização assistida das descrições mais frequentes, resumo final real, opção de saltar configuração e navegação por teclado.

## 1.0.2
- Catálogo de categorias por defeito recuperado.
- Salvaguardas de backup/restauro da base de dados.
- Build privada de beta para macOS.
