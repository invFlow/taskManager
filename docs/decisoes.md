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

## Etapa 3, 25/11/2026

- `nome_busca` = minúsculo, sem acento e só letras e números separados por um espaço ("EMB-23" e "emb 23" são o mesmo; "Johnson & Johnson" = "johnson johnson"). Fica em `public.nome_de_busca()` (SQL, com `translate`, sem depender da extensão `unaccent`) e em `logica/catalogos.js`; um teste confere que as duas listas de letras são iguais.
- O nome é gravado como foi digitado (só com os espaços limpos); "ABBOTT" continua "ABBOTT". O `unique` em `nome_busca` impede duplicado.
- Criar na hora usa as funções `criar_tipo_atividade(p_nome)` e `criar_cliente(p_nome)` (`insert ... on conflict do nothing`): se o nome já existe, devolvem o existente em vez de dar erro. São `security invoker`, então as regras RLS valem.
- Se o nome que a pessoa tenta criar está arquivado, a função devolve o arquivado e a tela avisa "está arquivado, peça ao gestor para reativar". Não reativa sozinho, para não ressuscitar duplicados que o gestor arquivou de propósito.
- Colaborador só consegue gravar a coluna `nome` (permissão por coluna); `criado_por` é carimbado pelo gatilho e `ativo` nasce `true`. Só o gestor faz `update` (renomear, arquivar, reativar). Ninguém apaga, nem o gestor.
- **Juntar duplicados** (seção 6.9 do plano) ficou para a etapa 4 ou 5: só faz sentido quando existirem tarefas para mudar de um item para o outro. Até lá, o gestor arquiva o duplicado.
- Contatos de cobrança do EMB-23 (`contatos_cobranca`) não entraram: vão com a etapa 16, usando o mesmo componente.
- Cadastros continua só para gestor. A aba Tipos/Clientes ficou em `telas/cadastros-catalogo.js` (o plano citava só `cadastros.js`) para cada arquivo continuar pequeno. As abas são links: `#/cadastros/pessoas`, `#/cadastros/tipos`, `#/cadastros/clientes`; o `main.js` agora passa os parâmetros da rota para a tela.
- `componentes/busca-com-criar.js` carrega a lista uma vez (no primeiro foco) e filtra no navegador, porque os catálogos são pequenos. Ordem: nome igual, começa com, começo de palavra, contém; cada palavra digitada precisa aparecer ("inv prog" acha "Inventários programados"). Mostra até 8 resultados e o Criar por último. Enter escolhe a opção destacada (a primeira, por padrão). Segue o padrão ARIA de combobox.
- Testes SQL novos em `supabase/tests/catalogos.sql` (arquivo separado do `rls.sql`, com as próprias pessoas de teste); `rodar-local.sh` roda os dois.
