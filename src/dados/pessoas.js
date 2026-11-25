// Pessoas do time. As regras de quem pode mudar o quê estão no banco (RLS + gatilho).
import { supabase } from './cliente.js';

const CAMPOS = 'id, nome, email, papel, ativo, recebe_email, trocar_senha, criado_em';

export async function listarPessoas() {
  const { data, error } = await supabase.from('pessoas').select(CAMPOS).order('ativo', { ascending: false }).order('nome');
  if (error) throw error;
  return data;
}

/**
 * Atualiza campos de uma pessoa e devolve a linha nova.
 * Colaborador só consegue mudar o próprio nome e recebe_email; gestor muda papel e ativo de todos.
 */
export async function atualizarPessoa(id, campos) {
  const { data, error } = await supabase.from('pessoas').update(campos).eq('id', id).select(CAMPOS);
  if (error) throw error;
  if (!data || data.length === 0) {
    const semPermissao = new Error('permission denied');
    semPermissao.code = '42501';
    throw semPermissao;
  }
  return data[0];
}
