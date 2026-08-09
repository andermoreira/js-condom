# Passo 10: Executar o piloto e congelar o protocolo oficial

## Goal

Executar o piloto, resolver os parâmetros empíricos pendentes e produzir um manifest oficial imutável antes da matriz.

## Rastreabilidade

- Plano de implementação: item 10.
- Acceptance criteria: AC1, AC5, AC8, AC11, AC13 e AC15.
- Open questions: este passo resolve OQ1, OQ5 e OQ6; registra a decisão já tomada para OQ4.

## Arquivos previstos

- `src/analysis/pilot.js`
- `test/analysis/pilot.test.js`
- `experiments/pilot/run.json`
- `experiments/pilot/report.md`
- `experiments/official/manifest.json`

Total: 5 arquivos lógicos.

## Tarefas

1. Orquestrar somente a partição piloto com o protocolo validado e preservar em `run.json` o manifest resolvido, células, trials, logs estruturados e conteúdo UTF-8 com SHA-256 de inputs, outputs, configurações e artefatos recuperados (AC1 e AC13).
2. Calibrar cada task/evaluator no controle e testar repetidamente o mesmo artefato para classificá-lo como determinístico ou variável (AC5 e AC13).
3. Verificar conformidade da fatia e compatibilidade do ambiente; impedir freeze se houver desvio causal ou campo obrigatório incompatível (AC8).
4. Derivar evidência para o owner decidir e registrar valores numéricos de OQ1, OQ5 e OQ6: threshold, budgets, seeds, repetições, método de intervalo e política de evaluator variável, sem trocar endpoint ou direção do efeito (AC11 e AC15).
5. Gerar `manifest.json` oficial com threshold positivo congelado, mínimos, análise pareada, agregação, intervalos, materialidade e decisões condicionais resolvidas; nenhuma decisão pode permanecer `pending-pilot` (AC1, AC11 e AC15).
6. Testar rejeição de N insuficiente, task inválida, evaluator variável sem repetições, threshold ausente, slice divergente e tentativa de alterar o protocolo depois do freeze (AC5, AC8, AC11, AC13 e AC15).

## Delta de complexidade planejado

- Abstrações: analisador concreto do piloto → AC11 e AC15; agregação direta durante a matriz permitiria recalibração retrospectiva e perderia o freeze anterior.
- Dependências: none; os módulos dos Steps 1–9 fornecem execução e dados necessários.
- Configuração: manifest oficial congelado → AC1, AC11 e AC15; `run.json` e `report.md` são evidências de saída, e o manifest separado impede alteração pelos dados oficiais.
- Extension points: none; o protocolo admite apenas a análise pareada congelada.
- Camadas arquiteturais: none; `pilot.js` compõe diretamente os componentes experimentais existentes.

## Riscos e edge cases

- Usar resultados oficiais para recalibrar threshold ou budgets.
- Escolher retrospectivamente o melhor método de intervalo.
- Agregar trials variáveis antes de preservar observações individuais.
- Congelar protocolo apesar de N insuficiente ou tasks inválidas.

## Fora de Escopo

- Executar a partição oficial.
- Escolher vencedor ou atualizar o ADR.
- Alterar endpoint primário, direção do efeito ou controle aprovados.

## Critério de Pronto

- O piloto e suas limitações estão auditáveis em dados e relatório.
- `run.json` é autocontido e não depende de artefatos ou logs persistidos em arquivos adicionais.
- OQ1, OQ5 e OQ6 têm valores explícitos aprovados e congelados.
- Tasks válidas, determinismo, conformidade e ambiente foram verificados.
- O manifest oficial passa validação sem pendências e não é reescrito pela matriz.

## Dependências

- Passos 1 a 8 concluídos.
- Passo 9 concluído se OQ4 aprovou LLM; caso contrário, Passo 9 registrado como N/A.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 10 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs e Open Questions afetadas estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [x] O passo não inventa os números: produz evidência e exige decisão registrada do owner.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 10 descrito em `@specs/steps/js-condom-polymorphism-poc-step-10.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Edite somente `src/analysis/pilot.js`, `test/analysis/pilot.test.js`, `experiments/pilot/run.json`, `experiments/pilot/report.md` e `experiments/official/manifest.json`. Execute apenas a partição piloto, preserve em `run.json` dados brutos, logs e artefatos de texto autocontidos com hashes verificáveis e forneça evidência para decisões explícitas de OQ1/OQ5/OQ6. Não crie arquivos persistentes adicionais, rode a matriz oficial nem altere endpoint/direção. O passo termina quando o manifest oficial validado congela todas as decisões sem `pending-pilot`.
