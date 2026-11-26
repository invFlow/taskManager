// Regras puras do detalhe da tarefa: textos da linha do tempo (tarefa_eventos)
// e duração (início -> fim, com o tempo bloqueado). Testado em
// tests/logica/linha-do-tempo.test.js.
import { formatarPrazo, formatarDuracao, formatarDesde } from './datas.js';
import { NOMES_STATUS } from './status.js';

const CAMPOS_EDITADOS = {
  tipo_id: 'Tipo',
  cliente_id: 'Cliente',
  local: 'Local',
  prazo: 'Prazo',
  descricao: 'Observações',
  email_assunto: 'Assunto do e-mail',
  lembrar_dias_antes: 'Lembrete',
};

/**
 * nomes: { pessoa(id) -> nome, tipo(id) -> nome, cliente(id) -> nome }
 * (cada função pode faltar; sem nome, mostra um texto neutro).
 */
function nomeador(nomes = {}) {
  return {
    pessoa: (id) => (id ? nomes.pessoa?.(id) ?? 'alguém' : null),
    tipo: (id) => nomes.tipo?.(id) ?? `tipo ${id}`,
    cliente: (id) => nomes.cliente?.(id) ?? `cliente ${id}`,
  };
}

function valorEditado(campo, valor, n, agora) {
  if (valor == null || valor === '') return 'vazio';
  switch (campo) {
    case 'tipo_id': return n.tipo(valor);
    case 'cliente_id': return n.cliente(valor);
    case 'prazo': return formatarPrazo(valor, agora);
    case 'lembrar_dias_antes': return `${valor} dias antes`;
    default: return `“${valor}”`;
  }
}

/** "Prazo: hoje 17h30 → amanhã 17h30", "Observações mudaram" ... */
export function mudancasDaEdicao(detalhe, nomes, agora = new Date()) {
  const n = nomeador(nomes);
  const linhas = [];
  for (const [campo, rotulo] of Object.entries(CAMPOS_EDITADOS)) {
    const m = detalhe?.[campo];
    if (!m) continue;
    if (campo === 'descricao') { linhas.push(m.para ? 'Observações mudaram' : 'Observações apagadas'); continue; }
    linhas.push(`${rotulo}: ${valorEditado(campo, m.de, n, agora)} → ${valorEditado(campo, m.para, n, agora)}`);
  }
  return linhas;
}

/**
 * Texto de um evento: { titulo, detalhes: [texto], tipo }.
 *   "Iniciada por Ana", "Bloqueada por Bia" + "Motivo: rua interditada",
 *   "Ana incluiu Bia como responsável", "Editada por Ana" + "Prazo: ... → ..."
 */
export function textoDoEvento(evento, nomes, agora = new Date()) {
  const r = textoCru(evento, nomes, agora);
  return { ...r, titulo: r.titulo.charAt(0).toUpperCase() + r.titulo.slice(1) }; // "você incluiu" -> "Você incluiu"
}

function textoCru(evento, nomes, agora) {
  const n = nomeador(nomes);
  const quem = n.pessoa(evento.pessoa_id);
  const por = (verbo) => (quem ? `${verbo} por ${quem}` : verbo);
  const d = evento.detalhe ?? {};
  switch (evento.evento) {
    case 'criada':
      return { tipo: 'criada', titulo: por(d.origem === 'programada' ? 'Programada criada' : 'Criada'), detalhes: [] };
    case 'iniciada': return { tipo: 'iniciada', titulo: por('Iniciada'), detalhes: [] };
    case 'concluida': return { tipo: 'concluida', titulo: por('Concluída'), detalhes: [] };
    case 'bloqueada':
      return { tipo: 'bloqueada', titulo: por('Bloqueada'), detalhes: d.motivo ? [`Motivo: ${d.motivo}`] : [] };
    case 'desbloqueada':
      return {
        tipo: 'desbloqueada', titulo: por('Desbloqueada'),
        detalhes: d.para ? [`Voltou para “${NOMES_STATUS[d.para] ?? d.para}”`] : [],
      };
    case 'reaberta': return { tipo: 'reaberta', titulo: por('Reaberta'), detalhes: [] };
    case 'cancelada': return { tipo: 'cancelada', titulo: por('Cancelada'), detalhes: [] };
    case 'editada':
      return { tipo: 'editada', titulo: por('Editada'), detalhes: mudancasDaEdicao(d, nomes, agora) };
    case 'responsavel_incluido': {
      const alvo = n.pessoa(d.pessoa_id) ?? 'alguém';
      return { tipo: 'responsavel', titulo: quem ? `${quem} incluiu ${alvo} como responsável` : `${alvo} incluído como responsável`, detalhes: [] };
    }
    case 'responsavel_removido': {
      const alvo = n.pessoa(d.pessoa_id) ?? 'alguém';
      return { tipo: 'responsavel', titulo: quem ? `${quem} tirou ${alvo} dos responsáveis` : `${alvo} saiu dos responsáveis`, detalhes: [] };
    }
    default:
      return { tipo: 'outro', titulo: por(String(evento.evento ?? 'Mudança')), detalhes: [] };
  }
}

/** Eventos em ordem do mais antigo para o mais novo (empate: id). */
export function ordenarEventos(eventos) {
  return [...(eventos ?? [])].sort((a, b) => new Date(a.em) - new Date(b.em) || a.id - b.id);
}

const MS = (d) => new Date(d).getTime();

/**
 * Tempo bloqueado (ms) entre "de" e "ate": soma dos trechos entre cada
 * "bloqueada" e o evento seguinte que tira do bloqueio.
 */
export function tempoBloqueado(eventos, de, ate) {
  const inicio = MS(de);
  const fim = MS(ate);
  let total = 0;
  let desde = null;
  for (const e of ordenarEventos(eventos)) {
    if (e.evento === 'bloqueada') desde ??= MS(e.em);
    else if (desde != null && ['desbloqueada', 'cancelada'].includes(e.evento)) {
      total += Math.max(0, Math.min(MS(e.em), fim) - Math.max(desde, inicio));
      desde = null;
    }
  }
  if (desde != null) total += Math.max(0, fim - Math.max(desde, inicio));
  return total;
}

/**
 * Duração para o detalhe. Devolve null se a tarefa não começou.
 *   { situacao: 'concluida' | 'andamento' | 'bloqueada', texto, detalhe }
 *   concluída: "Levou 1h 20min" · "09h12 → 10h32 (20 min bloqueada)"
 *   em andamento: "Em andamento há 45 min" · "desde 09h12"
 */
export function duracaoDaTarefa(tarefa, eventos = [], agora = new Date()) {
  if (!tarefa?.iniciada_em) return null;
  const inicio = tarefa.iniciada_em;
  const concluida = tarefa.status === 'concluida' && tarefa.concluida_em;
  const fim = concluida ? tarefa.concluida_em : agora;
  const bloqueado = tempoBloqueado(eventos, inicio, fim);
  const textoBloq = bloqueado >= 60_000 ? ` (${formatarDuracao(0, bloqueado)} bloqueada)` : '';

  if (concluida) {
    return {
      situacao: 'concluida',
      texto: `Levou ${formatarDuracao(inicio, fim)}`,
      detalhe: `${formatarPrazo(inicio, agora)} → ${formatarPrazo(fim, agora)}${textoBloq}`,
    };
  }
  if (tarefa.status === 'em_andamento' || tarefa.status === 'bloqueada') {
    return {
      situacao: tarefa.status === 'bloqueada' ? 'bloqueada' : 'andamento',
      texto: `${tarefa.status === 'bloqueada' ? 'Começou há' : 'Em andamento há'} ${formatarDuracao(inicio, agora)}`,
      detalhe: `${formatarDesde(inicio, agora)}${textoBloq}`,
    };
  }
  return null;
}

/** Quando aconteceu, para a linha do tempo: "hoje 09h12", "ontem 16h40", "qua 27/11 08h00". */
export function quandoFoi(em, agora = new Date()) {
  return formatarPrazo(em, agora);
}
