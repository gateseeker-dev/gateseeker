# Gateseeker — LGPD: registro, incidentes e transferência internacional

> Status: escrito em 2026-11-14 a pedido do PO. **Não é parecer jurídico**: organiza o que o produto faz e o que a lei pede, para revisão por advogado antes do plano pago. Prazos e artigos citados devem ser conferidos no texto vigente na hora de usar.
> Mantém-se junto com o código: quando uma tabela, um provedor ou um prazo de retenção mudar, este documento e `web/src/pages/Legal.tsx` mudam no mesmo PR.

## 1. Registro das operações de tratamento

LGPD art. 37. Formato simplificado, permitido a agentes de tratamento de pequeno porte (Resolução CD/ANPD nº 2/2022).

**Controlador:** Fernando Capone, pessoa natural, Brasil. Enquadra-se como agente de pequeno porte: pessoa natural, sem tratamento de alto risco (não há dados sensíveis, de crianças ou financeiros, nem decisão automatizada sobre pessoas).

**Encarregado:** dispensado pela Resolução nº 2/2022. Em seu lugar há um canal de comunicação: fernando.capone@gmail.com, publicado em `/privacy`.

**Titulares:** quem entra no site com a conta do GitHub, e quem visita o site sem entrar (só em contadores sem identificação).

| Operação | Dados pessoais | Finalidade | Base legal (art. 7) | Onde fica | Retenção |
|---|---|---|---|---|---|
| Conta e login | id, login, nome, avatar e e-mail do GitHub | identificar a conta | V (contrato) | Supabase Auth | enquanto a conta existir |
| Autorizações do GitHub App | número da instalação, login da conta ou organização | ler repositórios privados autorizados | V | tabela `installations` | até desconectar ou apagar a conta |
| Relatórios salvos | repositório, commit, achados e linhas de código apontadas (segredos sempre mascarados) | mostrar o resultado da análise | V | tabela `reports` | 30 dias |
| Histórico de análises | repositório, commit, veredito, contagem por prioridade | painel em qualquer aparelho | V | tabela `scans` | 180 dias |
| Repositórios seguidos | repositório, data da última verificação, resumo dos achados novos | reanálise diária e aviso | I (consentimento: botão Follow) | tabela `follows` | até deixar de seguir ou apagar a conta |
| Alertas por e-mail | e-mail (lido na hora do envio, nunca copiado), repositório, lista curta de achados | avisar sobre achados novos | I | Brevo (envio) | não guardado por nós; logs do Brevo pela política dele |
| Limites de uso | contagem de análises na hora corrente | uso justo do serviço gratuito | IX (legítimo interesse) | tabela `scan_quota` | janela de 1 hora, sobrescrita |
| Datas de acesso | primeiro e último acesso (precisão de 5 min) | operar o serviço, atender e prevenir abuso | IX | tabela `accounts` | enquanto a conta existir |
| Relatório compartilhado | marca de "público" no relatório que o dono escolheu compartilhar | link público pedido pelo dono | V | tabela `reports` | 30 dias, ou até o dono desligar |
| Logs de requisição | endereço IP, horário, caminho | funcionamento e segurança da hospedagem | IX | Vercel | curto, pela política do Vercel |
| Armazenamento no navegador | sessão, cópia do histórico, notificações | funcionamento da página | V | aparelho do titular | até sair, limpar o navegador ou apagar a conta |

**Sem dado pessoal (fora do registro, listado para completude):**
- contadores agregados por dia (`events`), inclusive a origem das visitas como uma palavra;
- teto diário de e-mails (`email_quota`);
- conjuntos do feed (`feed_sets`);
- a tabela `waitlist`, que existe desde a Sprint 4 e não recebe dados (nenhuma tela grava nela).

**Dados de terceiros dentro de repositórios analisados:** o código analisado pode conter dados pessoais de outras pessoas, como nomes e e-mails de autores em arquivos. Os relatórios guardam só as linhas apontadas por um achado, com segredos mascarados, por 30 dias, e só o dono da conta os abre. Para repositórios públicos, são dados tornados públicos pelo próprio titular (art. 7, §4).

**Exclusão:** "Delete account" em Settings apaga follows, scans, reports, scan_quota, waitlist, accounts, installations e o cadastro no Supabase Auth (`deleteAccount` em `src/web/store.ts`). Pedidos por e-mail são atendidos em até 15 dias (art. 19).

## 2. Plano de resposta a incidentes

Um incidente é qualquer acesso, perda ou divulgação não autorizada de dados pessoais. Exemplos: uma chave de serviço vazada, o banco acessado por terceiro, um relatório de uma conta aberto por outra.

**Quem faz o quê:**
- O PO decide e comunica.
- A engenharia investiga, contém e corrige.

### Passo 1: conter (nas primeiras horas)

Trocar toda credencial que possa ter vazado e publicar o site de novo para valerem as novas:

| Credencial | Onde trocar |
|---|---|
| Chave `service_role` / secret do Supabase | Supabase → Project Settings → API Keys |
| `BREVO_API_KEY` | Brevo → SMTP & API → API Keys |
| Chave privada do GitHub App | GitHub → Settings → Developer settings → GitHub Apps → Gateseeker → Private keys |
| `GATESEEKER_FEED_KEY`, `GATESEEKER_EMAIL_KEY`, `CRON_SECRET` | gerar valores novos; Vercel → Settings → Environment Variables (a do feed também no GitHub → Secrets) |
| Token do npm | não existe: a publicação usa proveniência sem token guardado |

Depois: Vercel → Deployments → Redeploy. Se a falha estiver no código, tirar a função do ar (Deployment Protection) até a correção.

### Passo 2: avaliar (até 2 dias)

- Quais dados, de quantas contas, desde quando, e se há como saber quem acessou (logs do Supabase e do Vercel).
- Se o incidente **pode causar risco ou dano relevante** aos titulares. Exemplos: e-mails expostos em massa, acesso a relatórios de repositórios privados, credenciais de terceiros. Isso decide o passo 3.

### Passo 3: comunicar, se houver risco ou dano relevante

- **ANPD:** pelo formulário de comunicação de incidente de segurança no portal gov.br da ANPD. O prazo da Resolução CD/ANPD nº 15/2024 é de **3 dias úteis** a partir de quando se soube do incidente, contado em dobro para agente de pequeno porte. Conferir o prazo vigente.
- **Titulares afetados:** no mesmo prazo, por e-mail, com:
  - o que aconteceu e quando;
  - quais dados foram atingidos;
  - os riscos;
  - o que foi feito;
  - o que a pessoa pode fazer;
  - o canal de contato.

  Modelo na seção 2.1.
- Sem risco ou dano relevante, não há comunicação obrigatória, mas o registro do passo 4 continua obrigatório.

### Passo 4: registrar

Um arquivo por incidente em local privado, fora do repositório público, guardado por **pelo menos 5 anos** (Resolução nº 15/2024). Conteúdo:
- data em que se soube;
- o que aconteceu;
- dados e titulares afetados;
- avaliação de risco;
- medidas;
- comunicações feitas (ou por que não foram feitas).

### Passo 5: aprender

Corrigir a causa, adicionar um teste que teria pegado a falha e atualizar `docs/THREAT_MODEL.md`.

### 2.1. Modelo de e-mail aos titulares

> Assunto: Gateseeker: incidente de segurança que afetou sua conta
>
> Em [data], identificamos que [o que aconteceu, em uma frase]. Os dados atingidos foram [lista]. Não foram atingidos [lista, quando ajudar].
>
> O risco para você é [frase simples]. Já fizemos [medidas]. Recomendamos que você [ação, se houver].
>
> Dúvidas: fernando.capone@gmail.com. Você também pode apagar sua conta a qualquer momento em Settings → Delete account.

## 3. Transferência internacional

Todos os provedores guardam ou processam dados fora do Brasil. A LGPD (art. 33) só permite isso por um dos caminhos previstos. A Resolução CD/ANPD nº 19/2024 regulamentou as **cláusulas-padrão contratuais (SCC) da ANPD**, que precisam estar incorporadas nos contratos de quem as usa.

**Situação em 2026-11-14:** pesquisa nas páginas legais públicas de cada um.

| Provedor | O que recebe | Contrato de tratamento (DPA) | Cláusulas da ANPD |
|---|---|---|---|
| Vercel | hospedagem, logs com IP | DPA público em vercel.com/legal/dpa, parte dos termos | não encontradas; o DPA cita só as cláusulas europeias |
| Supabase | conta, e-mail, banco | DPA citado no FAQ de residência de dados (supabase.com/legal/privacy-resources/data-residency-and-transfers-faq); processador principal em Singapura, suporte nos EUA | não encontradas |
| Brevo | e-mail e conteúdo do alerta | DPA nos termos legais do Brevo | não encontradas |
| GitHub | login, leitura de repositórios | GitHub Data Protection Agreement (site-policy do GitHub) | não encontradas |

**Plano, em ordem:**

1. **[PO]** Guardar uma cópia (PDF) do DPA vigente de cada provedor numa pasta privada. É o que comprova o contrato se a ANPD perguntar.
2. **[PO]** Enviar a cada provedor a pergunta da seção 3.1 pelo suporte ou e-mail de privacidade, e guardar as respostas.
3. **Enquanto as respostas não chegam:** a hipótese a confirmar com advogado é o art. 33, IX, transferência necessária para executar o contrato pedido pelo titular (art. 7, V). Ela cobre a hospedagem, o login e o envio dos alertas que a própria pessoa ligou. O aviso de privacidade já informa que os servidores podem ficar fora do Brasil e lista cada provedor.
4. **Se um provedor não oferecer as cláusulas** e o advogado não aceitar o art. 33, IX, as alternativas são:
   - o Supabase oferece projetos na região de São Paulo e o Vercel tem região de funções em São Paulo, o que reduz a transferência mas não a elimina (suporte e subprocessadores no exterior);
   - trocar por um provedor que publique as cláusulas da ANPD.

### 3.1. Pergunta aos provedores (em inglês)

> Subject: Brazilian Standard Contractual Clauses (ANPD Resolution 19/2024)
>
> Hello. I am the controller of a small service that uses [Vercel / Supabase / Brevo / GitHub] to process personal data of users in Brazil. Under Brazil's LGPD and ANPD Resolution CD/ANPD No. 19/2024, international transfers based on standard contractual clauses must incorporate the ANPD-approved clauses.
>
> 1. Does your Data Processing Agreement include, or can you provide, the Brazilian Standard Contractual Clauses approved by the ANPD?
> 2. If not, which transfer mechanism under LGPD art. 33 do you rely on for data from Brazil?
>
> Account: [e-mail ou nome da conta]. Thank you.
