// Roteador por hash: #/minhas, #/equipe, #/painel, #/emb ...
// As funções lerRota e resolverRota são puras (sem DOM) e têm testes.

/**
 * Converte o hash da URL em { caminho, partes, consulta }.
 * Ex.: "#/tarefa/123?x=1" -> { caminho: "/tarefa/123", partes: ["tarefa", "123"], consulta: { x: "1" } }
 */
export function lerRota(hash) {
  const texto = String(hash ?? '').replace(/^#/, '');
  const [caminhoTexto, consultaTexto = ''] = texto.split('?');
  const partes = caminhoTexto.split('/').filter(Boolean).map(decodeURIComponent);
  const consulta = Object.fromEntries(new URLSearchParams(consultaTexto));
  return { caminho: '/' + partes.join('/'), partes, consulta };
}

/**
 * Procura a rota pelo primeiro segmento do caminho.
 * rotas: [{ nome, titulo, tela }]; padrao: nome da rota usada quando o hash está vazio.
 * Devolve { rota, parametros, consulta, redirecionar } (rota null quando não existe).
 */
export function resolverRota(hash, rotas, padrao) {
  const { partes, consulta } = lerRota(hash);
  if (partes.length === 0) {
    const rota = rotas.find((r) => r.nome === padrao) ?? null;
    return { rota, parametros: [], consulta, redirecionar: rota ? '#/' + rota.nome : null };
  }
  const rota = rotas.find((r) => r.nome === partes[0]) ?? null;
  return { rota, parametros: partes.slice(1), consulta, redirecionar: null };
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
