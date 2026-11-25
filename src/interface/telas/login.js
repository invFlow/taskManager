// Tela de entrada: e-mail e senha, e "Esqueci a senha".
import { el, campo, ocupado } from '../componentes/el.js';
import { entrar, pedirLinkDeNovaSenha } from '../../dados/sessao.js';
import { emailValido, traduzirErro } from '../../logica/conta.js';

export function telaLogin(alvo, { mensagem } = {}) {
  mostrarEntrar(alvo, mensagem);
}

function caixa(...filhos) {
  return el('section', { class: 'cartao caixa-login' }, ...filhos);
}

function mostrarEntrar(alvo, mensagem) {
  const email = campo({ rotulo: 'E-mail', type: 'email', name: 'email', autocomplete: 'username', required: true, autofocus: true });
  const senha = campo({ rotulo: 'Senha', type: 'password', name: 'senha', autocomplete: 'current-password', required: true });
  const erro = el('p', { class: 'erro', role: 'alert', hidden: !mensagem }, mensagem ?? '');
  const botao = el('button', { class: 'botao botao-primario botao-largo', type: 'submit' }, 'Entrar');

  const form = el('form', { class: 'formulario', novalidate: true }, email.campo, senha.campo, erro, botao);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    if (!emailValido(email.input.value)) return mostrarErro(erro, 'Digite um e-mail válido.', email.input);
    if (!senha.input.value) return mostrarErro(erro, 'Digite sua senha.', senha.input);
    ocupado(botao, true, 'Entrando...');
    try {
      await entrar(email.input.value, senha.input.value);
      // main.js percebe o login e troca de tela.
    } catch (e) {
      ocupado(botao, false);
      mostrarErro(erro, traduzirErro(e), senha.input);
    }
  });

  const esqueci = el('button', { class: 'link', type: 'button', onclick: () => mostrarEsqueci(alvo, email.input.value) }, 'Esqueci a senha');

  alvo.replaceChildren(caixa(
    el('h1', {}, 'Entrar'),
    el('p', { class: 'texto-suave' }, 'Use o e-mail da empresa e a sua senha.'),
    form,
    el('p', { class: 'rodape-login' }, esqueci),
  ));
  email.input.focus();
}

function mostrarEsqueci(alvo, emailDigitado) {
  const email = campo({ rotulo: 'E-mail', type: 'email', name: 'email', autocomplete: 'username', required: true, value: emailDigitado ?? '' });
  const erro = el('p', { class: 'erro', role: 'alert', hidden: true });
  const botao = el('button', { class: 'botao botao-primario botao-largo', type: 'submit' }, 'Enviar link');
  const form = el('form', { class: 'formulario', novalidate: true }, email.campo, erro, botao);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    erro.hidden = true;
    if (!emailValido(email.input.value)) return mostrarErro(erro, 'Digite um e-mail válido.', email.input);
    ocupado(botao, true, 'Enviando...');
    try {
      await pedirLinkDeNovaSenha(email.input.value);
      alvo.replaceChildren(caixa(
        el('h1', {}, 'Confira seu e-mail'),
        el('p', {}, 'Se esse e-mail estiver cadastrado, chega em alguns minutos um link para criar uma senha nova.'),
        el('p', { class: 'texto-suave' }, 'Não chegou? Peça ao gestor uma senha temporária.'),
        el('button', { class: 'botao botao-largo', type: 'button', onclick: () => mostrarEntrar(alvo) }, 'Voltar para entrar'),
      ));
    } catch (e) {
      ocupado(botao, false);
      mostrarErro(erro, traduzirErro(e), email.input);
    }
  });

  alvo.replaceChildren(caixa(
    el('h1', {}, 'Esqueci a senha'),
    el('p', { class: 'texto-suave' }, 'Mandamos um link para você criar uma senha nova.'),
    form,
    el('p', { class: 'rodape-login' }, el('button', { class: 'link', type: 'button', onclick: () => mostrarEntrar(alvo) }, 'Voltar')),
  ));
  email.input.focus();
}

function mostrarErro(alvoErro, texto, foco) {
  alvoErro.textContent = texto;
  alvoErro.hidden = false;
  foco?.focus();
}
