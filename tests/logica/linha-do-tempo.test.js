import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  textoDoEvento, mudancasDaEdicao, ordenarEventos, tempoBloqueado, duracaoDaTarefa, quandoFoi,
} from '../../src/logica/linha-do-tempo.js';

const AGORA = new Date('2026-11-25T15:00:00Z'); // quarta, 12h00 em Brasília
const PESSOAS = { ana: 'Ana', bia: 'Bia' };
const NOMES = {
  pessoa: (id) => PESSOAS[id],
  tipo: (id) => ({ 1: 'Auditorias', 5: 'Posições vazias' })[id],
  cliente: (id) => ({ 2: 'ABBOTT' })[id],
};

const ev = (id, evento, em, pessoa_id = 'ana', detalhe = {}) => ({ id, evento, em, pessoa_id, detalhe });

test('textos dos eventos com quem fez', () => {
  assert.equal(textoDoEvento(ev(1, 'criada', AGORA), NOMES).titulo, 'Criada por Ana');
  assert.equal(textoDoEvento(ev(1, 'criada', AGORA, 'ana', { origem: 'programada' }), NOMES).titulo, 'Programada criada por Ana');
  assert.equal(textoDoEvento(ev(2, 'iniciada', AGORA), NOMES).titulo, 'Iniciada por Ana');
  assert.equal(textoDoEvento(ev(3, 'concluida', AGORA, 'bia'), NOMES).titulo, 'Concluída por Bia');
  const b = textoDoEvento(ev(4, 'bloqueada', AGORA, 'ana', { motivo: 'Rua interditada' }), NOMES);
  assert.deepEqual([b.titulo, b.detalhes], ['Bloqueada por Ana', ['Motivo: Rua interditada']]);
  assert.deepEqual(textoDoEvento(ev(5, 'desbloqueada', AGORA, 'ana', { para: 'a_fazer' }), NOMES).detalhes, ['Voltou para “A fazer”']);
  assert.equal(textoDoEvento(ev(6, 'responsavel_incluido', AGORA, 'ana', { pessoa_id: 'bia' }), NOMES).titulo, 'Ana incluiu Bia como responsável');
  assert.equal(textoDoEvento(ev(7, 'responsavel_removido', AGORA, 'ana', { pessoa_id: 'bia' }), NOMES).titulo, 'Ana tirou Bia dos responsáveis');
  assert.equal(textoDoEvento(ev(8, 'cancelada', AGORA, null), NOMES).titulo, 'Cancelada');
  assert.equal(textoDoEvento(ev(9, 'iniciada', AGORA, 'zzz'), NOMES).titulo, 'Iniciada por alguém');
  const eu = { ...NOMES, pessoa: (id) => (id === 'ana' ? 'você' : PESSOAS[id]) };
  assert.equal(textoDoEvento(ev(10, 'responsavel_incluido', AGORA, 'ana', { pessoa_id: 'bia' }), eu).titulo, 'Você incluiu Bia como responsável');
});

test('edição lista o que mudou, com nomes', () => {
  const linhas = mudancasDaEdicao({
    tipo_id: { de: 1, para: 5 },
    cliente_id: { de: 2, para: 9 },
    prazo: { de: '2026-11-25T20:30:00Z', para: '2026-11-26T20:30:00Z' },
    local: { de: null, para: 'Rua F05' },
    descricao: { de: null, para: 'olhar o mezanino' },
  }, NOMES, AGORA);
  assert.deepEqual(linhas, [
    'Tipo: Auditorias → Posições vazias',
    'Cliente: ABBOTT → cliente 9',
    'Local: vazio → “Rua F05”',
    'Prazo: hoje 17h30 → amanhã 17h30',
    'Observações mudaram',
  ]);
});

test('eventos em ordem do mais antigo', () => {
  const lista = [ev(3, 'concluida', '2026-11-25T14:00:00Z'), ev(1, 'criada', '2026-11-25T12:00:00Z'), ev(2, 'iniciada', '2026-11-25T12:00:00Z')];
  assert.deepEqual(ordenarEventos(lista).map((e) => e.id), [1, 2, 3]);
});

test('tempo bloqueado soma os trechos dentro do período', () => {
  const eventos = [
    ev(1, 'bloqueada', '2026-11-25T12:00:00Z'),    // antes do início: conta só a partir de 12h30
    ev(2, 'desbloqueada', '2026-11-25T12:45:00Z'),
    ev(3, 'bloqueada', '2026-11-25T13:00:00Z'),
    ev(4, 'desbloqueada', '2026-11-25T13:20:00Z'),
  ];
  assert.equal(tempoBloqueado(eventos, '2026-11-25T12:30:00Z', '2026-11-25T14:00:00Z'), 35 * 60_000);
  // bloqueio ainda aberto conta até o fim
  assert.equal(tempoBloqueado([ev(1, 'bloqueada', '2026-11-25T14:30:00Z')], '2026-11-25T12:00:00Z', AGORA), 30 * 60_000);
});

test('duração da concluída, com o tempo bloqueado', () => {
  const tarefa = { status: 'concluida', iniciada_em: '2026-11-25T12:12:00Z', concluida_em: '2026-11-25T13:32:00Z' };
  const eventos = [ev(1, 'bloqueada', '2026-11-25T12:40:00Z'), ev(2, 'desbloqueada', '2026-11-25T13:00:00Z')];
  assert.deepEqual(duracaoDaTarefa(tarefa, eventos, AGORA), {
    situacao: 'concluida', texto: 'Levou 1h 20min', detalhe: 'hoje 09h12 → hoje 10h32 (20 min bloqueada)',
  });
});

test('duração em andamento e sem início', () => {
  const r = duracaoDaTarefa({ status: 'em_andamento', iniciada_em: '2026-11-25T14:15:00Z' }, [], AGORA);
  assert.deepEqual(r, { situacao: 'andamento', texto: 'Em andamento há 45 min', detalhe: 'desde 11h15' });
  assert.equal(duracaoDaTarefa({ status: 'a_fazer', iniciada_em: null }, [], AGORA), null);
  assert.equal(duracaoDaTarefa({ status: 'bloqueada', iniciada_em: '2026-11-25T14:00:00Z' }, [ev(1, 'bloqueada', '2026-11-25T14:30:00Z')], AGORA).detalhe,
    'desde 11h00 (30 min bloqueada)');
});

test('quando foi', () => {
  assert.equal(quandoFoi('2026-11-24T19:40:00Z', AGORA), 'ontem 16h40');
});
