// Tela provisória usada enquanto a tela de verdade não é construída.

export function telaEmBreve({ titulo, descricao, etapa }) {
  return (alvo) => {
    alvo.replaceChildren();
    const h1 = document.createElement('h1');
    h1.textContent = titulo;
    const p = document.createElement('p');
    p.className = 'texto-suave';
    p.textContent = descricao;
    const selo = document.createElement('p');
    selo.className = 'selo';
    selo.textContent = `Em construção, etapa ${etapa}`;
    const cartao = document.createElement('section');
    cartao.className = 'cartao vazio';
    cartao.append(selo);
    alvo.append(h1, p, cartao);
  };
}

export function telaNaoEncontrada(alvo) {
  alvo.replaceChildren();
  const h1 = document.createElement('h1');
  h1.textContent = 'Página não encontrada';
  const p = document.createElement('p');
  p.className = 'texto-suave';
  p.innerHTML = 'Este endereço não existe. <a href="#/minhas">Voltar para Minhas tarefas</a>.';
  alvo.append(h1, p);
}
