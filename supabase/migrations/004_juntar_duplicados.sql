-- InvFlow · Migração 004: juntar duplicados de tipos e clientes (Cadastros)
-- Como aplicar: Supabase > SQL Editor > New query > colar este arquivo inteiro > Run.
-- Precisa da 001, 002 e 003 aplicadas antes. Pode rodar de novo sem estragar nada.
--
-- Como funciona:
--  - Só o gestor junta. "Juntar A em B" passa todas as tarefas de A para B
--    (abertas, concluídas e canceladas) e arquiva A. Nada é apagado.
--  - Cada tarefa mudada ganha um evento "editada" no histórico (pelo gatilho
--    da 003), com quem juntou e o tipo/cliente de antes.
--  - Quando o EMB-23 (etapa 13) usar clientes, esta função passa a mudar os
--    EMBs também.

create or replace function public.juntar_no_catalogo(p_catalogo text, p_de bigint, p_para bigint)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
  v_para_ativo boolean;
begin
  if not public.eh_gestor() then
    raise exception 'Só o gestor junta duplicados.' using errcode = '42501';
  end if;
  if p_catalogo not in ('tipos', 'clientes') then
    raise exception 'Catálogo desconhecido.';
  end if;
  if p_de is null or p_para is null or p_de = p_para then
    raise exception 'Escolha dois itens diferentes para juntar.';
  end if;

  if p_catalogo = 'tipos' then
    perform 1 from public.tipos_atividade where id = p_de for update;
    if not found then raise exception 'O item que vai ser juntado não existe mais.'; end if;
    select ativo into v_para_ativo from public.tipos_atividade where id = p_para for update;
    if v_para_ativo is null then raise exception 'O item que fica não existe mais.'; end if;
    if not v_para_ativo then raise exception 'O item que fica está arquivado. Reative antes de juntar.'; end if;

    update public.tarefas set tipo_id = p_para where tipo_id = p_de;
    get diagnostics v_n = row_count;
    update public.tipos_atividade set ativo = false where id = p_de;
  else
    perform 1 from public.clientes where id = p_de for update;
    if not found then raise exception 'O item que vai ser juntado não existe mais.'; end if;
    select ativo into v_para_ativo from public.clientes where id = p_para for update;
    if v_para_ativo is null then raise exception 'O item que fica não existe mais.'; end if;
    if not v_para_ativo then raise exception 'O item que fica está arquivado. Reative antes de juntar.'; end if;

    update public.tarefas set cliente_id = p_para where cliente_id = p_de;
    get diagnostics v_n = row_count;
    update public.clientes set ativo = false where id = p_de;
  end if;

  return v_n;
end;
$$;

comment on function public.juntar_no_catalogo(text, bigint, bigint) is
  'Gestor: passa as tarefas de um tipo/cliente duplicado (p_de) para o certo (p_para) e arquiva o duplicado. Devolve quantas tarefas mudaram.';

revoke all on function public.juntar_no_catalogo(text, bigint, bigint) from public, anon;
grant execute on function public.juntar_no_catalogo(text, bigint, bigint) to authenticated;
