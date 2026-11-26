-- InvFlow · Testes de "juntar duplicados" (etapa 5)
--
-- Como rodar no Supabase: SQL Editor > New query > colar este arquivo inteiro > Run.
-- Tudo roda dentro de uma transação desfeita no final (rollback): nada fica no banco.
-- Resultado esperado: uma linha "OK: todos os testes de juntar duplicados passaram".
-- Se algum teste falhar, aparece um erro começando com "FALHOU:".

begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-4000-8000-0000000000e1', 'jun.gestor@invflow.test', '{"nome":"Gestor Juntar"}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e2', 'jun.ana@invflow.test',    '{"nome":"Ana Juntar"}',    'authenticated', 'authenticated');

update public.pessoas set papel = 'gestor' where id = '00000000-0000-4000-8000-0000000000e1';
update public.pessoas set papel = 'colaborador' where id = '00000000-0000-4000-8000-0000000000e2';

insert into public.clientes (nome) values ('Juntar Certo'), ('Juntar Duplicado'), ('Juntar Arquivado') on conflict (nome_busca) do nothing;
update public.clientes set ativo = false where nome_busca = 'juntar arquivado';

do $$
begin
  perform set_config('teste.tipo', (select id::text from public.tipos_atividade where nome_busca = 'auditorias'), true);
  perform set_config('teste.certo', (select id::text from public.clientes where nome_busca = 'juntar certo'), true);
  perform set_config('teste.dup', (select id::text from public.clientes where nome_busca = 'juntar duplicado'), true);
  perform set_config('teste.arq', (select id::text from public.clientes where nome_busca = 'juntar arquivado'), true);
end $$;

-- Ana cria duas tarefas no cliente duplicado e conclui uma
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
do $$
declare
  ana constant uuid := '00000000-0000-4000-8000-0000000000e2';
  v public.tarefas;
begin
  v := public.criar_tarefa(current_setting('teste.tipo')::bigint, current_setting('teste.dup')::bigint, now() + interval '2 hours', array[ana]);
  perform set_config('teste.t1', v.id::text, true);
  v := public.criar_tarefa(current_setting('teste.tipo')::bigint, current_setting('teste.dup')::bigint, now() + interval '2 hours', array[ana], p_iniciar => true);
  v := public.mudar_status_tarefa(v.id, 'concluida');
  perform set_config('teste.t2', v.id::text, true);

  -- colaboradora não junta
  begin
    perform public.juntar_no_catalogo('clientes', current_setting('teste.dup')::bigint, current_setting('teste.certo')::bigint);
    raise exception 'FALHOU: colaboradora juntou duplicados';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Gestor junta
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
do $$
declare
  gestor constant uuid := '00000000-0000-4000-8000-0000000000e1';
  certo bigint := current_setting('teste.certo')::bigint;
  dup bigint := current_setting('teste.dup')::bigint;
  n int;
  t public.tarefas;
  e public.tarefa_eventos;
begin
  -- recusas
  begin
    perform public.juntar_no_catalogo('clientes', dup, dup);
    raise exception 'FALHOU: juntou um item nele mesmo';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.juntar_no_catalogo('clientes', dup, current_setting('teste.arq')::bigint);
    raise exception 'FALHOU: juntou num item arquivado';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;
  begin
    perform public.juntar_no_catalogo('pessoas', dup, certo);
    raise exception 'FALHOU: aceitou catálogo desconhecido';
  exception when raise_exception then if sqlerrm like 'FALHOU%' then raise; end if;
  end;

  n := public.juntar_no_catalogo('clientes', dup, certo);
  if n <> 2 then raise exception 'FALHOU: devia mudar 2 tarefas, mudou %', n; end if;

  -- as duas tarefas (aberta e concluída) agora são do cliente certo, sem mudar status
  select * into t from public.tarefas where id = current_setting('teste.t1')::bigint;
  if t.cliente_id <> certo or t.status <> 'a_fazer' then raise exception 'FALHOU: tarefa aberta não mudou de cliente'; end if;
  select * into t from public.tarefas where id = current_setting('teste.t2')::bigint;
  if t.cliente_id <> certo or t.status <> 'concluida' or t.concluida_em is null then raise exception 'FALHOU: tarefa concluída devia mudar só o cliente'; end if;

  -- duplicado arquivado, não apagado
  if (select ativo from public.clientes where id = dup) then raise exception 'FALHOU: duplicado devia ficar arquivado'; end if;

  -- histórico: evento "editada" com quem juntou e o cliente de antes
  select * into e from public.tarefa_eventos
    where tarefa_id = current_setting('teste.t1')::bigint and evento = 'editada' order by id desc limit 1;
  if e.pessoa_id is distinct from gestor then raise exception 'FALHOU: evento devia ser do gestor'; end if;
  if (e.detalhe -> 'cliente_id' ->> 'de')::bigint <> dup or (e.detalhe -> 'cliente_id' ->> 'para')::bigint <> certo then
    raise exception 'FALHOU: evento devia ter o cliente de antes e o de agora';
  end if;

  -- juntar de novo: nada para mudar
  n := public.juntar_no_catalogo('clientes', dup, certo);
  if n <> 0 then raise exception 'FALHOU: segunda vez devia mudar 0'; end if;
end $$;
reset role;

-- Visitante sem login não chama a função
set local role anon;
do $$
begin
  begin
    perform public.juntar_no_catalogo('clientes', 1, 2);
    raise exception 'FALHOU: visitante chamou juntar_no_catalogo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;

select 'OK: todos os testes de juntar duplicados passaram' as resultado;
