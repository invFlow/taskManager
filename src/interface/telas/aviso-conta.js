// Mensagens de conta: pessoa inativa, cadastro faltando, sem permissão para a tela.
import { el } from '../componentes/el.js';
import { sair } from '../../dados/sessao.js';

const TEXTOS = {
  inativo: {
    titulo: 'Acesso desativado',
    texto: 'Seu acesso ao InvFlow está desativado. Se acha que é engano, fale com o gestor.',
  },
  sem_perfil: {
    titulo: 'Cadastro incompleto',
    texto: 'Seu login existe, mas seu cadastro no InvFlow não foi encontrado. Fale com o gestor.',
  },
  erro: {
    titulo: 'Não foi possível carregar',
    texto: 'O InvFlow não conseguiu falar com o servidor. Confira a internet e recarregue a página.',
  },
};

export function telaAvisoConta(alvo, tipo) {
  const t = TEXTOS[tipo] ?? TEXTOS.erro;
  alvo.replaceChildren(el('section', { class: 'cartao caixa-login' },
    el('h1', {}, t.titulo),
    el('p', {}, t.texto),
    el('div', { class: 'linha-botoes' },
      tipo === 'erro' ? el('button', { class: 'botao botao-primario', type: 'button', onclick: () => location.reload() }, 'Recarregar') : null,
      el('button', { class: 'botao', type: 'button', onclick: () => sair() }, 'Sair'),
    ),
  ));
}

export function telaSemAcesso(alvo) {
  alvo.replaceChildren(
    el('h1', {}, 'Sem acesso'),
    el('p', { class: 'texto-suave' }, 'Esta tela é só para gestores. ', el('a', { href: '#/minhas' }, 'Voltar para Minhas tarefas'), '.'),
  );
}
