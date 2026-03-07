-- 0006_label_print_jobs.sql
-- Historico opcional de jobs de impressao de etiquetas.

create table if not exists public.label_print_jobs (
  job_id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id),
  created_at timestamp not null default now(),
  payload jsonb not null
);

create index if not exists label_print_jobs_created_at_idx
  on public.label_print_jobs (created_at desc);

create index if not exists label_print_jobs_created_by_idx
  on public.label_print_jobs (created_by);

alter table public.label_print_jobs enable row level security;

drop policy if exists "read_label_print_jobs" on public.label_print_jobs;
create policy "read_label_print_jobs" on public.label_print_jobs
  for select
  using (
    public.user_role() in ('ADMIN', 'GERENTE')
    or created_by = auth.uid()
  );

drop policy if exists "insert_label_print_jobs" on public.label_print_jobs;
create policy "insert_label_print_jobs" on public.label_print_jobs
  for insert
  with check (
    public.user_role() in ('ADMIN', 'GERENTE', 'OPERADOR')
    and created_by = auth.uid()
  );
