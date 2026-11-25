# Decisões

Registro curto das decisões tomadas durante a construção. O plano completo está fora do repositório (plano-invflow.md, v1.1 de 25/11/2026).

## Etapa 1, 25/11/2026

- Site estático sem build; `index.html` na raiz e todo o código em `src/`.
- `package.json` só com `"type": "module"`, para o `node --test` entender os módulos ES. Nenhuma dependência.
- O workflow do Pages publica só `index.html` e `src/` (pasta `_site`), para não expor `tests/`, `docs/` e, no futuro, `supabase/`.
- Os testes rodam em todo pull request; a publicação só acontece em push na `main`.
- Roteador por hash com funções puras (`lerRota`, `resolverRota`) testadas em `tests/roteador.test.js`. Hash vazio vai para `#/minhas`.
- Telas ainda não construídas usam `src/interface/telas/em-breve.js`, que diz em qual etapa a tela chega.
- Layout pensado para PC; abaixo de 700 px o menu vira uma faixa rolável sob a barra e os botões mantêm 44 px de altura.
