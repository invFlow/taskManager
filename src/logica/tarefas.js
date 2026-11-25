// Regras puras da tela de tarefas: título, validação da nova tarefa e os blocos
// de "Minhas tarefas". Testado em tests/logica/tarefas.test.js.
import { estaAtrasada } from './status.js';
import { diasEntre, inicioDoDia, juntarDataHora } from './datas.js';

export const LIMITES = { local: 120, descricao: 1000, email_assunto: 200 };

/** "Auditorias · ABBOTT · Rua F05" */
export function tituloDaTarefa(t) {
  return [t.tipo_nome, t.cliente_nome, t.local].filter(Boolean).join(' · ');
}

const limpar = (texto) => {
  const s = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return s || null;
};

/**
 * Confere o formulário de nova tarefa (ou edição) antes de mandar ao banco.
 * dados: { origem, tipo, cliente, prazo (Date) | data + hora (texto), responsaveis: [id],
 *          local, descricao, email_assunto }
 * Devolve { ok: true, valores } ou { ok: false, erros: { campo: mensagem } }.
 */
export function validarNovaTarefa(dados, { perfil, agora = new Date() } = {}) {
  const erros = {};
  const origem = dados.origem === 'programada' ? 'programada' : 'demanda';

  if (!dados.tipo?.id) erros.tipo = 'Escolha o tipo de atividade.';
  else if (dados.tipo.ativo === false) erros.tipo = 'Este tipo está arquivado. Escolha outro.';
  if (!dados.cliente?.id) erros.cliente = 'Escolha o cliente.';
  else if (dados.cliente.ativo === false) erros.cliente = 'Este cliente está arquivado. Escolha outro.';

  let prazo = dados.prazo ? new Date(dados.prazo) : null;
  if (!prazo && (dados.data || dados.hora)) prazo = juntarDataHora(dados.data, dados.hora);
  if (!prazo || Number.isNaN(prazo.getTime())) erros.prazo = 'Informe dia e hora do prazo.';
  else if (origem === 'programada' && diasEntre(agora, prazo) < 0) erros.prazo = 'A data de uma programada não pode ser no passado.';

  const responsaveis = [...new Set((dados.responsaveis ?? []).filter(Boolean))];
  if (responsaveis.length === 0) erros.responsaveis = 'Escolha pelo menos um responsável.';
  else if (perfil && perfil.papel !== 'gestor' && !responsaveis.includes(perfil.id))
    erros.responsaveis = 'Você precisa estar entre os responsáveis. Só o gestor direciona para outras pessoas.';

  const valores = {
    origem,
    tipo_id: dados.tipo?.id ?? null,
    cliente_id: dados.cliente?.id ?? null,
    prazo,
    responsaveis,
    local: limpar(dados.local),
    descricao: String(dados.descricao ?? '').trim() || null,
    email_assunto: limpar(dados.email_assunto),
  };
  for (const [campo, max] of Object.entries(LIMITES)) {
    if (valores[campo] && valores[campo].length > max) erros[campo] = `Use no máximo ${max} caracteres.`;
  }

  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, valores };
}

const porPrazo = (a, b) => new Date(a.prazo) - new Date(b.prazo) || a.id - b.id;

/**
 * Separa as tarefas de uma pessoa nos blocos da tela "Minhas tarefas":
 *   agora        em andamento (mais antiga primeiro)
 *   hoje         a fazer ou bloqueadas com prazo até hoje (atrasadas primeiro)
 *   proximos     a fazer ou bloqueadas dos próximos 7 dias
 *   adiante      depois disso
 *   concluidasHoje  concluídas hoje (bloco recolhido no fim)
 */
export function agruparMinhas(tarefas, agora = new Date()) {
  const grupos = { agora: [], hoje: [], proximos: [], adiante: [], concluidasHoje: [] };
  const inicioHoje = inicioDoDia(agora).getTime();
  for (const t of tarefas ?? []) {
    if (t.status === 'em_andamento') grupos.agora.push(t);
    else if (t.status === 'a_fazer' || t.status === 'bloqueada') {
      const dias = diasEntre(agora, t.prazo);
      if (dias <= 0) grupos.hoje.push(t);
      else if (dias <= 7) grupos.proximos.push(t);
      else grupos.adiante.push(t);
    } else if (t.status === 'concluida' && t.concluida_em && new Date(t.concluida_em).getTime() >= inicioHoje) {
      grupos.concluidasHoje.push(t);
    }
  }
  grupos.agora.sort((a, b) => new Date(a.iniciada_em ?? a.prazo) - new Date(b.iniciada_em ?? b.prazo));
  grupos.hoje.sort((a, b) => (estaAtrasada(b, agora) - estaAtrasada(a, agora)) || porPrazo(a, b));
  grupos.proximos.sort(porPrazo);
  grupos.adiante.sort(porPrazo);
  grupos.concluidasHoje.sort((a, b) => new Date(b.concluida_em) - new Date(a.concluida_em));
  return grupos;
}

/** Contagem para o subtítulo: "2 em andamento · 3 para hoje (1 atrasada)". */
export function resumoMinhas(grupos, agora = new Date()) {
  const partes = [];
  if (grupos.agora.length) partes.push(`${grupos.agora.length} em andamento`);
  if (grupos.hoje.length) {
    const atrasadas = grupos.hoje.filter((t) => estaAtrasada(t, agora)).length;
    partes.push(`${grupos.hoje.length} para hoje` + (atrasadas ? ` (${atrasadas} atrasada${atrasadas === 1 ? '' : 's'})` : ''));
  }
  if (grupos.proximos.length) partes.push(`${grupos.proximos.length} nos próximos dias`);
  return partes.length ? partes.join(' · ') : 'Nada pendente com você.';
}
