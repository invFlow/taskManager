-- InvFlow · Migração 002: catálogos (tipos de atividade e clientes)
-- Como aplicar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Precisa da 001 aplicada antes. Pode rodar de novo sem estragar nada.

-- ---------------------------------------------------------------------------
-- 1. Nome de busca: minúsculo, sem acento, só letras e números separados por
--    um espaço. "  Posições-Vazias " -> "posicoes vazias"; "EMB-23" -> "emb 23".
--    A mesma regra existe em src/logica/catalogos.js (um teste confere que as
--    duas listas de letras são iguais).
-- ---------------------------------------------------------------------------
create or replace function public.nome_de_busca(texto text)
returns text
language sql immutable parallel safe set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(translate(coalesce(texto, ''),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
      'aaaaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnnyyy')),
    '[^a-z0-9]+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- 2. Tabelas. nome_busca é único: "Abbott" e "ABBOTT" não convivem.
-- ---------------------------------------------------------------------------
create table if not exists public.tipos_atividade (
  id          bigint generated always as identity primary key,
  nome        text not null check (char_length(nome) between 1 and 80),
  nome_busca  text not null unique check (nome_busca <> ''),
  ativo       boolean not null default true,
  criado_por  uuid references public.pessoas (id) on delete set null,
  criado_em   timestamptz not null default now()
);

create table if not exists public.clientes (
  id          bigint generated always as identity primary key,
  nome        text not null check (char_length(nome) between 1 and 80),
  nome_busca  text not null unique check (nome_busca <> ''),
  ativo       boolean not null default true,
  criado_por  uuid references public.pessoas (id) on delete set null,
  criado_em   timestamptz not null default now()
);

comment on table public.tipos_atividade is 'Tipos de atividade (Inventários diários, Auditorias...). Qualquer pessoa ativa cria; só o gestor renomeia ou arquiva.';
comment on table public.clientes is 'Clientes do armazém. Qualquer pessoa ativa cria; só o gestor renomeia ou arquiva.';
comment on column public.tipos_atividade.ativo is 'false = arquivado: some das listas, mas continua nas tarefas antigas.';
comment on column public.clientes.ativo is 'false = arquivado: some das listas, mas continua nas tarefas antigas.';

-- ---------------------------------------------------------------------------
-- 3. Gatilho: limpa o nome, calcula nome_busca, carimba quem criou e não
--    deixa mudar id, criado_por e criado_em.
-- ---------------------------------------------------------------------------
create or replace function public.preparar_catalogo()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.nome := btrim(regexp_replace(coalesce(new.nome, ''), '\s+', ' ', 'g'));
  new.nome_busca := public.nome_de_busca(new.nome);
  if new.nome_busca = '' then
    raise exception 'Digite um nome com letras ou números.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      new.criado_por := auth.uid();
      new.criado_em := now();
    end if;
  else
    new.id := old.id;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists preparar_catalogo on public.tipos_atividade;
create trigger preparar_catalogo
  before insert or update on public.tipos_atividade
  for each row execute function public.preparar_catalogo();

drop trigger if exists preparar_catalogo on public.clientes;
create trigger preparar_catalogo
  before insert or update on public.clientes
  for each row execute function public.preparar_catalogo();

-- ---------------------------------------------------------------------------
-- 4. Semente: os 7 tipos iniciais.
-- ---------------------------------------------------------------------------
insert into public.tipos_atividade (nome, nome_busca) values
  ('Inventários diários',     public.nome_de_busca('Inventários diários')),
  ('Inventários programados', public.nome_de_busca('Inventários programados')),
  ('Auditorias',              public.nome_de_busca('Auditorias')),
  ('EMB-23',                  public.nome_de_busca('EMB-23')),
  ('Inventários geográficos', public.nome_de_busca('Inventários geográficos')),
  ('Posições vazias',         public.nome_de_busca('Posições vazias')),
  ('Validação das sobras',    public.nome_de_busca('Validação das sobras'))
on conflict (nome_busca) do nothing;

-- ---------------------------------------------------------------------------
-- 5. "Criar na hora" sem duplicar: devolve o item novo ou o que já existia
--    com o mesmo nome de busca (mesmo arquivado; a tela avisa nesse caso).
--    security invoker: as regras de acesso abaixo continuam valendo.
-- ---------------------------------------------------------------------------
create or replace function public.criar_tipo_atividade(p_nome text)
returns public.tipos_atividade
language plpgsql security invoker set search_path = ''
as $$
declare
  v public.tipos_atividade;
begin
  insert into public.tipos_atividade (nome) values (p_nome)
  on conflict (nome_busca) do nothing
  returning * into v;
  if v.id is null then
    select * into v from public.tipos_atividade t where t.nome_busca = public.nome_de_busca(p_nome);
  end if;
  return v;
end;
$$;

create or replace function public.criar_cliente(p_nome text)
returns public.clientes
language plpgsql security invoker set search_path = ''
as $$
declare
  v public.clientes;
begin
  insert into public.clientes (nome) values (p_nome)
  on conflict (nome_busca) do nothing
  returning * into v;
  if v.id is null then
    select * into v from public.clientes c where c.nome_busca = public.nome_de_busca(p_nome);
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permissões e regras de acesso (RLS)
--    - Qualquer pessoa ativa lê tudo e cria (só o nome; o resto é automático).
--    - Só o gestor renomeia ou arquiva/reativa.
--    - Ninguém apaga: arquivar mantém o histórico das tarefas.
-- ---------------------------------------------------------------------------
alter table public.tipos_atividade enable row level security;
alter table public.clientes enable row level security;

revoke all on public.tipos_atividade from anon, authenticated;
revoke all on public.clientes from anon, authenticated;
grant select on public.tipos_atividade, public.clientes to authenticated;
grant insert (nome) on public.tipos_atividade, public.clientes to authenticated;
grant update (nome, ativo) on public.tipos_atividade, public.clientes to authenticated;

revoke all on function public.preparar_catalogo() from public, anon, authenticated;
revoke all on function public.criar_tipo_atividade(text) from public, anon;
revoke all on function public.criar_cliente(text) from public, anon;
grant execute on function public.criar_tipo_atividade(text) to authenticated;
grant execute on function public.criar_cliente(text) to authenticated;
grant execute on function public.nome_de_busca(text) to authenticated;

drop policy if exists tipos_ler on public.tipos_atividade;
create policy tipos_ler on public.tipos_atividade
  for select to authenticated using (public.eu_ativo());

drop policy if exists tipos_criar on public.tipos_atividade;
create policy tipos_criar on public.tipos_atividade
  for insert to authenticated with check (public.eu_ativo() and ativo);

drop policy if exists tipos_editar on public.tipos_atividade;
create policy tipos_editar on public.tipos_atividade
  for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());

drop policy if exists clientes_ler on public.clientes;
create policy clientes_ler on public.clientes
  for select to authenticated using (public.eu_ativo());

drop policy if exists clientes_criar on public.clientes;
create policy clientes_criar on public.clientes
  for insert to authenticated with check (public.eu_ativo() and ativo);

drop policy if exists clientes_editar on public.clientes;
create policy clientes_editar on public.clientes
  for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
