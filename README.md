# InvFlow

App web do time de inventário para registrar, acompanhar e ser lembrado das atividades, com visibilidade para a gestão e um módulo para o EMB-23.

Site estático (HTML, CSS e JavaScript em módulos ES, **sem etapa de build**) publicado no GitHub Pages, com dados no Supabase.

## Estado atual

Etapa 1 de 19: esqueleto e publicação. O site abre com a barra do InvFlow e navega entre telas ainda vazias:

| Endereço | Tela | Chega na etapa |
|---|---|---|
| `#/minhas` | Minhas tarefas (inicial) | 4 |
| `#/equipe` | Equipe | 5 |
| `#/painel` | Painel do gestor | 10 |
| `#/emb` | EMB-23 | 13 |
| `#/cadastros` | Cadastros | 3 |
| `#/perfil` | Perfil | 2 |

## Rodar no seu PC

Os módulos ES não abrem direto do arquivo (`file://`), então é preciso um servidor local simples. Na pasta do projeto:

```
python -m http.server 8000
```

e abra http://localhost:8000. Qualquer outro servidor estático serve.

## Testes

Precisa do Node.js 20 ou mais novo. Na pasta do projeto:

```
node --test
```

Os testes ficam em `tests/` e cobrem só código puro (sem tela e sem banco).

## Publicação

O workflow `.github/workflows/pages.yml` roda os testes em todo pull request e, a cada push na `main`, publica `index.html` e `src/` no GitHub Pages.

Configuração única, feita por quem administra o repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Depois disso o endereço aparece no topo da mesma página (normalmente `https://invflow.github.io/taskmanager/`).

## Organização do código

```
index.html          casca única, carrega src/main.js
src/main.js         inicia o app e o roteador
src/config.js       URL do Supabase e chave pública (anon)
src/roteador.js     rotas por hash (#/minhas, #/equipe ...)
src/logica/         código puro, sem tela e sem banco, com testes (a partir da etapa 4)
src/dados/          único lugar que fala com o Supabase (a partir da etapa 2)
src/interface/      telas e componentes
src/estilos/        CSS
tests/              node --test
docs/decisoes.md    registro curto das decisões
```

Regras: telas nunca importam o Supabase diretamente (só `src/dados/`), e `src/logica/` nunca importa `dados/` nem `interface/`.

## Segurança

`src/config.js` guarda só a chave **pública** (anon) do Supabase, que pode ficar no site porque todo acesso passa pelas regras RLS do banco. A chave secreta (`service_role`) **nunca** entra no repositório.
