// Tarefas: ler, criar, mudar status e editar. As regras de quem pode o quê
// estão no banco (funções criar_tarefa, mudar_status_tarefa, editar_tarefa).
import { supabase } from './cliente.js';

const CAMPOS = [
  'id', 'origem', 'tipo_id', 'cliente_id', 'local', 'descricao', 'email_assunto', 'prazo', 'status',
  'motivo_bloqueio', 'iniciada_em', 'iniciada_por', 'concluida_em', 'concluida_por', 'lembrar_dias_antes',
  'criado_por', 'criado_em', 'atualizado_em', 'tipo_nome', 'cliente_nome', 'responsaveis_ids', 'responsaveis',
].join(', ');

/**
 * Tarefas em que a pessoa é responsável: as abertas e as concluídas a partir
 * de "desde" (início do dia de hoje, para o bloco "Concluídas hoje").
 */
export async function listarMinhasTarefas(idPessoa, desde) {
  const { data, error } = await supabase
    .from('tarefas_lista')
    .select(CAMPOS)
    .contains('responsaveis_ids', [idPessoa])
    .or(`status.in.(a_fazer,em_andamento,bloqueada),and(status.eq.concluida,concluida_em.gte."${new Date(desde).toISOString()}")`)
    .order('prazo')
    .limit(500);
  if (error) throw error;
  return data;
}

/** Uma tarefa com os nomes (tipo, cliente, responsáveis). */
export async function obterTarefa(id) {
  const { data, error } = await supabase.from('tarefas_lista').select(CAMPOS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** valores: saída de validarNovaTarefa (logica/tarefas.js). iniciar = "Criar e iniciar agora". */
export async function criarTarefa(valores, { iniciar = false } = {}) {
  const { data, error } = await supabase.rpc('criar_tarefa', {
    p_tipo_id: valores.tipo_id,
    p_cliente_id: valores.cliente_id,
    p_prazo: new Date(valores.prazo).toISOString(),
    p_responsaveis: valores.responsaveis,
    p_origem: valores.origem,
    p_local: valores.local,
    p_descricao: valores.descricao,
    p_email_assunto: valores.email_assunto,
    p_iniciar: iniciar,
  });
  if (error) throw error;
  return data;
}

export async function editarTarefa(id, valores) {
  const { data, error } = await supabase.rpc('editar_tarefa', {
    p_id: id,
    p_tipo_id: valores.tipo_id,
    p_cliente_id: valores.cliente_id,
    p_prazo: new Date(valores.prazo).toISOString(),
    p_responsaveis: valores.responsaveis,
    p_local: valores.local,
    p_descricao: valores.descricao,
    p_email_assunto: valores.email_assunto,
  });
  if (error) throw error;
  return data;
}

/** status: 'em_andamento' | 'concluida' | 'bloqueada' | 'a_fazer' | 'cancelada'. motivo só para bloquear. */
export async function mudarStatus(id, status, motivo = null) {
  const { data, error } = await supabase.rpc('mudar_status_tarefa', { p_id: id, p_status: status, p_motivo: motivo });
  if (error) throw error;
  return data;
}

/** Avisa as telas abertas que alguma tarefa mudou (até o tempo real da etapa 6). */
export function avisarQueTarefasMudaram(tarefa = null) {
  globalThis.dispatchEvent?.(new CustomEvent('invflow:tarefas', { detail: { tarefa } }));
}
