import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRANSICOES, STATUS, podeMudar, estaAtrasada, acoesDaTarefa, statusAoDesbloquear, limparMotivo } from '../../src/logica/status.js';

const AGORA = new Date('2026-11-25T13:00:00Z');
const ANA = { id: 'ana', papel: 'colaborador', ativo: true };
const BIA = { id: 'bia', papel: 'colaborador', ativo: true };
const GESTOR = { id: 'gestor', papel: 'gestor', ativo: true };
const tarefa = (campos = {}) => ({
  id: 1, status: 'a_fazer', prazo: '2026-11-25T20:30:00Z', criado_por: 'ana', responsaveis_ids: ['ana'], ...campos,
});

test('mudanças permitidas', () => {
  assert.ok(podeMudar('a_fazer', 'em_andamento'));
  assert.ok(podeMudar('em_andamento', 'concluida'));
  assert.ok(podeMudar('concluida', 'em_andamento'));
  assert.ok(podeMudar('bloqueada', 'a_fazer'));
  assert.ok(!podeMudar('a_fazer', 'concluida'));
  assert.ok(!podeMudar('em_andamento', 'cancelada'));
  assert.ok(!podeMudar('cancelada', 'a_fazer'));
  assert.ok(!podeMudar('xyz', 'a_fazer'));
});

test('a tabela de mudanças é igual à do banco (003_tarefas.sql)', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/003_tarefas.sql', import.meta.url), 'utf8');
  const corpo = sql.slice(sql.indexOf('function public.transicao_permitida'), sql.indexOf('$$;', sql.indexOf('function public.transicao_permitida')));
  const doBanco = [...corpo.matchAll(/\('(\w+)', '(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
  const daTela = STATUS.flatMap((de) => TRANSICOES[de].map((para) => `${de}>${para}`)).sort();
  assert.ok(doBanco.length > 0);
  assert.deepEqual(daTela, doBanco);
});

test('atrasada = prazo vencido e aberta', () => {
  const vencida = tarefa({ prazo: '2026-11-25T12:59:00Z' });
  assert.ok(estaAtrasada(vencida, AGORA));
  assert.ok(estaAtrasada({ ...vencida, status: 'em_andamento' }, AGORA));
  assert.ok(estaAtrasada({ ...vencida, status: 'bloqueada' }, AGORA));
  assert.ok(!estaAtrasada({ ...vencida, status: 'concluida' }, AGORA));
  assert.ok(!estaAtrasada({ ...vencida, status: 'cancelada' }, AGORA));
  assert.ok(!estaAtrasada(tarefa(), AGORA));
});

test('desbloquear volta para onde estava', () => {
  assert.equal(statusAoDesbloquear(tarefa({ status: 'bloqueada' })), 'a_fazer');
  assert.equal(statusAoDesbloquear(tarefa({ status: 'bloqueada', iniciada_em: '2026-11-25T12:00:00Z' })), 'em_andamento');
});

test('motivo do bloqueio é limpo e obrigatório', () => {
  assert.equal(limparMotivo('  Rua   interditada '), 'Rua interditada');
  assert.equal(limparMotivo('   '), null);
  assert.equal(limparMotivo('x'.repeat(400)).length, 300);
});

const nomes = (r) => ({ principal: r.principal?.acao ?? null, outras: r.outras.map((a) => a.acao) });

test('botões do responsável que criou', () => {
  assert.deepEqual(nomes(acoesDaTarefa(tarefa(), ANA)), { principal: 'iniciar', outras: ['bloquear', 'editar', 'cancelar'] });
  assert.deepEqual(nomes(acoesDaTarefa(tarefa({ status: 'em_andamento' }), ANA)), { principal: 'concluir', outras: ['bloquear', 'editar'] });
  assert.deepEqual(nomes(acoesDaTarefa(tarefa({ status: 'bloqueada' }), ANA)), { principal: 'desbloquear', outras: ['editar'] });
  assert.deepEqual(nomes(acoesDaTarefa(tarefa({ status: 'concluida' }), ANA)), { principal: null, outras: ['reabrir'] });
  assert.deepEqual(nomes(acoesDaTarefa(tarefa({ status: 'cancelada' }), ANA)), { principal: null, outras: [] });
});

test('responsável que não criou não cancela; quem não é responsável não mexe', () => {
  const t = tarefa({ responsaveis_ids: ['ana', 'bia'] });
  assert.deepEqual(nomes(acoesDaTarefa(t, BIA)), { principal: 'iniciar', outras: ['bloquear', 'editar'] });
  assert.deepEqual(nomes(acoesDaTarefa(tarefa(), BIA)), { principal: null, outras: [] });
});

test('quem criou e saiu dos responsáveis ainda edita e cancela', () => {
  assert.deepEqual(nomes(acoesDaTarefa(tarefa({ responsaveis_ids: ['bia'] }), ANA)), { principal: null, outras: ['editar', 'cancelar'] });
});

test('gestor faz tudo; pessoa inativa nada', () => {
  assert.deepEqual(nomes(acoesDaTarefa(tarefa(), GESTOR)), { principal: 'iniciar', outras: ['bloquear', 'editar', 'cancelar'] });
  assert.deepEqual(nomes(acoesDaTarefa(tarefa(), { ...ANA, ativo: false })), { principal: null, outras: [] });
  assert.equal(acoesDaTarefa(tarefa({ status: 'bloqueada', iniciada_em: 'x' }), GESTOR).principal.para, 'em_andamento');
});
