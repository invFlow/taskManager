import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarNovaSenha, normalizarEmail, emailValido, limparNome, iniciais, traduzirErro } from '../../src/logica/conta.js';

test('nova senha: tamanho, letras e números, confirmação', () => {
  assert.match(validarNovaSenha('abc12', 'abc12'), /8 caracteres/);
  assert.match(validarNovaSenha('abcdefgh', 'abcdefgh'), /letras e números/);
  assert.match(validarNovaSenha('12345678', '12345678'), /letras e números/);
  assert.match(validarNovaSenha(' inventario1', ' inventario1'), /espaço/);
  assert.match(validarNovaSenha('inventario1', 'inventario2'), /não são iguais/);
  assert.equal(validarNovaSenha('inventário1', 'inventário1'), null);
  assert.equal(validarNovaSenha('Abcdefg1', 'Abcdefg1'), null);
});

test('e-mail é limpo e validado', () => {
  assert.equal(normalizarEmail('  Ana.Souza@Andreani.COM '), 'ana.souza@andreani.com');
  assert.ok(emailValido(' ana@andreani.com'));
  assert.ok(!emailValido('ana@'));
  assert.ok(!emailValido('ana souza@x.com'));
  assert.ok(!emailValido(''));
});

test('nome: corta espaços e recusa vazio ou curto demais', () => {
  assert.equal(limparNome('  Ana   Souza '), 'Ana Souza');
  assert.equal(limparNome('A'), null);
  assert.equal(limparNome(''), null);
  assert.equal(limparNome('x'.repeat(81)), null);
});

test('iniciais', () => {
  assert.equal(iniciais('Ana Paula Souza'), 'AS');
  assert.equal(iniciais('ana'), 'AN');
  assert.equal(iniciais(''), '?');
});

test('erros do Supabase viram português', () => {
  assert.equal(traduzirErro({ message: 'Invalid login credentials' }), 'E-mail ou senha incorretos.');
  assert.match(traduzirErro({ message: 'Email rate limit exceeded' }), /Muitas tentativas/);
  assert.match(traduzirErro(new TypeError('Failed to fetch')), /Sem conexão/);
  assert.match(traduzirErro({ code: '42501', message: 'Só o gestor muda papel ou situação (ativo) de uma pessoa.' }), /Só o gestor/);
  assert.match(traduzirErro({ code: '23514', message: 'O time precisa de pelo menos um gestor ativo.' }), /pelo menos um gestor/);
  assert.match(traduzirErro({ code: '42501', message: 'permission denied for table pessoas' }), /permissão/);
  assert.match(traduzirErro({ message: 'qualquer coisa' }), /Algo deu errado/);
  assert.equal(traduzirErro(null), '');
});

test('erros dos catálogos', () => {
  assert.equal(traduzirErro({ code: '23505', message: 'duplicate key value violates unique constraint "clientes_nome_busca_key"' }), 'Já existe um cadastro com esse nome.');
  assert.equal(traduzirErro({ code: '23514', message: 'Digite um nome com letras ou números.' }), 'Digite um nome com letras ou números.');
});
