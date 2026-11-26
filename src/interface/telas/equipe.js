// Equipe: todas as tarefas do time, agrupadas por pessoa (padrão) ou numa
// lista por prazo, com filtros (pessoa, tipo, cliente, status, só atrasadas)
// e busca. Os filtros ficam no endereço (#/equipe?atrasadas=1), para o painel
// do gestor (etapa 10) abrir a lista certa e para dar para guardar o link.
import { el } from '../componentes/el.js';
import { cartaoTarefa } from '../componentes/cartao-tarefa.js';
import { vigiarTarefas } from '../componentes/vigia-tarefas.js';
import { listarTarefasEquipe } from '../../dados/tarefas.js';
import { listarPessoas } from '../../dados/pessoas.js';
import {
  lerFiltros, consultaDosFiltros, temFiltro, filtrarTarefas, ordenarEquipe, agruparPorPessoa,
  resumoEquipe, resumoDoGrupo, opcoesDasTarefas, OPCOES_STATUS, FILTROS_VAZIOS,
} from '../../logica/equipe.js';
import { inicioDoDia } from '../../logica/datas.js';
import { traduzirErro, iniciais } from '../../logica/conta.js';
import { ehGestor } from '../../logica/acesso.js';
import { abrirNovaTarefa } from './nova-tarefa.js';

/** contexto: { perfil }; consulta: filtros do endereço */
export function telaEquipe(alvo, contexto, consulta = {}) {
  const { perfil } = contexto;
  const gestor = ehGestor(perfil);
  let filtros = lerFiltros(consulta);
  let tarefas = null;
  let pessoas = [];
  let carregando = false;
  let livresAbertos = false;

  // --- Filtros
  const busca = el('input', {
    type: 'search', id: 'eq-busca', value: filtros.busca, placeholder: 'Cliente, tipo, local, motivo, pessoa...',
    autocomplete: 'off', 'aria-label': 'Buscar tarefas',
  });
  const selPessoa = el('select', { id: 'eq-pessoa' });
  const selTipo = el('select', { id: 'eq-tipo' });
  const selCliente = el('select', { id: 'eq-cliente' });
  const selStatus = el('select', { id: 'eq-status' },
    ...OPCOES_STATUS.map((o) => el('option', { value: o.valor }, o.rotulo)));
  const atrasadas = el('input', { type: 'checkbox', id: 'eq-atrasadas' });
  const limpar = el('button', { class: 'link', type: 'button' }, 'Limpar filtros');

  const abaPessoa = el('button', { class: 'segmento', type: 'button', role: 'tab' }, 'Por pessoa');
  const abaPrazo = el('button', { class: 'segmento', type: 'button', role: 'tab' }, 'Por prazo');
  const abas = el('div', { class: 'segmentos', role: 'tablist', 'aria-label': 'Como mostrar' }, abaPessoa, abaPrazo);

  const campoFiltro = (rotulo, controle) => el('div', { class: 'campo filtro' }, el('label', { for: controle.id }, rotulo), controle);
  const barra = el('section', { class: 'filtros-equipe', 'aria-label': 'Filtros' },
    el('div', { class: 'campo filtro filtro-busca' }, el('label', { for: busca.id }, 'Buscar'), busca),
    campoFiltro('Pessoa', selPessoa),
    campoFiltro('Tipo', selTipo),
    campoFiltro('Cliente', selCliente),
    campoFiltro('Status', selStatus),
    el('div', { class: 'filtro filtro-fim' },
      el('label', { class: 'opcao', for: atrasadas.id }, atrasadas, el('span', {}, 'Só atrasadas')),
      limpar,
    ),
  );

  const resumo = el('p', { class: 'texto-suave sem-margem' }, 'Carregando...');
  const corpo = el('div', { class: 'blocos-equipe', 'aria-live': 'polite' });
  const raiz = el('div', { class: 'tela-equipe' },
    el('div', { class: 'cabecalho-tela' },
      el('div', {}, el('h1', {}, 'Equipe'), resumo),
      abas,
    ),
    barra,
    corpo,
  );
  alvo.replaceChildren(raiz);

  // --- Eventos dos filtros
  let esperaBusca = null;
  busca.addEventListener('input', () => {
    clearTimeout(esperaBusca);
    esperaBusca = setTimeout(() => mudar({ busca: busca.value }), 200);
  });
  busca.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && busca.value) { ev.preventDefault(); busca.value = ''; mudar({ busca: '' }); } });
  selPessoa.addEventListener('change', () => mudar({ pessoa: selPessoa.value }));
  selTipo.addEventListener('change', () => mudar({ tipo: selTipo.value }));
  selCliente.addEventListener('change', () => mudar({ cliente: selCliente.value }));
  selStatus.addEventListener('change', () => mudar({ status: selStatus.value }));
  atrasadas.addEventListener('change', () => mudar({ atrasadas: atrasadas.checked }));
  limpar.addEventListener('click', () => { busca.value = ''; mudar({ ...FILTROS_VAZIOS, agrupar: filtros.agrupar }); busca.focus(); });
  abaPessoa.addEventListener('click', () => mudar({ agrupar: 'pessoa' }));
  abaPrazo.addEventListener('click', () => mudar({ agrupar: 'prazo' }));

  function mudar(novos) {
    filtros = { ...filtros, ...novos };
    // Guarda no endereço sem recarregar a tela (replaceState não dispara "hashchange").
    const q = consultaDosFiltros(filtros);
    history.replaceState(null, '', `${location.pathname}${location.search}#/equipe${q ? '?' + q : ''}`);
    desenhar();
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;
    try {
      const [lista, todas] = await Promise.all([listarTarefasEquipe(inicioDoDia(new Date())), listarPessoas()]);
      tarefas = lista;
      pessoas = todas.filter((p) => p.ativo);
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

  function preencherSelect(select, opcoes, valor, rotuloTodos) {
    // Um filtro vindo do endereço que não aparece nas tarefas continua escolhido.
    const lista = valor && !opcoes.some((o) => o.id === valor) ? [...opcoes, { id: valor, nome: '(sem tarefas agora)' }] : opcoes;
    select.replaceChildren(el('option', { value: '' }, rotuloTodos), ...lista.map((o) => el('option', { value: o.id }, o.nome)));
    select.value = valor;
  }

  function desenharFiltros() {
    const nomes = new Map(pessoas.map((p) => [p.id, p.nome]));
    for (const t of tarefas) for (const p of t.responsaveis ?? []) if (!nomes.has(p.id)) nomes.set(p.id, p.nome);
    const opPessoas = [...nomes].map(([id, nome]) => ({ id, nome: id === perfil.id ? `${nome} (você)` : nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    preencherSelect(selPessoa, opPessoas, filtros.pessoa, 'Todas');
    preencherSelect(selTipo, opcoesDasTarefas(tarefas, 'tipo_id', 'tipo_nome'), filtros.tipo, 'Todos');
    preencherSelect(selCliente, opcoesDasTarefas(tarefas, 'cliente_id', 'cliente_nome'), filtros.cliente, 'Todos');
    selStatus.value = filtros.status;
    atrasadas.checked = filtros.atrasadas;
    if (document.activeElement !== busca) busca.value = filtros.busca;
    limpar.hidden = !temFiltro(filtros);
    abaPessoa.setAttribute('aria-selected', String(filtros.agrupar === 'pessoa'));
    abaPrazo.setAttribute('aria-selected', String(filtros.agrupar === 'prazo'));
    for (const s of [selPessoa, selTipo, selCliente, selStatus]) s.classList.toggle('filtro-ligado', Boolean(s.value));
  }

  const aoEditar = (tarefa) => abrirNovaTarefa({ perfil, tarefa });
  const cartao = (t, agora) => cartaoTarefa(t, { perfil, agora, compacto: true, aoEditar });

  function grupoDaPessoa(g, agora) {
    const resumoGrupo = resumoDoGrupo(g.tarefas, agora);
    const abertas = g.tarefas.filter((t) => t.status !== 'concluida').length;
    return el('section', { class: 'bloco-tarefas grupo-pessoa', 'data-pessoa': g.pessoa.id },
      el('div', { class: 'cabecalho-grupo' },
        el('h2', {},
          el('span', { class: 'avatar avatar-mini', 'aria-hidden': 'true' }, iniciais(g.pessoa.nome)),
          g.pessoa.id === perfil.id ? `${g.pessoa.nome} (você)` : g.pessoa.nome,
          el('span', { class: 'contador', title: `${abertas} aberta(s)` }, String(g.tarefas.length)),
        ),
        resumoGrupo ? el('span', { class: 'texto-suave resumo-grupo' }, resumoGrupo) : null,
        gestor ? botaoTarefaPara(g.pessoa) : null,
      ),
      el('div', { class: 'lista-tarefas' }, ...g.tarefas.map((t) => cartao(t, agora))),
    );
  }

  function botaoTarefaPara(pessoa) {
    return el('button', {
      class: 'botao botao-pequeno botao-tarefa-para', type: 'button',
      title: `Criar uma tarefa já com ${pessoa.nome} de responsável`,
      onclick: () => abrirNovaTarefa({ perfil, responsaveis: [pessoa.id] }),
    }, `+ Tarefa para ${pessoa.id === perfil.id ? 'você' : primeiroNome(pessoa.nome)}`);
  }

  function blocoLivres(livres) {
    const det = el('details', { class: 'bloco-livres', open: livresAbertos },
      el('summary', {}, `Sem tarefa aberta agora: ${livres.map((p) => primeiroNome(p.nome)).join(', ')}`),
      gestor
        ? el('div', { class: 'linha-botoes livres-botoes' }, ...livres.map(botaoTarefaPara))
        : el('p', { class: 'texto-suave sem-margem' }, 'Essas pessoas não têm nada aberto no InvFlow.'),
    );
    det.addEventListener('toggle', () => { livresAbertos = det.open; });
    return det;
  }

  function desenhar() {
    if (!tarefas || !raiz.isConnected) return;
    const agora = new Date();
    desenharFiltros();
    const lista = filtrarTarefas(tarefas, filtros, agora);
    resumo.textContent = resumoEquipe(lista, agora);

    const blocos = [];
    if (!lista.length) {
      blocos.push(el('p', { class: 'vazio-bloco' },
        temFiltro(filtros) ? 'Nenhuma tarefa com esses filtros. ' : 'Nenhuma tarefa aberta no time. ',
        temFiltro(filtros) ? el('button', { class: 'link', type: 'button', onclick: () => limpar.click() }, 'Limpar filtros') : null));
    } else if (filtros.agrupar === 'prazo') {
      blocos.push(el('div', { class: 'lista-tarefas' }, ...ordenarEquipe(lista, agora).map((t) => cartao(t, agora))));
    } else {
      const { grupos, livres } = agruparPorPessoa(lista, pessoas, agora);
      const comFiltroPessoa = filtros.pessoa ? grupos.filter((g) => g.pessoa.id === filtros.pessoa) : grupos;
      blocos.push(...comFiltroPessoa.map((g) => grupoDaPessoa(g, agora)));
      // Quem está livre só faz sentido olhando o time todo, sem filtros.
      if (!temFiltro(filtros) && livres.length) blocos.push(blocoLivres(livres));
    }
    corpo.replaceChildren(...blocos);
  }

  vigiarTarefas(raiz, { carregar, desenhar });
  carregar();
}

function primeiroNome(nome) {
  return String(nome ?? '').trim().split(/\s+/)[0] || nome;
}
