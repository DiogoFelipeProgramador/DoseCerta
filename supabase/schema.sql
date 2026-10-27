-- Tabelas usadas pela cópia de segurança opcional e pelo aviso ao cuidador (src/services/supabase.ts).
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

-- Caregiver alert by email (added later: "add column if not exists" also updates existing projects)
alter table public.perfil_usuario add column if not exists email_cuidador text;
alter table public.perfil_usuario add column if not exists avisar_cuidador boolean default true;

alter table public.perfil_usuario enable row level security;
alter table public.medicamentos enable row level security;

drop policy if exists "perfil_proprio" on public.perfil_usuario;
create policy "perfil_proprio" on public.perfil_usuario
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "medicamentos_proprios" on public.medicamentos;
create policy "medicamentos_proprios" on public.medicamentos
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- Doses still waiting for confirmation in the next days, sent by the app (src/services/supabase.ts →
-- sincronizarDosesNuvem). The server uses them to email the caregiver when a dose stays 30 min
-- without confirmation. Only stored while the caregiver alert is on; taken/removed doses are deleted.
create table if not exists public.doses_pendentes (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  dose_id text not null,
  medicamento_nome text not null,
  dosagem text,
  previsto_para timestamptz not null,
  aviso_enviado_em timestamptz,
  atualizado_em timestamptz default now(),
  primary key (usuario_id, dose_id)
);

-- When the server first learned about the dose (the app never sends it, so updates keep it).
-- The 30 minutes count from whichever is later: the dose time or its arrival. A dose that only
-- reached the server after its time (phone offline, alert just turned on) still alerts the
-- caregiver, but the patient first gets 30 minutes to see it in the app and confirm.
alter table public.doses_pendentes add column if not exists registrado_em timestamptz not null default now();
alter table public.doses_pendentes add column if not exists referencia_aviso timestamptz
  generated always as (greatest(previsto_para, registrado_em)) stored;

drop index if exists public.doses_pendentes_sem_aviso;
create index if not exists doses_pendentes_aguardando_aviso
  on public.doses_pendentes (referencia_aviso) where aviso_enviado_em is null;

alter table public.doses_pendentes enable row level security;

drop policy if exists "doses_proprias" on public.doses_pendentes;
create policy "doses_proprias" on public.doses_pendentes
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- Backup of the routine, so logging in on another phone brings everything back
-- (src/services/supabase.ts → enviarRotinaNuvem / restaurarRotinaNuvem).
-- Dates of doses stay as the phone's local time ("YYYY-MM-DDTHH:mm:ss"), like in the app.
alter table public.medicamentos add column if not exists foto_caminho text;

create table if not exists public.horarios_medicamento (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  medicamento_id text not null,
  dosagem text not null,
  hora_programada text not null,
  dias_da_semana text default 'TODOS',
  ativo boolean default true,
  criado_em timestamptz,
  primary key (usuario_id, id)
);

-- Only doses already registered (taken, taken late, skipped): pending ones are recreated
-- from the schedules on the phone.
create table if not exists public.historico_doses (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  medicamento_id text not null,
  horario_id text,
  data_hora_prevista text not null,
  data_hora_realizada text,
  status text not null check (status in ('PENDENTE', 'TOMADO', 'ATRASADO', 'PULADO')),
  observacao text,
  atualizado_em timestamptz default now(),
  primary key (usuario_id, id)
);

alter table public.horarios_medicamento enable row level security;
alter table public.historico_doses enable row level security;

drop policy if exists "horarios_proprios" on public.horarios_medicamento;
create policy "horarios_proprios" on public.horarios_medicamento
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

drop policy if exists "historico_proprio" on public.historico_doses;
create policy "historico_proprio" on public.historico_doses
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

-- Photos of the medication boxes: private bucket, each user only reaches the folder named
-- with their own id ("<user id>/<medication id>.jpg").
insert into storage.buckets (id, name, public)
values ('fotos-medicamentos', 'fotos-medicamentos', false)
on conflict (id) do nothing;

drop policy if exists "fotos_proprias" on storage.objects;
create policy "fotos_proprias" on storage.objects
  for all to authenticated
  using (bucket_id = 'fotos-medicamentos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'fotos-medicamentos' and (storage.foldername(name))[1] = auth.uid()::text);
