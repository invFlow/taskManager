// Tipos de atividade e clientes. As regras (quem cria, quem renomeia) estão no banco.
// catalogo: 'tipos' ou 'clientes' (ver CATALOGOS em logica/catalogos.js).
import { supabase } from './cliente.js';

const TABELAS = { tipos: 'tipos_atividade', clientes: 'clientes' };
const FUNCOES_CRIAR = { tipos: 'criar_tipo_atividade', clientes: 'criar_cliente' };
const CAMPOS = 'id, nome, nome_busca, ativo, criado_por, criado_em';

function tabela(catalogo) {
  const t = TABELAS[catalogo];
  if (!t) throw new Error(`Catálogo desconhecido: ${catalogo}`);
  return t;
}

/** Todos os itens, inclusive arquivados (a busca esconde os arquivados). */
export async function listarCatalogo(catalogo) {
  const { data, error } = await supabase.from(tabela(catalogo)).select(CAMPOS).order('nome');
  if (error) throw error;
  return data;
}

/**
 * Cria pelo nome, sem duplicar: se já existe um com o mesmo nome de busca,
 * devolve o existente (que pode estar arquivado: ativo = false).
 */
export async function criarNoCatalogo(catalogo, nome) {
  tabela(catalogo);
  const { data, error } = await supabase.rpc(FUNCOES_CRIAR[catalogo], { p_nome: nome });
  if (error) throw error;
  return data;
}

/** Só o gestor consegue (o banco recusa para os demais). campos: { nome } e/ou { ativo }. */
export async function atualizarNoCatalogo(catalogo, id, campos) {
  const { data, error } = await supabase.from(tabela(catalogo)).update(campos).eq('id', id).select(CAMPOS);
  if (error) throw error;
  if (!data || data.length === 0) {
    const semPermissao = new Error('permission denied');
    semPermissao.code = '42501';
    throw semPermissao;
  }
  return data[0];
}

/**
 * Só o gestor: passa as tarefas do item "de" (duplicado) para o item "para"
 * e arquiva o duplicado. Devolve quantas tarefas mudaram.
 */
export async function juntarNoCatalogo(catalogo, de, para) {
  tabela(catalogo);
  const { data, error } = await supabase.rpc('juntar_no_catalogo', { p_catalogo: catalogo, p_de: de, p_para: para });
  if (error) throw error;
  return data;
}
