-- InvFlow · Testes dos catálogos (etapa 3: tipos de atividade e clientes)
--
-- Como rodar no Supabase: SQL Editor > New query > colar este arquivo inteiro > Run.
-- Tudo roda dentro de uma transação desfeita no final (rollback): nada fica no banco.
-- Resultado esperado: uma linha "OK: todos os testes de catálogos passaram".
-- Se algum teste falhar, aparece um erro começando com "FALHOU:".

begin;

-- Pessoas de teste (e-mails .test nunca existem de verdade)
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'cat.gestor@invflow.test',  '{"nome":"Gestor Catálogo"}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c2', 'cat.colab@invflow.test',   '{"nome":"Colab Catálogo"}',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'cat.inativo@invflow.test', '{}',                          'authenticated', 'authenticated');

update public.pessoas set papel = 'gestor', ativo = true where id = '00000000-0000-4000-8000-0000000000c1';
update public.pessoas set papel = 'colaborador'           where id in ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c3');
update public.pessoas set ativo = false                   where id = '00000000-0000-4000-8000-0000000000c3';

-- Nome de busca e semente
do $$
declare n int;
begin
  if public.nome_de_busca('  Posições-Vazias ') <> 'posicoes vazias' then raise exception 'FALHOU: nome_de_busca de "Posições-Vazias"'; end if;
  if public.nome_de_busca('ÁÉÍÓÚ ÇÃÕ') <> 'aeiou cao' then raise exception 'FALHOU: nome_de_busca com maiúsculas acentuadas: "%"', public.nome_de_busca('ÁÉÍÓÚ ÇÃÕ'); end if;
  if public.nome_de_busca('EMB-23') <> 'emb 23' then raise exception 'FALHOU: nome_de_busca de "EMB-23"'; end if;
  if public.nome_de_busca('---') <> '' then raise exception 'FALHOU: nome_de_busca de "---" devia ser vazio'; end if;

  select count(*) into n from public.tipos_atividade
  where nome_busca in ('inventarios diarios', 'inventarios programados', 'auditorias', 'emb 23',
                       'inventarios geograficos', 'posicoes vazias', 'validacao das sobras');
  if n <> 7 then raise exception 'FALHOU: a semente devia ter os 7 tipos iniciais, achei %', n; end if;
end $$;

-- Um cliente "de verdade" para os testes de busca (como se o gestor tivesse criado)
insert into public.clientes (nome) values ('ABBOTT') on conflict (nome_busca) do nothing;

-- ===========================================================================
-- Visitante sem login (anon): não vê nem cria nada
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.clientes;
    raise exception 'FALHOU: visitante sem login leu clientes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.criar_cliente('Visitante');
    raise exception 'FALHOU: visitante sem login criou cliente';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ===========================================================================
-- Colaborador ativo: lê, cria na hora sem duplicar, não renomeia nem arquiva
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);

do $$
declare
  n int;
  v public.clientes;
  t public.tipos_atividade;
  id_abbott bigint;
  nome_abbott text;
begin
  select count(*) into n from public.tipos_atividade;
  if n < 7 then raise exception 'FALHOU: colaborador devia ler os tipos'; end if;

  -- "abbot" encontra "ABBOTT" (a tela filtra por nome_busca)
  select id, nome into id_abbott, nome_abbott from public.clientes where nome_busca like '%' || public.nome_de_busca('abbot') || '%' order by nome_busca = 'abbott' desc limit 1;
  if id_abbott is null then raise exception 'FALHOU: busca por "abbot" não achou ABBOTT'; end if;

  -- criar "Abbott" de novo devolve o ABBOTT que já existe
  v := public.criar_cliente('  Abbott ');
  if v.id <> id_abbott or v.nome <> nome_abbott then raise exception 'FALHOU: criar "Abbott" devia devolver o ABBOTT existente, veio % / %', v.id, v.nome; end if;
  select count(*) into n from public.clientes where nome_busca = 'abbott';
  if n <> 1 then raise exception 'FALHOU: ABBOTT ficou duplicado (% linhas)', n; end if;

  -- cria um cliente novo, com nome limpo e autor carimbado
  v := public.criar_cliente('  Cliente   Teste  Ção ');
  if v.id is null then raise exception 'FALHOU: colaborador não conseguiu criar cliente'; end if;
  if v.nome <> 'Cliente Teste Ção' then raise exception 'FALHOU: nome devia ser limpo, veio "%"', v.nome; end if;
  if v.nome_busca <> 'cliente teste cao' then raise exception 'FALHOU: nome_busca errado: "%"', v.nome_busca; end if;
  if v.criado_por <> '00000000-0000-4000-8000-0000000000c2' then raise exception 'FALHOU: criado_por devia ser o colaborador'; end if;
  if not v.ativo then raise exception 'FALHOU: cliente novo devia nascer ativo'; end if;

  -- sem acento e em maiúsculas também é o mesmo
  v := public.criar_cliente('CLIENTE TESTE CAO');
  select count(*) into n from public.clientes where nome_busca = 'cliente teste cao';
  if n <> 1 then raise exception 'FALHOU: "CLIENTE TESTE CAO" duplicou o cliente'; end if;

  -- tipo novo e tipo que já existe
  t := public.criar_tipo_atividade('auditorias');
  if t.nome <> 'Auditorias' then raise exception 'FALHOU: criar "auditorias" devia devolver "Auditorias"'; end if;
  t := public.criar_tipo_atividade('Contagem cíclica teste');
  if t.id is null then raise exception 'FALHOU: colaborador não conseguiu criar tipo'; end if;

  -- insert direto também passa pelo gatilho (e o unique segura duplicado)
  begin
    insert into public.clientes (nome) values ('abbott');
    raise exception 'FALHOU: insert direto de "abbott" duplicou';
  exception when unique_violation then null;
  end;

  -- nome sem letras nem números é recusado
  begin
    perform public.criar_cliente(' -- ');
    raise exception 'FALHOU: aceitou nome vazio';
  exception when check_violation then null;
  end;

  -- não escolhe o autor nem cria arquivado
  begin
    insert into public.clientes (nome, criado_por) values ('Fingido', '00000000-0000-4000-8000-0000000000c1');
    raise exception 'FALHOU: colaborador escolheu o criado_por';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.clientes (nome, ativo) values ('Já arquivado', false);
    raise exception 'FALHOU: colaborador criou cliente arquivado';
  exception when insufficient_privilege then null;
  end;

  -- não renomeia nem arquiva (a regra não encontra a linha)
  update public.clientes set nome = 'Renomeado' where id = id_abbott;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: colaborador renomeou cliente'; end if;
  update public.tipos_atividade set ativo = false where nome_busca = 'auditorias';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: colaborador arquivou tipo'; end if;

  -- não apaga
  begin
    delete from public.clientes where id = id_abbott;
    raise exception 'FALHOU: colaborador apagou cliente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ===========================================================================
-- Pessoa inativa: não lê nem cria
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.tipos_atividade;
  if n <> 0 then raise exception 'FALHOU: pessoa inativa leu % tipos', n; end if;
  begin
    perform public.criar_cliente('Cliente do inativo');
    raise exception 'FALHOU: pessoa inativa criou cliente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ===========================================================================
-- Gestor: renomeia, arquiva e reativa; não apaga; não cria duplicado ao renomear
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
do $$
declare
  n int;
  v public.clientes;
  id_teste bigint;
begin
  select id into id_teste from public.clientes where nome_busca = 'cliente teste cao';

  update public.clientes set nome = 'Cliente Teste Renomeado' where id = id_teste;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: gestor não conseguiu renomear'; end if;
  if (select nome_busca from public.clientes where id = id_teste) <> 'cliente teste renomeado' then
    raise exception 'FALHOU: renomear devia recalcular nome_busca';
  end if;
  if (select criado_por from public.clientes where id = id_teste) <> '00000000-0000-4000-8000-0000000000c2' then
    raise exception 'FALHOU: renomear mudou o criado_por';
  end if;

  -- renomear para um nome que já existe é recusado
  begin
    update public.clientes set nome = 'abbott' where id = id_teste;
    raise exception 'FALHOU: renomear para "abbott" duplicou';
  exception when unique_violation then null;
  end;

  -- arquivar e reativar
  update public.clientes set ativo = false where id = id_teste;
  if (select ativo from public.clientes where id = id_teste) then raise exception 'FALHOU: gestor não arquivou'; end if;

  -- criar de novo um nome arquivado devolve o arquivado (a tela avisa)
  v := public.criar_cliente('cliente teste renomeado');
  if v.id <> id_teste or v.ativo then raise exception 'FALHOU: criar nome arquivado devia devolver o item arquivado'; end if;

  update public.clientes set ativo = true where id = id_teste;
  if not (select ativo from public.clientes where id = id_teste) then raise exception 'FALHOU: gestor não reativou'; end if;

  -- nem o gestor apaga
  begin
    delete from public.clientes where id = id_teste;
    raise exception 'FALHOU: gestor apagou cliente';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;

select 'OK: todos os testes de catálogos passaram' as resultado;
