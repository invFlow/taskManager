// Datas e horas no fuso de Brasília (puro, testado em tests/logica/datas.test.js).
// O Brasil não tem horário de verão desde 2019: Brasília = UTC-3 fixo.
// Tudo recebe e devolve Date (instantes); "dia" é o dia do calendário em Brasília.

export const FUSO_MINUTOS = -180;
const MS_MIN = 60_000;
const MS_DIA = 86_400_000;
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Hora de prazo padrão de uma demanda (hoje 17h30). */
export const HORA_PRAZO_PADRAO = '17:30';

function paraLocal(data) {
  return new Date(new Date(data).getTime() + FUSO_MINUTOS * MS_MIN);
}

function doLocal(local) {
  return new Date(local.getTime() - FUSO_MINUTOS * MS_MIN);
}

const dois = (n) => String(n).padStart(2, '0');

/** Partes do calendário em Brasília: { ano, mes (1-12), dia, hora, minuto, diaSemana (0 = domingo) }. */
export function partesBrasilia(data) {
  const l = paraLocal(data);
  return {
    ano: l.getUTCFullYear(), mes: l.getUTCMonth() + 1, dia: l.getUTCDate(),
    hora: l.getUTCHours(), minuto: l.getUTCMinutes(), diaSemana: l.getUTCDay(),
  };
}

/** Instante da meia-noite (em Brasília) do dia de "data". */
export function inicioDoDia(data) {
  const l = paraLocal(data);
  return doLocal(new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate())));
}

/** Soma dias de calendário (sem horário de verão, é só somar 24h). */
export function somarDias(data, dias) {
  return new Date(new Date(data).getTime() + dias * MS_DIA);
}

/** Diferença em dias de calendário: 0 = mesmo dia, 1 = amanhã, -1 = ontem. */
export function diasEntre(de, ate) {
  return Math.round((inicioDoDia(ate).getTime() - inicioDoDia(de).getTime()) / MS_DIA);
}

/** "2026-11-25" do dia em Brasília (para <input type="date">). */
export function textoData(data) {
  const p = partesBrasilia(data);
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`;
}

/** "17:30" em Brasília (para <input type="time">). */
export function textoHora(data) {
  const p = partesBrasilia(data);
  return `${dois(p.hora)}:${dois(p.minuto)}`;
}

/** Junta "2026-11-25" e "17:30" (horário de Brasília) num instante. Devolve null se inválido. */
export function juntarDataHora(textoDia, textoHorario) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(textoDia ?? '').trim());
  const h = /^(\d{1,2}):(\d{2})/.exec(String(textoHorario ?? '').trim());
  if (!d || !h) return null;
  const [ano, mes, dia, hora, minuto] = [+d[1], +d[2], +d[3], +h[1], +h[2]];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  const local = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto));
  if (local.getUTCDate() !== dia) return null; // 31/02 etc.
  return doLocal(local);
}

/**
 * Prazo padrão de uma demanda: hoje 17h30. Se já passou das 17h30,
 * amanhã 17h30 (para não nascer atrasada).
 */
export function prazoPadraoDemanda(agora = new Date()) {
  const hoje = juntarDataHora(textoData(agora), HORA_PRAZO_PADRAO);
  return hoje.getTime() > new Date(agora).getTime() ? hoje : somarDias(hoje, 1);
}

/** "09h12" */
export function formatarHora(data) {
  const p = partesBrasilia(data);
  return `${dois(p.hora)}h${dois(p.minuto)}`;
}

/** "25/11" */
export function formatarDiaMes(data) {
  const p = partesBrasilia(data);
  return `${dois(p.dia)}/${dois(p.mes)}`;
}

/**
 * Dia relativo, curto: "hoje", "amanhã", "ontem", "qua 27/11" (até 6 dias
 * à frente), senão "27/11" (ou "27/11/2027" em outro ano).
 */
export function formatarDia(data, agora = new Date()) {
  const n = diasEntre(agora, data);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  const p = partesBrasilia(data);
  if (n > 1 && n < 7) return `${DIAS_SEMANA[p.diaSemana]} ${formatarDiaMes(data)}`;
  if (p.ano !== partesBrasilia(agora).ano) return `${formatarDiaMes(data)}/${p.ano}`;
  return formatarDiaMes(data);
}

/** "hoje 17h30", "amanhã 09h00", "qua 27/11 17h30" */
export function formatarPrazo(prazo, agora = new Date()) {
  return `${formatarDia(prazo, agora)} ${formatarHora(prazo)}`;
}

/** "desde 09h12" (ou "desde ontem 16h40" quando começou em outro dia). */
export function formatarDesde(inicio, agora = new Date()) {
  const dia = diasEntre(inicio, agora) === 0 ? '' : formatarDia(inicio, agora) + ' ';
  return `desde ${dia}${formatarHora(inicio)}`;
}

/** Duração legível: "45 min", "1h 20min", "2h", "3 dias 4h". */
export function formatarDuracao(inicio, fim) {
  const min = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / MS_MIN));
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  if (horas < 24) return resto ? `${horas}h ${resto}min` : `${horas}h`;
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  return `${dias} dia${dias === 1 ? '' : 's'}${h ? ` ${h}h` : ''}`;
}
