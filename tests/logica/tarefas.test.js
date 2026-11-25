import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tituloDaTarefa, validarNovaTarefa, agruparMinhas, resumoMinhas } from '../../src/logica/tarefas.js';

const AGORA = new Date('2026-11-25T13:00:00Z'); // quarta, 10h00 em Brasília
const ANA = { id: 'ana', papel: 'colaborador', ativo: true };
const GESTOR = { id: 'gestor', papel: 'gestor', ativo: true };
const TIPO = { id: 1, nome: 'Auditorias', ativo: true };
const CLIENTE = { id: 2, nome: 'ABBOTT', ativo: true };

test('título junta tipo, cliente e local', () => {
  assert.equal(tituloDaTarefa({ tipo_nome: 'Auditorias', cliente_nome: 'ABBOTT', local: 'Rua F05' }), 'Auditorias · ABBOTT · Rua F05');
  assert.equal(tituloDaTarefa({ tipo_nome: 'Auditorias', cliente_nome: 'ABBOTT', local: null }), 'Auditorias · ABBOTT');
});

test('demanda em 3 campos: tipo, cliente e prazo (responsável = eu)', () => {
  const r = validarNovaTarefa({ tipo: TIPO, cliente: CLIENTE, prazo: new Date('2026-11-25T20:30:00Z'), responsaveis: ['ana'] }, { perfil: ANA, agora: AGORA });
  assert.ok(r.ok);
  assert.equal(r.valores.origem, 'demanda');
  assert.equal(r.valores.tipo_id, 1);
  assert.equal(r.valores.cliente_id, 2);
  assert.equal(r.valores.local, null);
  assert.deepEqual(r.valores.responsaveis, ['ana']);
});

test('campos que faltam viram mensagens', () => {
  const r = validarNovaTarefa({ responsaveis: [] }, { perfil: ANA, agora: AGORA });
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.erros).sort(), ['cliente', 'prazo', 'responsaveis', 'tipo']);
});

test('colaborador precisa estar entre os responsáveis; gestor não', () => {
  const dados = { tipo: TIPO, cliente: CLIENTE, prazo: new Date('2026-11-25T20:30:00Z'), responsaveis: ['bia'] };
  assert.ok(validarNovaTarefa(dados, { perfil: ANA, agora: AGORA }).erros.responsaveis);
  assert.ok(validarNovaTarefa(dados, { perfil: GESTOR, agora: AGORA }).ok);
});

test('programada usa data e hora e não aceita dia passado', () => {
  const base = { origem: 'programada', tipo: TIPO, cliente: CLIENTE, responsaveis: ['ana'] };
  const ok = validarNovaTarefa({ ...base, data: '2026-11-28', hora: '08:00' }, { perfil: ANA, agora: AGORA });
  assert.ok(ok.ok);
  assert.equal(ok.valores.prazo.toISOString(), '2026-11-28T11:00:00.000Z');
  assert.ok(validarNovaTarefa({ ...base, data: '2026-11-24', hora: '08:00' }, { perfil: ANA, agora: AGORA }).erros.prazo);
  assert.ok(validarNovaTarefa({ ...base, data: '2026-11-25', hora: '08:00' }, { perfil: ANA, agora: AGORA }).ok); // hoje mais cedo: ok
  assert.ok(validarNovaTarefa({ ...base, data: '', hora: '08:00' }, { perfil: ANA, agora: AGORA }).erros.prazo);
});

test('arquivado e textos longos são recusados; textos são limpos', () => {
  const base = { tipo: TIPO, cliente: CLIENTE, prazo: AGORA, responsaveis: ['ana', 'ana'] };
  assert.ok(validarNovaTarefa({ ...base, cliente: { ...CLIENTE, ativo: false } }, { perfil: ANA }).erros.cliente);
  assert.ok(validarNovaTarefa({ ...base, local: 'x'.repeat(121) }, { perfil: ANA }).erros.local);
  const r = validarNovaTarefa({ ...base, local: '  Rua   F05 ', email_assunto: '  ', descricao: ' linha 1\nlinha 2 ' }, { perfil: ANA });
  assert.equal(r.valores.local, 'Rua F05');
  assert.equal(r.valores.email_assunto, null);
  assert.equal(r.valores.descricao, 'linha 1\nlinha 2');
  assert.deepEqual(r.valores.responsaveis, ['ana']);
});

test('Minhas tarefas: agora, hoje (atrasadas primeiro), próximos, adiante, concluídas hoje', () => {
  const t = (id, status, prazo, extra = {}) => ({ id, status, prazo, ...extra });
  const tarefas = [
    t(1, 'em_andamento', '2026-11-25T20:30:00Z', { iniciada_em: '2026-11-25T12:00:00Z' }),
    t(2, 'a_fazer', '2026-11-25T20:30:00Z'),                 // hoje 17h30
    t(3, 'a_fazer', '2026-11-24T20:30:00Z'),                 // ontem: atrasada
    t(4, 'bloqueada', '2026-11-25T11:00:00Z'),               // hoje 08h00: atrasada
    t(5, 'a_fazer', '2026-11-27T11:00:00Z'),                 // sexta
    t(6, 'a_fazer', '2026-12-20T11:00:00Z'),                 // daqui a um mês
    t(7, 'concluida', '2026-11-25T20:30:00Z', { concluida_em: '2026-11-25T12:30:00Z' }),
    t(8, 'concluida', '2026-11-24T20:30:00Z', { concluida_em: '2026-11-24T20:00:00Z' }), // ontem: some
    t(9, 'cancelada', '2026-11-25T20:30:00Z'),
  ];
  const g = agruparMinhas(tarefas, AGORA);
  assert.deepEqual(g.agora.map((x) => x.id), [1]);
  assert.deepEqual(g.hoje.map((x) => x.id), [3, 4, 2]);
  assert.deepEqual(g.proximos.map((x) => x.id), [5]);
  assert.deepEqual(g.adiante.map((x) => x.id), [6]);
  assert.deepEqual(g.concluidasHoje.map((x) => x.id), [7]);
  assert.equal(resumoMinhas(g, AGORA), '1 em andamento · 3 para hoje (2 atrasadas) · 1 nos próximos dias');
  assert.equal(resumoMinhas(agruparMinhas([], AGORA), AGORA), 'Nada pendente com você.');
});
