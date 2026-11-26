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

## Etapa 4, 25/11/2026

- **Ninguém grava direto nas tabelas de tarefas.** Para o app, `tarefas`, `tarefa_responsaveis` e `tarefa_eventos` são só leitura (qualquer pessoa ativa lê tudo). Criar, mudar status e editar passam pelas funções `criar_tarefa`, `mudar_status_tarefa` e `editar_tarefa` (`security definer`), que conferem quem pode o quê. Assim as regras de responsável/criador/gestor ficam num lugar só, em vez de espalhadas em várias regras RLS.
- Um gatilho (`preparar_tarefa`) confere toda mudança de status com `transicao_permitida()` e carimba `iniciada_em/por` e `concluida_em/por`. Vale até para o painel do Supabase. A mesma tabela está em `logica/status.js` e um teste confere que as duas são iguais.
- Mudanças permitidas exatamente como no plano. Cancelar só a partir de "A fazer"; para cancelar uma bloqueada, desbloqueie antes.
- **Desbloquear** volta para "Em andamento" se a tarefa já tinha sido iniciada, senão para "A fazer". Voltar para "A fazer" apaga a hora de início (a tarefa não começou de verdade).
- Reabrir (concluída → em andamento) apaga a hora de conclusão e mantém a de início.
- O histórico (`tarefa_eventos`) é escrito só por gatilhos. Edição grava um evento `editada` com cada campo `{de, para}`. Acrescentei o evento `responsavel_removido` (o plano só tinha `responsavel_incluido`). Na criação não grava "responsável incluído" para cada pessoa; o evento `criada` basta.
- `tarefas_lista` é uma view (`security_invoker`, então as regras de leitura valem) com nomes do tipo, do cliente e dos responsáveis (`responsaveis_ids uuid[]` e `responsaveis jsonb`). As telas leem dela. Migração futura que mudar colunas de `tarefas` precisa recriar a view.
- `lembrar_dias_antes` já existe (programada nasce com 2, demanda fica sem); o campo na tela chega na etapa 7. `recorrencia_id` e `ocorrencia_data` **não** entraram: vão com a tabela de recorrências na etapa 8.
- **Prazo padrão da demanda**: hoje 17h30; se já passou das 17h30, amanhã 17h30 (para não nascer atrasada). Programada pede dia (não pode ser no passado) e hora (padrão 17h30). Fuso fixo UTC-3 em `logica/datas.js`.
- **Responsáveis já entram na nova tarefa** (o plano 6.3 previa; a etapa 5 só testa o gestor direcionando). Padrão: só você. Colaborador fica sempre entre os responsáveis (o botão dele vem travado); o gestor escolhe qualquer pessoa ativa. Na edição vale a mesma regra.
- **Editar** entrou no menu "…" do cartão (reaproveita a janela da nova tarefa). Só tarefa aberta é editada; concluída precisa ser reaberta antes. Quem criou, responsável ou gestor edita.
- Nova tarefa pensada para teclado: digita o tipo, Enter, digita o cliente, Enter, Enter cria. Local, assunto do e-mail e observações ficam recolhidos em "Mais detalhes". "Criar e iniciar agora" só aparece em demanda e quando você está entre os responsáveis.
- Minhas tarefas: além dos blocos do plano (Agora, Hoje, Próximos dias, Concluídas hoje recolhido), criei **Mais adiante** (recolhido) para tarefas com prazo depois de 7 dias, que senão sumiriam da tela. Bloqueadas aparecem no bloco do prazo delas, com selo e motivo. Atrasadas ficam no topo de "Hoje".
- Sem tempo real ainda (etapa 6): a tela recarrega depois de cada ação, quando a janela volta a ficar visível e a cada 5 minutos; o selo "Atrasada" é recalculado a cada minuto.
- `traduzirErro` passa adiante as mensagens das funções de tarefa (código P0001, já em português).
- Não entrou nesta etapa: "Gerar e-mail" no menu do cartão (etapa 12), tela de detalhe/linha do tempo e Equipe (etapa 5). "Juntar duplicados" de tipo/cliente fica para a etapa 5, junto da tela Equipe.

## Etapa 5, 26/11/2026

- **Equipe** (`telas/equipe.js`) abre para todos (o time já lê todas as tarefas); o gestor é quem mais usa. Mostra as abertas, agrupadas por pessoa (padrão) ou numa lista por prazo. Tarefa com dois responsáveis aparece com cada um.
- Filtros: busca, pessoa, tipo, cliente, status e "Só atrasadas". O status tem também **Concluídas hoje**. A busca não diferencia acento nem maiúscula e procura no título, observações, motivo do bloqueio, assunto do e-mail e nomes dos responsáveis; cada palavra precisa aparecer.
- **Os filtros ficam no endereço** (`#/equipe?atrasadas=1&pessoa=...`), gravados com `history.replaceState` (não recarrega a tela). Assim o painel do gestor (etapa 10) abre a lista certa só com um link, e dá para guardar um favorito. O roteador agora entrega a `consulta` às telas.
- Ordem dentro de cada pessoa: em andamento, atrasadas, depois por prazo; concluídas no fim.
- Sem filtros, aparece no fim **"Sem tarefa aberta agora: ..."** (quem está livre). Para o gestor, cada pessoa tem **+ Tarefa para Ana**, que abre a Nova tarefa já com ela de responsável (`abrirNovaTarefa({ responsaveis })`). O botão "+ Nova" continua igual.
- **Detalhe** (`#/tarefa/123`, `telas/tarefa-detalhe.js`): o título de qualquer cartão abre. Dados, responsáveis, botões de status (os mesmos do cartão, sem o menu "…"), **Duração** e **Linha do tempo**. "Voltar" leva para a tela de onde veio, com os filtros.
- **Duração** = do primeiro "Iniciei" até o "Concluí". Mostra quanto disso ficou bloqueada (soma dos trechos entre "bloqueada" e "desbloqueada", calculada pelos eventos). Em andamento mostra "Em andamento há 45 min". Reabrir mantém o início original.
- Linha do tempo do mais antigo para o mais novo, com quem fez e quando ("Iniciada por Ana · hoje 09h12"); edição mostra cada campo "de → para" com os nomes de tipo e cliente. Textos em `logica/linha-do-tempo.js`, com testes.
- As três telas de tarefas usam `componentes/vigia-tarefas.js` para ficar em dia (recarrega quando algo muda, ao voltar para a janela e a cada 5 min) até o tempo real da etapa 6.
- **Juntar duplicados** (pendente desde a etapa 3) entrou em Cadastros > Tipos/Clientes: botão "Juntar..." escolhe o item que fica; todas as tarefas (abertas e antigas) passam para ele e o duplicado é arquivado. Só gestor, pela função `juntar_no_catalogo` (migração `004_juntar_duplicados.sql`). Cada tarefa mudada ganha um evento "editada" no histórico. Quando o EMB-23 (etapa 13) usar clientes, a função muda os EMBs também.
- Por causa dessa migração, as migrações previstas no plano a partir da etapa 6 sobem um número (avisos vira `005_avisos.sql`, e assim por diante).
- "Gerar e-mail" no detalhe continua para a etapa 12.
