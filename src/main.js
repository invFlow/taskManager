// Ponto de entrada do InvFlow: login, perfil e navegação.
// Próxima etapa: tempo real e sino (etapa 6).

import { iniciarRoteador } from './roteador.js';
import { telaEmBreve, telaNaoEncontrada } from './interface/telas/em-breve.js';
import { telaLogin } from './interface/telas/login.js';
import { telaNovaSenha } from './interface/telas/nova-senha.js';
import { telaPerfil } from './interface/telas/perfil.js';
import { telaCadastros } from './interface/telas/cadastros.js';
import { telaMinhas } from './interface/telas/minhas.js';
import { telaEquipe } from './interface/telas/equipe.js';
import { telaTarefaDetalhe } from './interface/telas/tarefa-detalhe.js';
import { abrirNovaTarefa } from './interface/telas/nova-tarefa.js';
import { telaAvisoConta, telaSemAcesso } from './interface/telas/aviso-conta.js';
import { mostrarAviso } from './interface/componentes/aviso-toast.js';
import { sessaoAtual, aoMudarSessao, meuPerfil, minhaSituacao, chegouPeloLinkDeNovaSenha } from './dados/sessao.js';
import { estadoDoApp, podeAbrir, rotasVisiveis } from './logica/acesso.js';
import { iniciais } from './logica/conta.js';

const ROTAS = [
  { nome: 'minhas', titulo: 'Minhas tarefas', tela: (alvo) => telaMinhas(alvo, contexto) },
  { nome: 'equipe', titulo: 'Equipe', tela: (alvo, parametros, consulta) => telaEquipe(alvo, contexto, consulta) },
  { nome: 'painel', titulo: 'Painel', tela: telaEmBreve({ titulo: 'Painel do gestor', descricao: 'O que pede atenção hoje e como o time está andando.', etapa: 10 }) },
  { nome: 'emb', titulo: 'EMB-23', tela: telaEmBreve({ titulo: 'EMB-23', descricao: 'Lista, criação, impressão e baixa dos EMBs.', etapa: 13 }) },
  { nome: 'cadastros', titulo: 'Cadastros', tela: (alvo, parametros) => telaCadastros(alvo, contexto, parametros) },
  { nome: 'perfil', titulo: 'Perfil', tela: (alvo) => telaPerfil(alvo, contexto), foraDoMenu: true },
  { nome: 'tarefa', titulo: 'Tarefa', tela: (alvo, parametros) => telaTarefaDetalhe(alvo, contexto, parametros), foraDoMenu: true },
];

const conteudo = document.getElementById('conteudo');
const menu = document.getElementById('menu');
const botaoPerfil = document.getElementById('botao-perfil');

// Estado da sessão. "contexto" é o que as telas recebem.
let sessao = null;
let recuperandoSenha = chegouPeloLinkDeNovaSenha;
let estadoAtual = null;
let pararRoteador = null;
// Endereço de antes da última troca (com os filtros da Equipe, que mudam sem
// "hashchange"). Registrado antes do roteador, então já vale quando a tela abre.
let rotaAnterior = null;
window.addEventListener('hashchange', (ev) => {
  try { rotaAnterior = new URL(ev.oldURL).hash || null; } catch { rotaAnterior = null; }
});
const contexto = {
  perfil: null,
  voltarPara: null, // de onde veio quem abriu o detalhe (#/equipe?..., #/minhas)
  aoAtualizarPerfil(novo) {
    Object.assign(contexto.perfil, novo);
    montarTopo();
    if (!podeAbrir(rotaAtual(), contexto.perfil)) location.hash = '#/minhas';
  },
};

function rotaAtual() {
  return location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
}

function montarTopo() {
  const perfil = contexto.perfil;
  menu.replaceChildren(
    ...rotasVisiveis(ROTAS, perfil).filter((r) => !r.foraDoMenu).map((r) => {
      const a = document.createElement('a');
      a.href = '#/' + r.nome;
      a.textContent = r.titulo;
      a.dataset.rota = r.nome;
      return a;
    }),
  );
  botaoPerfil.querySelector('.iniciais').textContent = perfil ? iniciais(perfil.nome) : '';
  botaoPerfil.title = perfil ? `${perfil.nome} · Perfil` : 'Perfil';
  marcarAtivo(rotaAtual());
}

function marcarAtivo(nome) {
  for (const a of document.querySelectorAll('[data-rota]')) {
    if (a.dataset.rota === nome) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function mostrarRota({ rota, parametros, consulta }) {
  if (estadoAtual !== 'app') return;
  if (rota?.nome === 'tarefa' && rotaAnterior && !rotaAnterior.startsWith('#/tarefa')) contexto.voltarPara = rotaAnterior;
  if (!rota) {
    telaNaoEncontrada(conteudo);
    document.title = 'Página não encontrada · InvFlow';
    marcarAtivo(null);
  } else if (!podeAbrir(rota.nome, contexto.perfil)) {
    telaSemAcesso(conteudo);
    document.title = 'Sem acesso · InvFlow';
    marcarAtivo(null);
  } else {
    document.title = `${rota.titulo} · InvFlow`;
    rota.tela(conteudo, parametros, consulta);
    // O detalhe da tarefa marca no menu a tela de onde veio.
    marcarAtivo(rota.nome === 'tarefa' ? (contexto.voltarPara ?? '#/equipe').replace(/^#\/?/, '').split(/[/?]/)[0] : rota.nome);
  }
  conteudo.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/** Lê perfil e situação do banco e desenha a tela certa. */
async function atualizar() {
  let situacao = null;
  contexto.perfil = null;
  if (sessao) {
    try {
      [contexto.perfil, situacao] = await Promise.all([meuPerfil(sessao.user.id), minhaSituacao()]);
    } catch (e) {
      console.error(e);
      return mudarEstado('erro');
    }
  }
  mudarEstado(estadoDoApp({ sessao, perfil: contexto.perfil, situacao, recuperandoSenha }));
}

function mudarEstado(estado) {
  estadoAtual = estado;
  document.body.dataset.estado = estado;

  if (estado !== 'app') {
    pararRoteador?.();
    pararRoteador = null;
    menu.replaceChildren();
  }

  switch (estado) {
    case 'login':
      document.title = 'Entrar · InvFlow';
      telaLogin(conteudo);
      break;
    case 'nova_senha':
      document.title = 'Criar senha · InvFlow';
      telaNovaSenha(conteudo, {
        idUsuario: sessao.user.id,
        nome: contexto.perfil?.nome,
        recuperacao: recuperandoSenha,
        aoTerminar() {
          recuperandoSenha = false;
          mostrarAviso('Senha criada. Bem-vindo ao InvFlow!');
          atualizar();
        },
      });
      break;
    case 'inativo':
    case 'sem_perfil':
    case 'erro':
      document.title = 'InvFlow';
      telaAvisoConta(conteudo, estado);
      break;
    case 'app':
      montarTopo();
      if (!pararRoteador) pararRoteador = iniciarRoteador({ rotas: ROTAS, padrao: 'minhas', aoMudar: mostrarRota });
      break;
  }
}

document.getElementById('botao-nova').addEventListener('click', () => {
  if (estadoAtual === 'app' && contexto.perfil && !document.querySelector('dialog[open]')) abrirNovaTarefa({ perfil: contexto.perfil });
});

async function iniciar() {
  try {
    sessao = await sessaoAtual();
  } catch (e) {
    console.error(e);
    sessao = null;
  }
  // Tira do endereço o que sobrou do link de e-mail (#access_token=...)
  if (/access_token=|type=recovery|error_description=/.test(location.hash)) {
    history.replaceState(null, '', location.pathname + location.search + '#/minhas');
  }
  await atualizar();

  aoMudarSessao(async (evento, novaSessao) => {
    if (evento === 'TOKEN_REFRESHED') { sessao = novaSessao; return; }
    if (evento === 'PASSWORD_RECOVERY') recuperandoSenha = true;
    const mudouQuem = (novaSessao?.user?.id ?? null) !== (sessao?.user?.id ?? null);
    sessao = novaSessao;
    if (evento === 'SIGNED_OUT') recuperandoSenha = false;
    if (mudouQuem || evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_OUT') await atualizar();
  });
}

iniciar();
