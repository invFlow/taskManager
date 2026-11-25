import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  inicioDoDia, diasEntre, textoData, textoHora, juntarDataHora, prazoPadraoDemanda,
  formatarHora, formatarDia, formatarPrazo, formatarDesde, formatarDuracao, partesBrasilia,
} from '../../src/logica/datas.js';

// 25/11/2026 é uma quarta-feira. 13h00 UTC = 10h00 em Brasília.
const AGORA = new Date('2026-11-25T13:00:00Z');

test('Brasília é UTC-3: meia-noite local = 03h00 UTC', () => {
  assert.equal(inicioDoDia(AGORA).toISOString(), '2026-11-25T03:00:00.000Z');
  // 01h00 UTC do dia 26 ainda é dia 25 em Brasília (22h00)
  assert.equal(textoData(new Date('2026-11-26T01:00:00Z')), '2026-11-25');
  assert.equal(textoHora(new Date('2026-11-26T01:00:00Z')), '22:00');
  assert.equal(partesBrasilia(AGORA).diaSemana, 3);
});

test('juntarDataHora monta o instante e recusa datas inválidas', () => {
  assert.equal(juntarDataHora('2026-11-25', '17:30').toISOString(), '2026-11-25T20:30:00.000Z');
  assert.equal(juntarDataHora('2026-12-31', '23:59').toISOString(), '2027-01-01T02:59:00.000Z');
  assert.equal(juntarDataHora('2026-02-31', '10:00'), null);
  assert.equal(juntarDataHora('', '10:00'), null);
  assert.equal(juntarDataHora('2026-11-25', '25:00'), null);
  assert.equal(juntarDataHora('2026-11-25', ''), null);
});

test('diasEntre conta dias de calendário em Brasília', () => {
  assert.equal(diasEntre(AGORA, new Date('2026-11-26T02:59:00Z')), 0); // 23h59 de hoje
  assert.equal(diasEntre(AGORA, new Date('2026-11-26T03:00:00Z')), 1); // meia-noite de amanhã
  assert.equal(diasEntre(AGORA, new Date('2026-11-24T20:00:00Z')), -1);
});

test('prazo padrão da demanda: hoje 17h30, ou amanhã 17h30 depois desse horário', () => {
  assert.equal(prazoPadraoDemanda(AGORA).toISOString(), '2026-11-25T20:30:00.000Z');
  assert.equal(prazoPadraoDemanda(new Date('2026-11-25T20:29:00Z')).toISOString(), '2026-11-25T20:30:00.000Z');
  assert.equal(prazoPadraoDemanda(new Date('2026-11-25T20:30:00Z')).toISOString(), '2026-11-26T20:30:00.000Z');
  assert.equal(prazoPadraoDemanda(new Date('2026-11-26T01:00:00Z')).toISOString(), '2026-11-26T20:30:00.000Z');
});

test('formatação curta em português', () => {
  assert.equal(formatarHora(new Date('2026-11-25T12:12:00Z')), '09h12');
  assert.equal(formatarDia(new Date('2026-11-25T20:30:00Z'), AGORA), 'hoje');
  assert.equal(formatarDia(new Date('2026-11-26T20:30:00Z'), AGORA), 'amanhã');
  assert.equal(formatarDia(new Date('2026-11-24T20:30:00Z'), AGORA), 'ontem');
  assert.equal(formatarDia(new Date('2026-11-27T20:30:00Z'), AGORA), 'sex 27/11');
  assert.equal(formatarDia(new Date('2026-12-10T20:30:00Z'), AGORA), '10/12');
  assert.equal(formatarDia(new Date('2026-11-20T20:30:00Z'), AGORA), '20/11');
  assert.equal(formatarDia(new Date('2027-01-05T20:30:00Z'), AGORA), '05/01/2027');
  assert.equal(formatarPrazo(new Date('2026-11-25T20:30:00Z'), AGORA), 'hoje 17h30');
  assert.equal(formatarDesde(new Date('2026-11-25T12:12:00Z'), AGORA), 'desde 09h12');
  assert.equal(formatarDesde(new Date('2026-11-24T19:40:00Z'), AGORA), 'desde ontem 16h40');
});

test('duração', () => {
  const ini = new Date('2026-11-25T12:00:00Z');
  const mais = (min) => new Date(ini.getTime() + min * 60_000);
  assert.equal(formatarDuracao(ini, mais(0)), '0 min');
  assert.equal(formatarDuracao(ini, mais(45)), '45 min');
  assert.equal(formatarDuracao(ini, mais(80)), '1h 20min');
  assert.equal(formatarDuracao(ini, mais(120)), '2h');
  assert.equal(formatarDuracao(ini, mais(60 * 28)), '1 dia 4h');
  assert.equal(formatarDuracao(ini, mais(60 * 48)), '2 dias');
  assert.equal(formatarDuracao(mais(10), ini), '0 min');
});
