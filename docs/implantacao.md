# Implantação do InvFlow

Passo a passo do que é feito à mão no painel do Supabase e no GitHub. Nada aqui pede senha no chat.

- Site: https://invflow.github.io/taskManager/ (o endereço diferencia maiúsculas: `taskManager`)
- Supabase: https://supabase.com/dashboard, projeto `dkpuzrxyajpniuqgfbhu`

## Etapa 2: login e pessoas

Faça na ordem. Leva uns 10 minutos.

### 1. Desligar o cadastro aberto

Sem isso, qualquer pessoa com o endereço do site poderia criar uma conta.

1. Supabase > **Authentication** > **Sign In / Providers** (em versões antigas: Providers).
2. Desligue **Allow new users to sign up**. Salve.
3. Na mesma página, em **Email**, pode deixar **Confirm email** como está: as pessoas criadas pelo painel com "Auto Confirm User" não precisam confirmar.

### 2. Dizer ao Supabase qual é o endereço do site

É para onde o link de "Esqueci a senha" leva.

1. Supabase > **Authentication** > **URL Configuration**.
2. **Site URL**: `https://invflow.github.io/taskManager/`
3. Em **Redirect URLs**, clique **Add URL** e adicione `https://invflow.github.io/taskManager/` (e, se for testar no PC, `http://localhost:8000/`).

### 3. Criar as tabelas e regras (migração)

1. Supabase > **SQL Editor** > **New query**.
2. Abra o arquivo `supabase/migrations/001_pessoas.sql` do repositório, copie tudo e cole.
3. Clique **Run**. Deve aparecer "Success. No rows returned".

Pode rodar de novo sem problema. Se já existirem usuários no Auth, eles viram pessoas automaticamente e o mais antigo vira gestor.

### 4. Criar o primeiro gestor (você)

O primeiro usuário criado depois da migração vira **gestor** automaticamente.

1. Supabase > **Authentication** > **Users** > **Add user** > **Create new user**.
2. Seu e-mail da empresa e uma senha temporária. Deixe marcado **Auto Confirm User**.
3. Abra o site, entre com essa senha. O InvFlow pede para criar a sua senha definitiva.

### 5. Conferir as regras de acesso (opcional, recomendado)

1. Supabase > **SQL Editor** > **New query**.
2. Cole o conteúdo de `supabase/tests/rls.sql` e clique **Run**.
3. Deve aparecer uma linha `OK: todos os testes de acesso passaram`. Se aparecer um erro que começa com `FALHOU:`, me mande o texto.

O teste cria pessoas falsas dentro de uma transação e desfaz tudo no fim: nada fica no banco.

### 6. Adicionar o time

Para cada pessoa:

1. Supabase > **Authentication** > **Users** > **Add user** > **Create new user**, com o e-mail da pessoa, uma senha temporária e **Auto Confirm User** marcado.
2. Passe a senha temporária para a pessoa. No primeiro acesso ela cria a própria senha.
3. No InvFlow, em **Cadastros**, a pessoa aparece como Colaborador. Ali você muda o papel, desativa quem saiu do time e liga ou desliga os e-mails.

Para tirar alguém do time, desmarque **Ativo** em Cadastros (não apague o usuário: o histórico das tarefas fica ligado a ele).

### Esqueci a senha

O botão "Esqueci a senha" usa o e-mail embutido do Supabase, que no plano gratuito só entrega para endereços da equipe do projeto Supabase e tem limite de poucos e-mails por hora. Até configurar um SMTP próprio, o caminho garantido é o gestor dar uma senha temporária pelo **SQL Editor** (troque o e-mail e a senha):

```sql
update auth.users
   set encrypted_password = extensions.crypt('SenhaTemporaria1', extensions.gen_salt('bf'))
 where email = 'pessoa@andreani.com';
update public.pessoas set trocar_senha = true where email = 'pessoa@andreani.com';
```

A pessoa entra com a senha temporária e o InvFlow pede para criar uma nova.

## Etapa 3: tipos de atividade e clientes

Leva 2 minutos. Precisa da etapa 2 feita.

### 1. Criar as tabelas (migração)

1. Supabase > **SQL Editor** > **New query**.
2. Abra o arquivo `supabase/migrations/002_catalogos.sql` do repositório, copie tudo e cole.
3. Clique **Run**. Deve aparecer "Success. No rows returned".

Isso cria as tabelas de tipos e clientes, com os 7 tipos iniciais (Inventários diários, Inventários programados, Auditorias, EMB-23, Inventários geográficos, Posições vazias, Validação das sobras). Pode rodar de novo sem duplicar nada.

### 2. Conferir as regras (opcional, recomendado)

1. Supabase > **SQL Editor** > **New query**.
2. Cole o conteúdo de `supabase/tests/catalogos.sql` e clique **Run**.
3. Deve aparecer `OK: todos os testes de catálogos passaram`. Se aparecer um erro que começa com `FALHOU:`, me mande o texto.

Como o de pessoas, este teste desfaz tudo no fim.

### 3. Usar

No InvFlow, **Cadastros** > **Tipos** ou **Clientes**. Digite no campo "Procurar ou criar": se o nome já existe ele aparece na lista (sem diferenciar acento nem maiúscula); se não existe, a última opção é **Criar "nome"**. Na lista, **Renomear** corrige um nome e **Arquivar** tira o item das listas sem apagar.

## Etapa 4: tarefas

Leva 2 minutos. Precisa das etapas 2 e 3 feitas.

### 1. Criar as tabelas (migração)

1. Supabase > **SQL Editor** > **New query**.
2. Abra o arquivo `supabase/migrations/003_tarefas.sql` do repositório, copie tudo e cole.
3. Clique **Run**. Deve aparecer "Success. No rows returned".

Isso cria as tarefas, os responsáveis, o histórico e as regras de status. Pode rodar de novo sem estragar nada.

### 2. Conferir as regras (opcional, recomendado)

1. Supabase > **SQL Editor** > **New query**.
2. Cole o conteúdo de `supabase/tests/tarefas.sql` e clique **Run**.
3. Deve aparecer `OK: todos os testes de tarefas passaram`. Se aparecer um erro que começa com `FALHOU:`, me mande o texto.

O teste desfaz tudo no fim: nenhuma tarefa de teste fica no banco.

### 3. Usar

No InvFlow, **+ Nova**: escolha Tipo e Cliente (digitando; se não existir, a última opção cria) e clique **Criar**. O prazo já vem hoje 17h30 e o responsável é você. Em **Minhas tarefas**, **Iniciei** e **Concluí** gravam a hora; o menu **…** tem Bloquear (pede o motivo), Editar e Cancelar.

## Etapa 5: equipe, detalhe e juntar duplicados

Leva 1 minuto. Precisa da etapa 4 feita.

### 1. Criar a função de juntar duplicados (migração)

1. Supabase > **SQL Editor** > **New query**.
2. Abra o arquivo `supabase/migrations/004_juntar_duplicados.sql` do repositório, copie tudo e cole.
3. Clique **Run**. Deve aparecer "Success. No rows returned".

Sem essa migração, Equipe e o detalhe da tarefa funcionam normalmente; só o botão **Juntar...** em Cadastros dá erro.

### 2. Conferir (opcional)

Cole `supabase/tests/juntar.sql` no SQL Editor e clique **Run**. Deve aparecer `OK: todos os testes de juntar duplicados passaram`. O teste desfaz tudo no fim.

### 3. Usar

- **Equipe**: todas as tarefas abertas, por pessoa. Filtre por pessoa, tipo, cliente, status ou **Só atrasadas**, ou busque. Os filtros ficam no endereço: dá para salvar como favorito.
- **Detalhe**: clique no título de uma tarefa. Mostra a duração (com o tempo bloqueado) e a linha do tempo.
- **Gestor**: em Equipe, **+ Tarefa para Ana** cria a tarefa já direcionada.
- **Juntar duplicados**: Cadastros > Clientes (ou Tipos) > **Juntar...** no nome errado, escolha o certo e confirme.
