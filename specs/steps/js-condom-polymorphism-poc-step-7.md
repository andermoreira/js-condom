# Passo 7: Implementar o harness de recovery cego

## Goal

Calibrar e executar recovery automatizado sobre artefatos cegos, preservando outcome e custo de cada trial.

## Rastreabilidade

- Plano de implementação: item 7.
- Acceptance criteria: AC2, AC5, AC6, AC10, AC12, AC13 e AC18.

## Arquivos previstos

- `package.json`
- `package-lock.json`
- `src/recovery/blinding.js`
- `src/recovery/recovery-runner.js`
- `test/recovery/recovery-runner.test.js`

Total: 5 arquivos lógicos.

## Tarefas

1. Fixar versão e integridade do `webcrack` e disponibilizá-lo somente para execução local/offline (AC10 e AC18).
2. Gerar IDs opacos, ordem randomizada, hash do mapeamento e visão do evaluator sem candidato, seed ou engine; impedir reveal antes do lock dos resultados (AC12).
3. Executar primeiro cada par task/evaluator sobre `unprotected-control`; marcar o par inválido se o oracle não passar e excluir seus resultados protegidos do denominador (AC2 e AC5).
4. Executar controle e candidatos nas células/repetições do manifest e registrar por trial outcome, oracle, wall-clock, tentativas, invocações, artefato recuperado UTF-8 com SHA-256 e diagnósticos (AC6, AC10 e AC13).
5. Manter `failed`, `timeout`, `tool_error` e `inconclusive` distintos, preservando todos os trials e aplicando os limites pelo sandbox do Passo 6 (AC10, AC13 e AC18).
6. Testar cegamento, calibração, ordem, repetição, censura e tratamento de falhas sem cherry-picking (AC5, AC10, AC12 e AC13).

## Delta de complexidade planejado

- Abstrações: blinding e runner de recovery → AC10 e AC12; executar o adversário diretamente revelaria identidade/ordem e não preservaria calibração e esforço por trial.
- Dependências: `webcrack` fixado no lockfile → AC10; é o adversário automatizado obrigatório da matriz.
- Configuração: none; tasks, repetições e budgets vêm exclusivamente do manifest congelado.
- Extension points: none; não há requisito atual para registry genérico de evaluators.
- Camadas arquiteturais: none; os dois componentes formam diretamente o harness de recovery aprovado.

## Riscos e edge cases

- Nome de arquivo, diretório ou logs revelar o candidato.
- Falha no controle ser contada como resistência.
- Retry substituir ou apagar o trial original.
- Timeout ser convertido em custo infinito ou vitória defensiva.

## Fora de Escopo

- Avaliação por LLM ou humana.
- Agregação estatística e escolha dos budgets definitivos.
- Revelar o mapa cego antes do lock.

## Critério de Pronto

- A fila cega não expõe candidato, seed ou engine ao evaluator.
- Pares inválidos no controle são visíveis e excluídos corretamente.
- Todos os trials preservam outcome, oracle, esforço, artefato recuperado e diagnósticos em unidades separadas.
- Testes passam localmente sem rede.

## Dependências

- Passos 1, 2 e 6 concluídos.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 7 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs afetados estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [x] OQ5 e OQ6 continuam reservadas para o piloto.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 7 descrito em `@specs/steps/js-condom-polymorphism-poc-step-7.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Edite somente `package.json`, `package-lock.json`, `src/recovery/blinding.js`, `src/recovery/recovery-runner.js` e `test/recovery/recovery-runner.test.js`. Use o sandbox do Passo 6, calibre task/evaluator no controle, cegue identidade e ordem e preserve cada trial com esforço separado. Não implemente LLM nem agregação estatística. O passo termina quando calibração, cegamento e estados de recovery passam offline.
