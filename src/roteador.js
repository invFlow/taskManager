// Roteador por hash: #/minhas, #/equipe, #/painel, #/emb ...
// As funções lerRota e resolverRota são puras (sem DOM) e têm testes.

/**
 * Converte o hash da URL em { caminho, partes }.
 * Ex.: "#/tarefa/123?x=1" -> { caminho: "/tarefa/123", partes: ["tarefa", "123"] }
 */
export function lerRota(hash) {
  let texto = String(hash ?? '').replace(/^#/, '');
  texto = texto.split('?')[0];
  const partes = texto.split('/').filter(Boolean).map(decodeURIComponent);
  return { caminho: '/' + partes.join('/'), partes };
}

/**
 * Procura a rota pelo primeiro segmento do caminho.
 * rotas: [{ nome, titulo, tela }]; padrao: nome da rota usada quando o hash está vazio.
 * Devolve { rota, parametros, redirecionar } ou { rota: null } quando não existe.
 */
export function resolverRota(hash, rotas, padrao) {
  const { partes } = lerRota(hash);
  if (partes.length === 0) {
    const rota = rotas.find((r) => r.nome === padrao) ?? null;
    return { rota, parametros: [], redirecionar: rota ? '#/' + rota.nome : null };
  }
  const rota = rotas.find((r) => r.nome === partes[0]) ?? null;
  return { rota, parametros: partes.slice(1), redirecionar: null };
}

/**
 * Liga o roteador ao navegador. A cada troca de hash chama aoMudar(resultado).
 */
export function iniciarRoteador({ rotas, padrao, aoMudar, janela = globalThis.window }) {
  function atualizar() {
    const resultado = resolverRota(janela.location.hash, rotas, padrao);
    if (resultado.redirecionar) {
      janela.location.replace(resultado.redirecionar);
      return;
    }
    aoMudar(resultado);
  }
  janela.addEventListener('hashchange', atualizar);
  atualizar();
  return () => janela.removeEventListener('hashchange', atualizar);
}
