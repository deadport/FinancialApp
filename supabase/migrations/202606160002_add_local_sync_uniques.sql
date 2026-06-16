-- Make first desktop-to-cloud uploads repeatable without duplicating local rows.

alter table public.categories
  add constraint categories_user_local_id_key unique (user_id, local_id);

alter table public.category_rules
  add constraint category_rules_user_local_id_key unique (user_id, local_id);

alter table public.transactions
  add constraint transactions_user_local_id_key unique (user_id, local_id);

alter table public.imports
  add constraint imports_user_local_id_key unique (user_id, local_id);
