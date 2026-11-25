// Status das tarefas: mudanças permitidas, atraso e botões de cada cartão.
// Puro, testado em tests/logica/status.test.js. A mesma tabela de mudanças está
// no banco (transicao_permitida em supabase/migrations/003_tarefas.sql); um
// teste confere que as duas são iguais.

export const STATUS = ['a_fazer', 'em_andamento', 'bloqueada', 'concluida', 'cancelada'];
export const STATUS_ABERTOS = ['a_fazer', 'em_andamento', 'bloqueada'];

export const NOMES_STATUS = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  bloqueada: 'Bloqueada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

/** De cada status, para onde pode ir. */
export const TRANSICOES = {
  a_fazer: ['em_andamento', 'bloqueada', 'cancelada'],
  em_andamento: ['concluida', 'bloqueada'],
  bloqueada: ['em_andamento', 'a_fazer'],
  concluida: ['em_andamento'],
  cancelada: [],
};

export function podeMudar(de, para) {
  return Boolean(TRANSICOES[de]?.includes(para));
}

export function estaAberta(tarefa) {
  return STATUS_ABERTOS.includes(tarefa?.status);
}

/** Atrasada = prazo vencido e ainda aberta (não é um status gravado). */
export function estaAtrasada(tarefa, agora = new Date()) {
  return estaAberta(tarefa) && new Date(tarefa.prazo).getTime() < new Date(agora).getTime();
}

/** Ao desbloquear, volta para "em andamento" se já tinha começado, senão para "a fazer". */
export function statusAoDesbloquear(tarefa) {
  return tarefa?.iniciada_em ? 'em_andamento' : 'a_fazer';
}

export const MOTIVO_MAXIMO = 300;

/** Limpa o motivo do bloqueio. Devolve null se vazio. */
export function limparMotivo(texto) {
  const m = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return m ? m.slice(0, MOTIVO_MAXIMO) : null;
}

/**
 * O que a pessoa pode fazer com a tarefa, como a tela mostra:
 *   { principal: acao | null, outras: [acao] }
 * acao = { acao, para, rotulo, pedeMotivo?, confirmar? }
 * Regras de quem pode (iguais às do banco):
 *   - status: responsável ou gestor;  - cancelar: quem criou ou gestor;
 *   - editar: quem criou, responsável ou gestor, com a tarefa aberta.
 */
export function acoesDaTarefa(tarefa, perfil) {
  const vazio = { principal: null, outras: [] };
  if (!tarefa || !perfil?.ativo) return vazio;
  const gestor = perfil.papel === 'gestor';
  const responsavel = (tarefa.responsaveis_ids ?? []).includes(perfil.id);
  const criou = tarefa.criado_por === perfil.id;
  const mudaStatus = gestor || responsavel;
  const pode = (para) => podeMudar(tarefa.status, para);

  let principal = null;
  const outras = [];

  if (mudaStatus) {
    if (tarefa.status === 'a_fazer') principal = { acao: 'iniciar', para: 'em_andamento', rotulo: 'Iniciei' };
    else if (tarefa.status === 'em_andamento') principal = { acao: 'concluir', para: 'concluida', rotulo: 'Concluí' };
    else if (tarefa.status === 'bloqueada') principal = { acao: 'desbloquear', para: statusAoDesbloquear(tarefa), rotulo: 'Desbloquear' };
    else if (tarefa.status === 'concluida') outras.push({ acao: 'reabrir', para: 'em_andamento', rotulo: 'Reabrir' });

    if (pode('bloqueada')) outras.push({ acao: 'bloquear', para: 'bloqueada', rotulo: 'Bloquear', pedeMotivo: true });
  }
  if (estaAberta(tarefa) && (gestor || responsavel || criou)) outras.push({ acao: 'editar', rotulo: 'Editar' });
  if (pode('cancelada') && (gestor || criou)) outras.push({ acao: 'cancelar', para: 'cancelada', rotulo: 'Cancelar tarefa', confirmar: true });

  return { principal, outras };
}
