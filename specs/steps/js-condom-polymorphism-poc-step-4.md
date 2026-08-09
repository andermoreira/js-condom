# Passo 4: Implementar a extensão OSS

## Goal

Implementar no candidato `oss-extension` a transform mínima comum escolhida e publicar sua evidência de conformidade.

## Rastreabilidade

- Plano de implementação: item 4.
- Acceptance criteria: AC8.
- Open question: OQ3 deve estar resolvida pelo POC antes do handoff deste passo.

## Arquivos previstos

- `src/protocol/transformation-slice.js`
- `src/candidates/oss-extension.js`
- `test/candidates/oss-extension.test.js`
- `test/candidates/slice-conformance.test.js`

Total: 4 arquivos lógicos.

## Tarefas

1. Registrar em `transformation-slice.js` a decisão de OQ3: ID/versão, estágio de input, node types elegíveis, seleção, variantes, parâmetros lógicos e allowlist de transforms auxiliares (AC8).
2. Implementar `oss-extension` estritamente sobre essa fatia, sem proteção auxiliar ou estágio diferente não declarados (AC8).
3. Emitir evidências referenciáveis de conformidade para configuração e artefato (AC8).
4. Criar fixtures que provem aplicação e não aplicação nos mesmos limites da fatia e testes que rejeitem desvios de estágio, parâmetros ou transforms auxiliares (AC8).

## Delta de complexidade planejado

- Abstrações: contrato concreto da fatia compartilhada → AC8; comparar apenas outputs não prova igualdade de estágio, elegibilidade, parâmetros e auxiliares.
- Dependências: none; a extensão reutiliza a dependência OSS já fixada pelo baseline.
- Configuração: definição versionada da fatia → AC8; os dois candidatos customizados precisam compartilhar uma única referência verificável.
- Extension points: none; somente a fatia escolhida em OQ3 pertence ao POC.
- Camadas arquiteturais: none; os arquivos estendem diretamente o conjunto de candidatos experimentais.

## Riscos e edge cases

- OQ3 ser substituída por uma decisão implícita na implementação.
- A extensão herdar transforms do baseline que não estejam na allowlist.
- Fixtures verificarem apenas aparência do output, não a semântica da fatia.

## Fora de Escopo

- Implementar o candidato próprio.
- Declarar qual candidato venceu.
- Adicionar transforms além da fatia aprovada.

## Critério de Pronto

- OQ3 está registrada como contrato versionado, sem placeholders.
- `oss-extension` usa o estágio e os parâmetros aprovados sem auxiliares ocultos.
- Evidências e fixtures de conformidade passam e detectam desvios.

## Dependências

- Passos 1, 2 e 3 concluídos.
- Decisão explícita do POC para OQ3.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 4 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs e Open Questions afetadas estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [ ] OQ3 resolvida e fatia comum registrada sem placeholders.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 4 descrito em `@specs/steps/js-condom-polymorphism-poc-step-4.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Antes de editar, confirme que OQ3 está resolvida; se não estiver, interrompa o handoff sem escolher uma transform. Edite somente `src/protocol/transformation-slice.js`, `src/candidates/oss-extension.js`, `test/candidates/oss-extension.test.js` e `test/candidates/slice-conformance.test.js`. Não implemente o candidato próprio nem transforms auxiliares fora da allowlist. O passo termina quando contrato, adapter e fixtures comprovam a conformidade da fatia.
