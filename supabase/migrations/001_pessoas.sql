-- InvFlow · Migração 001: pessoas, papéis, configurações e regras de acesso (RLS)
-- Como aplicar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Pode rodar de novo sem estragar nada (usa "if not exists" / "create or replace").

-- ---------------------------------------------------------------------------
-- 1. Tabela de pessoas (uma linha por usuário do Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.pessoas (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text not null check (length(trim(nome)) > 0),
  email         text not null unique,
  papel         text not null default 'colaborador' check (papel in ('gestor', 'colaborador')),
  ativo         boolean not null default true,
  recebe_email  boolean not null default true,
  trocar_senha  boolean not null default true,  -- pede uma senha nova no primeiro acesso
  criado_em     timestamptz not null default now()
);

comment on table public.pessoas is 'Pessoas do time. Criada automaticamente quando um usuário é criado no Supabase Auth.';
comment on column public.pessoas.trocar_senha is 'true = no próximo login o app pede para a pessoa criar a própria senha.';

-- ---------------------------------------------------------------------------
-- 2. Configurações (uma linha só)
-- ---------------------------------------------------------------------------
create table if not exists public.configuracoes (
  id                    int primary key default 1 check (id = 1),
  hora_relatorio_manha  time not null default '08:30',
  hora_relatorio_tarde  time not null default '17:30',
  hora_lembretes        time not null default '07:30',
  email_copia_emb       text,
  prazo_emb_horas       int  not null default 24 check (prazo_emb_horas > 0),
  url_app               text not null default 'https://invflow.github.io/taskManager/',
  criado_em             timestamptz not null default now()
);

insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Funções usadas nas regras de acesso
--    security definer: leem pessoas sem cair nas próprias regras (evita laço).
-- ---------------------------------------------------------------------------
create or replace function public.eu_ativo()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pessoas p where p.id = auth.uid() and p.ativo
  );
$$;

create or replace function public.eh_gestor()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pessoas p
    where p.id = auth.uid() and p.ativo and p.papel = 'gestor'
  );
$$;

-- Situação de quem está logado, mesmo inativo (a regra de leitura esconde a
-- própria linha de quem foi desativado; o app usa isto só para explicar o motivo).
create or replace function public.minha_situacao()
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select case when p.ativo then 'ativo' else 'inativo' end
       from public.pessoas p where p.id = auth.uid()),
    'sem_cadastro'
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Ao criar um usuário no Auth, cria a pessoa.
--    Se ainda não existe nenhum gestor ativo, a pessoa nasce gestora
--    (assim o primeiro usuário criado no painel vira o gestor).
-- ---------------------------------------------------------------------------
create or replace function public.criar_pessoa_do_usuario()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text;
  v_papel text := 'colaborador';
begin
  v_nome := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    initcap(regexp_replace(split_part(coalesce(new.email, 'pessoa'), '@', 1), '[._-]+', ' ', 'g'))
  );
  if not exists (select 1 from public.pessoas where papel = 'gestor' and ativo) then
    v_papel := 'gestor';
  end if;
  insert into public.pessoas (id, nome, email, papel)
  values (new.id, v_nome, lower(coalesce(new.email, new.id::text)), v_papel)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_pessoa_do_usuario();

-- Usuários que já existiam antes desta migração também viram pessoas.
-- O mais antigo vira gestor se ainda não houver nenhum.
insert into public.pessoas (id, nome, email, papel)
select u.id,
       initcap(regexp_replace(split_part(coalesce(u.email, 'pessoa'), '@', 1), '[._-]+', ' ', 'g')),
       lower(coalesce(u.email, u.id::text)),
       'colaborador'
from auth.users u
on conflict (id) do nothing;

update public.pessoas set papel = 'gestor'
where id = (select id from public.pessoas order by criado_em, email limit 1)
  and not exists (select 1 from public.pessoas where papel = 'gestor' and ativo);

-- ---------------------------------------------------------------------------
-- 5. Proteções ao editar uma pessoa
--    - Quem não é gestor só muda o próprio nome, "recebe e-mail" e "trocar senha".
--    - Ninguém tira o último gestor ativo (o time nunca fica sem gestor).
--    O painel do Supabase (usuário postgres/service_role) não passa por aqui.
-- ---------------------------------------------------------------------------
create or replace function public.proteger_pessoa()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id or new.email is distinct from old.email
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Não é permitido mudar o e-mail ou o identificador da pessoa.'
      using errcode = '42501';
  end if;

  if not public.eh_gestor()
     and (new.papel is distinct from old.papel or new.ativo is distinct from old.ativo) then
    raise exception 'Só o gestor muda papel ou situação (ativo) de uma pessoa.'
      using errcode = '42501';
  end if;

  if old.papel = 'gestor' and old.ativo
     and (new.papel <> 'gestor' or not new.ativo)
     and not exists (
       select 1 from public.pessoas p
       where p.papel = 'gestor' and p.ativo and p.id <> old.id
     ) then
    raise exception 'O time precisa de pelo menos um gestor ativo.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_pessoa on public.pessoas;
create trigger proteger_pessoa
  before update on public.pessoas
  for each row execute function public.proteger_pessoa();

-- ---------------------------------------------------------------------------
-- 6. Permissões e regras de acesso (RLS)
--    Pessoa inativa não passa em nenhuma regra.
-- ---------------------------------------------------------------------------
alter table public.pessoas enable row level security;
alter table public.configuracoes enable row level security;

revoke all on public.pessoas from anon, authenticated;
revoke all on public.configuracoes from anon, authenticated;
grant select, update on public.pessoas to authenticated;
grant select, update on public.configuracoes to authenticated;

revoke all on function public.eu_ativo() from public, anon;
revoke all on function public.eh_gestor() from public, anon;
grant execute on function public.eu_ativo() to authenticated;
grant execute on function public.eh_gestor() to authenticated;
revoke all on function public.minha_situacao() from public, anon;
grant execute on function public.minha_situacao() to authenticated;
revoke all on function public.criar_pessoa_do_usuario() from public, anon, authenticated;

drop policy if exists pessoas_ler on public.pessoas;
create policy pessoas_ler on public.pessoas
  for select to authenticated
  using (public.eu_ativo());

drop policy if exists pessoas_editar on public.pessoas;
create policy pessoas_editar on public.pessoas
  for update to authenticated
  using (public.eh_gestor() or (id = auth.uid() and public.eu_ativo()))
  with check (public.eh_gestor() or (id = auth.uid() and public.eu_ativo()));

drop policy if exists configuracoes_ler on public.configuracoes;
create policy configuracoes_ler on public.configuracoes
  for select to authenticated
  using (public.eu_ativo());

drop policy if exists configuracoes_editar on public.configuracoes;
create policy configuracoes_editar on public.configuracoes
  for update to authenticated
  using (public.eh_gestor())
  with check (public.eh_gestor());
