# Passo 2: Montar corpus e recovery tasks

## Goal

Versionar as partições do corpus, seus oracles semânticos e as tarefas de recuperação que alimentarão o piloto e a matriz oficial.

## Rastreabilidade

- Plano de implementação: item 2.
- Acceptance criteria: AC3, AC4 e AC5.
- Open question: OQ2 deve ser decidida por `@andersonalves` antes do handoff deste passo.

## Arquivos previstos

- `corpus/pilot-cases.json`
- `corpus/official-cases.json`
- `corpus/recovery-tasks.json`
- `src/corpus/corpus.js`
- `test/corpus/corpus.test.js`

Total: 5 arquivos lógicos.

## Tarefas

1. Registrar a decisão de OQ2 nos arquivos do corpus: total mínimo, mínimo por categoria, origem permitida e separação sem sobreposição entre piloto e oficial (AC3).
2. Definir casos para todas as categorias do AC3 e políticas esperadas para `eval`, `with` e `Function.prototype.toString`, usando somente fixtures sintéticas ou código open source permitido (AC3 e AC18).
3. Associar a todo caso suportado um oracle semântico observável e justificar previamente exclusões ou casos não suportados (AC4).
4. Definir cada recovery task com objetivo, evaluators, budget e oracle de conclusão; usar oracle automatizado quando possível e rubrica humana a priori quando necessário (AC4 e AC5).
5. Implementar leitura/validação referencial do corpus e testes para cobertura mínima, partições, hashes, categorias, oracles e referências entre casos e tasks (AC3, AC4 e AC5).

## Delta de complexidade planejado

- Abstrações: loader/validador de corpus → AC3 e AC4; JSON bruto não comprova mínimos, partições disjuntas nem referências entre casos, oracles e tasks.
- Dependências: none; o validador do Passo 1 e APIs nativas bastam para os registros atuais.
- Configuração: três registros versionados de corpus/tasks → AC3 e AC4; piloto, oficial e recovery tasks precisam ser congelados e auditados separadamente.
- Extension points: none; não há requisito atual para fontes ou registries adicionais.
- Camadas arquiteturais: none; `src/corpus` é somente organização do loader e dos dados aprovados.

## Riscos e edge cases

- OQ2 permanecer sem valores aprovados e placeholders virarem protocolo oficial.
- Um mesmo caso aparecer nas duas partições.
- Oracle validar a execução, mas não o efeito observável relevante.
- Task depender implicitamente de um evaluator ou budget não registrado.

## Fora de Escopo

- Implementar candidatos ou executá-los.
- Calibrar tasks no controle não protegido; isso ocorre no piloto.
- Definir números de OQ2 sem aprovação do owner.

## Critério de Pronto

- OQ2 foi respondida e os mínimos aprovados estão versionados sem placeholders.
- As duas partições são disjuntas e satisfazem as categorias e mínimos congelados.
- Todo caso suportado e toda task possuem os contratos exigidos pelo AC4.
- Testes de integridade e referências passam offline.

## Dependências

- Passo 1 concluído.
- Decisão explícita de `@andersonalves` para OQ2.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 2 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs e Open Questions afetadas estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [ ] OQ2 respondida pelo owner e valores inseridos sem placeholders.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 2 descrito em `@specs/steps/js-condom-polymorphism-poc-step-2.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Antes de editar, confirme que OQ2 já possui decisão explícita de `@andersonalves`; se não possuir, interrompa o handoff sem inventar números. Edite somente `corpus/pilot-cases.json`, `corpus/official-cases.json`, `corpus/recovery-tasks.json`, `src/corpus/corpus.js` e `test/corpus/corpus.test.js`. Não implemente candidatos, calibração ou execução. O passo termina quando partições, mínimos, categorias, oracles e referências são validados por testes offline.
