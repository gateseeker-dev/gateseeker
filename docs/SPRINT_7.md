# Gateseeker — Sprint 7: admin master e aviso de atualização

> Status: **aprovada pelo PO em 2026-11-04** com as recomendações do §8 (último acesso com hora e precisão de 5 minutos; a CLI consulta o npm, desligável). Implementada em 2026-11-04: migração `20261104100000_accounts.sql`, rotas `/api/admin/*`, páginas `/app/admin`, `/app/admin/accounts` e `/app/admin/accounts/<id>`, seletor Usuário/Admin na barra lateral, aviso de atualização (faixa, sineta, `CHANGELOG.md`), linha de versão na CLI (`--no-update-check`, `GATESEEKER_NO_UPDATE_CHECK=1`) e no resumo da Action, aviso de privacidade com "Access dates". Pendente do PO: aplicar a migração (DEPLOY §2 passo 10). Proposta escrita em 2026-11-03 a partir de três pedidos feitos no mesmo dia: (1) usuários logados recebem um aviso quando o produto é atualizado, com chamada para atualizar; (2) o dono do produto vê quantas pessoas usam, o que acessam e quando; (3) o admin master alterna entre a visão de usuário e a de admin na barra lateral. Continua `docs/GROWTH.md` (contadores agregados) e desloca a antiga Sprint 7 do roadmap (repositórios privados e plano pago) para Sprint 8.

Você é o Software Engineer responsável pelo Gateseeker. O stakeholder, Product Owner, Product Designer e auditor é o usuário humano, que não é desenvolvedor: apresente decisões em linguagem simples. As regras de trabalho, a stack e os controles de segurança das sprints anteriores continuam valendo. Esta sprint não traz serviço hospedado novo nem dependência nova.

## 1. Objetivo da sprint

Dar ao dono do produto a visão de quem usa o Gateseeker e como, sem coletar nada além do que o aviso de privacidade já diz, e dar a quem usa o produto um aviso quando uma versão nova entra no ar.

Entregas:

1. **Aviso de atualização.** Quem está com o site aberto vê, na sineta e numa faixa discreta, "Gateseeker foi atualizado para a versão X" com o botão **Atualizar**, que recarrega a página. Quem usa a CLI ou a Action vê uma linha no fim do relatório quando existe versão mais nova.
2. **Área de admin** (`/app/admin`), só para os logins de admin master: visão geral, lista de contas, atividade por conta e os contadores agregados que hoje ficam em Settings.
3. **Alternância na barra lateral.** Para o admin master, a barra lateral ganha um seletor **Usuário / Admin**: em "Usuário" o workspace é exatamente o que qualquer pessoa vê; em "Admin" aparecem os itens da área de admin.

## 2. Princípios específicos

1. **Nada além do aviso de privacidade.** A área de admin mostra dados que o serviço já guarda por conta (login, análises, repositórios seguidos, relatórios) mais uma data nova: **último acesso** (dia e hora da última chamada autenticada). Não guardamos IP, navegador, páginas visitadas nem localização. O aviso de privacidade ganha uma linha dizendo que o operador vê a atividade por conta para operar o serviço.
2. **Admin é uma lista explícita.** Os logins de admin master ficam na variável `GATESEEKER_ADMIN_LOGINS` (já existe). Não há promoção pela interface: ser admin é configuração do deploy, não dado do banco, o que impede que um bug ou um abuso crie admins.
3. **Visão de usuário é a visão real.** Em "Usuário" o admin não tem nenhum atalho extra; é a forma de conferir o produto como qualquer pessoa vê.
4. **O aviso de atualização é só um aviso.** Ele não força recarga nem apaga o que a pessoa está fazendo: uma análise em andamento continua; o botão recarrega quando a pessoa quiser.
5. **Agregado antes de individual.** A visão geral mostra totais; a lista de contas existe para operar (responder um usuário, investigar abuso), e cada linha mostra o mínimo: login, desde quando, último acesso, análises, seguidos.

## 3. Escopo

### 3.1. Aviso de atualização

- `GET /api/config` passa a devolver a versão do serviço (`GATESEEKER_VERSION`). A página guarda a versão com que foi construída e compara: ao abrir, ao voltar o foco para a aba e a cada 10 minutos. Quando a versão do serviço é mais nova, entra uma notificação persistente na sineta ("Gateseeker atualizado para 1.1.0") e uma faixa no topo do workspace com o botão **Atualizar** (recarrega). Uma vez por versão; "Depois" fecha a faixa e deixa a notificação.
- Nota de versão: um arquivo `CHANGELOG.md` no repositório, uma seção curta por versão. A notificação linka a seção. Escrever a nota faz parte do fluxo de release (`docs/RELEASE.md`).
- CLI e Action: ao fim de uma análise com rede disponível, uma consulta leve ao npm (`https://registry.npmjs.org/gateseeker/latest`, com `fetch` injetável e timeout de 2 s) e, se houver versão mais nova, uma linha "Gateseeker 1.1.0 is available (you run 1.0.0): npm i -g gateseeker@latest". Nunca bloqueia, nunca muda o veredito; `--no-update-check` e a variável `GATESEEKER_NO_UPDATE_CHECK=1` desligam. Nos testes, `fetch` injetado; nenhuma consulta real.

### 3.2. Último acesso

- Tabela `accounts` (uma linha por conta): `user_id`, `login`, `first_seen`, `last_seen`, `scans`, `follows` (contadores mantidos pelo serviço). Atualizada por `touch_account(user_id, login)` a cada chamada autenticada, no máximo uma gravação por conta a cada 5 minutos (para não escrever a cada clique). RLS ligada, sem políticas, como as outras.
- Apagar a conta apaga a linha (já faz parte de `deleteAccount`).

### 3.3. Área de admin

- `GET /api/admin/overview`: contas no total, ativas em 7 e 30 dias (último acesso), novas em 7 e 30 dias, análises em 7 e 30 dias, repositórios seguidos, relatórios compartilhados, e os contadores agregados de 14 dias que `/api/funnel` já devolve (que passa a viver aqui; Settings deixa de mostrar a seção).
- `GET /api/admin/accounts?sort=last_seen&cursor=`: lista paginada (50 por página) com login, desde quando, último acesso, análises, seguidos.
- `GET /api/admin/accounts/<user_id>`: a atividade de uma conta: análises (repositório, commit, veredito, quando), repositórios seguidos, relatórios compartilhados. Sem o conteúdo dos relatórios: o admin vê **que** uma análise aconteceu, não os achados de alguém.
- Páginas: `/app/admin` (visão geral com os números e um gráfico simples por dia), `/app/admin/accounts` (tabela), `/app/admin/accounts/<id>` (atividade). Tudo só para os logins de admin; qualquer outro recebe 404, como `/api/funnel` hoje.

### 3.4. Alternância na barra lateral

- Para logins de admin, a barra lateral mostra um seletor **Usuário | Admin** acima dos itens. Em "Admin", os itens são Visão geral, Contas e (como hoje) Design system; em "Usuário", os itens normais. A escolha fica no navegador; ao recarregar, volta para "Usuário".
- Para quem não é admin, nada muda, nem um pixel.

### 3.5. Instrumentação

Contadores novos: `update_banner_shown`, `update_banner_reload`. Dizem se o aviso é visto e seguido.

## 4. Testes obrigatórios

1. O aviso aparece quando a versão do serviço é mais nova que a da página, uma vez por versão, e não aparece quando é igual; o botão recarrega; "Depois" fecha a faixa e mantém a notificação.
2. A CLI imprime a linha de atualização só quando a resposta do registro traz versão maior; sem rede ou com timeout, nada é impresso e o código de saída não muda. Teste com `fetch` injetado; o teste de rede é proibido.
3. `touch_account` grava a primeira vez e no máximo uma vez a cada 5 minutos; apagar a conta remove a linha.
4. As rotas de admin respondem 404 a logins fora da lista e 401 sem sessão; a lista e a atividade mostram o que o §3.3 diz e nada mais (teste afirma que nenhum achado de relatório aparece na resposta).
5. Navegador: admin alterna Usuário/Admin e vê a visão geral com os números da conta de teste; usuário comum não vê o seletor nem a rota.
6. O aviso de privacidade menciona o último acesso e a visão do operador (teste de texto, como os já existentes para as páginas legais).

## 5. Segurança e privacidade

- Admin por configuração, nunca por dado. A lista é lida do ambiente a cada chamada; mudar exige redeploy, o que é desejável.
- Último acesso é a única informação nova por conta. Nada de IP, agente de usuário ou rota visitada. A granularidade de 5 minutos reduz a precisão de propósito.
- A atividade de uma conta mostra metadados das análises (repositório público, commit, veredito), nunca os achados. Os relatórios continuam abrindo só para o dono ou pelo link que o dono compartilhou.
- O aviso de atualização não executa nada: recarregar a página é a única ação. Na CLI, a consulta ao npm é só leitura e desligável.
- A atualização do aviso de privacidade acompanha a entrega, não vem depois.

## 6. Critérios de aceite

- Admin master entra, alterna para Admin e vê contas, ativos em 7 e 30 dias, análises, seguidos e a lista de contas com último acesso.
- Usuário comum não vê nada diferente de hoje.
- Com uma versão nova publicada, uma aba aberta mostra a faixa e a notificação em até 10 minutos ou ao voltar o foco; o botão recarrega.
- CLI mostra a linha de atualização quando há versão mais nova e fica em silêncio sem rede.
- `pnpm check` verde; CI verde; aviso de privacidade atualizado.

## 7. Fora de escopo

Promoção de admin pela interface, papéis intermediários (suporte, leitura), times, exportação de dados, gráficos avançados, qualquer rastreamento por página ou por IP, notificações por e-mail de atualização (quem segue repositórios já recebe e-mail; aviso de versão por e-mail é spam).

## 8. Decisões que precisam do PO antes de começar

1. **Aprovação deste escopo.**
2. **Último acesso:** confirmar que guardar dia e hora da última chamada autenticada (granularidade de 5 minutos) é aceitável e que o aviso de privacidade pode ser atualizado para dizer isso. Alternativa mais estrita: só o dia.
3. **CLI consultando o npm:** a consulta de versão é uma chamada de rede nova que a CLI faz por conta própria (desligável). Aprovar, ou deixar o aviso só na web e na Action.
4. **Renumeração:** a antiga Sprint 7 do roadmap (repositórios privados, plano pago) passa a Sprint 8.

## 9. Ordem de trabalho

1. Migração `accounts` + `touch_account` + atualização do `deleteAccount`; testes.
2. Rotas de admin e a mudança do `/api/funnel` para `/api/admin/overview`; testes.
3. Páginas de admin e o seletor na barra lateral; testes de navegador.
4. Aviso de atualização na web (`/api/config` com versão, notificação, faixa, `CHANGELOG.md`); testes.
5. Linha de atualização na CLI e na Action (se aprovada); testes.
6. Aviso de privacidade; `docs/ROADMAP.md` (renumeração); `docs/DEPLOY.md` (migração nova).
