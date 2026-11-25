// Criar a própria senha: primeiro acesso (senha temporária) ou link de "Esqueci a senha".
import { el, campo, ocupado } from '../componentes/el.js';
import { definirSenha, sair } from '../../dados/sessao.js';
import { validarNovaSenha, traduzirErro, SENHA_MINIMA } from '../../logica/conta.js';

export function telaNovaSenha(alvo, { idUsuario, nome, recuperacao = false, aoTerminar }) {
  const senha = campo({ rotulo: 'Nova senha', type: 'password', autocomplete: 'new-password', required: true,
    ajuda: `Pelo menos ${SENHA_MINIMA} caracteres, com letras e números.` });
  const confirmar = campo({ rotulo: 'Repita a nova senha', type: 'password', autocomplete: 'new-password', required: true });
  const erro = el('p', { class: 'erro', role: 'alert', hidden: true });
  const botao = el('button', { class: 'botao botao-primario botao-largo', type: 'submit' }, 'Salvar senha');
  const form = el('form', { class: 'formulario', novalidate: true }, senha.campo, confirmar.campo, erro, botao);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const problema = validarNovaSenha(senha.input.value, confirmar.input.value);
    if (problema) {
      erro.textContent = problema;
      erro.hidden = false;
      senha.input.focus();
      return;
    }
    erro.hidden = true;
    ocupado(botao, true, 'Salvando...');
    try {
      await definirSenha(idUsuario, senha.input.value);
      aoTerminar?.();
    } catch (e) {
      ocupado(botao, false);
      erro.textContent = traduzirErro(e);
      erro.hidden = false;
    }
  });

  const titulo = recuperacao ? 'Crie uma senha nova' : 'Crie sua senha';
  const explicacao = recuperacao
    ? 'Escolha a senha que você vai usar daqui para frente.'
    : `Olá${nome ? ', ' + nome.split(' ')[0] : ''}! É seu primeiro acesso. Troque a senha temporária por uma só sua.`;

  alvo.replaceChildren(el('section', { class: 'cartao caixa-login' },
    el('h1', {}, titulo),
    el('p', { class: 'texto-suave' }, explicacao),
    form,
    el('p', { class: 'rodape-login' }, el('button', { class: 'link', type: 'button', onclick: () => sair() }, 'Sair')),
  ));
  senha.input.focus();
}
