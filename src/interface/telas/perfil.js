// Perfil: nome, receber e-mails, trocar senha e sair.
import { el, campo, ocupado } from '../componentes/el.js';
import { mostrarAviso } from '../componentes/aviso-toast.js';
import { atualizarPessoa } from '../../dados/pessoas.js';
import { definirSenha, sair } from '../../dados/sessao.js';
import { limparNome, validarNovaSenha, traduzirErro, SENHA_MINIMA } from '../../logica/conta.js';
import { nomeDoPapel } from '../../logica/acesso.js';

/** contexto: { perfil, aoAtualizarPerfil(perfilNovo) } */
export function telaPerfil(alvo, contexto) {
  const { perfil } = contexto;

  // Dados
  const nome = campo({ rotulo: 'Nome', type: 'text', value: perfil.nome, autocomplete: 'name', maxlength: '80', required: true });
  const recebe = el('input', { type: 'checkbox', id: 'perfil-recebe', checked: perfil.recebe_email });
  const erroDados = el('p', { class: 'erro', role: 'alert', hidden: true });
  const salvar = el('button', { class: 'botao botao-primario', type: 'submit' }, 'Salvar');
  const formDados = el('form', { class: 'formulario', novalidate: true },
    nome.campo,
    el('div', { class: 'campo' }, el('span', { class: 'rotulo' }, 'E-mail'), el('p', { class: 'valor' }, perfil.email)),
    el('div', { class: 'campo' }, el('span', { class: 'rotulo' }, 'Papel'), el('p', { class: 'valor' }, nomeDoPapel(perfil.papel))),
    el('label', { class: 'opcao', for: 'perfil-recebe' }, recebe,
      el('span', {}, 'Receber lembretes por e-mail', el('small', { class: 'ajuda' }, 'Os avisos dentro do app continuam chegando.'))),
    erroDados,
    el('div', { class: 'linha-botoes' }, salvar),
  );
  formDados.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nomeLimpo = limparNome(nome.input.value);
    if (!nomeLimpo) {
      erroDados.textContent = 'Digite seu nome (de 2 a 80 letras).';
      erroDados.hidden = false;
      nome.input.focus();
      return;
    }
    erroDados.hidden = true;
    ocupado(salvar, true, 'Salvando...');
    try {
      const novo = await atualizarPessoa(perfil.id, { nome: nomeLimpo, recebe_email: recebe.checked });
      Object.assign(perfil, novo);
      contexto.aoAtualizarPerfil?.(novo);
      nome.input.value = novo.nome;
      mostrarAviso('Perfil salvo.');
    } catch (e) {
      erroDados.textContent = traduzirErro(e);
      erroDados.hidden = false;
    } finally {
      ocupado(salvar, false);
    }
  });

  // Senha
  const senha = campo({ rotulo: 'Nova senha', type: 'password', autocomplete: 'new-password',
    ajuda: `Pelo menos ${SENHA_MINIMA} caracteres, com letras e números.` });
  const confirmar = campo({ rotulo: 'Repita a nova senha', type: 'password', autocomplete: 'new-password' });
  const erroSenha = el('p', { class: 'erro', role: 'alert', hidden: true });
  const trocar = el('button', { class: 'botao', type: 'submit' }, 'Trocar senha');
  const formSenha = el('form', { class: 'formulario', novalidate: true }, senha.campo, confirmar.campo, erroSenha, el('div', { class: 'linha-botoes' }, trocar));
  formSenha.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const problema = validarNovaSenha(senha.input.value, confirmar.input.value);
    if (problema) {
      erroSenha.textContent = problema;
      erroSenha.hidden = false;
      senha.input.focus();
      return;
    }
    erroSenha.hidden = true;
    ocupado(trocar, true, 'Trocando...');
    try {
      await definirSenha(perfil.id, senha.input.value);
      senha.input.value = '';
      confirmar.input.value = '';
      mostrarAviso('Senha trocada.');
    } catch (e) {
      erroSenha.textContent = traduzirErro(e);
      erroSenha.hidden = false;
    } finally {
      ocupado(trocar, false);
    }
  });

  const botaoSair = el('button', { class: 'botao botao-perigo', type: 'button' }, 'Sair do InvFlow');
  botaoSair.addEventListener('click', async () => {
    ocupado(botaoSair, true, 'Saindo...');
    try { await sair(); } catch (e) { ocupado(botaoSair, false); mostrarAviso(traduzirErro(e), { tipo: 'erro' }); }
  });

  alvo.replaceChildren(
    el('h1', {}, 'Perfil'),
    el('p', { class: 'texto-suave' }, 'Seus dados, e-mails e senha.'),
    el('div', { class: 'grade-perfil' },
      el('section', { class: 'cartao' }, el('h2', {}, 'Seus dados'), formDados),
      el('section', { class: 'cartao' }, el('h2', {}, 'Senha'), formSenha),
    ),
    el('div', { class: 'linha-botoes sair' }, botaoSair),
  );
}
