// Ponto de entrada do InvFlow. Nesta etapa só monta a navegação.
// Nas próximas etapas: login (etapa 2) e tempo real (etapa 6).

import { iniciarRoteador } from './roteador.js';
import { telaEmBreve, telaNaoEncontrada } from './interface/telas/em-breve.js';

const ROTAS = [
  { nome: 'minhas', titulo: 'Minhas tarefas', tela: telaEmBreve({ titulo: 'Minhas tarefas', descricao: 'O que está com você agora, hoje e nos próximos dias.', etapa: 4 }) },
  { nome: 'equipe', titulo: 'Equipe', tela: telaEmBreve({ titulo: 'Equipe', descricao: 'Todas as tarefas abertas do time, com filtros.', etapa: 5 }) },
  { nome: 'painel', titulo: 'Painel', tela: telaEmBreve({ titulo: 'Painel do gestor', descricao: 'O que pede atenção hoje e como o time está andando.', etapa: 10 }) },
  { nome: 'emb', titulo: 'EMB-23', tela: telaEmBreve({ titulo: 'EMB-23', descricao: 'Lista, criação, impressão e baixa dos EMBs.', etapa: 13 }) },
  { nome: 'cadastros', titulo: 'Cadastros', tela: telaEmBreve({ titulo: 'Cadastros', descricao: 'Pessoas, tipos, clientes, grupos de e-mail e configurações.', etapa: 3 }) },
  { nome: 'perfil', titulo: 'Perfil', tela: telaEmBreve({ titulo: 'Perfil', descricao: 'Seu nome, e-mails e senha.', etapa: 2 }) },
];

const conteudo = document.getElementById('conteudo');
const menu = document.getElementById('menu');

function montarMenu() {
  menu.replaceChildren(
    ...ROTAS.filter((r) => r.nome !== 'perfil').map((r) => {
      const a = document.createElement('a');
      a.href = '#/' + r.nome;
      a.textContent = r.titulo;
      a.dataset.rota = r.nome;
      return a;
    }),
  );
}

function marcarAtivo(nome) {
  for (const a of document.querySelectorAll('[data-rota]')) {
    if (a.dataset.rota === nome) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

montarMenu();

iniciarRoteador({
  rotas: ROTAS,
  padrao: 'minhas',
  aoMudar({ rota }) {
    if (rota) {
      rota.tela(conteudo);
      document.title = `${rota.titulo} · InvFlow`;
      marcarAtivo(rota.nome);
    } else {
      telaNaoEncontrada(conteudo);
      document.title = 'Página não encontrada · InvFlow';
      marcarAtivo(null);
    }
    conteudo.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  },
});

document.getElementById('botao-nova').addEventListener('click', () => {
  alertaSimples('A criação de tarefas chega na etapa 4.');
});

function alertaSimples(texto) {
  const aviso = document.getElementById('aviso');
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(alertaSimples.timer);
  alertaSimples.timer = setTimeout(() => { aviso.hidden = true; }, 3000);
}
