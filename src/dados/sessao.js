// Login, logout e perfil de quem está usando o app.
import { supabase, chegouPeloLinkDeNovaSenha } from './cliente.js';
import { normalizarEmail } from '../logica/conta.js';

export { chegouPeloLinkDeNovaSenha };

/** Espera o Supabase ler a sessão salva (ou o link do e-mail) e devolve a sessão ou null. */
export async function sessaoAtual() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

/**
 * Avisa quando a sessão muda. cb(evento, sessao); evento é o do Supabase
 * (SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, USER_UPDATED, TOKEN_REFRESHED ...).
 * Devolve a função para parar de ouvir.
 */
export function aoMudarSessao(cb) {
  const { data } = supabase.auth.onAuthStateChange((evento, sessao) => {
    // Não chamar o Supabase dentro do próprio aviso (pode travar): adia um instante.
    setTimeout(() => cb(evento, sessao), 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function entrar(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalizarEmail(email), password: senha });
  if (error) throw error;
  return data.session;
}

export async function sair() {
  const { error } = await supabase.auth.signOut();
  if (error && error.name !== 'AuthSessionMissingError') throw error;
}

/** 'ativo' | 'inativo' | 'sem_cadastro' (função minha_situacao() do banco). */
export async function minhaSituacao() {
  const { data, error } = await supabase.rpc('minha_situacao');
  if (error) throw error;
  return data;
}

/** Linha de pessoas de quem está logado, ou null. */
export async function meuPerfil(idUsuario) {
  const { data, error } = await supabase
    .from('pessoas')
    .select('id, nome, email, papel, ativo, recebe_email, trocar_senha')
    .eq('id', idUsuario)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Grava a senha nova e tira o aviso de "criar senha". */
export async function definirSenha(idUsuario, novaSenha) {
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) throw error;
  const { error: erro2 } = await supabase.from('pessoas').update({ trocar_senha: false }).eq('id', idUsuario);
  if (erro2) throw erro2;
}

/** Manda o e-mail do Supabase com link para criar senha nova. */
export async function pedirLinkDeNovaSenha(email) {
  const voltarPara = location.origin + location.pathname;
  const { error } = await supabase.auth.resetPasswordForEmail(normalizarEmail(email), { redirectTo: voltarPara });
  if (error) throw error;
}
