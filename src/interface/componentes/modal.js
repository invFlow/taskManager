// Janela por cima da tela (<dialog>). Em telas estreitas ocupa a tela toda.
// const m = abrirModal({ titulo: 'Nova tarefa', conteudo: form, aoFechar });  m.fechar();
import { el } from './el.js';

let contador = 0;

export function abrirModal({ titulo, conteudo, aoFechar, classe = '', larguraPequena = false }) {
  const idTitulo = `modal-titulo-${++contador}`;
  const fecharBotao = el('button', { class: 'botao botao-icone modal-fechar', type: 'button', 'aria-label': 'Fechar' }, '✕');
  const corpo = el('div', { class: 'modal-corpo' }, conteudo);
  const dialogo = el('dialog', {
    class: `modal ${larguraPequena ? 'modal-pequeno' : ''} ${classe}`.trim(),
    'aria-labelledby': idTitulo,
  },
    el('header', { class: 'modal-topo' }, el('h2', { id: idTitulo }, titulo), fecharBotao),
    corpo,
  );

  let fechado = false;
  function fechar(resultado) {
    if (fechado) return;
    fechado = true;
    if (dialogo.open) dialogo.close();
    dialogo.remove();
    aoFechar?.(resultado);
  }

  fecharBotao.addEventListener('click', () => fechar());
  dialogo.addEventListener('cancel', (ev) => { ev.preventDefault(); fechar(); });
  // Clique no fundo escuro fecha (só se começou e terminou fora da caixa)
  let comecouFora = false;
  dialogo.addEventListener('mousedown', (ev) => { comecouFora = ev.target === dialogo; });
  dialogo.addEventListener('click', (ev) => { if (comecouFora && ev.target === dialogo) fechar(); });

  document.body.append(dialogo);
  dialogo.showModal();
  return { dialogo, corpo, fechar };
}

/**
 * Pergunta curta com Sim/Não ou com um texto (motivo).
 * Devolve uma Promise: true/false, ou o texto digitado (null se cancelou).
 */
export function perguntar({ titulo, mensagem, confirmar = 'Confirmar', cancelar = 'Voltar', perigo = false, pedirTexto = null }) {
  return new Promise((resolver) => {
    const campoTexto = pedirTexto
      ? el('textarea', { rows: '3', maxlength: String(pedirTexto.maximo ?? 300), placeholder: pedirTexto.placeholder ?? '', 'aria-label': pedirTexto.rotulo ?? titulo, required: true })
      : null;
    const erro = el('p', { class: 'erro', role: 'alert', hidden: true });
    const ok = el('button', { class: `botao ${perigo ? 'botao-perigo' : 'botao-primario'}`, type: 'submit' }, confirmar);
    const voltar = el('button', { class: 'botao', type: 'button' }, cancelar);
    const form = el('form', { class: 'formulario', novalidate: true },
      mensagem ? el('p', { class: 'texto-suave sem-margem' }, mensagem) : null,
      campoTexto ? el('div', { class: 'campo' }, el('label', {}, pedirTexto.rotulo ?? 'Motivo'), campoTexto) : null,
      erro,
      el('div', { class: 'linha-botoes modal-botoes' }, ok, voltar),
    );
    if (campoTexto) campoTexto.previousSibling.htmlFor = campoTexto.id = `perg-${++contador}`;

    let resposta = pedirTexto ? null : false;
    const m = abrirModal({ titulo, conteudo: form, larguraPequena: true, aoFechar: () => resolver(resposta) });
    voltar.addEventListener('click', () => m.fechar());
    campoTexto?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (campoTexto) {
        const texto = campoTexto.value.replace(/\s+/g, ' ').trim();
        if (!texto) {
          erro.textContent = pedirTexto.obrigatorio ?? 'Escreva o motivo.';
          erro.hidden = false;
          campoTexto.focus();
          return;
        }
        resposta = texto;
      } else {
        resposta = true;
      }
      m.fechar();
    });
    (campoTexto ?? ok).focus();
  });
}
