-- Hardening pass after initial cloud schema.

alter function public.set_updated_at() set search_path = '';

create index if not exists category_rules_category_id_idx
on public.category_rules (category_id);

create index if not exists transactions_category_id_idx
on public.transactions (category_id);
