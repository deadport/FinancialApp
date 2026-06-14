# Changelog

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
