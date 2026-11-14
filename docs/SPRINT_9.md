# Gateseeker — Sprint 9: distribuição

> Status: **aprovada pelo PO em 2026-11-13** ("pode seguir com suas sugestões"), a partir da análise de 2026-11-06. Substitui o plano pago que o `docs/ROADMAP.md` punha nesta sprint: o plano pago só volta com o gatilho do §4.

## 1. Por quê

Em 2026-11-06 o produto estava completo e sem uso de fora: 0 estrelas, 3 visitantes únicos no repositório em 14 dias, nenhum repositório público usando a Action. O gargalo é chegar às pessoas, não o que o produto faz. Esta sprint leva o Gateseeker para onde o vibe coder já trabalha (o agente de IA), cria uma página para a dor mais concreta do público (Supabase sem RLS) e passa a medir de onde as visitas vêm.

## 2. Entregas

1. **Servidor MCP** (`gateseeker mcp`): Claude Code, Cursor e outros clientes MCP rodam o portão sozinhos. Uma ferramenta, `gateseeker_scan`, só leitura, presa à pasta do projeto. Sem SDK (JSON-RPC sobre stdio, `src/mcp.ts`).
2. **Hook do Claude Code** (`gateseeker hook claude-code`): antes de um `git commit` do agente, roda o portão e segura o commit em `fail` ou `incomplete`, dizendo ao agente o que corrigir. Opcional, colado pela pessoa; o Gateseeker nunca o instala (trilha A3 do roadmap).
3. **Configurações prontas testadas contra as nossas regras** (`src/agent-snippets.ts`): o `.mcp.json` fixa a versão (GSK-AGENT-003) e o hook usa a cópia instalada no projeto, nunca um download (GSK-AGENT-002). Na página Get started e no README.
4. **Página `/supabase-rls`**: o caso CVE-2025-48757 (registro público), o que o Gateseeker verifica, o que um repositório não mostra (tabelas criadas no painel, políticas generosas demais) com SQL só de leitura para conferir, e como corrigir.
5. **De onde vêm as visitas**: oito contadores agregados (`visit_direct`, `search`, `github`, `hn`, `reddit`, `x`, `linkedin`, `other`), uma vez por aba, só para quem não está logado; vem do `?ref=` dos nossos links ou do domínio de origem, guardado como uma palavra. Migração `20261113000000_visit_sources.sql`. Aviso de privacidade atualizado.
6. **Coletor do feed sem travar**: até aqui, uma proposta aberta sem revisão fazia o coletor pular toda execução (ficou parado de 2026-10-29 a 2026-11-13). Agora as propostas novas entram na mesma PR aberta, com comentário do que chegou.
7. **Versão 1.1.0** (npm e Action), com o servidor MCP e o hook.

## 3. Pendências do PO

1. Aplicar a migração `20261113000000_visit_sources.sql` (DEPLOY §2 passo 12).
2. Aprovar a 1.1.0 no npm depois da tag (RELEASE.md, "A cada versão").
3. Revisar a fila de propostas do feed (PR `intel/…`) na interface de triagem.
4. Publicar o post e divulgar usando links com `?ref=` (por exemplo `https://gateseeker.vercel.app/supabase-rls?ref=reddit`), para o contador dizer qual canal trouxe gente.

## 4. Meta e gatilho

Medida em 2026-11-27 na área de admin: 20 contas de fora com pelo menos uma análise e 5 conversas com usuários. O plano pago volta à mesa quando houver 50 contas com mais de uma análise (gatilho de `docs/GROWTH.md`).
