-- InvFlow · Testes das regras de acesso (etapa 2: pessoas e configurações)
--
-- Como rodar no Supabase: SQL Editor > New query > colar este arquivo inteiro > Run.
-- Tudo roda dentro de uma transação que é desfeita no final (rollback):
-- as pessoas de teste NÃO ficam no banco.
-- Resultado esperado: uma linha "OK: todos os testes de acesso passaram".
-- Se algum teste falhar, aparece um erro começando com "FALHOU:".

begin;

-- Pessoas de teste (e-mails .test nunca existem de verdade)
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'teste.gestor@invflow.test',  '{"nome":"Gestor Teste"}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'teste.colab@invflow.test',   '{}',                      'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a3', 'teste.inativo@invflow.test', '{}',                      'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a4', 'ana.souza@invflow.test',     '{}',                      'authenticated', 'authenticated');

-- O gatilho criou as pessoas?
do $$
declare n int;
begin
  select count(*) into n from public.pessoas where email like '%@invflow.test';
  if n <> 4 then raise exception 'FALHOU: o gatilho devia criar 4 pessoas, criou %', n; end if;
  if (select nome from public.pessoas where email = 'ana.souza@invflow.test') <> 'Ana Souza' then
    raise exception 'FALHOU: nome tirado do e-mail devia ser "Ana Souza"';
  end if;
  if (select nome from public.pessoas where email = 'teste.gestor@invflow.test') <> 'Gestor Teste' then
    raise exception 'FALHOU: nome devia vir de raw_user_meta_data.nome';
  end if;
  if not (select bool_and(trocar_senha) from public.pessoas where email like '%@invflow.test') then
    raise exception 'FALHOU: pessoa nova devia nascer com trocar_senha = true';
  end if;
end $$;

-- Arruma os papéis como administrador (painel do Supabase pode tudo).
-- Os gestores reais viram colaboradores só dentro desta transação, para
-- testar a regra do "último gestor". O rollback do fim desfaz.
update public.pessoas set papel = 'colaborador' where email not like '%@invflow.test';
update public.pessoas set papel = 'gestor'      where id = '00000000-0000-4000-8000-0000000000a1';
update public.pessoas set papel = 'colaborador' where id <> '00000000-0000-4000-8000-0000000000a1' and email like '%@invflow.test';
update public.pessoas set ativo = false         where id = '00000000-0000-4000-8000-0000000000a3';

-- ===========================================================================
-- Visitante sem login (anon): não vê nada
-- ===========================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.pessoas;
    raise exception 'FALHOU: visitante sem login conseguiu ler pessoas';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.configuracoes;
    raise exception 'FALHOU: visitante sem login conseguiu ler configurações';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Usuário logado sem linha em pessoas (não deve acontecer, mas o app trata)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
do $$
begin
  if public.minha_situacao() <> 'sem_cadastro' then raise exception 'FALHOU: minha_situacao() devia dizer sem_cadastro'; end if;
  if public.eu_ativo() or public.eh_gestor() then raise exception 'FALHOU: usuário sem cadastro passou como ativo'; end if;
end $$;
reset role;

-- ===========================================================================
-- Colaborador ativo
-- ===========================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

do $$
declare n int;
begin
  if public.eh_gestor() then raise exception 'FALHOU: colaborador aparece como gestor'; end if;
  if not public.eu_ativo() then raise exception 'FALHOU: colaborador ativo aparece como inativo'; end if;
  if public.minha_situacao() <> 'ativo' then raise exception 'FALHOU: minha_situacao() devia dizer ativo'; end if;

  select count(*) into n from public.pessoas where email like '%@invflow.test';
  if n <> 4 then raise exception 'FALHOU: colaborador devia ver as 4 pessoas, viu %', n; end if;

  select count(*) into n from public.configuracoes;
  if n <> 1 then raise exception 'FALHOU: colaborador devia ler as configurações'; end if;

  -- muda o próprio nome e o "recebe e-mail"
  update public.pessoas set nome = 'Colab Novo Nome', recebe_email = false, trocar_senha = false
  where id = '00000000-0000-4000-8000-0000000000a2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: colaborador não conseguiu editar o próprio perfil'; end if;

  -- não muda o próprio papel
  begin
    update public.pessoas set papel = 'gestor' where id = '00000000-0000-4000-8000-0000000000a2';
    raise exception 'FALHOU: colaborador conseguiu virar gestor';
  exception when insufficient_privilege then null;
  end;

  -- não se reativa / desativa
  begin
    update public.pessoas set ativo = false where id = '00000000-0000-4000-8000-0000000000a2';
    raise exception 'FALHOU: colaborador conseguiu mudar o próprio "ativo"';
  exception when insufficient_privilege then null;
  end;

  -- não muda o próprio e-mail
  begin
    update public.pessoas set email = 'outro@invflow.test' where id = '00000000-0000-4000-8000-0000000000a2';
    raise exception 'FALHOU: colaborador conseguiu mudar o próprio e-mail';
  exception when insufficient_privilege then null;
  end;

  -- não mexe em outra pessoa (a regra simplesmente não encontra a linha)
  update public.pessoas set nome = 'Hackeado' where id = '00000000-0000-4000-8000-0000000000a4';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: colaborador editou outra pessoa'; end if;

  -- não mexe nas configurações
  update public.configuracoes set prazo_emb_horas = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: colaborador editou as configurações'; end if;

  -- não cria nem apaga pessoas
  begin
    insert into public.pessoas (id, nome, email) values (gen_random_uuid(), 'X', 'x@invflow.test');
    raise exception 'FALHOU: colaborador conseguiu criar pessoa';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.pessoas where id = '00000000-0000-4000-8000-0000000000a4';
    raise exception 'FALHOU: colaborador conseguiu apagar pessoa';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ===========================================================================
-- Pessoa inativa: não lê nada e não edita nada
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

do $$
declare n int;
begin
  if public.eu_ativo() then raise exception 'FALHOU: pessoa inativa aparece como ativa'; end if;
  if public.minha_situacao() <> 'inativo' then raise exception 'FALHOU: minha_situacao() devia dizer inativo'; end if;
  select count(*) into n from public.pessoas;
  if n <> 0 then raise exception 'FALHOU: pessoa inativa leu % pessoas', n; end if;
  select count(*) into n from public.configuracoes;
  if n <> 0 then raise exception 'FALHOU: pessoa inativa leu as configurações'; end if;
  update public.pessoas set nome = 'Voltei' where id = '00000000-0000-4000-8000-0000000000a3';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: pessoa inativa editou o próprio perfil'; end if;
end $$;

-- ===========================================================================
-- Gestor
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
declare n int;
begin
  if not public.eh_gestor() then raise exception 'FALHOU: gestor não aparece como gestor'; end if;

  -- é o único gestor ativo: não pode deixar de ser gestor nem se desativar
  begin
    update public.pessoas set papel = 'colaborador' where id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'FALHOU: o último gestor conseguiu deixar de ser gestor';
  exception when check_violation then null;
  end;
  begin
    update public.pessoas set ativo = false where id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'FALHOU: o último gestor conseguiu se desativar';
  exception when check_violation then null;
  end;

  -- muda papel e situação de outras pessoas
  update public.pessoas set papel = 'gestor' where id = '00000000-0000-4000-8000-0000000000a4';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: gestor não conseguiu promover outra pessoa'; end if;

  update public.pessoas set ativo = true where id = '00000000-0000-4000-8000-0000000000a3';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: gestor não conseguiu reativar pessoa'; end if;

  -- com outro gestor ativo, agora pode deixar de ser gestor
  update public.pessoas set papel = 'colaborador' where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: gestor não conseguiu sair do papel havendo outro gestor'; end if;
end $$;

-- o ex-gestor já não é gestor: não edita configurações nem outras pessoas
do $$
declare n int;
begin
  if public.eh_gestor() then raise exception 'FALHOU: ex-gestor continua como gestor'; end if;
  update public.configuracoes set prazo_emb_horas = 48;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: ex-gestor editou as configurações'; end if;
end $$;

-- o novo gestor (Ana) edita as configurações
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);

do $$
declare n int;
begin
  update public.configuracoes set prazo_emb_horas = 48;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALHOU: gestor não conseguiu editar as configurações'; end if;
end $$;

reset role;
rollback;

select 'OK: todos os testes de acesso passaram' as resultado;
