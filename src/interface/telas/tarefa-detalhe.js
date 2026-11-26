// Detalhe da tarefa (#/tarefa/123): dados, responsáveis, duração (início ->
// fim, com o tempo bloqueado), linha do tempo (tarefa_eventos) e os botões de
// status. "Gerar e-mail" chega na etapa 12.
import { el } from '../componentes/el.js';
import { executarAcao } from '../componentes/cartao-tarefa.js';
import { vigiarTarefas } from '../componentes/vigia-tarefas.js';
import { obterTarefa, listarEventos } from '../../dados/tarefas.js';
import { listarPessoas } from '../../dados/pessoas.js';
import { listarCatalogo } from '../../dados/catalogos.js';
import { tituloDaTarefa } from '../../logica/tarefas.js';
import { acoesDaTarefa, estaAtrasada, NOMES_STATUS } from '../../logica/status.js';
import { textoDoEvento, ordenarEventos, duracaoDaTarefa, quandoFoi } from '../../logica/linha-do-tempo.js';
import { formatarPrazo } from '../../logica/datas.js';
import { traduzirErro, iniciais } from '../../logica/conta.js';
import { abrirNovaTarefa } from './nova-tarefa.js';

/** contexto: { perfil, voltarPara }; parametros: [id] */
export function telaTarefaDetalhe(alvo, contexto, parametros = []) {
  const { perfil } = contexto;
  const id = Number(parametros[0]);
  let tarefa = null;
  let eventos = [];
  let nomesPessoas = new Map();
  let nomesCatalogo = null; // { tipos: Map, clientes: Map }, só se precisar
  let carregando = false;

  const voltar = el('a', { class: 'voltar', href: contexto.voltarPara || '#/equipe' }, '← Voltar');
  const corpo = el('div', { class: 'detalhe-corpo', 'aria-live': 'polite' }, el('p', { class: 'texto-suave' }, 'Carregando...'));
  const raiz = el('div', { class: 'tela-detalhe' }, voltar, corpo);
  alvo.replaceChildren(raiz);

  if (!Number.isInteger(id) || id <= 0) {
    naoEncontrada();
    return;
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;
    try {
      const [t, evs, pessoas] = await Promise.all([obterTarefa(id), listarEventos(id), nomesPessoas.size ? null : listarPessoas()]);
      if (pessoas) nomesPessoas = new Map(pessoas.map((p) => [p.id, p.nome]));
      if (!t) { naoEncontrada(); return; }
      tarefa = t;
      eventos = ordenarEventos(evs);
      for (const p of tarefa.responsaveis ?? []) if (!nomesPessoas.has(p.id)) nomesPessoas.set(p.id, p.nome);
      const precisaCatalogo = eventos.some((e) => e.evento === 'editada' && (e.detalhe?.tipo_id || e.detalhe?.cliente_id));
      if (precisaCatalogo && !nomesCatalogo) {
        const [tipos, clientes] = await Promise.all([listarCatalogo('tipos'), listarCatalogo('clientes')]);
        nomesCatalogo = { tipos: new Map(tipos.map((x) => [x.id, x.nome])), clientes: new Map(clientes.map((x) => [x.id, x.nome])) };
      }
      document.title = `${tituloDaTarefa(tarefa)} · InvFlow`;
      desenhar();
    } catch (e) {
      console.error(e);
      if (!tarefa) {
        corpo.replaceChildren(el('div', { class: 'cartao' },
          el('p', { class: 'erro' }, traduzirErro(e)),
          el('div', { class: 'linha-botoes', style: 'margin-top:.75rem' }, el('button', { class: 'botao', type: 'button', onclick: carregar }, 'Tentar de novo')),
        ));
      }
    } finally {
      carregando = false;
    }
  }

  function naoEncontrada() {
    document.title = 'Tarefa não encontrada · InvFlow';
    corpo.replaceChildren(
      el('h1', {}, 'Tarefa não encontrada'),
      el('p', { class: 'texto-suave' }, 'O número não existe ou você não tem acesso. ', el('a', { href: '#/equipe' }, 'Ver as tarefas da equipe'), '.'),
    );
  }

  const nomes = {
    pessoa: (pid) => (pid === perfil.id ? 'você' : nomesPessoas.get(pid)),
    tipo: (tid) => nomesCatalogo?.tipos.get(tid),
    cliente: (cid) => nomesCatalogo?.clientes.get(cid),
  };

  function botoesDeAcao() {
    const { principal, outras } = acoesDaTarefa(tarefa, perfil);
    const aoEditar = (t) => abrirNovaTarefa({ perfil, tarefa: t });
    const botoes = [];
    if (principal) {
      const b = el('button', { class: `botao ${principal.acao === 'concluir' ? 'botao-sucesso' : 'botao-primario'} botao-acao`, type: 'button' }, principal.rotulo);
      b.addEventListener('click', () => executarAcao(tarefa, principal, { botao: b, aoEditar }));
      botoes.push(b);
    }
    for (const acao of outras) {
      const b = el('button', { class: `botao${acao.acao === 'cancelar' ? ' botao-perigo' : ''}`, type: 'button' }, acao.rotulo);
      b.addEventListener('click', () => executarAcao(tarefa, acao, { botao: acao.acao === 'editar' ? null : b, aoEditar }));
      botoes.push(b);
    }
    return botoes.length ? el('div', { class: 'linha-botoes detalhe-acoes' }, ...botoes) : null;
  }

  function linhaDado(rotulo, ...valor) {
    return [el('dt', {}, rotulo), el('dd', {}, ...valor)];
  }

  function cartaoDados(agora) {
    const atrasada = estaAtrasada(tarefa, agora);
    const responsaveis = (tarefa.responsaveis ?? []).map((p) =>
      el('span', { class: 'pessoa-chip' }, el('span', { class: 'avatar avatar-mini', 'aria-hidden': 'true' }, iniciais(p.nome)),
        p.id === perfil.id ? `${p.nome} (você)` : p.nome));
    const criadoPor = tarefa.criado_por ? nomes.pessoa(tarefa.criado_por) ?? 'alguém' : null;
    const linhas = [
      ...linhaDado('Status', NOMES_STATUS[tarefa.status] ?? tarefa.status),
      ...linhaDado('Prazo', el('span', { class: atrasada ? 'info-prazo atrasada' : '' }, formatarPrazo(tarefa.prazo, agora) + (atrasada ? ' (atrasada)' : ''))),
      ...linhaDado('Origem', tarefa.origem === 'programada' ? 'Programada' : 'Demanda'),
      ...linhaDado('Tipo', tarefa.tipo_nome),
      ...linhaDado('Cliente', tarefa.cliente_nome),
      ...(tarefa.local ? linhaDado('Local', tarefa.local) : []),
      ...linhaDado('Responsáveis', el('span', { class: 'pessoas-chips' }, ...responsaveis)),
      ...(tarefa.status === 'bloqueada' && tarefa.motivo_bloqueio ? linhaDado('Motivo do bloqueio', el('span', { class: 'cartao-tarefa-motivo' }, tarefa.motivo_bloqueio)) : []),
      ...(tarefa.email_assunto ? linhaDado('Assunto do e-mail', tarefa.email_assunto) : []),
      ...(tarefa.descricao ? linhaDado('Observações', el('span', { class: 'texto-livre' }, tarefa.descricao)) : []),
      ...linhaDado('Criada', `${quandoFoi(tarefa.criado_em, agora)}${criadoPor ? ` por ${criadoPor}` : ''}`),
    ];
    return el('section', { class: 'cartao detalhe-dados' }, el('h2', {}, 'Dados'), el('dl', { class: 'lista-dados' }, ...linhas));
  }

  function cartaoTempo(agora) {
    const duracao = duracaoDaTarefa(tarefa, eventos, agora);
    const blocoDuracao = duracao
      ? el('div', { class: `duracao duracao-${duracao.situacao}` },
        el('p', { class: 'duracao-texto' }, duracao.texto),
        el('p', { class: 'texto-suave sem-margem' }, duracao.detalhe))
      : el('div', { class: 'duracao' }, el('p', { class: 'texto-suave sem-margem' },
        tarefa.status === 'cancelada' ? 'Cancelada antes de começar.' : 'Ainda não começou. A duração conta a partir do “Iniciei”.'));

    const itens = eventos.map((e) => {
      const txt = textoDoEvento(e, nomes, agora);
      return el('li', { class: `evento evento-${txt.tipo}` },
        el('span', { class: 'evento-marca', 'aria-hidden': 'true' }),
        el('div', { class: 'evento-texto' },
          el('p', { class: 'evento-titulo' }, txt.titulo, el('time', { datetime: e.em, class: 'evento-quando' }, quandoFoi(e.em, agora))),
          ...txt.detalhes.map((d) => el('p', { class: 'evento-detalhe' }, d)),
        ),
      );
    });
    return el('section', { class: 'cartao detalhe-tempo' },
      el('h2', {}, 'Duração'),
      blocoDuracao,
      el('h2', { class: 'titulo-linha-tempo' }, 'Linha do tempo'),
      itens.length ? el('ol', { class: 'linha-tempo' }, ...itens) : el('p', { class: 'texto-suave sem-margem' }, 'Sem histórico.'),
    );
  }

  function desenhar() {
    if (!tarefa || !raiz.isConnected) return;
    const agora = new Date();
    const atrasada = estaAtrasada(tarefa, agora);
    const selos = [];
    if (atrasada) selos.push(el('span', { class: 'selo selo-pequeno selo-atrasada' }, 'Atrasada'));
    if (tarefa.status === 'bloqueada') selos.push(el('span', { class: 'selo selo-pequeno selo-bloqueada' }, 'Bloqueada'));
    if (tarefa.status === 'em_andamento') selos.push(el('span', { class: 'selo selo-pequeno selo-andamento' }, 'Em andamento'));
    if (tarefa.status === 'concluida') selos.push(el('span', { class: 'selo selo-pequeno selo-concluida' }, 'Concluída'));
    if (tarefa.status === 'cancelada') selos.push(el('span', { class: 'selo selo-pequeno selo-arquivado' }, 'Cancelada'));
    if (tarefa.origem === 'programada') selos.push(el('span', { class: 'selo selo-pequeno selo-programada' }, 'Programada'));

    corpo.replaceChildren(
      el('div', { class: 'cabecalho-detalhe' },
        el('h1', {}, tituloDaTarefa(tarefa), ...selos),
        el('p', { class: 'texto-suave sem-margem' }, `Tarefa nº ${tarefa.id}`),
      ),
      botoesDeAcao(),
      el('div', { class: 'grade-detalhe' }, cartaoDados(agora), cartaoTempo(agora)),
    );
  }

  vigiarTarefas(raiz, { carregar, desenhar });
  carregar();
}
