-- Tabelas usadas pela cópia de segurança opcional (src/services/supabase.ts → triggerAutoSync).
-- Rode no Supabase → SQL Editor. Cada usuário só enxerga e altera os próprios dados (RLS).

create table if not exists public.perfil_usuario (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text,
  email text,
  telefone_cuidador text,
  nome_cuidador text,
  tamanho_fonte text default 'padrao',
  alto_contraste integer default 0,
  atualizado_em timestamptz default now()
);

create table if not exists public.medicamentos (
  id text primary key,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  forma_farmaceutica text,
  cor text,
  foto_url text,
  orientacoes_extras text,
  criado_em timestamptz default now()
);

alter table public.perfil_usuario enable row level security;
alter table public.medicamentos enable row level security;

drop policy if exists "perfil_proprio" on public.perfil_usuario;
create policy "perfil_proprio" on public.perfil_usuario
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "medicamentos_proprios" on public.medicamentos;
create policy "medicamentos_proprios" on public.medicamentos
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
