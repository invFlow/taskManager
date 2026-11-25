-- InvFlow · Testes das tarefas (etapa 4: criar, mudar status, histórico e regras)
--
-- Como rodar no Supabase: SQL Editor > New query > colar este arquivo inteiro > Run.
-- Tudo roda dentro de uma transação desfeita no final (rollback): nada fica no banco.
-- Resultado esperado: uma linha "OK: todos os testes de tarefas passaram".
-- Se algum teste falhar, aparece um erro começando com "FALHOU:".

begin;

-- Pessoas de teste: gestor, duas colaboradoras e uma inativa
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-4000-8000-0000000000d1', 'tar.gestor@invflow.test',  '{"nome":"Gestor Tarefas"}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d2', 'tar.ana@invflow.test',     '{"nome":"Ana Tarefas"}',    'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d3', 'tar.bia@invflow.test',     '{"nome":"Bia Tarefas"}',    'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d4', 'tar.inativo@invflow.test', '{}',                         'authenticated', 'authenticated');

update public.pessoas set papel = 'gestor' where id = '00000000-0000-4000-8000-0000000000d1';
update public.pessoas set papel = 'colaborador'
  where id in ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000d4');
update public.pessoas set ativo = false where id = '00000000-0000-4000-8000-0000000000d4';

insert into public.clientes (nome) values ('Cliente Tarefa Teste') on conflict (nome_busca) do nothing;
insert into public.clientes (nome) values ('Cliente Tarefa Arquivado') on conflict (nome_busca) do nothing;
update public.clientes set ativo = false where nome_busca = 'cliente tarefa arquivado';

-- Guarda ids para os blocos seguintes (configuração local da transação)
do $$
begin
  perform set_config('teste.tipo', (select id::text from public.tipos_atividade where nome_busca = 'auditorias'), true);
  perform set_config('teste.cliente', (select id::text from public.clientes where nome_busca = 'cliente tarefa teste'), true);
  perform set_config('teste.arquivado', (select id::text from public.clientes where nome_busca = 'cliente tarefa arquivado'), true);
end $$;

-- Mudanças de status permitidas (a mesma tabela de src/logica/status.js)
do $$
begin
  if not public.transicao_permitida('a_fazer', 'em_andamento') then raise exception 'FALHOU: a_fazer -> em_andamento devia valer'; end if;
  if not public.transicao_permitida('concluida', 'em_andamento') then raise exception 'FALHOU: Reabrir devia valer'; end if;
  if public.transicao_permitida('a_fazer', 'concluida') then raise exception 'FALHOU: a_fazer -> concluida não devia valer'; end if;
  if public.transicao_permitida('cancelada', 'a_fazer') then raise exception 'FALHOU: cancelada não volta'; end if;
  if public.transicao_permitida('em_andamento', 'cancelada') then raise exception 'FALHOU: em_andamento -> cancelada não devia valer'; end if;
end $$;

-- ===========================================================================
-- Visitante sem login: não lê nem cria
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.tarefas;
    raise exception 'FALHOU: visitante leu tarefas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.tarefas_lista;
    raise exception 'FALHOU: visitante leu tarefas_lista';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.criar_tarefa(1, 1, now(), array['00000000-0000-4000-8000-0000000000d2']::uuid[]);
    raise exception 'FALHOU: visitante criou tarefa';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ===========================================================================
-- Ana (colaboradora): cria demanda em 3 campos, Iniciei, Concluí, bloquear
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);

do $$
declare
  ana constant uuid := '00000000-0000-4000-8000-0000000000d2';
  bia constant uuid := '00000000-0000-4000-8000-0000000000d3';
  tipo bigint := current_setting('teste.tipo')::bigint;
  cli bigint := current_setting('teste.cliente')::bigint;
  v public.tarefas;
  l public.tarefas_lista;
  n int;
  eventos text;
begin
  -- demanda: tipo, cliente e prazo (responsável = eu)
  v := public.criar_tarefa(tipo, cli, now() + interval '3 hours', array[ana]);
  if v.id is null or v.status <> 'a_fazer' or v.origem <> 'demanda' then raise exception 'FALHOU: demanda devia nascer a_fazer'; end if;
  if v.criado_por <> ana then raise exception 'FALHOU: criado_por devia ser a Ana'; end if;
  if v.lembrar_dias_antes is not null then raise exception 'FALHOU: demanda não tem lembrete'; end if;
  perform set_config('teste.t1', v.id::text, true);

  select * into l from public.tarefas_lista where id = v.id;
  if l.tipo_nome <> 'Auditorias' or l.cliente_nome <> 'Cliente Tarefa Teste' then raise exception 'FALHOU: tarefas_lista sem os nomes'; end if;
  if l.responsaveis_ids <> array[ana] or l.responsaveis -> 0 ->> 'nome' <> 'Ana Tarefas' then raise exception 'FALHOU: tarefas_lista sem os responsáveis'; end if;

  -- não grava direto nas tabelas
  begin
    insert into public.tarefas (tipo_id, cliente_id, prazo) values (tipo, cli, now());
    raise exception 'FALHOU: colaboradora inseriu direto em tarefas';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tarefas set status = 'concluida' where id = v.id;
    raise exception 'FALHOU: colaboradora mudou status direto na tabela';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tarefa_eventos (tarefa_id, evento) values (v.id, 'concluida');
    raise exception 'FALHOU: colaboradora escreveu no histórico';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.tarefas where id = v.id;
    raise exception 'FALHOU: colaboradora apagou tarefa';
  exception when insufficient_privilege then null;
  end;

  -- transição proibida: a_fazer -> concluida
  begin
    perform public.mudar_status_tarefa(v.id, 'concluida');
    raise exception 'FALHOU: aceitou a_fazer -> concluida';
  exception when raise_exception then
    if sqlerrm not like 'Mudança de status não permitida%' then raise; end if;
  end;

  -- Iniciei grava hora e quem
  v := public.mudar_status_tarefa(v.id, 'em_andamento');
  if v.status <> 'em_andamento' or v.iniciada_em is null or v.iniciada_por <> ana then raise exception 'FALHOU: Iniciei devia gravar hora e pessoa'; end if;
  -- clicar de novo não muda nada
  v := public.mudar_status_tarefa(v.id, 'em_andamento');
  -- bloquear exige motivo
  begin
    perform public.mudar_status_tarefa(v.id, 'bloqueada', '   ');
    raise exception 'FALHOU: bloqueou sem motivo';
  exception when raise_exception then
    if sqlerrm not like 'Para bloquear, diga o motivo%' then raise; end if;
  end;
  v := public.mudar_status_tarefa(v.id, 'bloqueada', ' Rua interditada ');
  if v.status <> 'bloqueada' or v.motivo_bloqueio <> 'Rua interditada' then raise exception 'FALHOU: bloquear devia guardar o motivo limpo'; end if;
  -- desbloquear volta para em andamento, mantém a hora de início e limpa o motivo
  v := public.mudar_status_tarefa(v.id, 'em_andamento');
  if v.motivo_bloqueio is not null or v.iniciada_em is null then raise exception 'FALHOU: desbloquear devia limpar o motivo e manter o início'; end if;
  -- Concluí grava hora e quem
  v := public.mudar_status_tarefa(v.id, 'concluida');
  if v.concluida_em is null or v.concluida_por <> ana then raise exception 'FALHOU: Concluí devia gravar hora e pessoa'; end if;
  -- Reabrir limpa a conclusão
  v := public.mudar_status_tarefa(v.id, 'em_andamento');
  if v.concluida_em is not null or v.concluida_por is not null then raise exception 'FALHOU: reabrir devia limpar concluida_em'; end if;
  v := public.mudar_status_tarefa(v.id, 'concluida');

  -- concluída não é editada
  begin
    perform public.editar_tarefa(v.id, tipo, cli, now(), array[ana]);
    raise exception 'FALHOU: editou tarefa concluída';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- histórico registrou cada passo, na ordem
  select string_agg(evento, ',' order by id) into eventos from public.tarefa_eventos where tarefa_id = v.id;
  if eventos <> 'criada,iniciada,bloqueada,desbloqueada,concluida,reaberta,concluida' then
    raise exception 'FALHOU: histórico errado: %', eventos;
  end if;
  if (select detalhe ->> 'motivo' from public.tarefa_eventos where tarefa_id = v.id and evento = 'bloqueada') <> 'Rua interditada' then
    raise exception 'FALHOU: histórico do bloqueio sem o motivo';
  end if;
  if exists (select 1 from public.tarefa_eventos where tarefa_id = v.id and pessoa_id is distinct from ana) then
    raise exception 'FALHOU: histórico devia ter a Ana em todos os passos';
  end if;

  -- Criar e iniciar agora
  v := public.criar_tarefa(tipo, cli, now() + interval '1 hour', array[ana, bia], 'demanda', ' Rua  F05 ', null, null, true);
  if v.status <> 'em_andamento' or v.iniciada_em is null then raise exception 'FALHOU: criar e iniciar devia nascer em andamento'; end if;
  if v.local <> 'Rua F05' then raise exception 'FALHOU: local devia ser limpo, veio "%"', v.local; end if;
  select count(*) into n from public.tarefa_responsaveis where tarefa_id = v.id;
  if n <> 2 then raise exception 'FALHOU: devia ter 2 responsáveis'; end if;
  select string_agg(evento, ',' order by id) into eventos from public.tarefa_eventos where tarefa_id = v.id;
  if eventos <> 'criada,iniciada' then raise exception 'FALHOU: histórico de criar e iniciar: %', eventos; end if;
  perform set_config('teste.t2', v.id::text, true);

  -- colaboradora precisa estar entre os responsáveis
  begin
    perform public.criar_tarefa(tipo, cli, now(), array[bia]);
    raise exception 'FALHOU: colaboradora criou tarefa só para a colega';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  -- sem responsável, sem prazo, cliente arquivado, responsável inativo: recusados
  begin
    perform public.criar_tarefa(tipo, cli, now(), array[]::uuid[]);
    raise exception 'FALHOU: criou sem responsável';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.criar_tarefa(tipo, cli, null, array[ana]);
    raise exception 'FALHOU: criou sem prazo';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.criar_tarefa(tipo, current_setting('teste.arquivado')::bigint, now(), array[ana]);
    raise exception 'FALHOU: criou com cliente arquivado';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.criar_tarefa(tipo, cli, now(), array[ana, '00000000-0000-4000-8000-0000000000d4'::uuid]);
    raise exception 'FALHOU: criou com responsável inativo';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- programada nasce com lembrete de 2 dias
  v := public.criar_tarefa(tipo, cli, now() + interval '5 days', array[ana], 'programada');
  if v.origem <> 'programada' or v.lembrar_dias_antes <> 2 then raise exception 'FALHOU: programada devia ter lembrar_dias_antes = 2'; end if;
  perform set_config('teste.t3', v.id::text, true);
end $$;

-- ===========================================================================
-- Bia: responsável na t2, não responsável na t3
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
do $$
declare
  ana constant uuid := '00000000-0000-4000-8000-0000000000d2';
  bia constant uuid := '00000000-0000-4000-8000-0000000000d3';
  t2 bigint := current_setting('teste.t2')::bigint;
  t3 bigint := current_setting('teste.t3')::bigint;
  tipo bigint := current_setting('teste.tipo')::bigint;
  cli bigint := current_setting('teste.cliente')::bigint;
  v public.tarefas;
  n int;
begin
  -- vê todas as tarefas
  select count(*) into n from public.tarefas_lista where id in (t2, t3);
  if n <> 2 then raise exception 'FALHOU: Bia devia ver as tarefas do time'; end if;

  -- não muda status de quem não é responsável
  begin
    perform public.mudar_status_tarefa(t3, 'em_andamento');
    raise exception 'FALHOU: Bia iniciou tarefa que não é dela';
  exception when insufficient_privilege then null;
  end;
  -- não edita tarefa em que não está
  begin
    perform public.editar_tarefa(t3, tipo, cli, now(), array[bia]);
    raise exception 'FALHOU: Bia editou tarefa que não é dela';
  exception when insufficient_privilege then null;
  end;

  -- é responsável na t2: conclui
  v := public.mudar_status_tarefa(t2, 'concluida');
  if v.concluida_por <> bia then raise exception 'FALHOU: concluida_por devia ser a Bia'; end if;
  v := public.mudar_status_tarefa(t2, 'em_andamento');

  -- mas não cancela (não criou)
  begin
    perform public.mudar_status_tarefa(t2, 'cancelada');
    raise exception 'FALHOU: Bia cancelou tarefa que não criou';
  exception when insufficient_privilege then null;
  end;

  -- edita a t2 (é responsável): muda prazo e tira a Ana
  v := public.editar_tarefa(t2, tipo, cli, now() + interval '2 days', array[bia], 'Rua G01', 'Contar de novo');
  if v.local <> 'Rua G01' or v.descricao <> 'Contar de novo' then raise exception 'FALHOU: edição não gravou'; end if;
  if (select array_agg(pessoa_id) from public.tarefa_responsaveis where tarefa_id = t2) <> array[bia] then
    raise exception 'FALHOU: edição devia deixar só a Bia';
  end if;
  if not exists (select 1 from public.tarefa_eventos where tarefa_id = t2 and evento = 'editada' and detalhe ? 'prazo' and detalhe ? 'local') then
    raise exception 'FALHOU: histórico devia registrar a edição com os campos';
  end if;
  if not exists (select 1 from public.tarefa_eventos where tarefa_id = t2 and evento = 'responsavel_removido' and detalhe ->> 'pessoa_id' = ana::text) then
    raise exception 'FALHOU: histórico devia registrar a Ana removida';
  end if;
  if exists (select 1 from public.tarefa_eventos where tarefa_id = t2 and evento = 'responsavel_incluido') then
    raise exception 'FALHOU: criação não devia gerar responsavel_incluido';
  end if;
end $$;

-- ===========================================================================
-- Pessoa inativa: não lê nem mexe
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.tarefas_lista;
  if n <> 0 then raise exception 'FALHOU: pessoa inativa leu % tarefas', n; end if;
  select count(*) into n from public.tarefa_eventos;
  if n <> 0 then raise exception 'FALHOU: pessoa inativa leu o histórico'; end if;
  begin
    perform public.mudar_status_tarefa(current_setting('teste.t3')::bigint, 'cancelada');
    raise exception 'FALHOU: pessoa inativa cancelou tarefa';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ===========================================================================
-- Gestor: direciona para outra pessoa, muda status de qualquer uma, cancela
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
do $$
declare
  gestor constant uuid := '00000000-0000-4000-8000-0000000000d1';
  bia constant uuid := '00000000-0000-4000-8000-0000000000d3';
  tipo bigint := current_setting('teste.tipo')::bigint;
  cli bigint := current_setting('teste.cliente')::bigint;
  t3 bigint := current_setting('teste.t3')::bigint;
  v public.tarefas;
begin
  -- cria só para a Bia (sem estar entre os responsáveis)
  v := public.criar_tarefa(tipo, cli, now() + interval '1 day', array[bia]);
  if v.criado_por <> gestor then raise exception 'FALHOU: gestor devia ser o criador'; end if;
  -- mas não "cria e inicia" sem estar entre os responsáveis
  begin
    perform public.criar_tarefa(tipo, cli, now(), array[bia], 'demanda', null, null, null, true);
    raise exception 'FALHOU: gestor iniciou tarefa em que não está';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  -- muda status de tarefa alheia e cancela
  v := public.mudar_status_tarefa(t3, 'bloqueada', 'Falta equipamento');
  v := public.mudar_status_tarefa(t3, 'a_fazer');
  if v.iniciada_em is not null or v.motivo_bloqueio is not null then raise exception 'FALHOU: voltar para a_fazer devia limpar início e motivo'; end if;
  v := public.mudar_status_tarefa(t3, 'cancelada');
  if v.status <> 'cancelada' then raise exception 'FALHOU: gestor não cancelou'; end if;
  -- cancelada não volta
  begin
    perform public.mudar_status_tarefa(t3, 'a_fazer');
    raise exception 'FALHOU: tarefa cancelada voltou';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  -- nem o gestor apaga
  begin
    delete from public.tarefas where id = t3;
    raise exception 'FALHOU: gestor apagou tarefa';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- O gatilho de status vale até para o painel do Supabase (administrador)
do $$
begin
  begin
    update public.tarefas set status = 'a_fazer' where id = current_setting('teste.t3')::bigint;
    raise exception 'FALHOU: administrador tirou tarefa de cancelada';
  exception when raise_exception then
    if sqlerrm not like 'Mudança de status não permitida%' then raise; end if;
  end;
end $$;

rollback;

select 'OK: todos os testes de tarefas passaram' as resultado;
