# Passo 1: Definir o protocolo e o manifest do piloto

## Goal

Criar o contrato validável que congela a configuração do experimento antes de qualquer execução.

## Rastreabilidade

- Plano de implementação: item 1.
- Acceptance criteria: AC1, AC2, AC11, AC12, AC15 e AC18.
- Open questions: OQ7 já está resolvida na spec; OQ1, OQ5 e OQ6 permanecem como saídas do piloto.

## Arquivos previstos

- `package.json`
- `package-lock.json`
- `src/protocol/experiment-manifest.schema.json`
- `src/protocol/validate-manifest.js`
- `test/protocol/experiment-manifest.test.js`

Total: 5 arquivos lógicos.

## Tarefas

1. Definir em `experiment-manifest.schema.json` todos os campos, enums e invariantes de `ExperimentManifest` descritos na spec, inclusive controle, três candidatos, fatia comum, seeds, evaluators, budgets, sampling, decisão, blinding e compatibilidade de ambiente (AC1, AC2, AC11, AC12 e AC15).
2. Codificar a decisão aprovada de OQ7: exigir igualdade de `os`, `architecture` e `nodeVersion`, tratar `cpu` e `memoryBytes` como informativos e validar que os dois conjuntos são exatos, disjuntos e completos (AC1).
3. Implementar `validate-manifest.js` para validar schema e invariantes cruzados, falhando antes da execução com diagnósticos acionáveis e sem acesso à rede (AC1 e AC18).
4. Adicionar apenas as dependências estritamente necessárias e scripts de validação/teste nos manifests do npm (AC1).
5. Cobrir manifests válidos de piloto/oficial e rejeições de threshold pendente na fase oficial, braços incorretos, referências quebradas, fatia divergente, sampling inconsistente e campos de ambiente não classificados (AC1, AC2, AC11 e AC15).

## Delta de complexidade planejado

- Abstrações: `validate-manifest` → AC1; o JSON Schema isolado não valida referências e invariantes cruzados do protocolo.
- Dependências: implementação de JSON Schema fixada no lockfile → AC1; validação manual duplicaria o contrato declarativo e aumentaria o risco de drift.
- Configuração: schema versionado do manifest → AC1; é necessário congelar um contrato único e validável antes da matriz.
- Extension points: none; a spec rejeita provider genérico além dos candidatos atuais.
- Camadas arquiteturais: none; `src/protocol` é somente organização dos arquivos deste contrato.

## Riscos e edge cases

- Validação apenas estrutural deixar invariantes cruzados sem cobertura.
- O schema aceitar um quarto candidato ou tratar o controle como provider.
- Manifest oficial aceitar decisões ainda pendentes do piloto.
- Classificação de ambiente incompleta ou sobreposta.

## Fora de Escopo

- Criar corpus, adapters, runners ou relatórios.
- Escolher o valor numérico do threshold, budgets, seeds ou repetições.
- Criar framework genérico de providers.

## Critério de Pronto

- O manifest válido representa integralmente o modelo aprovado e um manifest oficial incompleto é rejeitado.
- O validador lista erros de schema e invariantes antes da execução.
- A classificação de ambiente aprovada em OQ7 está codificada no contrato e coberta por testes.
- Testes do passo passam offline.

## Dependências

- Nenhum passo anterior.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 1 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs e Open Questions afetadas estão explícitos; OQ7 foi resolvida antes do handoff.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [x] Não há decisão arquitetural nova além da spec aprovada.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 1 descrito em `@specs/steps/js-condom-polymorphism-poc-step-1.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Edite somente `package.json`, `package-lock.json`, `src/protocol/experiment-manifest.schema.json`, `src/protocol/validate-manifest.js` e `test/protocol/experiment-manifest.test.js`. Entregue schema e validação cruzada do manifest, codifique a classificação de ambiente já aprovada em OQ7 e mantenha OQ1/OQ5/OQ6 pendentes para o piloto. Não implemente corpus, candidatos, runners ou relatórios. O passo termina quando os testes offline passam e manifests oficiais incompletos são rejeitados com diagnóstico.
