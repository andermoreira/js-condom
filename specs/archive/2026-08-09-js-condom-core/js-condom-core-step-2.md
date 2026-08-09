# Atomic Step 2 — API e validação semântica

## Goal

Implementar a API offline sobre a engine qualificada, com análise fail-closed de hazards e
validação pós-transform na matriz de fixtures.

## Rastreabilidade

- Spec: `specs/archive/2026-08-09-js-condom-core/js-condom-core.md`, seções Entrada, Compatibilidade semântica, Threat model e AC 4, 7, 8.
- Dependência: Step 1.

## Arquivos previstos

- `src/core/protect.js`
- `src/core/hazard-policy.js`
- `test/core/protect.test.js`
- `test/core/fixtures/semantic-fixtures.js`
- `test/core/fixtures/semantic-fixtures.test.js`

## Tarefas

1. Encaminhar somente opções validadas ao preset da engine.
2. Rejeitar `eval`, `with` e padrões textuais de função cobertos pela política fechada.
3. Executar validação sintática e equivalência observável antes de retornar `code`.
4. Garantir ausência de rede, telemetria e processos externos no caminho normal.
5. Cobrir a matriz declarada com testes determinísticos e casos de falha.

## Fora de escopo

- Leitura/escrita de arquivos.
- Source maps, diretórios, plugins de bundler e TypeScript/JSX.
- Benchmark de recuperação ou comparação com concorrentes.

## Critério de pronto

- API retorna `{ code, metadata }` apenas após todas as validações.
- Todo hazard detectável falha sem publicar código transformado.
- A matriz suportada passa equivalência observável e roda offline.

## Dependências

- Step 1 concluído.
- Versão da engine fixada e instalada.

## Checklist pré-handoff

- [ ] Frontmatter não se aplica: este repositório não usa o pipeline prosa.
- [ ] Testes unitários e de fixtures passam.
- [ ] Seed fixa é byte-determinística.
- [ ] Não há claim de resistência adversarial nos testes ou mensagens.

## Prompt para implementação

Implemente a API e a política de hazards somente nos arquivos previstos. Reutilize módulos
existentes quando houver contrato compatível e mantenha o evaluator experimental fora do core.
