// Regras puras de conta e login (sem tela e sem Supabase). Testadas em tests/logica/conta.test.js.

export const SENHA_MINIMA = 8;

/** Devolve a mensagem de erro da nova senha, ou null quando está boa. */
export function validarNovaSenha(senha, confirmacao) {
  const s = String(senha ?? '');
  if (s.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (s.trim() !== s) return 'A senha não pode começar nem terminar com espaço.';
  if (!/[A-Za-zÀ-ÿ]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
  if (s !== String(confirmacao ?? '')) return 'As duas senhas não são iguais.';
  return null;
}

/** Limpa o e-mail digitado (espaços e maiúsculas). */
export function normalizarEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(email));
}

/** Nome legível para a pessoa: valida e corta espaços. Devolve null se inválido. */
export function limparNome(nome) {
  const n = String(nome ?? '').replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 80) return null;
  return n;
}

/** "Ana Paula Souza" -> "AS"; "ana" -> "AN". */
export function iniciais(nome) {
  const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Traduz erros do Supabase Auth / PostgREST para uma frase em português. */
export function traduzirErro(erro) {
  if (!erro) return '';
  const msg = String(erro.message ?? erro).toLowerCase();
  const codigo = String(erro.code ?? '');
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado. Fale com o gestor.';
  if (msg.includes('user is banned') || msg.includes('user banned')) return 'Seu acesso foi bloqueado. Fale com o gestor.';
  if (msg.includes('rate limit') || msg.includes('too many requests') || codigo === 'over_request_rate_limit' || codigo === 'over_email_send_rate_limit')
    return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
  if (msg.includes('new password should be different') || codigo === 'same_password') return 'A nova senha precisa ser diferente da atual.';
  if (msg.includes('password should be at least') || codigo === 'weak_password') return 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed'))
    return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (msg.includes('pelo menos um gestor')) return 'O time precisa de pelo menos um gestor ativo.';
  if (msg.includes('só o gestor')) return 'Só o gestor pode fazer essa mudança.';
  if (codigo === '42501' || msg.includes('permission denied') || msg.includes('row-level security'))
    return 'Você não tem permissão para fazer isso.';
  return 'Algo deu errado. Tente de novo em instantes.';
}
