// Cartão de uma tarefa: título, prazo, selos, responsáveis, botão principal
// (Iniciei / Concluí / Desbloquear) e menu "…" com as outras ações.
// executarAcao() faz a ação pedida (pergunta o motivo, confirma, chama o banco).
import { el } from './el.js';
import { mostrarAviso } from './aviso-toast.js';
import { perguntar } from './modal.js';
import { mudarStatus, avisarQueTarefasMudaram } from '../../dados/tarefas.js';
import { acoesDaTarefa, estaAtrasada, NOMES_STATUS, MOTIVO_MAXIMO } from '../../logica/status.js';
import { tituloDaTarefa } from '../../logica/tarefas.js';
import { formatarPrazo, formatarDesde, formatarHora, formatarDuracao } from '../../logica/datas.js';
import { iniciais, traduzirErro } from '../../logica/conta.js';

/**
 * opcoes: { perfil, agora, compacto, aoEditar(tarefa) }
 * Depois de cada mudança, avisa as telas (evento "invflow:tarefas").
 */
export function cartaoTarefa(tarefa, { perfil, agora = new Date(), compacto = false, aoEditar } = {}) {
  const atrasada = estaAtrasada(tarefa, agora);
  const { principal, outras } = acoesDaTarefa(tarefa, perfil);

  const selos = [];
  if (atrasada) selos.push(el('span', { class: 'selo selo-pequeno selo-atrasada' }, 'Atrasada'));
  if (tarefa.status === 'bloqueada') selos.push(el('span', { class: 'selo selo-pequeno selo-bloqueada' }, 'Bloqueada'));
  if (tarefa.origem === 'programada') selos.push(el('span', { class: 'selo selo-pequeno selo-programada' }, 'Programada'));
  if (tarefa.status === 'cancelada') selos.push(el('span', { class: 'selo selo-pequeno selo-arquivado' }, NOMES_STATUS.cancelada));

  const linhaInfo = [];
  if (tarefa.status === 'em_andamento' && tarefa.iniciada_em) {
    linhaInfo.push(el('span', { class: 'info-desde' }, formatarDesde(tarefa.iniciada_em, agora)));
  }
  if (tarefa.status === 'concluida' && tarefa.concluida_em) {
    linhaInfo.push(el('span', {}, `Concluída ${formatarHora(tarefa.concluida_em)}` +
      (tarefa.iniciada_em ? ` · levou ${formatarDuracao(tarefa.iniciada_em, tarefa.concluida_em)}` : '')));
  } else {
    linhaInfo.push(el('span', { class: atrasada ? 'info-prazo atrasada' : 'info-prazo' }, `Prazo ${formatarPrazo(tarefa.prazo, agora)}`));
  }

  const pessoas = (tarefa.responsaveis ?? []);
  const avatares = el('span', { class: 'avatares', title: pessoas.map((p) => p.nome).join(', ') },
    ...pessoas.slice(0, 4).map((p) => el('span', { class: 'avatar avatar-mini', 'aria-hidden': 'true' }, iniciais(p.nome))),
    pessoas.length > 4 ? el('span', { class: 'avatar avatar-mini', 'aria-hidden': 'true' }, `+${pessoas.length - 4}`) : null,
    el('span', { class: 'so-leitor' }, `Responsáveis: ${pessoas.map((p) => p.nome).join(', ')}`),
  );

  const botoes = [];
  if (principal) {
    const b = el('button', { class: `botao ${principal.acao === 'concluir' ? 'botao-sucesso' : 'botao-primario'} botao-acao`, type: 'button' }, principal.rotulo);
    b.addEventListener('click', () => executarAcao(tarefa, principal, { botao: b, aoEditar }));
    botoes.push(b);
  }
  if (outras.length) botoes.push(menuMais(tarefa, outras, aoEditar));

  const cartao = el('article', {
    class: `cartao-tarefa status-${tarefa.status}${atrasada ? ' atrasada' : ''}${compacto ? ' compacto' : ''}`,
    'data-id': String(tarefa.id),
  },
    el('div', { class: 'cartao-tarefa-texto' },
      el('h3', { class: 'cartao-tarefa-titulo' }, tituloDaTarefa(tarefa), ...selos),
      el('p', { class: 'cartao-tarefa-info' }, ...entremear(linhaInfo), avatares),
      tarefa.status === 'bloqueada' && tarefa.motivo_bloqueio
        ? el('p', { class: 'cartao-tarefa-motivo' }, `Motivo: ${tarefa.motivo_bloqueio}`) : null,
      !compacto && tarefa.descricao ? el('p', { class: 'cartao-tarefa-descricao' }, tarefa.descricao) : null,
    ),
    botoes.length ? el('div', { class: 'cartao-tarefa-acoes' }, ...botoes) : null,
  );
  return cartao;
}

function entremear(itens) {
  return itens.flatMap((x, i) => (i ? [el('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), x] : [x]));
}

function menuMais(tarefa, acoes, aoEditar) {
  const resumo = el('summary', { class: 'botao botao-icone', 'aria-label': 'Mais ações', title: 'Mais ações' }, '…');
  const menu = el('details', { class: 'menu-mais' }, resumo,
    el('div', { class: 'menu-mais-lista', role: 'menu' },
      ...acoes.map((acao) => el('button', {
        class: `menu-mais-item${acao.acao === 'cancelar' ? ' perigo' : ''}`, type: 'button', role: 'menuitem',
        onclick: () => { menu.open = false; executarAcao(tarefa, acao, { aoEditar }); },
      }, acao.rotulo)),
    ),
  );
  menu.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && menu.open) { ev.stopPropagation(); menu.open = false; resumo.focus(); }
  });
  return menu;
}

// Fecha os menus "…" ao clicar fora.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (ev) => {
    for (const aberto of document.querySelectorAll('details.menu-mais[open]')) {
      if (!aberto.contains(ev.target)) aberto.open = false;
    }
  });
}

const MENSAGENS = {
  iniciar: 'Tarefa iniciada.',
  concluir: 'Tarefa concluída.',
  bloquear: 'Tarefa bloqueada.',
  desbloquear: 'Tarefa desbloqueada.',
  reabrir: 'Tarefa reaberta.',
  cancelar: 'Tarefa cancelada.',
};

/** Faz a ação de um botão do cartão. Devolve a tarefa nova (ou null se a pessoa desistiu ou deu erro). */
export async function executarAcao(tarefa, acao, { botao, aoEditar } = {}) {
  if (acao.acao === 'editar') { aoEditar?.(tarefa); return null; }

  let motivo = null;
  if (acao.pedeMotivo) {
    motivo = await perguntar({
      titulo: 'Bloquear tarefa',
      mensagem: `${tituloDaTarefa(tarefa)}. O que está impedindo?`,
      confirmar: 'Bloquear',
      pedirTexto: { rotulo: 'Motivo', placeholder: 'Ex.: rua interditada, falta equipamento', maximo: MOTIVO_MAXIMO, obrigatorio: 'Para bloquear, diga o motivo.' },
    });
    if (!motivo) return null;
  }
  if (acao.confirmar) {
    const sim = await perguntar({
      titulo: 'Cancelar tarefa?',
      mensagem: `${tituloDaTarefa(tarefa)}. A tarefa some das listas, mas fica no histórico.`,
      confirmar: 'Cancelar tarefa', cancelar: 'Manter', perigo: true,
    });
    if (!sim) return null;
  }

  if (botao) { botao.disabled = true; botao.dataset.texto = botao.textContent; botao.textContent = 'Aguarde...'; }
  try {
    const nova = await mudarStatus(tarefa.id, acao.para, motivo);
    mostrarAviso(MENSAGENS[acao.acao] ?? 'Feito.');
    avisarQueTarefasMudaram(nova);
    return nova;
  } catch (e) {
    console.error(e);
    mostrarAviso(traduzirErro(e), { tipo: 'erro', duracao: 6000 });
    avisarQueTarefasMudaram(); // a tarefa pode ter mudado por outra pessoa: recarrega
    return null;
  } finally {
    if (botao?.isConnected) { botao.disabled = false; botao.textContent = botao.dataset.texto; }
  }
}
