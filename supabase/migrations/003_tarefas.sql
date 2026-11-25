-- InvFlow · Migração 003: tarefas, responsáveis, histórico e mudanças de status
-- Como aplicar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Precisa da 001 e da 002 aplicadas antes. Pode rodar de novo sem estragar nada.
--
-- Como funciona:
--  - Todo mundo ativo LÊ todas as tarefas (time pequeno, transparência).
--  - Ninguém grava direto nas tabelas: criar, mudar status e editar passam por
--    três funções (criar_tarefa, mudar_status_tarefa, editar_tarefa), que
--    conferem quem pode o quê.
--  - Um gatilho confere a mudança de status (a mesma tabela de
--    src/logica/status.js), grava as horas de início e fim e outro gatilho
--    escreve o histórico (tarefa_eventos). A tela nunca escreve o histórico.

-- ---------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.tarefas (
  id                  bigint generated always as identity primary key,
  origem              text not null default 'demanda' check (origem in ('demanda', 'programada')),
  tipo_id             bigint not null references public.tipos_atividade (id),
  cliente_id          bigint not null references public.clientes (id),
  local               text check (local is null or char_length(local) <= 120),
  descricao           text check (descricao is null or char_length(descricao) <= 1000),
  email_assunto       text check (email_assunto is null or char_length(email_assunto) <= 200),
  prazo               timestamptz not null,
  status              text not null default 'a_fazer'
                        check (status in ('a_fazer', 'em_andamento', 'bloqueada', 'concluida', 'cancelada')),
  motivo_bloqueio     text,
  iniciada_em         timestamptz,
  iniciada_por        uuid references public.pessoas (id) on delete set null,
  concluida_em        timestamptz,
  concluida_por       uuid references public.pessoas (id) on delete set null,
  lembrar_dias_antes  int check (lembrar_dias_antes is null or lembrar_dias_antes >= 2),
  criado_por          uuid references public.pessoas (id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint tarefa_bloqueada_tem_motivo check (
    (status = 'bloqueada') = (motivo_bloqueio is not null and btrim(motivo_bloqueio) <> '')
  ),
  constraint tarefa_concluida_tem_hora check ((status = 'concluida') = (concluida_em is not null))
);

comment on table public.tarefas is 'Tarefas do time. Título exibido = tipo + cliente + local. "Atrasada" não é status: é prazo vencido com a tarefa aberta.';
comment on column public.tarefas.lembrar_dias_antes is 'Só programadas (mínimo 2). Os lembretes chegam na etapa 7.';

create index if not exists tarefas_status_prazo on public.tarefas (status, prazo);

create table if not exists public.tarefa_responsaveis (
  tarefa_id  bigint not null references public.tarefas (id) on delete cascade,
  pessoa_id  uuid   not null references public.pessoas (id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (tarefa_id, pessoa_id)
);

create index if not exists tarefa_responsaveis_pessoa on public.tarefa_responsaveis (pessoa_id);

create table if not exists public.tarefa_eventos (
  id         bigint generated always as identity primary key,
  tarefa_id  bigint not null references public.tarefas (id) on delete cascade,
  pessoa_id  uuid references public.pessoas (id) on delete set null,
  evento     text not null check (evento in (
               'criada', 'iniciada', 'concluida', 'bloqueada', 'desbloqueada', 'reaberta',
               'editada', 'responsavel_incluido', 'responsavel_removido', 'cancelada')),
  detalhe    jsonb not null default '{}'::jsonb,
  em         timestamptz not null default now()
);

comment on table public.tarefa_eventos is 'Histórico da tarefa (só inserção, escrito pelos gatilhos).';

create index if not exists tarefa_eventos_tarefa on public.tarefa_eventos (tarefa_id, em);

-- ---------------------------------------------------------------------------
-- 2. Mudanças de status permitidas (igual a TRANSICOES em src/logica/status.js)
--    a_fazer      -> em_andamento (Iniciei), bloqueada, cancelada
--    em_andamento -> concluida (Concluí), bloqueada
--    bloqueada    -> em_andamento, a_fazer
--    concluida    -> em_andamento (Reabrir)
--    cancelada    -> (nada)
-- ---------------------------------------------------------------------------
create or replace function public.transicao_permitida(de text, para text)
returns boolean
language sql immutable parallel safe set search_path = ''
as $$
  select (de, para) in (
    ('a_fazer', 'em_andamento'), ('a_fazer', 'bloqueada'), ('a_fazer', 'cancelada'),
    ('em_andamento', 'concluida'), ('em_andamento', 'bloqueada'),
    ('bloqueada', 'em_andamento'), ('bloqueada', 'a_fazer'),
    ('concluida', 'em_andamento')
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Gatilho "antes de gravar": limpa textos, confere status e carimba horas.
--    Vale para todo mundo, inclusive o painel do Supabase.
-- ---------------------------------------------------------------------------
create or replace function public.preparar_tarefa()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.local := nullif(btrim(regexp_replace(coalesce(new.local, ''), '\s+', ' ', 'g')), '');
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.email_assunto := nullif(btrim(regexp_replace(coalesce(new.email_assunto, ''), '\s+', ' ', 'g')), '');
  new.motivo_bloqueio := nullif(btrim(coalesce(new.motivo_bloqueio, '')), '');

  if tg_op = 'INSERT' then
    if new.status not in ('a_fazer') then
      raise exception 'Uma tarefa nova começa "A fazer".';
    end if;
    new.motivo_bloqueio := null;
    new.iniciada_em := null; new.iniciada_por := null;
    new.concluida_em := null; new.concluida_por := null;
    if new.origem = 'programada' then
      new.lembrar_dias_antes := coalesce(new.lembrar_dias_antes, 2);
    else
      new.lembrar_dias_antes := null;
    end if;
    return new;
  end if;

  -- UPDATE: o que nunca muda
  new.id := old.id;
  new.criado_por := old.criado_por;
  new.criado_em := old.criado_em;
  new.origem := old.origem;
  new.atualizado_em := now();

  if new.status is distinct from old.status then
    if not public.transicao_permitida(old.status, new.status) then
      raise exception 'Mudança de status não permitida: % para %.', old.status, new.status
        using hint = 'A tarefa pode ter mudado agora há pouco. Atualize a tela.';
    end if;

    if new.status = 'bloqueada' then
      if new.motivo_bloqueio is null then
        raise exception 'Para bloquear, diga o motivo.';
      end if;
    else
      new.motivo_bloqueio := null;
    end if;

    if new.status = 'em_andamento' then
      if old.status = 'a_fazer' or new.iniciada_em is null then
        new.iniciada_em := now();
        new.iniciada_por := auth.uid();
      end if;
      if old.status = 'concluida' then   -- Reabrir
        new.concluida_em := null;
        new.concluida_por := null;
      end if;
    elsif new.status = 'a_fazer' then    -- desbloqueou sem ter começado
      new.iniciada_em := null;
      new.iniciada_por := null;
    elsif new.status = 'concluida' then
      new.concluida_em := now();
      new.concluida_por := auth.uid();
    end if;
  else
    -- status igual: horas e motivo não mudam por fora
    new.iniciada_em := old.iniciada_em; new.iniciada_por := old.iniciada_por;
    new.concluida_em := old.concluida_em; new.concluida_por := old.concluida_por;
    if new.status = 'bloqueada' and new.motivo_bloqueio is null then
      new.motivo_bloqueio := old.motivo_bloqueio;
    end if;
  end if;

  if new.origem = 'demanda' then
    new.lembrar_dias_antes := null;
  else
    new.lembrar_dias_antes := coalesce(new.lembrar_dias_antes, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists preparar_tarefa on public.tarefas;
create trigger preparar_tarefa
  before insert or update on public.tarefas
  for each row execute function public.preparar_tarefa();

-- ---------------------------------------------------------------------------
-- 4. Gatilhos do histórico (tarefa_eventos)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_evento_tarefa()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_evento text;
  v_mudou jsonb := '{}'::jsonb;
  v_campo text;
begin
  if tg_op = 'INSERT' then
    insert into public.tarefa_eventos (tarefa_id, pessoa_id, evento, detalhe)
    values (new.id, auth.uid(), 'criada', jsonb_build_object('origem', new.origem));
    return null;
  end if;

  if new.status is distinct from old.status then
    v_evento := case
      when new.status = 'cancelada' then 'cancelada'
      when new.status = 'bloqueada' then 'bloqueada'
      when old.status = 'bloqueada' then 'desbloqueada'
      when old.status = 'concluida' then 'reaberta'
      when new.status = 'concluida' then 'concluida'
      when new.status = 'em_andamento' then 'iniciada'
    end;
    insert into public.tarefa_eventos (tarefa_id, pessoa_id, evento, detalhe)
    values (new.id, auth.uid(), v_evento, jsonb_strip_nulls(jsonb_build_object(
      'de', old.status, 'para', new.status,
      'motivo', case when new.status = 'bloqueada' then new.motivo_bloqueio end)));
  end if;

  foreach v_campo in array array['tipo_id', 'cliente_id', 'local', 'descricao', 'email_assunto', 'prazo', 'lembrar_dias_antes'] loop
    if (to_jsonb(new) -> v_campo) is distinct from (to_jsonb(old) -> v_campo) then
      v_mudou := v_mudou || jsonb_build_object(v_campo,
        jsonb_build_object('de', to_jsonb(old) -> v_campo, 'para', to_jsonb(new) -> v_campo));
    end if;
  end loop;
  if v_mudou <> '{}'::jsonb then
    insert into public.tarefa_eventos (tarefa_id, pessoa_id, evento, detalhe)
    values (new.id, auth.uid(), 'editada', v_mudou);
  end if;
  return null;
end;
$$;

drop trigger if exists registrar_evento_tarefa on public.tarefas;
create trigger registrar_evento_tarefa
  after insert or update on public.tarefas
  for each row execute function public.registrar_evento_tarefa();

-- Responsável incluído ou removido depois da criação.
-- (Na criação, criar_tarefa liga "invflow.criando_tarefa" e o evento "criada" basta.)
create or replace function public.registrar_evento_responsavel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('invflow.criando_tarefa', true), '') = new.tarefa_id::text then
      return null;
    end if;
    insert into public.tarefa_eventos (tarefa_id, pessoa_id, evento, detalhe)
    values (new.tarefa_id, auth.uid(), 'responsavel_incluido', jsonb_build_object('pessoa_id', new.pessoa_id));
  else
    if exists (select 1 from public.tarefas t where t.id = old.tarefa_id) then
      insert into public.tarefa_eventos (tarefa_id, pessoa_id, evento, detalhe)
      values (old.tarefa_id, auth.uid(), 'responsavel_removido', jsonb_build_object('pessoa_id', old.pessoa_id));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists registrar_evento_responsavel on public.tarefa_responsaveis;
create trigger registrar_evento_responsavel
  after insert or delete on public.tarefa_responsaveis
  for each row execute function public.registrar_evento_responsavel();

-- ---------------------------------------------------------------------------
-- 5. Conferências usadas pelas funções
-- ---------------------------------------------------------------------------
create or replace function public.conferir_dados_tarefa(
  p_tipo_id bigint, p_cliente_id bigint, p_prazo timestamptz, p_responsaveis uuid[]
)
returns uuid[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_resp uuid[];
begin
  if p_tipo_id is null or not exists (select 1 from public.tipos_atividade where id = p_tipo_id and ativo) then
    raise exception 'Escolha um tipo de atividade da lista.';
  end if;
  if p_cliente_id is null or not exists (select 1 from public.clientes where id = p_cliente_id and ativo) then
    raise exception 'Escolha um cliente da lista.';
  end if;
  if p_prazo is null then
    raise exception 'Informe o prazo.';
  end if;

  select coalesce(array_agg(distinct r), '{}') into v_resp from unnest(p_responsaveis) r where r is not null;
  if cardinality(v_resp) = 0 then
    raise exception 'Escolha pelo menos um responsável.';
  end if;
  if exists (select 1 from unnest(v_resp) r
             where not exists (select 1 from public.pessoas p where p.id = r and p.ativo)) then
    raise exception 'Um dos responsáveis não está ativo no time.';
  end if;
  if not public.eh_gestor() and not (auth.uid() = any (v_resp)) then
    raise exception 'Você precisa estar entre os responsáveis. Só o gestor direciona tarefas para outras pessoas.';
  end if;
  return v_resp;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Criar tarefa. p_iniciar = true é o botão "Criar e iniciar agora".
-- ---------------------------------------------------------------------------
create or replace function public.criar_tarefa(
  p_tipo_id        bigint,
  p_cliente_id     bigint,
  p_prazo          timestamptz,
  p_responsaveis   uuid[],
  p_origem         text    default 'demanda',
  p_local          text    default null,
  p_descricao      text    default null,
  p_email_assunto  text    default null,
  p_iniciar        boolean default false
)
returns public.tarefas
language plpgsql security definer set search_path = ''
as $$
declare
  v_resp uuid[];
  v public.tarefas;
begin
  if not public.eu_ativo() then
    raise exception 'Você não tem permissão para fazer isso.' using errcode = '42501';
  end if;
  if p_origem not in ('demanda', 'programada') then
    raise exception 'Origem da tarefa inválida.';
  end if;
  v_resp := public.conferir_dados_tarefa(p_tipo_id, p_cliente_id, p_prazo, p_responsaveis);
  if p_iniciar and not (auth.uid() = any (v_resp)) then
    raise exception 'Para iniciar agora, você precisa estar entre os responsáveis.';
  end if;

  insert into public.tarefas (origem, tipo_id, cliente_id, local, descricao, email_assunto, prazo, criado_por)
  values (p_origem, p_tipo_id, p_cliente_id, p_local, p_descricao, p_email_assunto, p_prazo, auth.uid())
  returning * into v;

  perform set_config('invflow.criando_tarefa', v.id::text, true);
  insert into public.tarefa_responsaveis (tarefa_id, pessoa_id)
  select v.id, r from unnest(v_resp) r;
  perform set_config('invflow.criando_tarefa', '', true);

  if p_iniciar then
    update public.tarefas set status = 'em_andamento' where id = v.id returning * into v;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Mudar status (Iniciei, Concluí, Bloquear, Desbloquear, Reabrir, Cancelar)
--    Responsável ou gestor mudam status. Cancelar: quem criou ou gestor.
-- ---------------------------------------------------------------------------
create or replace function public.mudar_status_tarefa(p_id bigint, p_status text, p_motivo text default null)
returns public.tarefas
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas;
  v_responsavel boolean;
begin
  if not public.eu_ativo() then
    raise exception 'Você não tem permissão para fazer isso.' using errcode = '42501';
  end if;
  select * into v from public.tarefas where id = p_id for update;
  if v.id is null then
    raise exception 'Tarefa não encontrada.';
  end if;
  if v.status = p_status then
    return v;  -- dois cliques seguidos: nada a fazer
  end if;

  v_responsavel := exists (select 1 from public.tarefa_responsaveis r where r.tarefa_id = p_id and r.pessoa_id = auth.uid());
  if p_status = 'cancelada' then
    if not (public.eh_gestor() or v.criado_por = auth.uid()) then
      raise exception 'Só quem criou a tarefa ou o gestor pode cancelar.' using errcode = '42501';
    end if;
  elsif not (public.eh_gestor() or v_responsavel) then
    raise exception 'Só os responsáveis pela tarefa ou o gestor mudam o status.' using errcode = '42501';
  end if;

  update public.tarefas
  set status = p_status,
      motivo_bloqueio = case when p_status = 'bloqueada' then p_motivo else null end
  where id = p_id
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Editar dados e responsáveis (quem criou, responsável ou gestor;
--    só enquanto a tarefa está aberta)
-- ---------------------------------------------------------------------------
create or replace function public.editar_tarefa(
  p_id             bigint,
  p_tipo_id        bigint,
  p_cliente_id     bigint,
  p_prazo          timestamptz,
  p_responsaveis   uuid[],
  p_local          text default null,
  p_descricao      text default null,
  p_email_assunto  text default null
)
returns public.tarefas
language plpgsql security definer set search_path = ''
as $$
declare
  v public.tarefas;
  v_resp uuid[];
begin
  if not public.eu_ativo() then
    raise exception 'Você não tem permissão para fazer isso.' using errcode = '42501';
  end if;
  select * into v from public.tarefas where id = p_id for update;
  if v.id is null then
    raise exception 'Tarefa não encontrada.';
  end if;
  if not (public.eh_gestor() or v.criado_por = auth.uid()
          or exists (select 1 from public.tarefa_responsaveis r where r.tarefa_id = p_id and r.pessoa_id = auth.uid())) then
    raise exception 'Só quem criou, os responsáveis ou o gestor editam a tarefa.' using errcode = '42501';
  end if;
  if v.status in ('concluida', 'cancelada') then
    raise exception 'Tarefa concluída ou cancelada não é editada. Reabra antes, se precisar.';
  end if;
  v_resp := public.conferir_dados_tarefa(p_tipo_id, p_cliente_id, p_prazo, p_responsaveis);

  update public.tarefas
  set tipo_id = p_tipo_id, cliente_id = p_cliente_id, prazo = p_prazo,
      local = p_local, descricao = p_descricao, email_assunto = p_email_assunto
  where id = p_id
  returning * into v;

  delete from public.tarefa_responsaveis r where r.tarefa_id = p_id and not (r.pessoa_id = any (v_resp));
  insert into public.tarefa_responsaveis (tarefa_id, pessoa_id)
  select p_id, x from unnest(v_resp) x
  on conflict do nothing;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Lista pronta para a tela: tarefa + nomes do tipo, do cliente e dos
--    responsáveis. security_invoker: as regras de leitura de quem consulta valem.
--    (Migrações futuras que mudarem colunas de tarefas recriam esta view.)
-- ---------------------------------------------------------------------------
create or replace view public.tarefas_lista
with (security_invoker = true)
as
select
  t.id, t.origem, t.tipo_id, t.cliente_id, t.local, t.descricao, t.email_assunto, t.prazo,
  t.status, t.motivo_bloqueio, t.iniciada_em, t.iniciada_por, t.concluida_em, t.concluida_por,
  t.lembrar_dias_antes, t.criado_por, t.criado_em, t.atualizado_em,
  ta.nome as tipo_nome,
  c.nome  as cliente_nome,
  coalesce(r.ids, '{}'::uuid[])  as responsaveis_ids,
  coalesce(r.lista, '[]'::jsonb) as responsaveis
from public.tarefas t
join public.tipos_atividade ta on ta.id = t.tipo_id
join public.clientes c on c.id = t.cliente_id
left join lateral (
  select array_agg(p.id order by p.nome) as ids,
         jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome) as lista
  from public.tarefa_responsaveis tr
  join public.pessoas p on p.id = tr.pessoa_id
  where tr.tarefa_id = t.id
) r on true;

comment on view public.tarefas_lista is 'Tarefas com nomes do tipo, cliente e responsáveis (para as telas).';

-- ---------------------------------------------------------------------------
-- 10. Permissões e regras de acesso (RLS)
--     Ler: qualquer pessoa ativa. Gravar: só pelas funções acima.
--     Ninguém apaga tarefa (só cancelar), para manter o histórico.
-- ---------------------------------------------------------------------------
alter table public.tarefas enable row level security;
alter table public.tarefa_responsaveis enable row level security;
alter table public.tarefa_eventos enable row level security;

revoke all on public.tarefas, public.tarefa_responsaveis, public.tarefa_eventos from anon, authenticated;
revoke all on public.tarefas_lista from anon, authenticated;
grant select on public.tarefas, public.tarefa_responsaveis, public.tarefa_eventos, public.tarefas_lista to authenticated;

drop policy if exists tarefas_ler on public.tarefas;
create policy tarefas_ler on public.tarefas
  for select to authenticated using (public.eu_ativo());

drop policy if exists responsaveis_ler on public.tarefa_responsaveis;
create policy responsaveis_ler on public.tarefa_responsaveis
  for select to authenticated using (public.eu_ativo());

drop policy if exists eventos_ler on public.tarefa_eventos;
create policy eventos_ler on public.tarefa_eventos
  for select to authenticated using (public.eu_ativo());

revoke all on function public.preparar_tarefa() from public, anon, authenticated;
revoke all on function public.registrar_evento_tarefa() from public, anon, authenticated;
revoke all on function public.registrar_evento_responsavel() from public, anon, authenticated;
revoke all on function public.conferir_dados_tarefa(bigint, bigint, timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.criar_tarefa(bigint, bigint, timestamptz, uuid[], text, text, text, text, boolean) from public, anon;
revoke all on function public.mudar_status_tarefa(bigint, text, text) from public, anon;
revoke all on function public.editar_tarefa(bigint, bigint, bigint, timestamptz, uuid[], text, text, text) from public, anon;
grant execute on function public.criar_tarefa(bigint, bigint, timestamptz, uuid[], text, text, text, text, boolean) to authenticated;
grant execute on function public.mudar_status_tarefa(bigint, text, text) to authenticated;
grant execute on function public.editar_tarefa(bigint, bigint, bigint, timestamptz, uuid[], text, text, text) to authenticated;
grant execute on function public.transicao_permitida(text, text) to authenticated;
