// Minhas tarefas (tela inicial): Agora, Hoje, Próximos dias, Mais adiante e
// Concluídas hoje (recolhido). Fica em dia com vigiarTarefas (recarrega quando
// algo muda e redesenha a cada minuto para o selo "Atrasada").
import { el } from '../componentes/el.js';
import { cartaoTarefa } from '../componentes/cartao-tarefa.js';
import { listarMinhasTarefas } from '../../dados/tarefas.js';
import { agruparMinhas, resumoMinhas } from '../../logica/tarefas.js';
import { inicioDoDia } from '../../logica/datas.js';
import { traduzirErro } from '../../logica/conta.js';
import { abrirNovaTarefa } from './nova-tarefa.js';
import { vigiarTarefas } from '../componentes/vigia-tarefas.js';

/** contexto: { perfil } */
export function telaMinhas(alvo, contexto) {
  const { perfil } = contexto;
  let tarefas = null;
  let carregando = false;
  let concluidasAbertas = false;
  let adianteAberto = false;

  const resumo = el('p', { class: 'texto-suave' }, 'Carregando...');
  const corpo = el('div', { class: 'blocos-minhas', 'aria-live': 'polite' });
  const raiz = el('div', { class: 'tela-minhas' },
    el('h1', {}, 'Minhas tarefas'),
    resumo,
    corpo,
  );
  alvo.replaceChildren(raiz);

  async function carregar() {
    if (carregando) return;
    carregando = true;
    try {
      tarefas = await listarMinhasTarefas(perfil.id, inicioDoDia(new Date()));
      desenhar();
    } catch (e) {
      console.error(e);
      if (!tarefas) {
        resumo.textContent = '';
        corpo.replaceChildren(el('div', { class: 'cartao' },
          el('p', { class: 'erro' }, traduzirErro(e)),
          el('div', { class: 'linha-botoes', style: 'margin-top:.75rem' }, el('button', { class: 'botao', type: 'button', onclick: carregar }, 'Tentar de novo')),
        ));
      }
    } finally {
      carregando = false;
    }
  }

  function aoEditar(tarefa) {
    abrirNovaTarefa({ perfil, tarefa });
  }

  function bloco({ titulo, ajuda, lista, vazio, compacto = false, classe = '' }) {
    const agora = new Date();
    return el('section', { class: `bloco-tarefas ${classe}`.trim() },
      el('h2', {}, titulo, lista.length ? el('span', { class: 'contador' }, String(lista.length)) : null),
      ajuda ? el('p', { class: 'texto-suave ajuda-bloco' }, ajuda) : null,
      lista.length
        ? el('div', { class: 'lista-tarefas' }, ...lista.map((t) => cartaoTarefa(t, { perfil, agora, compacto, aoEditar })))
        : el('p', { class: 'vazio-bloco' }, vazio),
    );
  }

  function recolhivel({ titulo, lista, aberto, aoAlternar, compacto = true }) {
    const det = el('details', { class: 'bloco-tarefas recolhido', open: aberto },
      el('summary', {}, el('h2', {}, titulo, el('span', { class: 'contador' }, String(lista.length)))),
      el('div', { class: 'lista-tarefas' }, ...lista.map((t) => cartaoTarefa(t, { perfil, agora: new Date(), compacto, aoEditar }))),
    );
    det.addEventListener('toggle', () => aoAlternar(det.open));
    return det;
  }

  function desenhar() {
    if (!tarefas || !raiz.isConnected) return;
    const agora = new Date();
    const g = agruparMinhas(tarefas, agora);
    resumo.textContent = resumoMinhas(g, agora);

    const blocos = [];
    if (g.agora.length) {
      blocos.push(bloco({ titulo: 'Agora', lista: g.agora, classe: 'bloco-agora' }));
    }
    blocos.push(bloco({
      titulo: 'Hoje', lista: g.hoje, classe: 'bloco-hoje',
      vazio: g.agora.length ? 'Nada mais para hoje.' : 'Nada para hoje. Use “+ Nova” para registrar uma demanda.',
    }));
    blocos.push(bloco({ titulo: 'Próximos dias', lista: g.proximos, compacto: true, vazio: 'Nada marcado para os próximos 7 dias.' }));
    if (g.adiante.length) {
      blocos.push(recolhivel({ titulo: 'Mais adiante', lista: g.adiante, aberto: adianteAberto, aoAlternar: (v) => { adianteAberto = v; } }));
    }
    if (g.concluidasHoje.length) {
      blocos.push(recolhivel({ titulo: 'Concluídas hoje', lista: g.concluidasHoje, aberto: concluidasAbertas, aoAlternar: (v) => { concluidasAbertas = v; } }));
    }
    corpo.replaceChildren(...blocos);
  }

  vigiarTarefas(raiz, { carregar, desenhar });
  carregar();
}
