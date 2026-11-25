// Regras puras dos catálogos (tipos de atividade e clientes) e da "busca com criar".
// Sem tela e sem Supabase. Testadas em tests/logica/catalogos.test.js.

// As mesmas letras da função nome_de_busca() em supabase/migrations/002_catalogos.sql.
// Um teste confere que as duas listas continuam iguais.
export const LETRAS_COM_ACENTO = 'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ';
export const LETRAS_SEM_ACENTO = 'aaaaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnnyyy';

const MAPA = new Map([...LETRAS_COM_ACENTO].map((letra, i) => [letra, LETRAS_SEM_ACENTO[i]]));

export const NOME_MAXIMO = 80;

/**
 * Nome usado para comparar e buscar: minúsculo, sem acento, só letras e números
 * separados por um espaço. "  Posições-Vazias " -> "posicoes vazias".
 */
export function nomeDeBusca(texto) {
  let s = '';
  for (const letra of String(texto ?? '')) s += MAPA.get(letra) ?? letra;
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Nome como será gravado: espaços repetidos viram um. Devolve null se não tem letra nem número ou passa de 80. */
export function limparNomeCatalogo(texto) {
  const nome = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (!nomeDeBusca(nome) || nome.length > NOME_MAXIMO) return null;
  return nome;
}

/** Ordem alfabética em português ("Ávila" junto de "Avon"). */
export function ordenarPorNome(itens) {
  return [...itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

/**
 * Quanto o item combina com a busca (menor é melhor), ou null se não combina.
 *  0 nome igual · 1 começa com a busca · 2 todas as palavras são começo de palavra do nome · 3 contém
 * Cada palavra digitada precisa aparecer no nome: "inv prog" acha "Inventários programados".
 */
export function notaDaBusca(nomeBuscaItem, busca) {
  const alvo = nomeBuscaItem ?? '';
  if (!busca) return 3;
  if (alvo === busca) return 0;
  const palavras = busca.split(' ');
  if (!palavras.every((p) => alvo.includes(p))) return null;
  if (alvo.startsWith(busca)) return 1;
  const doAlvo = alvo.split(' ');
  if (palavras.every((p) => doAlvo.some((w) => w.startsWith(p)))) return 2;
  return 3;
}

/**
 * Filtra um catálogo pelo texto digitado.
 * itens: [{ id, nome, ativo, nome_busca? }]. Arquivados (ativo = false) não aparecem.
 * Devolve { resultados, igual, podeCriar, nomeParaCriar }:
 *  - resultados: até "limite" itens, melhores primeiro (empate: ordem alfabética)
 *  - igual: o item com o mesmo nome de busca, se existir (mesmo arquivado)
 *  - podeCriar: true quando há texto válido e nenhum item igual
 */
export function filtrarCatalogo(itens, texto, { limite = 8 } = {}) {
  const busca = nomeDeBusca(texto);
  const lista = itens ?? [];
  const igual = busca ? lista.find((i) => (i.nome_busca ?? nomeDeBusca(i.nome)) === busca) ?? null : null;

  const comNota = [];
  for (const item of lista) {
    if (item.ativo === false) continue;
    const nota = notaDaBusca(item.nome_busca ?? nomeDeBusca(item.nome), busca);
    if (nota !== null) comNota.push({ item, nota });
  }
  comNota.sort((a, b) => a.nota - b.nota || a.item.nome.localeCompare(b.item.nome, 'pt-BR', { sensitivity: 'base' }));

  const nomeParaCriar = limparNomeCatalogo(texto);
  return {
    resultados: comNota.slice(0, limite).map((c) => c.item),
    igual,
    podeCriar: Boolean(nomeParaCriar) && !igual,
    nomeParaCriar,
  };
}

/**
 * Opções que a lista da "busca com criar" mostra, em ordem.
 * [{ tipo: 'item', item } ..., { tipo: 'criar', nome }?]
 * O "Criar" fica por último; Enter escolhe a primeira opção.
 */
export function opcoesDaBusca(itens, texto, { podeCriar = true, limite = 8 } = {}) {
  const r = filtrarCatalogo(itens, texto, { limite });
  const opcoes = r.resultados.map((item) => ({ tipo: 'item', item }));
  if (podeCriar && r.podeCriar) opcoes.push({ tipo: 'criar', nome: r.nomeParaCriar });
  return opcoes;
}

/** Próxima opção destacada ao apertar seta para baixo (+1) ou para cima (-1), dando a volta. */
export function moverDestaque(atual, passo, total) {
  if (total <= 0) return -1;
  if (atual < 0) return passo > 0 ? 0 : total - 1;
  return (atual + passo + total) % total;
}

/** Nome do catálogo para mensagens. */
export const CATALOGOS = {
  tipos: { tabela: 'tipos_atividade', singular: 'tipo', plural: 'Tipos', artigo: 'o' },
  clientes: { tabela: 'clientes', singular: 'cliente', plural: 'Clientes', artigo: 'o' },
};
