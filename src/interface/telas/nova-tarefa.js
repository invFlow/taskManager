// Janela "Nova tarefa" (e "Editar tarefa"). Pensada para ser rápida:
// Tipo, Cliente e Prazo (já vem hoje 17h30); responsável já é você.
// Local, assunto do e-mail e descrição ficam em "Mais detalhes".
import { el, ocupado } from '../componentes/el.js';
import { abrirModal } from '../componentes/modal.js';
import { mostrarAviso } from '../componentes/aviso-toast.js';
import { buscaComCriar } from '../componentes/busca-com-criar.js';
import { listarCatalogo, criarNoCatalogo } from '../../dados/catalogos.js';
import { listarPessoas } from '../../dados/pessoas.js';
import { criarTarefa, editarTarefa, avisarQueTarefasMudaram } from '../../dados/tarefas.js';
import { validarNovaTarefa, LIMITES } from '../../logica/tarefas.js';
import { prazoPadraoDemanda, formatarPrazo, textoData, textoHora, juntarDataHora, HORA_PRAZO_PADRAO } from '../../logica/datas.js';
import { traduzirErro, iniciais } from '../../logica/conta.js';

let pessoasCache = null;

/**
 * Abre a janela. perfil: quem está usando. tarefa: linha de tarefas_lista para editar (opcional).
 * Devolve uma Promise com a tarefa salva (ou null se fechou sem salvar).
 */
export function abrirNovaTarefa({ perfil, tarefa = null }) {
  return new Promise((resolver) => {
    const editando = Boolean(tarefa);
    const gestor = perfil.papel === 'gestor';
    let origem = tarefa?.origem ?? 'demanda';
    let salva = null;
    let responsaveis = new Set(tarefa?.responsaveis_ids ?? [perfil.id]);
    let pessoas = pessoasCache ?? (tarefa?.responsaveis ?? []).concat([{ id: perfil.id, nome: perfil.nome }]);

    // --- Demanda / Programada
    const abaDemanda = el('button', { class: 'segmento', type: 'button', role: 'tab' }, 'Demanda');
    const abaProgramada = el('button', { class: 'segmento', type: 'button', role: 'tab' }, 'Programada');
    const abas = el('div', { class: 'segmentos', role: 'tablist', 'aria-label': 'Origem da tarefa', hidden: editando }, abaDemanda, abaProgramada);
    const explicacao = el('p', { class: 'texto-suave sem-margem explicacao-origem' });

    // --- Tipo e Cliente (busca com criar)
    const erroTipo = el('p', { class: 'erro-campo', hidden: true });
    const erroCliente = el('p', { class: 'erro-campo', hidden: true });
    const tipo = buscaComCriar({
      rotulo: 'Tipo', placeholder: 'Ex.: Auditorias', nomeDoItem: 'tipo',
      valor: tarefa ? { id: tarefa.tipo_id, nome: tarefa.tipo_nome, ativo: true } : null,
      carregar: async () => (await listarCatalogo('tipos')),
      criar: (nome) => criarNoCatalogo('tipos', nome),
      aoEscolher(item, { criado }) {
        erroTipo.hidden = true;
        if (criado) mostrarAviso(`Tipo “${item.nome}” criado.`);
        if (!cliente.valor()) cliente.focar(); else botaoCriar.focus();
      },
    });
    const cliente = buscaComCriar({
      rotulo: 'Cliente', placeholder: 'Ex.: ABBOTT', nomeDoItem: 'cliente',
      valor: tarefa ? { id: tarefa.cliente_id, nome: tarefa.cliente_nome, ativo: true } : null,
      carregar: async () => (await listarCatalogo('clientes')),
      criar: (nome) => criarNoCatalogo('clientes', nome),
      aoEscolher(item, { criado }) {
        erroCliente.hidden = true;
        if (criado) mostrarAviso(`Cliente “${item.nome}” criado.`);
        if (origem === 'programada' && !data.value) data.focus(); else botaoCriar.focus();
      },
    });
    tipo.elemento.append(erroTipo);
    cliente.elemento.append(erroCliente);

    // --- Prazo
    const prazoInicial = tarefa ? new Date(tarefa.prazo) : prazoPadraoDemanda();
    const data = el('input', { type: 'date', id: 'nt-data', value: tarefa || origem === 'demanda' ? textoData(prazoInicial) : '', min: editando ? null : textoData(new Date()) });
    const hora = el('input', { type: 'time', id: 'nt-hora', value: textoHora(prazoInicial), step: '300' });
    const erroPrazo = el('p', { class: 'erro-campo', hidden: true });
    const resumoPrazo = el('span', { class: 'prazo-resumo' });
    const mudarPrazo = el('button', { class: 'link', type: 'button' }, 'mudar');
    const linhaResumo = el('p', { class: 'prazo-linha' }, el('span', { class: 'rotulo' }, 'Prazo: '), resumoPrazo, ' ', mudarPrazo);
    const camposPrazo = el('div', { class: 'prazo-campos' },
      el('div', { class: 'campo' }, el('label', { for: 'nt-data' }, 'Dia'), data),
      el('div', { class: 'campo' }, el('label', { for: 'nt-hora' }, 'Hora'), hora),
    );
    let prazoAberto = editando;
    mudarPrazo.addEventListener('click', () => { prazoAberto = true; desenharPrazo(); data.focus(); });
    for (const c of [data, hora]) c.addEventListener('input', () => { erroPrazo.hidden = true; desenharPrazo(); });
    const blocoPrazo = el('div', { class: 'bloco-prazo' }, linhaResumo, camposPrazo, erroPrazo);

    function desenharPrazo() {
      const mostrarCampos = prazoAberto || origem === 'programada';
      camposPrazo.hidden = !mostrarCampos;
      linhaResumo.hidden = mostrarCampos;
      const p = juntarDataHora(data.value, hora.value);
      resumoPrazo.textContent = p ? formatarPrazo(p) : 'sem prazo';
    }

    // --- Responsáveis
    const erroResp = el('p', { class: 'erro-campo', hidden: true });
    const resumoResp = el('span', { class: 'resp-resumo' });
    const mostrarPessoas = el('button', { class: 'link', type: 'button' }, gestor ? 'escolher pessoas' : 'incluir colegas');
    const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Responsáveis', hidden: true });
    let chipsAbertos = editando && (responsaveis.size > 1 || !responsaveis.has(perfil.id));
    mostrarPessoas.addEventListener('click', async () => { chipsAbertos = true; await carregarPessoas(); desenharResp(); chips.querySelector('button')?.focus(); });
    const blocoResp = el('div', { class: 'bloco-resp' },
      el('p', { class: 'prazo-linha' }, el('span', { class: 'rotulo' }, 'Responsáveis: '), resumoResp, ' ', mostrarPessoas),
      chips, erroResp,
    );

    async function carregarPessoas() {
      if (pessoasCache) { pessoas = pessoasCache; return; }
      try {
        pessoasCache = (await listarPessoas()).filter((p) => p.ativo);
        pessoas = pessoasCache;
      } catch (e) {
        mostrarAviso(traduzirErro(e), { tipo: 'erro' });
      }
    }

    function nomeDe(id) {
      if (id === perfil.id) return 'Você';
      return pessoas.find((p) => p.id === id)?.nome ?? '...';
    }

    function desenharResp() {
      const ids = [...responsaveis];
      resumoResp.textContent = ids.length ? ids.map(nomeDe).sort((a, b) => (a === 'Você' ? -1 : b === 'Você' ? 1 : a.localeCompare(b, 'pt-BR'))).join(', ') : 'ninguém';
      mostrarPessoas.hidden = chipsAbertos;
      chips.hidden = !chipsAbertos;
      if (!chipsAbertos) return;
      const lista = [...pessoas].sort((a, b) => (a.id === perfil.id ? -1 : b.id === perfil.id ? 1 : a.nome.localeCompare(b.nome, 'pt-BR')));
      chips.replaceChildren(...lista.map((p) => {
        const marcado = responsaveis.has(p.id);
        const travado = p.id === perfil.id && !gestor; // colaborador fica sempre entre os responsáveis
        const chip = el('button', {
          class: 'chip' + (marcado ? ' marcado' : ''), type: 'button', 'aria-pressed': marcado ? 'true' : 'false',
          disabled: travado, title: travado ? 'Quem cria a tarefa fica entre os responsáveis' : null,
        }, el('span', { class: 'avatar avatar-mini', 'aria-hidden': 'true' }, iniciais(p.nome)), p.id === perfil.id ? `${p.nome} (você)` : p.nome);
        chip.addEventListener('click', () => {
          if (responsaveis.has(p.id)) responsaveis.delete(p.id); else responsaveis.add(p.id);
          erroResp.hidden = true;
          desenharResp();
          chips.querySelector(`[data-id="${p.id}"]`)?.focus();
        });
        chip.dataset.id = p.id;
        return chip;
      }));
      atualizarBotoes();
    }

    // --- Mais detalhes
    const local = el('input', { type: 'text', id: 'nt-local', maxlength: String(LIMITES.local), value: tarefa?.local ?? '', placeholder: 'Ex.: Rua F05, mezanino' });
    const assunto = el('input', { type: 'text', id: 'nt-assunto', maxlength: String(LIMITES.email_assunto), value: tarefa?.email_assunto ?? '', placeholder: 'Se a demanda chegou por e-mail' });
    const descricao = el('textarea', { id: 'nt-descricao', rows: '3', maxlength: String(LIMITES.descricao), placeholder: 'Observações para quem vai fazer' });
    descricao.value = tarefa?.descricao ?? '';
    const detalhes = el('details', { class: 'mais-detalhes', open: Boolean(tarefa?.local || tarefa?.email_assunto || tarefa?.descricao) },
      el('summary', {}, 'Mais detalhes (local, assunto do e-mail, observações)'),
      el('div', { class: 'formulario' },
        el('div', { class: 'campo' }, el('label', { for: 'nt-local' }, 'Local ', el('small', { class: 'ajuda inline' }, '(opcional)')), local),
        el('div', { class: 'campo' }, el('label', { for: 'nt-assunto' }, 'Assunto do e-mail ', el('small', { class: 'ajuda inline' }, '(opcional)')), assunto),
        el('div', { class: 'campo' }, el('label', { for: 'nt-descricao' }, 'Observações ', el('small', { class: 'ajuda inline' }, '(opcional)')), descricao),
      ),
    );

    // --- Botões
    const erroGeral = el('p', { class: 'erro', role: 'alert', hidden: true });
    const botaoCriar = el('button', { class: 'botao botao-primario', type: 'submit' }, editando ? 'Salvar' : 'Criar');
    const botaoIniciar = el('button', { class: 'botao botao-sucesso', type: 'button' }, 'Criar e iniciar agora');
    const botaoVoltar = el('button', { class: 'botao', type: 'button' }, 'Cancelar');
    const linhaBotoes = el('div', { class: 'linha-botoes modal-botoes' }, botaoCriar, botaoIniciar, botaoVoltar);

    const form = el('form', { class: 'formulario form-tarefa', novalidate: true },
      abas, explicacao, tipo.elemento, cliente.elemento, blocoPrazo, blocoResp, detalhes, erroGeral, linhaBotoes,
    );

    function atualizarBotoes() {
      botaoIniciar.hidden = editando || origem !== 'demanda' || !responsaveis.has(perfil.id);
    }

    function trocarOrigem(nova) {
      origem = nova;
      abaDemanda.setAttribute('aria-selected', String(origem === 'demanda'));
      abaProgramada.setAttribute('aria-selected', String(origem === 'programada'));
      explicacao.textContent = origem === 'demanda'
        ? 'Para fazer hoje ou logo: o prazo já vem preenchido.'
        : 'Tem dia marcado: escolha o dia e a hora. Os lembretes antes do dia chegam numa próxima versão.';
      if (!editando) {
        if (origem === 'programada' && data.value === textoData(prazoPadraoDemanda()) && !prazoAberto) data.value = '';
        if (origem === 'demanda' && !data.value) { const p = prazoPadraoDemanda(); data.value = textoData(p); hora.value = textoHora(p); }
      }
      desenharPrazo();
      atualizarBotoes();
    }
    abaDemanda.addEventListener('click', () => trocarOrigem('demanda'));
    abaProgramada.addEventListener('click', () => trocarOrigem('programada'));

    async function salvar(iniciar) {
      for (const e of [erroTipo, erroCliente, erroPrazo, erroResp, erroGeral]) e.hidden = true;
      const r = validarNovaTarefa({
        origem, tipo: tipo.valor(), cliente: cliente.valor(),
        data: data.value, hora: hora.value || HORA_PRAZO_PADRAO,
        responsaveis: [...responsaveis], local: local.value, email_assunto: assunto.value, descricao: descricao.value,
      }, { perfil });
      if (!r.ok) {
        const mostra = (p, msg) => { if (msg) { p.textContent = msg; p.hidden = false; } };
        mostra(erroTipo, r.erros.tipo);
        mostra(erroCliente, r.erros.cliente);
        if (r.erros.prazo) { prazoAberto = true; desenharPrazo(); }
        mostra(erroPrazo, r.erros.prazo);
        mostra(erroResp, r.erros.responsaveis);
        const longo = r.erros.local || r.erros.email_assunto || r.erros.descricao;
        if (longo) { detalhes.open = true; mostra(erroGeral, `Texto longo demais: ${longo}`); }
        if (r.erros.tipo) tipo.focar();
        else if (r.erros.cliente) cliente.focar();
        else if (r.erros.prazo) data.focus();
        return;
      }
      const botao = iniciar ? botaoIniciar : botaoCriar;
      ocupado(botao, true, 'Salvando...');
      try {
        salva = editando ? await editarTarefa(tarefa.id, r.valores) : await criarTarefa(r.valores, { iniciar });
        const paraOutros = !r.valores.responsaveis.includes(perfil.id);
        mostrarAviso(editando ? 'Tarefa salva.'
          : iniciar ? 'Tarefa criada e iniciada.'
          : paraOutros ? `Tarefa criada para ${r.valores.responsaveis.map(nomeDe).join(', ')}.` : 'Tarefa criada.');
        avisarQueTarefasMudaram(salva);
        modal.fechar();
      } catch (e) {
        console.error(e);
        erroGeral.textContent = traduzirErro(e);
        erroGeral.hidden = false;
        ocupado(botao, false);
      }
    }

    form.addEventListener('submit', (ev) => { ev.preventDefault(); salvar(false); });
    botaoIniciar.addEventListener('click', () => salvar(true));
    botaoVoltar.addEventListener('click', () => modal.fechar());

    const modal = abrirModal({
      titulo: editando ? 'Editar tarefa' : 'Nova tarefa',
      conteudo: form,
      classe: 'modal-tarefa',
      aoFechar: () => resolver(salva),
    });

    trocarOrigem(origem);
    desenharResp();
    if (editando || pessoasCache == null) carregarPessoas().then(desenharResp);
    (editando ? botaoCriar : tipo.input).focus();
  });
}
