# Passo 11: Executar a matriz oficial e publicar o relatório

## Goal

Executar integralmente o manifest oficial congelado e publicar evidência auditável com uma das três conclusões permitidas.

## Rastreabilidade

- Plano de implementação: item 11.
- Acceptance criteria: AC6, AC7, AC9, AC10, AC11, AC12, AC14, AC15, AC16, AC17, AC18 e AC20.

## Arquivos previstos

- `src/runner/official-matrix.js`
- `test/runner/official-matrix.test.js`
- `experiments/official/blinding-map.json`
- `experiments/official/results.json`
- `experiments/official/report.md`

Total: 5 arquivos lógicos.

## Tarefas

1. Validar o manifest congelado e executar exatamente as células previstas para controle e candidatos, sem mudar corpus, seeds, repetições, budgets ou análise (AC6 e AC15).
2. Preservar todos os `CaseResult`, trials, ausências, erros, logs estruturados e conteúdos UTF-8 com SHA-256 em `results.json`; não criar artefatos persistentes adicionais nem publicar agregado completo com células faltantes (AC6, AC7, AC10 e AC18).
3. Fixar o hash do mapa cego antes das avaliações e só materializar/revelar `blinding-map.json` depois do lock dos resultados e oracles (AC12).
4. Derivar o relatório dos dados JSON, com correção, validade de tasks, endpoint primário, custos separados, diversidade, tamanho, build time, runtime overhead, dados por caso/categoria, intervalos, variação e limitações (AC9, AC10, AC11 e AC16).
5. Se LLM foi aprovado, incluir configuração/trials exigidos; se não foi, declarar anti-LLM inconclusivo sem bloquear dimensões determinísticas (AC14).
6. Aplicar a regra congelada e concluir exatamente uma opção do AC17; divergência semântica, N insuficiente ou matriz incompleta impede conclusão favorável (AC7, AC15 e AC17).
7. Justificar `javascript-obfuscator` frente ao `js-confuser` ou recomendar rodada adicional, sem contaminar retrospectivamente a matriz (AC20).
8. Testar imutabilidade do manifest, completude da matriz, rastreabilidade de agregados, reveal tardio e seleção exclusiva das conclusões (AC12, AC16 e AC17).

## Delta de complexidade planejado

- Abstrações: orquestrador concreto da matriz oficial → AC6 e AC16; execução manual não garante completude de células, imutabilidade do manifest nem relatório derivado dos mesmos resultados.
- Dependências: none; a matriz compõe somente candidatos, runners e métricas já fixados.
- Configuração: none; mapa cego, dataset e relatório são evidências de saída, enquanto toda configuração vem do manifest oficial.
- Extension points: none; novos candidatos, evaluators ou métricas exigiriam outro protocolo.
- Camadas arquiteturais: none; `official-matrix.js` apenas compõe os módulos experimentais existentes.

## Riscos e edge cases

- Alteração acidental do manifest oficial durante a execução.
- Agregado não rastreável a trials individuais.
- Mapa cego exposto antes do lock.
- `tool_error` ou `inconclusive` virar não recuperação no endpoint.
- Relatório omitir uma limitação que muda a conclusão.

## Fora de Escopo

- Recalibrar protocolo com dados oficiais.
- Atualizar ADR/core antes da aprovação humana do relatório.
- Adicionar `js-confuser` à matriz atual sem nova rodada aprovada.

## Critério de Pronto

- A matriz corresponde exatamente ao manifest e preserva todas as células e observações.
- `results.json` é autocontido e preserva logs e artefatos de texto com hashes verificáveis.
- O relatório é derivado dos resultados, rastreável e cobre todas as dimensões do AC16.
- O reveal ocorre somente depois do lock e permanece auditável.
- A conclusão usa uma e somente uma opção do AC17 e trata AC20 explicitamente.

## Dependências

- Passo 10 concluído com manifest oficial congelado.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 11 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs afetados estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [x] Todas as Open Questions de execução devem estar resolvidas ou marcadas N/A no manifest.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 11 descrito em `@specs/steps/js-condom-polymorphism-poc-step-11.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Edite somente `src/runner/official-matrix.js`, `test/runner/official-matrix.test.js`, `experiments/official/blinding-map.json`, `experiments/official/results.json` e `experiments/official/report.md`. Execute sem alterar o manifest congelado, preserve todas as células, trials, logs e artefatos de texto dentro de `results.json`, revele o mapa somente após lock e derive o relatório dos resultados. Não crie arquivos persistentes adicionais, atualize ADR/core nem recalibre o protocolo. O passo termina com relatório auditável, AC20 tratado e exatamente uma conclusão do AC17.
