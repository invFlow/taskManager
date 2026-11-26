// Aba Tipos ou Clientes da tela Cadastros (só gestor abre).
// Procurar ou criar pela "busca com criar"; renomear, juntar duplicados,
// arquivar e reativar na lista.
import { el, ocupado } from '../componentes/el.js';
import { mostrarAviso } from '../componentes/aviso-toast.js';
import { buscaComCriar } from '../componentes/busca-com-criar.js';
import { listarCatalogo, criarNoCatalogo, atualizarNoCatalogo, juntarNoCatalogo } from '../../dados/catalogos.js';
import { abrirModal } from '../componentes/modal.js';
import { filtrarCatalogo, limparNomeCatalogo, ordenarPorNome, CATALOGOS, NOME_MAXIMO } from '../../logica/catalogos.js';
import { traduzirErro } from '../../logica/conta.js';

/** catalogo: 'tipos' | 'clientes' */
export function abaCatalogo(alvo, catalogo) {
  const info = CATALOGOS[catalogo];
  let itens = [];
  let mostrarArquivados = false;
  let filtro = '';

  const busca = buscaComCriar({
    rotulo: `Procurar ou criar ${info.singular}`,
    placeholder: catalogo === 'tipos' ? 'Ex.: Auditorias' : 'Ex.: ABBOTT',
    ajuda: 'Não diferencia acento nem maiúscula. Se não existir, a última opção cria.',
    nomeDoItem: info.singular,
    limparAoEscolher: true,
    carregar: async () => itens,
    criar: (nome) => criarNoCatalogo(catalogo, nome),
    aoEscolher(item, { criado }) {
      filtro = '';
      if (criado) {
        if (!itens.some((i) => i.id === item.id)) itens.push(item);
        mostrarAviso(`${primeiraMaiuscula(info.singular)} “${item.nome}” criado.`);
      }
      desenhar(item.id);
    },
  });
  busca.input.addEventListener('input', () => { filtro = busca.input.value; desenhar(); });

  const arquivados = el('input', { type: 'checkbox', id: `arquivados-${catalogo}` });
  arquivados.addEventListener('change', () => { mostrarArquivados = arquivados.checked; desenhar(); });

  const contagem = el('p', { class: 'texto-suave contagem' });
  const lista = el('div', { class: 'lista-catalogo', 'aria-live': 'polite' }, el('p', { class: 'texto-suave' }, 'Carregando...'));

  alvo.replaceChildren(
    el('section', { class: 'cartao' },
      el('div', { class: 'cabecalho-secao' },
        el('h2', {}, info.plural),
        el('label', { class: 'opcao', for: arquivados.id }, arquivados, el('span', {}, 'Mostrar arquivados')),
      ),
      el('p', { class: 'texto-suave' },
        `Qualquer pessoa do time pode criar ${info.singular} na hora, ao preencher uma tarefa. Aqui você corrige nomes, junta duplicados (as tarefas passam para o nome certo) e arquiva o que não se usa mais. Arquivar não apaga: as tarefas antigas continuam com o nome.`),
      el('div', { class: 'busca-catalogo' }, busca.elemento),
      contagem,
      lista,
    ),
  );

  carregar();

  async function carregar() {
    try {
      itens = await listarCatalogo(catalogo);
      busca.usarItens(itens);
      desenhar();
    } catch (e) {
      lista.replaceChildren(el('p', { class: 'erro' }, traduzirErro(e)), el('button', { class: 'botao', type: 'button', onclick: carregar }, 'Tentar de novo'));
    }
  }

  function desenhar(destacarId = null) {
    const visiveis = filtro.trim()
      ? filtrarCatalogo(itens.map((i) => ({ ...i, ativo: true, _real: i })), filtro, { limite: Infinity }).resultados.map((i) => i._real)
      : ordenarPorNome(itens);
    const mostrar = visiveis.filter((i) => mostrarArquivados || i.ativo || i.id === destacarId);
    const nAtivos = itens.filter((i) => i.ativo).length;
    const nArquivados = itens.length - nAtivos;
    contagem.textContent = `${nAtivos} ativo${nAtivos === 1 ? '' : 's'}` + (nArquivados ? ` · ${nArquivados} arquivado${nArquivados === 1 ? '' : 's'}` : '');

    lista.replaceChildren(...(mostrar.length
      ? mostrar.map(linha)
      : [el('p', { class: 'texto-suave vazio-lista' }, filtro.trim() ? 'Nada encontrado com esse nome.' : `Nenhum ${info.singular} cadastrado ainda.`)]));

    if (destacarId != null) {
      const alvoLinha = lista.querySelector(`[data-id="${destacarId}"]`);
      if (alvoLinha) {
        alvoLinha.classList.add('destaque');
        alvoLinha.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(() => alvoLinha.classList.remove('destaque'), 2500);
      }
    }
  }

  function linha(item) {
    const nome = el('strong', { class: 'item-nome' }, item.nome);
    const selo = item.ativo ? null : el('span', { class: 'selo selo-pequeno selo-arquivado' }, 'arquivado');
    const renomear = el('button', { class: 'botao botao-pequeno', type: 'button' }, 'Renomear');
    const juntar = item.ativo ? el('button', { class: 'botao botao-pequeno', type: 'button', title: `Passar as tarefas de “${item.nome}” para outro ${info.singular} e arquivar este` }, 'Juntar...') : null;
    const arquivar = el('button', { class: 'botao botao-pequeno' + (item.ativo ? ' botao-perigo' : ''), type: 'button' },
      item.ativo ? 'Arquivar' : 'Reativar');
    const linhaEl = el('article', { class: 'item-catalogo' + (item.ativo ? '' : ' inativo'), 'data-id': String(item.id) },
      el('div', { class: 'item-texto' }, nome, selo),
      el('div', { class: 'item-acoes' }, renomear, juntar, arquivar),
    );

    renomear.addEventListener('click', () => editarNome(linhaEl, item));
    juntar?.addEventListener('click', () => abrirJuntar(item));
    arquivar.addEventListener('click', async () => {
      ocupado(arquivar, true, item.ativo ? 'Arquivando...' : 'Reativando...');
      try {
        const novo = await atualizarNoCatalogo(catalogo, item.id, { ativo: !item.ativo });
        Object.assign(item, novo);
        mostrarAviso(`“${novo.nome}” ${novo.ativo ? 'reativado' : 'arquivado'}.`);
        busca.usarItens(itens);
        desenhar(novo.id);
      } catch (e) {
        ocupado(arquivar, false);
        mostrarAviso(traduzirErro(e), { tipo: 'erro', duracao: 5000 });
      }
    });
    return linhaEl;
  }

  /** "Juntar Abbot em ABBOTT": escolhe o item que fica, confirma e chama o banco. */
  function abrirJuntar(item) {
    const outros = ordenarPorNome(itens.filter((i) => i.ativo && i.id !== item.id));
    if (!outros.length) { mostrarAviso(`Não há outro ${info.singular} ativo para juntar.`, { tipo: 'erro' }); return; }
    const idSelect = `juntar-${catalogo}-${item.id}`;
    const select = el('select', { id: idSelect },
      el('option', { value: '' }, 'Escolha...'),
      ...outros.map((o) => el('option', { value: String(o.id) }, o.nome)));
    // Sugere o mais parecido (mesmo nome sem espaços, ou que começa igual).
    const chave = (n) => (n.nome_busca ?? '').replace(/ /g, '');
    const parecido = outros.find((o) => chave(o) === chave(item)) ?? outros.find((o) => chave(o).startsWith(chave(item).slice(0, 4)) && chave(item).length >= 4);
    if (parecido) select.value = String(parecido.id);
    const explicacao = el('p', { class: 'texto-suave sem-margem' });
    const erro = el('p', { class: 'erro', role: 'alert', hidden: true });
    const ok = el('button', { class: 'botao botao-primario', type: 'submit' }, 'Juntar');
    const voltar = el('button', { class: 'botao', type: 'button' }, 'Voltar');
    const form = el('form', { class: 'formulario', novalidate: true },
      el('p', { class: 'sem-margem' }, `Juntar “${item.nome}” em:`),
      el('div', { class: 'campo' }, el('label', { for: idSelect }, `${primeiraMaiuscula(info.singular)} que fica`), select),
      explicacao, erro,
      el('div', { class: 'linha-botoes modal-botoes' }, ok, voltar),
    );
    const atualizarTexto = () => {
      const alvoItem = outros.find((o) => String(o.id) === select.value);
      explicacao.textContent = alvoItem
        ? `Todas as tarefas de “${item.nome}” (abertas e antigas) passam para “${alvoItem.nome}”, e “${item.nome}” fica arquivado. Fica registrado no histórico de cada tarefa.`
        : `Escolha o ${info.singular} com o nome certo.`;
      ok.disabled = !alvoItem;
    };
    select.addEventListener('change', atualizarTexto);
    atualizarTexto();

    const m = abrirModal({ titulo: 'Juntar duplicados', conteudo: form, larguraPequena: true });
    voltar.addEventListener('click', () => m.fechar());
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const alvoItem = outros.find((o) => String(o.id) === select.value);
      if (!alvoItem) return;
      ocupado(ok, true, 'Juntando...');
      try {
        const n = await juntarNoCatalogo(catalogo, item.id, alvoItem.id);
        item.ativo = false;
        m.fechar();
        mostrarAviso(`“${item.nome}” juntado em “${alvoItem.nome}”. ${n === 1 ? '1 tarefa mudou' : `${n} tarefas mudaram`}.`, { duracao: 5000 });
        busca.usarItens(itens);
        desenhar(alvoItem.id);
      } catch (e) {
        ocupado(ok, false);
        erro.textContent = traduzirErro(e);
        erro.hidden = false;
      }
    });
    select.focus();
  }

  function editarNome(linhaEl, item) {
    const input = el('input', { type: 'text', value: item.nome, maxlength: String(NOME_MAXIMO), 'aria-label': `Novo nome de ${item.nome}` });
    const salvar = el('button', { class: 'botao botao-primario botao-pequeno', type: 'submit' }, 'Salvar');
    const cancelar = el('button', { class: 'botao botao-pequeno', type: 'button', onclick: () => desenhar(item.id) }, 'Cancelar');
    const form = el('form', { class: 'item-editar' }, input, el('div', { class: 'item-acoes' }, salvar, cancelar));
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); desenhar(item.id); } });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const novoNome = limparNomeCatalogo(input.value);
      if (!novoNome) {
        mostrarAviso(`Digite um nome com letras ou números (até ${NOME_MAXIMO}).`, { tipo: 'erro' });
        input.focus();
        return;
      }
      if (novoNome === item.nome) return desenhar(item.id);
      ocupado(salvar, true, 'Salvando...');
      try {
        const novo = await atualizarNoCatalogo(catalogo, item.id, { nome: novoNome });
        Object.assign(item, novo);
        mostrarAviso('Nome salvo.');
        busca.usarItens(itens);
        desenhar(item.id);
      } catch (e) {
        ocupado(salvar, false);
        mostrarAviso(traduzirErro(e), { tipo: 'erro', duracao: 5000 });
        input.focus();
      }
    });
    linhaEl.replaceChildren(form);
    input.focus();
    input.select();
  }
}

function primeiraMaiuscula(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
