# Gateseeker — Rodada de crescimento (2026-11-03)

> Status: análise apresentada ao PO em 2026-11-03; itens 1 a 10 aprovados ("os demais itens pode executar"), e-mail (Brevo, domínio) deixado para o fim. Implementado em 2026-11-03 e listado em §3. Decisões que ficam com o PO em §4.

## 1. Diagnóstico

Seis sprints em oito dias: motor completo (npm, pnpm, Yarn e Composer; Bun ainda não), OSV e Packagist mais o feed curado assinado, treze regras de padrão (oito de vibe coding e cinco de configuração de agentes), regras estruturais de supply chain, Action com SARIF, workspace com login, histórico, comparação, acompanhamento com reanálise diária, alertas por e-mail (pendente de configuração), PDF, termos, privacidade e exclusão de conta.

Uso: nenhum. Em 2026-11-03 o repositório tinha 0 estrelas; o npm registrava 585 downloads no dia da publicação (robôs e espelhos) e cerca de 10 por dia depois; `npm install gateseeker` entregava a `1.0.0-beta.1`, de seis sprints atrás, porque a dist-tag `latest` nunca foi movida. Nenhuma métrica de sprint pôde ser medida porque ninguém de fora analisou um repositório.

Conclusão: o produto está à frente da distribuição. Cada sprint testou uma hipótese de produto; nenhuma hipótese de aquisição foi testada. O risco é construir a Sprint 7 (repositórios privados, plano pago) sem um usuário que tenha dito "isso me serviu".

## 2. Oportunidades de crescimento (em ordem de custo)

1. **Feed curado como conteúdo.** Cada registro aprovado vira uma página pública que responde o que as pessoas pesquisam na hora do incidente. Implementado (§3).
2. **Regras de agentes como história de lançamento.** A validação da Sprint 5 mediu dez repositórios populares com `.claude/`, `.cursor/` e `.mcp.json`; é um post com dado real e ferramenta grátis para reproduzir. Rascunho em `docs/posts/2026-11-agent-config-rules.md`.
3. **Ir onde o público está.** Comunidades de Lovable, Bolt, v0 e Supabase, r/vibecoding, X; a regra de RLS fala com a comunidade Supabase; Laravel-Lang fala com Laravel News. Depende do PO (publicação).
4. **Templates como canal.** Dois repositórios já analisados são templates de SaaS populares; um PR com o workflow do Gateseeker coloca o portão em todo projeto gerado a partir deles. Depende de aprovação (interação pública com terceiros).
5. **Relatório compartilhável.** Implementado (§3): link público opcional por relatório.
6. **Marketplace do GitHub.** Roteiro em `docs/RELEASE.md`; a publicação é um clique do PO na tela de release.
7. **Monetização condicionada a sinal.** Sprint 7 só depois de um gatilho objetivo: 50 contas com mais de uma análise, lido na seção de contadores.

## 3. O que entrou nesta rodada

| # | Item | Onde |
|---|---|---|
| 1 | Metadados de compartilhamento (`og:image`, Twitter card), imagem 1200×630 e favicon | `web/index.html`, `web/public/og.png`, `web/public/favicon.svg` |
| 2 | Selo "checked with Gateseeker" para README, com o trecho pronto em Get started e no README do projeto | `web/public/badge.svg`, `web/src/pages/GetStarted.tsx` |
| 3 | Exemplo ao vivo na Home sem login: `GET /api/example` analisa `GATESEEKER_EXAMPLE_REPO` sem cota, reusa por commit (memória da instância ou relatório de qualquer conta nas últimas 24 h), uma análise por vez por instância, nada salvo | `src/web/handler.ts` (`handleExampleRequest`), `web/src/components/LiveExample.tsx` |
| 4 | Link público opcional de relatório: `POST/DELETE /api/reports/<id>/share` (só o dono), `GET /api/public/<id>` sem sessão, página `/p/<id>` com chamada para analisar o próprio repositório. O corpo guardado já foi redigido antes de ser salvo | migração `20261104000000_public_reports.sql`, `web/src/pages/PublicReport.tsx`, `ShareButton.tsx` |
| 5 | Contadores do produto em Settings para os logins de `GATESEEKER_ADMIN_LOGINS` (`GET /api/funnel`, 404 para os demais): funil de login, exemplo aberto, relatórios compartilhados abertos, reanálises, e-mails, análises e contas em 14 dias, repositórios seguidos | `web/src/components/ProductCounters.tsx` |
| 6 | Páginas públicas por registro do feed: `/advisories` e `/advisories/<id>`, geradas do conjunto embutido no build; só texto, links só das fontes | `web/src/pages/Advisories.tsx` |
| 7 | Dois contadores novos: `example_view` e `public_report_view` | migração acima |
| 8 | Roteiro do Marketplace e da primeira versão estável | `docs/RELEASE.md` |
| 9 | Rascunho do post de lançamento das regras de agentes | `docs/posts/2026-11-agent-config-rules.md` |

Testes: 5 testes de navegador novos (exemplo ao vivo, compartilhar e parar de compartilhar, contadores só para o admin, páginas do feed, selo e imagem) e testes unitários dos três handlers, incluindo o PATCH/GET do Supabase e a concorrência do exemplo.

Segurança: o exemplo público não gasta cota de ninguém mas gasta GitHub API e OSV; está limitado a uma análise por vez por instância e reuso de 24 h por commit, e o repositório é o nosso. O link público só existe quando o dono liga; o relatório guardado nunca contém um segredo inteiro (redação antes de salvar, testada). A seção de contadores só é entregue ao login configurado; qualquer outro recebe o mesmo 404 de uma rota inexistente.

## 4. Decisões e passos que ficam com o PO

1. **Versão 1.0.0 no npm** (move a `latest`): aprovar; engenharia prepara, PO aprova no npm e marca o Marketplace na mesma release (`docs/RELEASE.md`).
2. **Migração `20261104000000_public_reports.sql`** no editor SQL do Supabase, e a variável `GATESEEKER_ADMIN_LOGINS` no Vercel com o seu login do GitHub, depois Redeploy (`docs/DEPLOY.md` §2 e §5).
3. **Domínio próprio** (continua pendente; o e-mail depende dele).
4. **Publicação do post** das regras de agentes e divulgação nas comunidades (texto em inglês pronto para revisão).
5. **PR em templates de terceiros**: aprovar ou não; só depois dos primeiros usuários.

## 5. O que medir nas próximas duas semanas

Na seção "Product counters" de Settings: visitas à página de login e conversão para login (meta da decisão 1 do roadmap: abrir análise anônima se a desistência passar de 40%), exemplo ao vivo aberto, relatórios compartilhados abertos, análises e contas distintas, repositórios seguidos. Decisão da Sprint 7 só com esses números.
