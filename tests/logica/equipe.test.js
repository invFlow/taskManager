import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lerFiltros, consultaDosFiltros, temFiltro, filtrarTarefas, ordenarEquipe,
  agruparPorPessoa, resumoEquipe, resumoDoGrupo, opcoesDasTarefas, FILTROS_VAZIOS,
} from '../../src/logica/equipe.js';

const AGORA = new Date('2026-11-25T13:00:00Z'); // quarta, 10h00 em Brasília
const ANA = { id: 'ana', nome: 'Ana' };
const BIA = { id: 'bia', nome: 'Bia' };
const CAIO = { id: 'caio', nome: 'Caio', ativo: true };

const t = (id, status, prazo, resp, extra = {}) => ({
  id, status, prazo,
  tipo_id: 1, tipo_nome: 'Auditorias', cliente_id: 2, cliente_nome: 'ABBOTT', local: null,
  responsaveis: resp, responsaveis_ids: resp.map((p) => p.id),
  ...extra,
});

const TAREFAS = [
  t(1, 'a_fazer', '2026-11-25T12:00:00Z', [ANA]),                          // atrasada (09h00)
  t(2, 'em_andamento', '2026-11-25T20:30:00Z', [ANA, BIA], { iniciada_em: '2026-11-25T12:30:00Z' }),
  t(3, 'bloqueada', '2026-11-26T20:30:00Z', [BIA], { motivo_bloqueio: 'Rua interditada', cliente_id: 3, cliente_nome: 'Natura' }),
  t(4, 'a_fazer', '2026-11-27T20:30:00Z', [BIA], { tipo_id: 5, tipo_nome: 'Posições vazias', local: 'Rua F05' }),
  t(5, 'concluida', '2026-11-25T20:30:00Z', [ANA], { concluida_em: '2026-11-25T12:50:00Z' }),
  t(6, 'cancelada', '2026-11-25T20:30:00Z', [ANA]),
];

const ids = (lista) => lista.map((x) => x.id);

test('filtros vêm do endereço e voltam para ele', () => {
  const f = lerFiltros({ atrasadas: '1', pessoa: 'ana', tipo: '5', cliente: 'x', status: 'nada', busca: '  rua f05 ', agrupar: 'prazo' });
  assert.deepEqual(f, { pessoa: 'ana', tipo: '5', cliente: '', status: '', atrasadas: true, busca: 'rua f05', agrupar: 'prazo' });
  assert.equal(consultaDosFiltros(f), 'pessoa=ana&tipo=5&atrasadas=1&busca=rua+f05&agrupar=prazo');
  assert.deepEqual(lerFiltros({}), { ...FILTROS_VAZIOS });
  assert.equal(consultaDosFiltros(FILTROS_VAZIOS), '');
  assert.equal(lerFiltros(new Map()).agrupar, 'pessoa');
});

test('temFiltro ignora o agrupamento', () => {
  assert.equal(temFiltro({ agrupar: 'prazo' }), false);
  assert.equal(temFiltro({ atrasadas: true }), true);
  assert.equal(temFiltro({ busca: '   ' }), false);
});

test('sem filtro: só as abertas (a fazer, em andamento, bloqueadas)', () => {
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, {}, AGORA)), [1, 2, 3, 4]);
});

test('só atrasadas', () => {
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { atrasadas: true }, AGORA)), [1]);
});

test('pessoa, tipo, cliente e status', () => {
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { pessoa: 'bia' }, AGORA)), [2, 3, 4]);
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { tipo: '5' }, AGORA)), [4]);
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { cliente: '3' }, AGORA)), [3]);
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { status: 'bloqueada' }, AGORA)), [3]);
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { status: 'concluida' }, AGORA)), [5]);
});

test('busca sem acento, por palavras, inclui motivo e responsáveis', () => {
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { busca: 'posicoes f05' }, AGORA)), [4]);
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { busca: 'INTERDITADA' }, AGORA)), [3]);
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { busca: 'ana' }, AGORA)), [1, 2]);
  assert.deepEqual(ids(filtrarTarefas(TAREFAS, { busca: 'abbott natura' }, AGORA)), []);
});

test('ordem: em andamento, atrasadas, por prazo, concluídas no fim', () => {
  assert.deepEqual(ids(ordenarEquipe([TAREFAS[4], TAREFAS[3], TAREFAS[0], TAREFAS[1]], AGORA)), [2, 1, 4, 5]);
});

test('agrupa por pessoa; tarefa de duas pessoas aparece nas duas; mostra quem está livre', () => {
  const abertas = filtrarTarefas(TAREFAS, {}, AGORA);
  const { grupos, livres } = agruparPorPessoa(abertas, [{ ...ANA, ativo: true }, { ...BIA, ativo: true }, CAIO, { id: 'z', nome: 'Zé', ativo: false }], AGORA);
  assert.deepEqual(grupos.map((g) => g.pessoa.nome), ['Ana', 'Bia']);
  assert.deepEqual(ids(grupos[0].tarefas), [2, 1]);
  assert.deepEqual(ids(grupos[1].tarefas), [2, 3, 4]);
  assert.deepEqual(livres.map((p) => p.nome), ['Caio']);
});

test('quem só tem concluídas conta como livre', () => {
  const { grupos, livres } = agruparPorPessoa([TAREFAS[4]], [{ ...ANA, ativo: true }], AGORA);
  assert.equal(grupos.length, 1);
  assert.deepEqual(livres.map((p) => p.id), ['ana']);
});

test('resumos', () => {
  const abertas = filtrarTarefas(TAREFAS, {}, AGORA);
  assert.equal(resumoEquipe(abertas, AGORA), '4 tarefas · 1 em andamento · 1 atrasada · 1 bloqueada');
  assert.equal(resumoEquipe([], AGORA), 'Nenhuma tarefa com esses filtros.');
  assert.equal(resumoDoGrupo([TAREFAS[3]], AGORA), '');
});

test('opções de tipo e cliente saem das tarefas, sem repetir', () => {
  assert.deepEqual(opcoesDasTarefas(TAREFAS, 'cliente_id', 'cliente_nome'), [{ id: '2', nome: 'ABBOTT' }, { id: '3', nome: 'Natura' }]);
});
