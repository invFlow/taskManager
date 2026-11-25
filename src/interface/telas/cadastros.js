// Cadastros do gestor. Nesta etapa só a aba Pessoas; Tipos e Clientes chegam na etapa 3.
import { el } from '../componentes/el.js';
import { mostrarAviso } from '../componentes/aviso-toast.js';
import { listarPessoas, atualizarPessoa } from '../../dados/pessoas.js';
import { traduzirErro, iniciais } from '../../logica/conta.js';

/** contexto: { perfil, aoAtualizarPerfil } */
export function telaCadastros(alvo, contexto) {
  const lista = el('div', { class: 'lista-pessoas', 'aria-live': 'polite' }, el('p', { class: 'texto-suave' }, 'Carregando pessoas...'));

  alvo.replaceChildren(
    el('h1', {}, 'Cadastros'),
    el('p', { class: 'texto-suave' }, 'Pessoas do time. Tipos, clientes, grupos de e-mail e horários chegam nas próximas etapas.'),
    el('nav', { class: 'abas', 'aria-label': 'Cadastros' },
      el('span', { class: 'aba', 'aria-current': 'page' }, 'Pessoas'),
      el('span', { class: 'aba desligada', title: 'Etapa 3' }, 'Tipos e clientes'),
    ),
    el('section', { class: 'cartao' },
      el('div', { class: 'cabecalho-secao' }, el('h2', {}, 'Pessoas'), el('details', { class: 'como-adicionar' },
        el('summary', {}, 'Como adicionar alguém'),
        el('ol', {},
          el('li', {}, 'No painel do Supabase, abra Authentication > Users > Add user > Create new user.'),
          el('li', {}, 'Digite o e-mail da pessoa e uma senha temporária. Deixe marcado "Auto Confirm User".'),
          el('li', {}, 'Passe a senha temporária para a pessoa. No primeiro acesso o InvFlow pede para ela criar a própria senha.'),
          el('li', {}, 'Ela aparece aqui como Colaborador. Mude para Gestor se precisar.'),
        ),
      )),
      lista,
    ),
  );

  carregar();

  async function carregar() {
    try {
      const pessoas = await listarPessoas();
      lista.replaceChildren(...(pessoas.length ? pessoas.map(linha) : [el('p', { class: 'texto-suave' }, 'Nenhuma pessoa cadastrada ainda.')]));
    } catch (e) {
      lista.replaceChildren(el('p', { class: 'erro' }, traduzirErro(e)), el('button', { class: 'botao', type: 'button', onclick: carregar }, 'Tentar de novo'));
    }
  }

  function linha(p) {
    const souEu = p.id === contexto.perfil.id;
    const papel = el('select', { 'aria-label': `Papel de ${p.nome}` },
      el('option', { value: 'colaborador' }, 'Colaborador'),
      el('option', { value: 'gestor' }, 'Gestor'));
    papel.value = p.papel;
    const ativo = el('input', { type: 'checkbox', checked: p.ativo, 'aria-label': `${p.nome} ativo` });
    const recebe = el('input', { type: 'checkbox', checked: p.recebe_email, 'aria-label': `${p.nome} recebe e-mail` });

    const item = el('article', { class: 'pessoa' + (p.ativo ? '' : ' inativa') },
      el('span', { class: 'avatar', 'aria-hidden': 'true' }, iniciais(p.nome)),
      el('div', { class: 'pessoa-nome' },
        el('strong', {}, p.nome, souEu ? el('span', { class: 'selo selo-pequeno' }, 'você') : null),
        el('span', { class: 'texto-suave' }, p.email),
        p.trocar_senha ? el('small', { class: 'pendente' }, 'Ainda não criou a própria senha') : null),
      el('label', { class: 'pessoa-campo' }, el('span', {}, 'Papel'), papel),
      el('label', { class: 'pessoa-campo opcao' }, ativo, el('span', {}, 'Ativo')),
      el('label', { class: 'pessoa-campo opcao' }, recebe, el('span', {}, 'Recebe e-mail')),
    );

    async function salvar(campos, desfazer) {
      for (const c of [papel, ativo, recebe]) c.disabled = true;
      try {
        const novo = await atualizarPessoa(p.id, campos);
        Object.assign(p, novo);
        item.classList.toggle('inativa', !novo.ativo);
        mostrarAviso(`${novo.nome}: salvo.`);
        if (souEu) contexto.aoAtualizarPerfil?.(novo);
      } catch (e) {
        desfazer();
        mostrarAviso(traduzirErro(e), { tipo: 'erro', duracao: 5000 });
      } finally {
        for (const c of [papel, ativo, recebe]) c.disabled = false;
      }
    }

    papel.addEventListener('change', () => {
      if (souEu && papel.value !== 'gestor' && !confirm('Você vai deixar de ser gestor e perder acesso a esta tela. Continuar?')) {
        papel.value = p.papel;
        return;
      }
      salvar({ papel: papel.value }, () => { papel.value = p.papel; });
    });
    ativo.addEventListener('change', () => salvar({ ativo: ativo.checked }, () => { ativo.checked = p.ativo; }));
    recebe.addEventListener('change', () => salvar({ recebe_email: recebe.checked }, () => { recebe.checked = p.recebe_email; }));
    return item;
  }
}
