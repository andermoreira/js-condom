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
- [Corpus](../corpus/official-cases.json) — achado da revisão de 2026-10-16: 11 dos 22 casos
  oficiais têm `sourceHash` idêntico a um caso do piloto. Em todos os pares, `official-<categoria>-001`
  é igual a `pilot-<categoria>-001`. `validateCorpus` só verifica se os `caseId` são disjuntos, e
  por isso aceitou `partitionsDisjoint: true`. Como o piloto calibrou o limiar (OQ1), metade da
  partição oficial não era dado inédito. Isso reforça a classificação `evidencia-insuficiente`
  desta spec. O corpus histórico não foi alterado. Exigir disjunção por `sourceHash` invalidaria
  o corpus atual e fica pendente de decisão.
- [Sampling](../src/analysis/pilot.js) — achado da revisão de 2026-10-16: os manifests do piloto e
  o oficial congelaram `sampling.minimumCasesPerCategory: {}`. A política OQ2 guarda esse mínimo
  como número, e o manifest espalhava esse número dentro de um objeto, o que resulta em `{}`. Por
  isso `verifySampleSize` nunca verificou o mínimo por categoria. `validateCorpus` faz a mesma
  verificação por outro caminho, e o corpus oficial tem exatamente 2 casos por categoria, então
  não houve violação. O código passou a gerar o mapa por categoria. Os manifests históricos não
  foram regenerados.
- [Diversidade](../src/diversity/similarity.js) — achado da revisão de 2026-10-16: a métrica
  `tree-edit@1` atribui similaridade 0,99 a dois programas sem relação (uma função `add` e uma
  classe `Queue`). No alinhamento de arrays, substituir uma subárvore inteira custa 1,
  independentemente do tamanho dela. Assim, a distância fica perto do número de statements de
  topo, enquanto o divisor é o tamanho da árvore. Os valores de diversidade AST publicados não
  discriminam variantes e não devem ser lidos como evidência de polimorfismo. A métrica está
  congelada no manifest. Corrigi-la exige uma `tree-edit@2` e fica pendente de decisão. Na mesma
  revisão foi corrigido um defeito menor da normalização: literais regex eram tokenizados como
  `Null`. Nenhuma das 216 células registradas contém regex, então os números publicados não mudam.
- [Blinding](../src/recovery/blinding.js) — achado da revisão de 2026-10-16: o `blindArtifactId`
  gerado com RNG terminava em `-${index}`, a posição na lista de artefatos. Essa lista segue sempre
  a ordem controle → `oss-baseline` × seeds → `oss-extension` × seeds → `own-minimal` × seeds por
  caso. Em [blinding-map.json](../experiments/official/blinding-map.json), por exemplo,
  `artifact-9efa3b21-0` é `unprotected-control` e `-1` a `-3` são `oss-baseline`. Assim, a visão
  do avaliador (`buildEvaluatorView`) revelava o candidato a qualquer leitor humano, e o AC12 não
  se sustentava para avaliação humana. Os evaluators executados na matriz oficial (`webcrack` e
  comparação de AST) são automáticos, e o prompt do LLM usa só o objetivo e o código. Por isso não
  há indício de viés nos resultados registrados. **Correção pendente de decisão:** remover o
  sufixo faz os hashes de blinding do manifest oficial congelado deixarem de ser reproduzíveis, e
  `test/runner/official-blinding.test.js` protege justamente essa reprodução. Enquanto não houver
  decisão, o teste da correção fica como `todo` em `test/recovery/recovery-runner.test.js`.

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
2. Após aprovação do reposicionamento, revisar o core e gerar novos Atomic Steps; a versão aceita está arquivada em `specs/archive/2026-08-09-js-condom-core/`.
3. Antes de qualquer implementação, criar uma spec técnica separada para o harness experimental e
   resolver os bloqueios de segurança e dependências.
