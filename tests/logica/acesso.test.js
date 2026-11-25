import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoDoApp, ehGestor, podeAbrir, rotasVisiveis, nomeDoPapel } from '../../src/logica/acesso.js';

const gestor = { papel: 'gestor', ativo: true, trocar_senha: false };
const colab = { papel: 'colaborador', ativo: true, trocar_senha: false };
const inativo = { papel: 'gestor', ativo: false, trocar_senha: false };

test('estado do app', () => {
  assert.equal(estadoDoApp({ sessao: null, perfil: gestor }), 'login');
  assert.equal(estadoDoApp({ sessao: {}, perfil: null }), 'sem_perfil');
  // a regra de leitura esconde a própria linha de quem foi desativado
  assert.equal(estadoDoApp({ sessao: {}, perfil: null, situacao: 'inativo' }), 'inativo');
  assert.equal(estadoDoApp({ sessao: {}, perfil: null, situacao: 'inativo', recuperandoSenha: true }), 'inativo');
  assert.equal(estadoDoApp({ sessao: {}, perfil: inativo }), 'inativo');
  assert.equal(estadoDoApp({ sessao: {}, perfil: { ...colab, trocar_senha: true } }), 'nova_senha');
  assert.equal(estadoDoApp({ sessao: {}, perfil: colab, recuperandoSenha: true }), 'nova_senha');
  assert.equal(estadoDoApp({ sessao: {}, perfil: colab }), 'app');
});

test('gestor inativo não é gestor', () => {
  assert.ok(ehGestor(gestor));
  assert.ok(!ehGestor(colab));
  assert.ok(!ehGestor(inativo));
  assert.ok(!ehGestor(null));
});

test('painel e cadastros só para gestor', () => {
  assert.ok(podeAbrir('painel', gestor));
  assert.ok(!podeAbrir('painel', colab));
  assert.ok(!podeAbrir('cadastros', colab));
  assert.ok(podeAbrir('minhas', colab));
  assert.ok(!podeAbrir('minhas', inativo));
  const rotas = [{ nome: 'minhas' }, { nome: 'painel' }, { nome: 'cadastros' }, { nome: 'perfil' }];
  assert.deepEqual(rotasVisiveis(rotas, colab).map((r) => r.nome), ['minhas', 'perfil']);
  assert.equal(rotasVisiveis(rotas, gestor).length, 4);
});

test('nome do papel', () => {
  assert.equal(nomeDoPapel('gestor'), 'Gestor');
  assert.equal(nomeDoPapel('colaborador'), 'Colaborador');
});
