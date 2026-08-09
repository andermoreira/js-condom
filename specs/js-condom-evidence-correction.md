# Spec: correção da evidência e reposicionamento do `js-condom`

> **Status:** Draft — descoberta concluída; sem Atomic Steps até aprovação do reposicionamento.

## Goal

Restabelecer uma base documental honesta para a decisão do `js-condom`, separando a escolha de
orquestração OSS da eficácia adversarial não demonstrada e preparando um core v1 orientado a
execução offline, reprodução e segurança operacional.

## Non-goals

- Não implementar CLI, API, sandbox, correção do harness ou qualquer código de produção nesta
  mudança documental.
- Não repetir a matriz adversarial enquanto resistência mensurada não for requisito explícito do
  produto.
- Não afirmar que o POC provou reversibilidade, resistência a LLM ou superioridade de qualquer
  candidato.

## User stories

### US1 — Decidir o rumo da v1

**Given** o resultado publicado do POC e a revisão do harness

**When** o responsável avalia a arquitetura

**Then** distingue uma decisão de simplicidade operacional de uma medição de eficácia adversarial.

### US2 — Impedir implementação prematura

**Given** a spec do core ainda bloqueada

**When** um handoff for preparado

**Then** o fluxo exige Goal reformulado e aprovação antes de criar Atomic Steps.

## Assumptions

1. O repositório atual é um laboratório/POC e não há release de produção dependente dos artefatos
   experimentais.
2. A escolha de um wrapper OSS atende ao objetivo atual de reduzir complexidade, desde que a
   documentação não apresente a camada como boundary de segurança.
3. Uma eventual claim de resistência será tratada como requisito separado, com protocolo próprio.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| O wrapper não ter diferenciação suficiente para usuários reais | Alto | Validar o objetivo de produto antes de ampliar a implementação |
| Um leitor interpretar o POC como benchmark de resistência | Alto | Reclassificar o resultado e manter a claim explicitamente proibida |
| Código não confiável escapar do runner experimental | Crítico | Exigir isolamento de sistema operacional antes de aceitar novo corpus |
| A correção documental divergir dos artefatos históricos | Médio | Manter links para manifest/resultados e registrar o ADR 002 como decisão posterior |

## Error handling

Qualquer relatório que use o endpoint atual para afirmar resistência deve ser classificado como
`evidencia-insuficiente`. Uma matriz futura com evaluator inválido, chamada de modelo inexistente,
isolamento ausente ou célula incompleta não pode produzir conclusão arquitetural favorável.

## Threat model

- O autor do experimento pode interpretar um oracle de execução como recuperação de lógica.
- Um evaluator pode ser configurado para não executar nenhuma tentativa e ainda gerar uma taxa
  numérica.
- Código do corpus pode acessar rede, filesystem, ambiente ou processos do host se o runner apenas
  bloquear APIs superficiais.

A postura é fail-closed para decisões: ausência de medição causal ou de isolamento válido produz
evidência insuficiente, nunca resistência presumida.

## Evidence anchors

- [Evaluator primário](../src/recovery/recovery-runner.js) — opções atuais do `webcrack` e oracle
  semântico.
- [Evaluator anti-LLM](../src/recovery/llm-evaluator.js) — limite que impede tentativas quando o
  budget tem `maxToolInvocations: 0`.
- [Resultados oficiais](../experiments/official/results.json) e [relatório](../experiments/official/report.md)
  — artefatos históricos preservados, agora interpretados pelo ADR 002.
- [ADR 002](../adr/002-evidencia-e-posicionamento-v1.md) — decisão de posicionamento.

## Acceptance criteria

1. O resultado do POC é classificado como `evidencia-insuficiente` para eficácia adversarial,
   porque o evaluator primário desabilita `deobfuscate`/`unpack` e valida apenas execução do
   resultado; a decisão de não criar engine própria fica registrada como decisão de simplicidade,
   não como efeito medido.
2. A dimensão anti-LLM é classificada como inconclusiva: o manifest oficial usa
   `maxToolInvocations: 0`, portanto os trials não fizeram chamadas ao modelo.
3. O ADR novo supera a interpretação de eficácia do ADR 001 e fixa o posicionamento provisório da
   v1 como wrapper offline, auditável e reproduzível sobre o baseline OSS, sem claim de
   polimorfismo defensivo.
4. O benchmark e as referências da spec do core não apresentam os 0 pp como medição adversarial
   válida; o core permanece bloqueado até Goal, escopo e critérios de aceite serem reformulados.
5. O documento registra como pré-condições técnicas para qualquer implementação futura: isolamento
   real de código não confiável, atualização do `ses` vulnerável, alinhamento de runtime/dependências
   e correção dos timers que mantêm a suíte aberta.

## Open questions

- Qual redação final do Goal do core melhor representa o wrapper operacional e seus usuários-alvo?
- Resistência adversarial continua sendo requisito de produto? Se sim, uma nova spec de POC deverá
  definir um evaluator que realmente desofusque/recupere lógica e um sandbox de sistema operacional.

## Implementation plan

1. Registrar a decisão e as limitações no ADR 002 e no benchmark durável.
2. Após aprovação do reposicionamento, revisar `specs/js-condom-core.md` e gerar novos Atomic Steps.
3. Antes de qualquer implementação, criar uma spec técnica separada para o harness experimental e
   resolver os bloqueios de segurança e dependências.
