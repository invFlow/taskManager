import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nomeDeBusca, limparNomeCatalogo, filtrarCatalogo, opcoesDaBusca, notaDaBusca, moverDestaque, ordenarPorNome,
  LETRAS_COM_ACENTO, LETRAS_SEM_ACENTO,
} from '../../src/logica/catalogos.js';

const TIPOS = [
  'Inventários diários', 'Inventários programados', 'Auditorias', 'EMB-23',
  'Inventários geográficos', 'Posições vazias', 'Validação das sobras',
].map((nome, i) => ({ id: i + 1, nome, ativo: true }));

const CLIENTES = [
  { id: 1, nome: 'ABBOTT', ativo: true },
  { id: 2, nome: 'Abbvie', ativo: true },
  { id: 3, nome: 'Bayer', ativo: true },
  { id: 4, nome: 'Johnson & Johnson', ativo: true },
  { id: 5, nome: 'Cliente Antigo', ativo: false },
];

test('nome de busca: minúsculo, sem acento, só letras e números', () => {
  assert.equal(nomeDeBusca('  Posições-Vazias '), 'posicoes vazias');
  assert.equal(nomeDeBusca('ÁÉÍÓÚ ÇÃÕ'), 'aeiou cao');
  assert.equal(nomeDeBusca('EMB-23'), 'emb 23');
  assert.equal(nomeDeBusca('Johnson & Johnson'), 'johnson johnson');
  assert.equal(nomeDeBusca('---'), '');
  assert.equal(nomeDeBusca(null), '');
});

test('a lista de acentos é a mesma do banco (002_catalogos.sql)', () => {
  assert.equal(LETRAS_COM_ACENTO.length, LETRAS_SEM_ACENTO.length);
  const sql = readFileSync(new URL('../../supabase/migrations/002_catalogos.sql', import.meta.url), 'utf8');
  const m = sql.match(/translate\(coalesce\(texto, ''\),\s*'([^']+)',\s*'([^']+)'\)/);
  assert.ok(m, 'não achei o translate() na migração');
  assert.equal(m[1], LETRAS_COM_ACENTO);
  assert.equal(m[2], LETRAS_SEM_ACENTO);
});

test('limpar nome: tira espaços sobrando e recusa vazio ou longo demais', () => {
  assert.equal(limparNomeCatalogo('  Abbott   Brasil '), 'Abbott Brasil');
  assert.equal(limparNomeCatalogo(' -- '), null);
  assert.equal(limparNomeCatalogo(''), null);
  assert.equal(limparNomeCatalogo('x'.repeat(81)), null);
  assert.equal(limparNomeCatalogo('x'.repeat(80)), 'x'.repeat(80));
});

test('"abbot" encontra "ABBOTT" e mostra Criar', () => {
  const r = filtrarCatalogo(CLIENTES, 'abbot');
  assert.deepEqual(r.resultados.map((c) => c.nome), ['ABBOTT']);
  assert.equal(r.igual, null);
  assert.equal(r.podeCriar, true);
  assert.equal(r.nomeParaCriar, 'abbot');
});

test('"Abbott" de novo não oferece Criar', () => {
  for (const texto of ['Abbott', 'ABBOTT', ' abbott ', 'Abbótt']) {
    const r = filtrarCatalogo(CLIENTES, texto);
    assert.equal(r.igual?.id, 1, texto);
    assert.equal(r.podeCriar, false, texto);
    assert.equal(r.resultados[0].nome, 'ABBOTT', texto);
  }
});

test('busca sem diferenciar acento e maiúscula, por palavras', () => {
  assert.deepEqual(filtrarCatalogo(TIPOS, 'posicoes').resultados.map((t) => t.nome), ['Posições vazias']);
  assert.deepEqual(filtrarCatalogo(TIPOS, 'VALIDACAO').resultados.map((t) => t.nome), ['Validação das sobras']);
  assert.deepEqual(filtrarCatalogo(TIPOS, 'inv prog').resultados.map((t) => t.nome), ['Inventários programados']);
  assert.deepEqual(filtrarCatalogo(TIPOS, 'emb 23').resultados.map((t) => t.nome), ['EMB-23']);
  assert.equal(filtrarCatalogo(TIPOS, 'xyz').resultados.length, 0);
});

test('ordem: igual, começa com, começo de palavra, contém', () => {
  const itens = [
    { id: 1, nome: 'Rede Ab', ativo: true },      // começo de palavra
    { id: 2, nome: 'Ab', ativo: true },           // igual
    { id: 3, nome: 'Abbvie', ativo: true },       // começa com
    { id: 4, nome: 'Labs', ativo: true },         // contém
  ];
  assert.deepEqual(filtrarCatalogo(itens, 'ab').resultados.map((i) => i.id), [2, 3, 1, 4]);
  assert.equal(notaDaBusca('ab', 'ab'), 0);
  assert.equal(notaDaBusca('labs', 'zz'), null);
});

test('arquivados não aparecem na busca, mas impedem Criar duplicado', () => {
  assert.equal(filtrarCatalogo(CLIENTES, 'antigo').resultados.length, 0);
  const r = filtrarCatalogo(CLIENTES, 'cliente antigo');
  assert.equal(r.igual?.id, 5);
  assert.equal(r.podeCriar, false);
});

test('texto vazio lista tudo em ordem alfabética, sem Criar', () => {
  const r = filtrarCatalogo(TIPOS, '', { limite: 100 });
  assert.equal(r.resultados.length, 7);
  assert.equal(r.resultados[0].nome, 'Auditorias');
  assert.equal(r.podeCriar, false);
  assert.equal(filtrarCatalogo(TIPOS, '').resultados.length, 7);
  assert.equal(filtrarCatalogo(TIPOS, '', { limite: 3 }).resultados.length, 3);
});

test('opções da busca: Criar fica por último', () => {
  const opcoes = opcoesDaBusca(CLIENTES, 'ab');
  assert.deepEqual(opcoes.map((o) => o.tipo), ['item', 'item', 'criar']);
  assert.equal(opcoes.at(-1).nome, 'ab');
  assert.deepEqual(opcoesDaBusca(CLIENTES, 'Novo Cliente'), [{ tipo: 'criar', nome: 'Novo Cliente' }]);
  assert.deepEqual(opcoesDaBusca(CLIENTES, 'Novo Cliente', { podeCriar: false }), []);
  assert.deepEqual(opcoesDaBusca(CLIENTES, 'bayer').map((o) => o.tipo), ['item']);
});

test('setas dão a volta na lista', () => {
  assert.equal(moverDestaque(-1, 1, 3), 0);
  assert.equal(moverDestaque(-1, -1, 3), 2);
  assert.equal(moverDestaque(2, 1, 3), 0);
  assert.equal(moverDestaque(0, -1, 3), 2);
  assert.equal(moverDestaque(0, 1, 0), -1);
});

test('ordenar por nome em português', () => {
  const nomes = ordenarPorNome([{ nome: 'Bayer' }, { nome: 'Ávila' }, { nome: 'avon' }, { nome: 'Abbott' }]).map((i) => i.nome);
  assert.deepEqual(nomes, ['Abbott', 'Ávila', 'avon', 'Bayer']);
});
