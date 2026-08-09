# Atomic Step 1 — Contrato e preset do core v1

## Goal

Definir o contrato público de `protect(sourceCode, options)`, o preset versionado, os hashes e os
códigos de erro sem acoplar consumidores às flags internas da engine.

## Rastreabilidade

- Spec: `specs/archive/2026-08-09-js-condom-core/js-condom-core.md`, seções Goal, Preset e configuração, Erros e AC 2, 5, 6, 9, 10.
- ADR: `adr/002-evidencia-e-posicionamento-v1.md`.

## Arquivos previstos

- `src/core/config.js`
- `src/core/errors.js`
- `src/core/metadata.js`
- `test/core/config.test.js`

## Tarefas

1. Definir schema de opções, preset e rejeição de chaves desconhecidas.
2. Definir erros públicos e serialização segura para API e CLI.
3. Implementar cálculo determinístico dos hashes e contrato de metadata.
4. Fixar a versão qualificada da engine e registrar a decisão no package manifest.
5. Cobrir seed explícita, seed gerada, configuração inválida e serialização estável.

## Fora de escopo

- Transformação de código JavaScript.
- CLI, escrita em disco ou análise de hazards.
- Qualquer claim ou métrica de resistência adversarial.

## Critério de pronto

- Contratos exportados e testados sem depender de detalhes não públicos da engine.
- Mesma configuração serializada produz o mesmo `configSha256`.
- Testes verificam que mensagens não incluem source code ou secrets.

## Dependências

- Nenhuma; é o primeiro passo do core.

## Checklist pré-handoff

- [ ] Frontmatter não se aplica: este repositório não usa o pipeline prosa.
- [ ] `npm test -- test/core/config.test.js` passa.
- [ ] `git diff --check` passa.
- [ ] Nenhuma flag arbitrária da engine aparece no contrato público.

## Prompt para implementação

Implemente apenas os arquivos previstos deste passo. Preserve o contrato da spec, não introduza
produção fora do escopo e não altere o evaluator experimental.
