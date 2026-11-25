// Decide o que a pessoa vê, a partir da sessão e do perfil (puro, testado).

/** Rotas que só o gestor abre. */
export const ROTAS_DO_GESTOR = ['painel', 'cadastros'];

/**
 * Em que estado o app está:
 *  'login'        sem sessão
 *  'inativo'      pessoa desativada pelo gestor (situacao vem de minha_situacao())
 *  'sem_perfil'   tem login mas não há linha em pessoas (migração não aplicada?)
 *  'nova_senha'   precisa criar a senha (primeiro acesso ou "esqueci a senha")
 *  'app'          tudo certo
 */
export function estadoDoApp({ sessao, perfil, situacao = null, recuperandoSenha = false }) {
  if (!sessao) return 'login';
  if (situacao === 'inativo') return 'inativo';
  if (recuperandoSenha) return 'nova_senha';
  if (!perfil) return 'sem_perfil';
  if (!perfil.ativo) return 'inativo';
  if (perfil.trocar_senha) return 'nova_senha';
  return 'app';
}

export function ehGestor(perfil) {
  return Boolean(perfil && perfil.ativo && perfil.papel === 'gestor');
}

export function podeAbrir(nomeRota, perfil) {
  if (!perfil || !perfil.ativo) return false;
  if (ROTAS_DO_GESTOR.includes(nomeRota)) return ehGestor(perfil);
  return true;
}

/** Filtra a lista de rotas do menu para a pessoa. */
export function rotasVisiveis(rotas, perfil) {
  return rotas.filter((r) => podeAbrir(r.nome, perfil));
}

/** Rótulo do papel para a tela. */
export function nomeDoPapel(papel) {
  return papel === 'gestor' ? 'Gestor' : 'Colaborador';
}
