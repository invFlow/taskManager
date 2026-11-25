// Campo "busca com criar": digita, filtra sem diferenciar acento e maiúscula e,
// quando não há igual, oferece Criar "texto" como última opção. Enter escolhe o
// primeiro resultado (ou o destacado pelas setas). Esc fecha.
//
// Uso:
//   const tipo = buscaComCriar({
//     rotulo: 'Tipo',
//     carregar: () => listarCatalogo('tipos'),
//     criar: (nome) => criarNoCatalogo('tipos', nome),   // opcional
//     aoEscolher: (item, { criado }) => { ... },
//   });
//   form.append(tipo.elemento);  tipo.valor() -> item escolhido ou null
import { el } from './el.js';
import { mostrarAviso } from './aviso-toast.js';
import { opcoesDaBusca, filtrarCatalogo, moverDestaque } from '../../logica/catalogos.js';
import { traduzirErro } from '../../logica/conta.js';

let contador = 0;

export function buscaComCriar({
  rotulo,
  placeholder = 'Digite para procurar',
  ajuda,
  carregar,
  criar,
  aoEscolher,
  valor = null,
  limparAoEscolher = false,
  limite = 8,
  nomeDoItem = 'item',
}) {
  const id = `bcc-${++contador}`;
  let itens = null;          // cache da lista (carregada no primeiro foco)
  let carregando = null;
  let escolhido = valor;
  let opcoes = [];
  let destaque = -1;
  let criando = false;

  const input = el('input', {
    id, type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder,
    role: 'combobox', 'aria-expanded': 'false', 'aria-controls': `${id}-lista`, 'aria-autocomplete': 'list',
    value: escolhido?.nome ?? '',
  });
  const lista = el('ul', { id: `${id}-lista`, class: 'bcc-lista', role: 'listbox', hidden: true, 'aria-label': rotulo });
  const estado = el('p', { class: 'bcc-estado', 'aria-live': 'polite' });

  const elemento = el('div', { class: 'campo bcc' },
    el('label', { for: id }, rotulo),
    el('div', { class: 'bcc-caixa' }, input, lista),
    ajuda ? el('small', { class: 'ajuda' }, ajuda) : null,
    estado,
  );

  async function garantirItens() {
    if (itens) return itens;
    if (!carregando) {
      estado.textContent = 'Carregando...';
      carregando = carregar()
        .then((dados) => { itens = dados ?? []; estado.textContent = ''; return itens; })
        .catch((e) => { carregando = null; estado.textContent = traduzirErro(e); throw e; });
    }
    return carregando;
  }

  function abrir() {
    opcoes = opcoesDaBusca(itens ?? [], input.value, { podeCriar: Boolean(criar), limite });
    destaque = opcoes.length ? 0 : -1;
    desenhar();
  }

  function fechar() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    destaque = -1;
  }

  function desenhar() {
    const texto = input.value.trim();
    const filhos = opcoes.map((op, i) => {
      const li = el('li', {
        id: `${id}-op-${i}`, role: 'option', class: 'bcc-opcao' + (op.tipo === 'criar' ? ' bcc-criar' : ''),
        'aria-selected': i === destaque ? 'true' : 'false',
        onmousedown: (ev) => ev.preventDefault(), // não tira o foco do campo
        onclick: () => escolher(op),
      }, op.tipo === 'criar' ? ['Criar ', el('strong', {}, `“${op.nome}”`)] : op.item.nome);
      return li;
    });
    const igual = texto ? filtrarCatalogo(itens ?? [], texto).igual : null;
    if (igual && igual.ativo === false) {
      filhos.push(el('li', { class: 'bcc-vazio', role: 'presentation' }, `“${igual.nome}” está arquivado. Peça ao gestor para reativar.`));
    } else if (filhos.length === 0) {
      filhos.push(el('li', { class: 'bcc-vazio', role: 'presentation' },
        texto ? 'Nada encontrado.' : `Nenhum ${nomeDoItem} cadastrado ainda.`));
    }
    lista.replaceChildren(...filhos);
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (destaque >= 0) {
      input.setAttribute('aria-activedescendant', `${id}-op-${destaque}`);
      lista.children[destaque]?.scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  async function escolher(op) {
    if (!op || criando) return;
    if (op.tipo === 'item') return finalizar(op.item, false);

    criando = true;
    input.disabled = true;
    estado.textContent = `Criando “${op.nome}”...`;
    fechar();
    try {
      const item = await criar(op.nome);
      estado.textContent = '';
      if (!itens.some((i) => i.id === item.id)) itens.push(item);
      if (item.ativo === false) {
        mostrarAviso(`“${item.nome}” foi arquivado pelo gestor. Peça para reativar ou use outro nome.`, { tipo: 'erro', duracao: 6000 });
        return;
      }
      finalizar(item, true);
    } catch (e) {
      estado.textContent = '';
      mostrarAviso(traduzirErro(e), { tipo: 'erro', duracao: 5000 });
    } finally {
      criando = false;
      input.disabled = false;
      input.focus();
    }
  }

  function finalizar(item, criado) {
    escolhido = limparAoEscolher ? null : item;
    input.value = limparAoEscolher ? '' : item.nome;
    fechar();
    aoEscolher?.(item, { criado });
  }

  input.addEventListener('focus', async () => {
    try { await garantirItens(); } catch { return; }
    if (document.activeElement === input) abrir();
  });
  input.addEventListener('input', async () => {
    if (escolhido && input.value !== escolhido.nome) escolhido = null;
    try { await garantirItens(); } catch { return; }
    abrir();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (lista.hidden) { if (itens) abrir(); return; }
      destaque = moverDestaque(destaque, ev.key === 'ArrowDown' ? 1 : -1, opcoes.length);
      desenhar();
    } else if (ev.key === 'Enter') {
      if (lista.hidden && !input.value.trim()) return; // deixa o formulário seguir
      ev.preventDefault();
      if (!itens) return;
      if (lista.hidden) abrir();
      escolher(opcoes[destaque >= 0 ? destaque : 0]);
    } else if (ev.key === 'Escape') {
      if (!lista.hidden) { ev.preventDefault(); ev.stopPropagation(); fechar(); }
    } else if (ev.key === 'Tab') {
      fechar();
    }
  });
  input.addEventListener('blur', () => {
    fechar();
    // Sem escolher da lista, o texto volta para o que estava escolhido.
    if (!criando && !limparAoEscolher) input.value = escolhido?.nome ?? '';
  });

  return {
    elemento,
    input,
    valor: () => escolhido,
    definir(item) { escolhido = item; input.value = item?.nome ?? ''; },
    /** Esquece o cache (ex.: depois de renomear fora do campo). */
    recarregar() { itens = null; carregando = null; },
    /** Atualiza o cache sem ir ao banco. */
    usarItens(novos) { itens = novos; carregando = null; },
    focar() { input.focus(); },
  };
}
