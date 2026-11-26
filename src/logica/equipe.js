// Regras puras da tela Equipe: filtros (lidos e gravados no endereço),
// busca, agrupamento por pessoa e resumo. Testado em tests/logica/equipe.test.js.
import { estaAtrasada, STATUS_ABERTOS } from './status.js';
import { nomeDeBusca } from './catalogos.js';
import { tituloDaTarefa } from './tarefas.js';

/** Opções do filtro de status. '' = todas as abertas. "concluida" = concluídas hoje. */
export const OPCOES_STATUS = [
  { valor: '', rotulo: 'Abertas' },
  { valor: 'a_fazer', rotulo: 'A fazer' },
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'bloqueada', rotulo: 'Bloqueadas' },
  { valor: 'concluida', rotulo: 'Concluídas hoje' },
];

export const FILTROS_VAZIOS = Object.freeze({
  pessoa: '', tipo: '', cliente: '', status: '', atrasadas: false, busca: '', agrupar: 'pessoa',
});

const STATUS_VALIDOS = OPCOES_STATUS.map((o) => o.valor);

/** Filtros a partir da consulta do endereço (#/equipe?atrasadas=1&pessoa=...). */
export function lerFiltros(consulta = {}) {
  const c = consulta ?? {};
  const texto = (v) => String(v ?? '').trim();
  return {
    pessoa: texto(c.pessoa),
    tipo: /^\d+$/.test(texto(c.tipo)) ? texto(c.tipo) : '',
    cliente: /^\d+$/.test(texto(c.cliente)) ? texto(c.cliente) : '',
    status: STATUS_VALIDOS.includes(texto(c.status)) ? texto(c.status) : '',
    atrasadas: ['1', 'sim', 'true'].includes(texto(c.atrasadas)),
    busca: texto(c.busca).slice(0, 100),
    agrupar: texto(c.agrupar) === 'prazo' ? 'prazo' : 'pessoa',
  };
}

/** O contrário de lerFiltros: "atrasadas=1&pessoa=..." (só o que não é padrão). */
export function consultaDosFiltros(filtros) {
  const f = { ...FILTROS_VAZIOS, ...filtros };
  const p = new URLSearchParams();
  for (const campo of ['pessoa', 'tipo', 'cliente', 'status']) if (f[campo]) p.set(campo, f[campo]);
  if (f.atrasadas) p.set('atrasadas', '1');
  if (f.busca.trim()) p.set('busca', f.busca.trim());
  if (f.agrupar === 'prazo') p.set('agrupar', 'prazo');
  return p.toString();
}

/** Algum filtro que esconde tarefas está ligado? (o agrupamento não conta) */
export function temFiltro(filtros) {
  const f = { ...FILTROS_VAZIOS, ...filtros };
  return Boolean(f.pessoa || f.tipo || f.cliente || f.status || f.atrasadas || f.busca.trim());
}

/** Texto onde a busca procura: título, observações, motivo, assunto e responsáveis. */
export function textoDeBusca(t) {
  return nomeDeBusca([
    tituloDaTarefa(t), t.descricao, t.motivo_bloqueio, t.email_assunto,
    ...(t.responsaveis ?? []).map((p) => p.nome),
  ].filter(Boolean).join(' '));
}

/** Aplica os filtros. Cada palavra buscada precisa aparecer ("abbott f05"). */
export function filtrarTarefas(tarefas, filtros, agora = new Date()) {
  const f = { ...FILTROS_VAZIOS, ...filtros };
  const palavras = nomeDeBusca(f.busca).split(' ').filter(Boolean);
  return (tarefas ?? []).filter((t) => {
    if (f.status) { if (t.status !== f.status) return false; }
    else if (!STATUS_ABERTOS.includes(t.status)) return false;
    if (f.pessoa && !(t.responsaveis_ids ?? []).includes(f.pessoa)) return false;
    if (f.tipo && String(t.tipo_id) !== f.tipo) return false;
    if (f.cliente && String(t.cliente_id) !== f.cliente) return false;
    if (f.atrasadas && !estaAtrasada(t, agora)) return false;
    if (palavras.length) {
      const alvo = textoDeBusca(t);
      if (!palavras.every((p) => alvo.includes(p))) return false;
    }
    return true;
  });
}

/** Ordem dentro de um grupo: em andamento, atrasadas, a fazer/bloqueadas por prazo, concluídas. */
export function ordenarEquipe(tarefas, agora = new Date()) {
  const peso = (t) => {
    if (t.status === 'em_andamento') return 0;
    if (estaAtrasada(t, agora)) return 1;
    if (t.status === 'concluida') return 3;
    return 2;
  };
  return [...(tarefas ?? [])].sort((a, b) => peso(a) - peso(b)
    || (a.status === 'concluida' ? new Date(b.concluida_em) - new Date(a.concluida_em) : 0)
    || new Date(a.prazo) - new Date(b.prazo)
    || a.id - b.id);
}

/** Contagem de um conjunto: { total, andamento, atrasadas, bloqueadas, concluidas } */
export function contar(tarefas, agora = new Date()) {
  const c = { total: 0, andamento: 0, atrasadas: 0, bloqueadas: 0, concluidas: 0 };
  for (const t of tarefas ?? []) {
    c.total++;
    if (t.status === 'em_andamento') c.andamento++;
    if (t.status === 'bloqueada') c.bloqueadas++;
    if (t.status === 'concluida') c.concluidas++;
    if (estaAtrasada(t, agora)) c.atrasadas++;
  }
  return c;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** "1 em andamento · 2 atrasadas · 1 bloqueada" (só o que tem). */
export function resumoDoGrupo(tarefas, agora = new Date()) {
  const c = contar(tarefas, agora);
  const partes = [];
  if (c.andamento) partes.push(`${c.andamento} em andamento`);
  if (c.atrasadas) partes.push(plural(c.atrasadas, 'atrasada', 'atrasadas'));
  if (c.bloqueadas) partes.push(plural(c.bloqueadas, 'bloqueada', 'bloqueadas'));
  if (c.concluidas) partes.push(plural(c.concluidas, 'concluída', 'concluídas'));
  return partes.join(' · ');
}

/** Subtítulo da tela: "14 tarefas · 3 em andamento · 2 atrasadas". */
export function resumoEquipe(tarefas, agora = new Date()) {
  const n = (tarefas ?? []).length;
  if (!n) return 'Nenhuma tarefa com esses filtros.';
  const resto = resumoDoGrupo(tarefas, agora);
  return [plural(n, 'tarefa', 'tarefas'), resto].filter(Boolean).join(' · ');
}

const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

/**
 * Agrupa por responsável. Tarefa com vários responsáveis aparece com cada um.
 * pessoas: [{ id, nome, ativo }] (para saber quem está sem tarefa).
 * Devolve { grupos: [{ pessoa, tarefas }], livres: [pessoa] }:
 *   - grupos em ordem alfabética, tarefas em ordenarEquipe;
 *   - livres: pessoas ativas sem nenhuma tarefa aberta na lista (só faz sentido sem filtros).
 */
export function agruparPorPessoa(tarefas, pessoas = [], agora = new Date()) {
  const mapa = new Map();
  for (const t of tarefas ?? []) {
    for (const p of t.responsaveis ?? []) {
      if (!mapa.has(p.id)) mapa.set(p.id, { pessoa: { id: p.id, nome: p.nome }, tarefas: [] });
      mapa.get(p.id).tarefas.push(t);
    }
  }
  const grupos = [...mapa.values()].sort((a, b) => porNome(a.pessoa, b.pessoa));
  for (const g of grupos) g.tarefas = ordenarEquipe(g.tarefas, agora);
  const comAberta = new Set(grupos.filter((g) => g.tarefas.some((t) => STATUS_ABERTOS.includes(t.status))).map((g) => g.pessoa.id));
  const livres = (pessoas ?? []).filter((p) => p.ativo !== false && !comAberta.has(p.id)).sort(porNome);
  return { grupos, livres };
}

/** Opções de um filtro (tipo ou cliente) tiradas das tarefas carregadas: [{ id, nome }] em ordem. */
export function opcoesDasTarefas(tarefas, campoId, campoNome) {
  const mapa = new Map();
  for (const t of tarefas ?? []) if (t[campoId] != null) mapa.set(String(t[campoId]), t[campoNome]);
  return [...mapa].map(([id, nome]) => ({ id, nome })).sort(porNome);
}
