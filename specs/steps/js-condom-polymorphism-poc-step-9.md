# Passo 9: Implementar o avaliador LLM condicional

## Goal

Disponibilizar, somente se OQ4 for aprovada, avaliação por LLM local, cega, reproduzível e auditável.

## Rastreabilidade

- Plano de implementação: item 9.
- Acceptance criteria: AC10, AC12, AC14 e AC18.
- Open question: OQ4 deve ser respondida por `@andersonalves`; sem avaliador local versionável, este passo fica N/A e a dimensão anti-LLM permanece inconclusiva.

## Arquivos previstos

- `package.json`
- `package-lock.json`
- `src/recovery/llm-evaluator.js`
- `test/recovery/llm-evaluator.test.js`
- `experiments/llm/evaluator.json`

Total: 5 arquivos lógicos.

## Tarefas

1. Registrar a decisão de OQ4 em `evaluator.json`, incluindo runtime/modelo local, versão, parâmetros, prompt/contexto hashados e disponibilidade; nenhum serviço remoto é permitido (AC14 e AC18).
2. Produzir dentro de `llm-evaluator.js` a visão cega do prompt usando apenas ID opaco, objetivo, artefato permitido e rubrica predefinida, sem candidato, seed ou engine (AC12 e AC14).
3. Invocar o runtime local com budgets do manifest e registrar por trial outcome, oracle, wall-clock, tentativas, invocações, prompts e tokens quando disponibilizados (AC10 e AC14).
4. Preservar output/diagnóstico local e distinguir indisponibilidade, timeout, erro e inconclusivo sem promover nenhum deles a resistência (AC10 e AC14).
5. Testar hashes, ausência de identidade na visão, repetição configurável, contabilização e bloqueio de endpoints remotos (AC12, AC14 e AC18).

## Delta de complexidade planejado

- Abstrações: evaluator local com construção interna da visão cega → AC12 e AC14; invocar o runtime diretamente não fixa prompt/contexto nem remove metadados identificadores.
- Dependências: cliente do runtime local decidido em OQ4 e fixado no lockfile → AC14 e AC18; ele só existe para invocar o modelo aprovado sem serviço remoto.
- Configuração: registro versionado do evaluator → AC14; modelo, versão, parâmetros e hashes precisam ser congelados antes dos trials.
- Extension points: none; somente o runtime aprovado em OQ4 pertence a este POC.
- Camadas arquiteturais: none; o evaluator é uma extensão direta e condicional do harness existente.

## Riscos e edge cases

- Runtime local encaminhar dados a um endpoint remoto.
- API não expor tokens e o runner inventar estimativas não previstas.
- Prompt revelar padrões de candidato por metadados.
- Indisponibilidade bloquear dimensões determinísticas do POC.

## Fora de Escopo

- Instalar ou baixar modelo durante a execução oficial.
- Usar API externa ou código proprietário.
- Tornar anti-LLM decisivo sem configuração completa e repetível.

## Critério de Pronto

- Se OQ4 for aprovada, o evaluator local fixado recebe visão cega, respeita budgets e preserva todos os campos disponíveis por trial.
- Testes passam sem rede e rejeitam configuração remota ou incompleta.
- Se OQ4 não for aprovada, o passo é marcado N/A e o manifest/relatório oficial exige a dimensão anti-LLM como inconclusiva.

## Dependências

- Passos 1, 2 e 7 concluídos.
- Decisão explícita de `@andersonalves` para OQ4.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 9 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs e Open Questions afetadas estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [ ] OQ4 respondida; implementar se aprovada ou registrar o passo como N/A.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 9 descrito em `@specs/steps/js-condom-polymorphism-poc-step-9.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Primeiro confirme a decisão de OQ4. Se não houver runtime LLM local, fixável e aprovado, não crie os arquivos: registre o passo como N/A no acompanhamento e preserve anti-LLM como inconclusivo. Se aprovado, edite somente `package.json`, `package-lock.json`, `src/recovery/llm-evaluator.js`, `test/recovery/llm-evaluator.test.js` e `experiments/llm/evaluator.json`; fixe no lockfile somente o cliente local exigido pela decisão. Não use rede nem API externa. O passo termina quando visão cega, hashes, budgets, trials e rejeição de remoto passam nos testes.
