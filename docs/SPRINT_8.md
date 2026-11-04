# Gateseeker — Sprint 8: repositórios privados pelo site (GitHub App)

> Status: **aprovada pelo PO em 2026-11-04** (com o monitoramento de privados, §1 item 4). Implementada em 2026-11-04: `src/web/github-app.ts`, migração `20261105000000_installations.sql`, rotas `/api/github/*`, cartão "Allow access on GitHub", página `/app/github/setup`, seção GitHub access em Settings, etiqueta "private" no relatório, monitor com token de instalação e pausa por revogação, área de admin, aviso de privacidade e termos. Pendente do PO: criar o App e as três variáveis (DEPLOY §5.3) e aplicar a migração (DEPLOY §2 passo 11). Proposta escrita em 2026-11-04. Origem: o PO perguntou se repositórios privados podem ser analisados exclusivamente pelo site, sem instalar nada no repositório, e pediu para seguir. O plano pago, que o roadmap colocava na mesma sprint, fica para depois (§7): primeiro o produto precisa analisar o que as pessoas têm de verdade, que são repositórios privados.

Você é o Software Engineer responsável pelo Gateseeker. O stakeholder, Product Owner, Product Designer e auditor é o usuário humano, que não é desenvolvedor: apresente decisões em linguagem simples. As regras de trabalho, a stack e os controles de segurança das sprints anteriores continuam valendo. Esta sprint traz a **primeira integração com o GitHub além do login** (um GitHub App), que a regra 8 do `CLAUDE.md` reserva ao PO; a aprovação deste documento é essa autorização. Nenhuma dependência nova: a assinatura do token do App usa o módulo `crypto` do Node.

## 1. Objetivo da sprint

Quem cola a URL de um repositório privado no workspace consegue analisá-lo pelo site, depois de autorizar o Gateseeker uma vez numa tela do GitHub. Nada é instalado no repositório, nenhum arquivo entra nele, e o serviço nunca guarda uma credencial de acesso.

Entregas:

1. **Autorização pelo GitHub.** Ao colar um repositório privado, o workspace explica e oferece o botão **Allow access on GitHub**. A tela do GitHub pergunta em quais repositórios o Gateseeker pode ler o conteúdo; a pessoa escolhe, confirma e volta ao workspace com a análise rodando. Uma vez por conta ou organização; nas próximas análises o passo não existe.
2. **Análise de privados** com os mesmos limites, a mesma cota e o mesmo relatório dos públicos.
3. **Acesso visível e revogável** em Settings: lista das contas e organizações do GitHub que autorizaram, com os botões **Manage on GitHub** e **Disconnect**.
4. **Monitoramento de privados** (seguir o repositório e receber o rescan diário), usando a mesma autorização; se ela for revogada no GitHub, o acompanhamento pausa com o motivo "access revoked".

## 2. Princípios específicos

1. **Leitura, por repositório, sem guardar credencial.** O GitHub App pede só *Contents: read* e *Metadata: read*. A pessoa escolhe os repositórios na tela do GitHub. A cada análise o serviço pede ao GitHub um token temporário (1 hora) restrito àquele repositório, usa e descarta. O que fica no nosso banco é o número da instalação e a quem ela pertence, nada que dê acesso por si só.
2. **Pelo site, sem YAML.** O único passo fora do site é a tela de permissão do GitHub, a mesma lógica do "Continue with GitHub" que já existe. Não há arquivo a copiar nem workflow a editar.
3. **A pessoa só liga instalações que o GitHub lhe devolveu.** O vínculo entre a conta Gateseeker e a instalação é feito pelo retorno do GitHub com um `state` assinado pelo serviço (conta + validade de 15 minutos, uso único). Não dá para "adotar" a instalação de outra pessoa.
4. **Mesmo relatório, mesma privacidade.** O relatório de um repositório privado abre só para o dono. Compartilhar por link continua sendo uma escolha explícita do dono, com um aviso extra quando o repositório é privado.
5. **Falha fechada.** Sem instalação válida, a resposta é "privado, sem acesso" com o botão de autorizar. Token expirado ou revogado resulta em erro claro e pausa do acompanhamento; nunca em análise parcial apresentada como completa (regra 2 do `CLAUDE.md`).

## 3. Escopo

### 3.1. GitHub App (configuração do PO, roteiro em `docs/DEPLOY.md`)

- App "Gateseeker" na conta do PO: permissões *Contents: read* e *Metadata: read*; sem webhooks nesta sprint; "Setup URL" apontando para `https://<site>/app/github/setup`; "Request user authorization" desligado (o login continua sendo o Supabase).
- Variáveis no Vercel: `GATESEEKER_GITHUB_APP_ID`, `GATESEEKER_GITHUB_APP_SLUG` (o nome público, para montar o link de instalação) e `GATESEEKER_GITHUB_APP_KEY` (a chave privada em PEM, tipo Secret). Sem elas, tudo desta sprint fica desligado e o produto se comporta como hoje.

### 3.2. Serviço

- `src/web/github-app.ts`: assinatura do JWT do App (RS256 com `crypto.sign`, validade de 10 minutos), troca por token de instalação restrito ao repositório (`POST /app/installations/{id}/access_tokens` com `repositories: [name]`), consulta da instalação (`GET /app/installations/{id}`). `fetch` injetável; nenhum teste toca a rede.
- `resolveGitHubRepository` e `scanGitHubRepository` aceitam um token de instalação: metadados e tarball (`GET /repos/{owner}/{repo}/tarball/{sha}`, que redireciona para o codeload com credencial) passam a ser pedidos com `Authorization`. O token nunca entra em log, em relatório ou em mensagem de erro (`redactInLine` cobre o formato `ghs_…`).
- Fluxo da análise: público resolve como hoje. Em 404 ou `private`, o serviço procura uma instalação da conta que cubra o repositório (dono da instalação = dono do repositório; a lista de repositórios da instalação confirma). Com instalação: token, análise, relatório marcado `private: true`. Sem instalação: erro `private` com `installUrl` (a URL de instalação do App com o `state`).
- Rotas novas:
  - `GET /api/github/install?repo=owner/name`: devolve a URL de instalação com `state` assinado e o repositório lembrado para depois.
  - `POST /api/github/installations` `{installationId, state}`: valida o `state` (assinatura, validade, conta), consulta a instalação no GitHub, grava o vínculo (`installations`: `user_id`, `installation_id`, `account_login`, `account_type`, `created_at`). Idempotente.
  - `GET /api/github/installations`: as instalações da conta com o número de repositórios cobertos (consultado na hora, não guardado).
  - `DELETE /api/github/installations/<id>`: remove o vínculo do nosso lado; a resposta traz o link para desinstalar no GitHub.
- Monitor diário: para um repositório privado seguido, o rescan usa a instalação vinculada à conta de quem segue. Instalação removida ou token recusado pausa o acompanhamento com `pausedReason = "access revoked"` e o e-mail de pausa diz isso.
- Apagar a conta apaga as linhas de `installations` (o App continua instalado no GitHub até a pessoa desinstalar; a tela de exclusão diz onde).

### 3.3. Banco

Migração `20261105000000_installations.sql`: tabela `installations` (RLS ligada, sem políticas, como as outras), índice por `user_id`, `on delete cascade` em `auth.users`. Contador de evento novo: `github_install_start`, `github_install_done`.

### 3.4. Site

- Analyze: quando o serviço responde `private` com `installUrl`, o cartão "This repository is private" explica em duas frases e mostra **Allow access on GitHub** (leva à tela do GitHub). A URL do repositório fica lembrada no navegador.
- `/app/github/setup`: página de retorno; lê `installation_id` e `state`, chama `POST /api/github/installations`, mostra "Connected to <conta>" e volta à análise do repositório lembrado (ou ao Dashboard).
- Settings, seção **GitHub access**: a lista de instalações (conta, tipo, repositórios cobertos, desde quando), **Manage on GitHub** (abre a página da instalação no GitHub, onde se escolhem repositórios ou se desinstala) e **Disconnect**.
- Relatório e Scans: etiqueta "private" ao lado do nome; ao compartilhar um relatório de repositório privado, o diálogo avisa que o link abre os achados para quem o tiver.
- Admin: a visão geral ganha "GitHub installations"; a atividade da conta mostra as instalações (conta e desde quando), sem nada do conteúdo.
- Aviso de privacidade: linha nova em "What the service keeps" (instalações do GitHub: número e conta, para analisar repositórios privados que você autorizou; token temporário por análise, nunca guardado) e em "Services" (GitHub, já citado, agora também como origem do código privado).

### 3.5. Instrumentação

`github_install_start` (clicou em Allow access), `github_install_done` (voltou com a instalação). Dizem quantos param na tela do GitHub.

## 4. Testes obrigatórios

1. JWT do App assinado e verificável com um par de chaves gerado no próprio teste (`crypto.generateKeyPairSync`); validade de 10 minutos; chave inválida ou ausente desliga a funcionalidade com uma mensagem clara no log de inicialização.
2. `state`: válido só para a conta que o pediu e dentro do prazo; alteração de um caractere, reuso ou conta diferente são recusados (403), e nenhuma instalação é gravada.
3. Repositório privado sem instalação: resposta `private` com `installUrl`; o relatório não é criado e a cota não é consumida. Com instalação: o GitHub de teste recebe `Authorization: Bearer <token de instalação>` nos metadados e no tarball, e a análise completa; o token não aparece em nenhum campo da resposta nem do relatório salvo.
4. Instalação que não cobre o repositório (lista de repositórios sem ele) é tratada como ausente.
5. Monitor: repositório privado seguido é reanalisado com o token; instalação removida pausa com "access revoked" e envia o e-mail de pausa (caixa de saída em memória).
6. Apagar a conta remove as instalações do nosso lado.
7. Navegador (stub do GitHub em `e2e/start-web.mjs`): cola privado, vê o cartão, clica em Allow access, o stub devolve ao `/app/github/setup`, a análise roda e o relatório aparece com a etiqueta; Settings lista e desconecta.
8. Aviso de privacidade menciona as instalações (teste de texto).

## 5. Segurança e privacidade

- Permissões mínimas do App (*Contents: read*, *Metadata: read*); tokens de instalação restritos a um repositório e descartados após a análise. Nada de escopo `repo` do OAuth, que daria leitura e escrita em todos os repositórios da conta.
- A chave privada do App vive só em variável de ambiente do Vercel, nunca no repositório nem no banco. Em caso de vazamento, o PO gera uma nova no GitHub e troca a variável; nada mais precisa mudar.
- O vínculo conta ↔ instalação exige o `state` assinado e o retorno do GitHub; o serviço confirma a instalação no GitHub antes de gravar.
- O conteúdo de repositórios privados segue o caminho dos públicos: lido como texto, nunca executado (regra 1), limites de tamanho iguais, relatório visível só para o dono.
- Erros do GitHub (token recusado, 403, 404) viram mensagens sem o token e sem o corpo da resposta do GitHub.
- O aviso de privacidade e os Termos acompanham a entrega.

## 6. Critérios de aceite

- Com o App configurado, uma pessoa cola um repositório privado seu, autoriza no GitHub em até um minuto e recebe o relatório completo; a segunda análise não pede nada.
- Sem o App configurado (variáveis ausentes), o produto se comporta exatamente como hoje.
- Settings mostra e desconecta as instalações; o GitHub mostra o Gateseeker instalado com leitura apenas.
- Um repositório privado seguido recebe o rescan diário; revogar o acesso pausa com o motivo certo.
- `pnpm check` verde, CI verde, `pnpm test:e2e` verde com o stub do GitHub; aviso de privacidade atualizado.

## 7. Fora de escopo

Plano pago e cobrança (fica para a Sprint 9, com dados de uso desta); check de pull request pelo App (sem YAML), que o roadmap cita e que depende de webhooks e de permissão de escrita em *Checks*; organizações com aprovação de administrador (o fluxo do GitHub já cobre o pedido; nós só mostramos "pending" se o GitHub devolver isso); GitLab e Bitbucket; leitura de repositórios de terceiros a que a pessoa tem acesso mas não instalou.

## 8. Decisões que precisam do PO antes de começar

1. **Aprovação deste escopo**, que vale como a autorização da regra 8 para a integração com o GitHub.
2. **Criação do App no GitHub**: feita por você, na sua conta, com o roteiro que entra em `docs/DEPLOY.md` (nome, permissões, Setup URL, chave privada, três variáveis no Vercel). Posso guiar passo a passo como fiz com o Supabase.
3. **Monitoramento de privados** nesta sprint (§1 item 4) ou só análise sob demanda, deixando o rescan para depois. Recomendo incluir: é o motivo de alguém pagar na sprint seguinte.
4. **Plano pago adiado** para a Sprint 9, conforme §7.

## 9. Ordem de trabalho

1. `github-app.ts` (JWT, token de instalação, consulta), `state` assinado, redação do token; testes com chaves geradas no teste.
2. Migração `installations`, store (memória e Supabase), apagar conta; testes.
3. Serviço: resolver e analisar com token de instalação; rotas `/api/github/*`; testes com GitHub de teste.
4. Site: cartão de autorização, página de retorno, Settings, etiquetas e aviso de compartilhamento; e2e com o stub.
5. Monitor com instalação e pausa por revogação; testes.
6. Admin, aviso de privacidade, `docs/DEPLOY.md` (roteiro do App e variáveis), `docs/ROADMAP.md`, `CHANGELOG.md`.
