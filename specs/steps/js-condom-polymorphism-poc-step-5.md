# Passo 5: Implementar o candidato próprio mínimo

## Goal

Implementar `own-minimal` com a mesma fatia e o mesmo estágio de input de `oss-extension`, sem ampliar o escopo do POC.

## Rastreabilidade

- Plano de implementação: item 5.
- Acceptance criteria: AC8.

## Arquivos previstos

- `package.json`
- `package-lock.json`
- `src/candidates/own-minimal.js`
- `test/candidates/own-minimal.test.js`
- `test/candidates/slice-conformance.test.js`

Total: 5 arquivos lógicos.

## Tarefas

1. Adicionar somente o parser/gerador JavaScript necessário à fatia aprovada, com versão e integridade fixadas (AC8).
2. Implementar `own-minimal` usando o contrato versionado do Passo 4, o mesmo estágio, elegibilidade, parâmetros lógicos e allowlist (AC8).
3. Registrar a projeção da seed e evidências de conformidade sem bridge Rust/Wasm ou auxiliares não declarados (AC8).
4. Reutilizar e completar as fixtures de conformidade para provar equivalência da fatia entre os dois candidatos customizados, incluindo rejeição de desvios (AC8).

## Delta de complexidade planejado

- Abstrações: candidato concreto `own-minimal` → AC8; reutilizar o adapter OSS não testaria a alternativa própria exigida pela matriz.
- Dependências: parser/gerador existente fixado no lockfile → AC8; a alternativa própria precisa transformar e regerar o mesmo estágio AST sem reimplementar parser/codegen.
- Configuração: none; o candidato consome exclusivamente a fatia versionada do Passo 4.
- Extension points: none; não há requisito para engine ou catálogo de transforms de produção.
- Camadas arquiteturais: none; o arquivo adiciona diretamente o terceiro candidato experimental.

## Riscos e edge cases

- Diferenças do parser alterarem o estágio de input efetivo.
- Implementação própria ganhar transforms auxiliares acidentalmente.
- Seeds equivalentes selecionarem conjuntos diferentes por projeção inconsistente.

## Fora de Escopo

- Rust, Wasm, VM bytecode ou engine de produção.
- Transforms que não pertençam à fatia aprovada.
- Otimizações de performance não necessárias à conformidade.

## Critério de Pronto

- `own-minimal` implementa somente a fatia aprovada e registra sua seed projetada.
- Os dois candidatos customizados passam as mesmas fixtures de conformidade.
- Qualquer desvio de estágio, parâmetros ou auxiliares é detectado pelos testes.

## Dependências

- Passos 1, 2 e 4 concluídos.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 5 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs afetados estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [x] OQ3 já deve estar resolvida pelo Passo 4.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 5 descrito em `@specs/steps/js-condom-polymorphism-poc-step-5.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Edite somente `package.json`, `package-lock.json`, `src/candidates/own-minimal.js`, `test/candidates/own-minimal.test.js` e `test/candidates/slice-conformance.test.js`. Use exatamente o contrato produzido no Passo 4. Não adicione Rust/Wasm, VM, transforms auxiliares ou abstrações de produção. O passo termina quando ambos os candidatos customizados passam as mesmas fixtures e qualquer desvio é rejeitado.
