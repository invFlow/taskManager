import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerRota, resolverRota } from '../src/roteador.js';

const ROTAS = [{ nome: 'minhas' }, { nome: 'equipe' }, { nome: 'tarefa' }];

test('lerRota separa o caminho em partes', () => {
  assert.deepEqual(lerRota('#/tarefa/123'), { caminho: '/tarefa/123', partes: ['tarefa', '123'], consulta: {} });
  assert.deepEqual(lerRota(''), { caminho: '/', partes: [], consulta: {} });
  assert.deepEqual(lerRota('#/equipe?filtro=x'), { caminho: '/equipe', partes: ['equipe'], consulta: { filtro: 'x' } });
  assert.deepEqual(lerRota('#/emb/E%2000123'), { caminho: '/emb/E 00123', partes: ['emb', 'E 00123'], consulta: {} });
});

test('lerRota lê os filtros depois do "?"', () => {
  const { consulta } = lerRota('#/equipe?atrasadas=1&busca=rua%20f05&pessoa=abc');
  assert.deepEqual(consulta, { atrasadas: '1', busca: 'rua f05', pessoa: 'abc' });
  assert.deepEqual(resolverRota('#/equipe?atrasadas=1', ROTAS, 'minhas').consulta, { atrasadas: '1' });
});

test('hash vazio redireciona para a rota padrão', () => {
  const r = resolverRota('', ROTAS, 'minhas');
  assert.equal(r.rota.nome, 'minhas');
  assert.equal(r.redirecionar, '#/minhas');
  assert.equal(resolverRota('#/', ROTAS, 'minhas').redirecionar, '#/minhas');
});

test('rota conhecida devolve parâmetros', () => {
  const r = resolverRota('#/tarefa/42', ROTAS, 'minhas');
  assert.equal(r.rota.nome, 'tarefa');
  assert.deepEqual(r.parametros, ['42']);
  assert.equal(r.redirecionar, null);
});

test('rota desconhecida devolve rota nula', () => {
  assert.equal(resolverRota('#/nada', ROTAS, 'minhas').rota, null);
});
