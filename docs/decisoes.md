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

## Etapa 2, 25/11/2026

- O endereço publicado é `https://invflow.github.io/taskManager/` (com M maiúsculo, igual ao nome do repositório). `taskmanager` minúsculo dá 404.
- Pessoas são criadas pelo gestor no painel do Supabase (Add user > Create new user, com senha temporária e "Auto Confirm User"). Convite por e-mail não foi usado porque o e-mail embutido do Supabase só entrega para a equipe do projeto. Criar pessoas pela tela do app exigiria a chave secreta numa Edge Function; fica para depois, se fizer falta.
- Cadastro aberto (sign up) deve ficar desligado no Supabase; é a primeira barreira. As regras RLS são a segunda.
- Um gatilho em `auth.users` cria a linha em `pessoas`. Se não existe gestor ativo, a pessoa nasce gestora (assim o primeiro usuário vira o gestor sem SQL).
- `pessoas.trocar_senha` (padrão `true`): no primeiro login o app pede para a pessoa criar a própria senha.
- Pessoa inativa não passa em nenhuma regra, nem para ler a própria linha. A função `minha_situacao()` (security definer) devolve só `ativo`/`inativo`/`sem_cadastro`, para o app explicar por que a pessoa não entra.
- Colaborador só muda o próprio `nome`, `recebe_email` e `trocar_senha`. Papel, ativo e e-mail são protegidos por gatilho (`proteger_pessoa`), porque RLS não restringe colunas por linha. O painel do Supabase (postgres/service_role) passa direto.
- O time nunca fica sem gestor ativo: o gatilho recusa tirar ou desativar o último.
- `grupos_email` (seção 5.1 do plano) não entrou: vai junto com a etapa de e-mail.
- Tela Cadastros já existe com a aba Pessoas (só gestor); Tipos e Clientes entram nela na etapa 3. Painel e Cadastros ficam fora do menu de quem não é gestor (`logica/acesso.js`).
- supabase-js 2.58.0 via jsDelivr (`+esm`), versão fixa.
- Testes SQL: `supabase/tests/rls.sql` roda no SQL Editor do Supabase (transação desfeita no fim) e no GitHub Actions num Postgres 16 com `supabase/tests/simular-supabase.sql`, que imita `auth.users`, `auth.uid()` e os papéis `anon`/`authenticated`. A publicação só acontece se os dois testes passarem.
