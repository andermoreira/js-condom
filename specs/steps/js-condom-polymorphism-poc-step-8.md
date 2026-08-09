# Passo 8: Implementar métricas de diversidade

## Goal

Calcular similaridade normalizada por tokens e AST para todos os pares de seeds do mesmo caso e candidato.

## Rastreabilidade

- Plano de implementação: item 8.
- Acceptance criteria: AC9.

## Arquivos previstos

- `src/diversity/normalize.js`
- `src/diversity/similarity.js`
- `src/diversity/diversity-runner.js`
- `test/diversity/diversity-runner.test.js`

Total: 4 arquivos lógicos.

## Tarefas

1. Implementar normalizadores versionáveis para tokens e AST que removam whitespace, nomes e literais conforme política explícita (AC9).
2. Implementar algoritmos de similaridade com saída finita em `[0, 1]`, incluindo casos vazios e idênticos (AC9).
3. Enumerar todos os pares não ordenados de seeds por caso/candidato e preservar cada comparação no `CaseResult` (AC9).
4. Rejeitar comparação entre casos/candidatos diferentes ou quando faltarem seeds previstas no manifest (AC9).
5. Testar normalização contra ruído cosmético, limites do range, número esperado de pares e proibição de percentual de linhas como métrica (AC9).

## Delta de complexidade planejado

- Abstrações: normalização token/AST, similaridade e enumeração de pares → AC9; comparação textual direta não remove ruído nem garante todos os pares de seeds.
- Dependências: none; o parser já fixado pelo candidato próprio basta para a normalização AST atual.
- Configuração: IDs e versões das métricas no manifest → AC9; os algoritmos precisam permanecer identificáveis e reproduzíveis entre execuções.
- Extension points: none; não há requisito para registry genérico de métricas.
- Camadas arquiteturais: none; os arquivos implementam diretamente a única análise estrutural do POC.

## Riscos e edge cases

- Normalização apagar toda a estrutura relevante.
- Métrica retornar `NaN` para artefatos vazios.
- Pares duplicados ou ausentes distorcerem o agregado.
- Resultado ser interpretado como endpoint primário.

## Fora de Escopo

- Percentual de linhas, aparência visual ou score composto.
- Agregar diversidade com recuperação.
- Decidir arquitetura com base isolada nessa métrica.

## Critério de Pronto

- Token e AST geram resultados versionáveis em `[0, 1]`.
- Todos e somente os pares de seeds aplicáveis são preservados.
- Testes provam resistência a ruído cosmético e cobrem limites e ausências.

## Dependências

- Passos 1, 2, 4 e 5 concluídos.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 8 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs afetados estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [x] Nenhuma Open Question bloqueia a implementação das métricas.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 8 descrito em `@specs/steps/js-condom-polymorphism-poc-step-8.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Edite somente `src/diversity/normalize.js`, `src/diversity/similarity.js`, `src/diversity/diversity-runner.js` e `test/diversity/diversity-runner.test.js`. Calcule tokens e AST normalizados para todos os pares de seeds e preserve resultados em `[0, 1]`. Não implemente métricas de linhas, score composto ou decisão arquitetural. O passo termina quando cobertura de pares, normalização e limites passam nos testes.
