-- Add notes field for supplier observations and order instructions.
alter table public.suppliers
  add column if not exists notes text;
