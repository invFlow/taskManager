// Ajudante pequeno para montar HTML sem innerHTML (evita injeção de texto).
// el('button', { class: 'botao', onclick: fn }, 'Salvar')
export function el(tag, atributos = {}, ...filhos) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos ?? {})) {
    if (valor === false || valor == null) continue;
    if (chave.startsWith('on') && typeof valor === 'function') no.addEventListener(chave.slice(2), valor);
    else if (chave === 'class') no.className = valor;
    else if (chave in no && typeof valor !== 'string') no[chave] = valor;
    else no.setAttribute(chave, valor === true ? '' : valor);
  }
  for (const filho of filhos.flat()) {
    if (filho == null || filho === false) continue;
    no.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

/** Campo com rótulo: devolve { campo, input }. */
export function campo({ rotulo, ajuda, ...atributosInput }) {
  const id = atributosInput.id ?? 'c-' + Math.random().toString(36).slice(2, 9);
  const input = el('input', { ...atributosInput, id });
  const partes = [el('label', { for: id }, rotulo), input];
  if (ajuda) partes.push(el('small', { class: 'ajuda' }, ajuda));
  return { campo: el('div', { class: 'campo' }, ...partes), input };
}

/** Liga/desliga o estado "trabalhando" de um botão. */
export function ocupado(botao, sim, textoOcupado = 'Aguarde...') {
  if (sim) {
    botao.dataset.textoOriginal = botao.textContent;
    botao.textContent = textoOcupado;
    botao.disabled = true;
  } else {
    botao.textContent = botao.dataset.textoOriginal ?? botao.textContent;
    botao.disabled = false;
  }
}
