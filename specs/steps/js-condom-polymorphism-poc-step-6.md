# Passo 6: Implementar o runner semântico isolado

## Goal

Executar original e artefatos candidatos em isolamento local, comparar seus oracles e produzir resultados semânticos auditáveis.

## Rastreabilidade

- Plano de implementação: item 6.
- Acceptance criteria: AC6, AC7 e AC18.

## Arquivos previstos

- `package.json`
- `package-lock.json`
- `src/runner/sandbox.js`
- `src/runner/semantic-runner.js`
- `test/runner/semantic-runner.test.js`

Total: 5 arquivos lógicos.

## Tarefas

1. Implementar processo isolado local sem rede, com filesystem descartável, timeout e limite de memória derivados do manifest (AC18).
2. Executar controle e outputs dos candidatos nas mesmas células aplicáveis, preservando stdout, stderr, exit status, duração, conteúdo UTF-8 e hashes verificáveis necessários à auditoria (AC6).
3. Aplicar o oracle semântico do caso e produzir a parcela correspondente de `CaseResult`, distinguindo `valid`, `semantic_mismatch`, `tool_error`, `timeout` e `inconclusive` (AC7).
4. Impedir que divergência, timeout ou erro sejam removidos silenciosamente ou entrem como sucesso de proteção (AC7).
5. Consolidar em `semantic-runner.test.js` os testes de bloqueio de rede, descarte do filesystem, budgets, equivalência e diagnósticos para divergências e falhas (AC7 e AC18).

## Delta de complexidade planejado

- Abstrações: sandbox local e runner semântico → AC7 e AC18; um processo filho direto não reúne enforcement fail-closed de rede/filesystem/memória e comparação uniforme de oracles.
- Dependências: mecanismo local de isolamento fixado no lockfile → AC18; APIs nativas só podem substituí-lo se os testes provarem todos os controles, sem fallback permissivo.
- Configuração: none; budgets e compatibilidade de ambiente vêm exclusivamente do manifest.
- Extension points: none; o POC exige um único modo local de execução isolada.
- Camadas arquiteturais: none; sandbox e runner são componentes diretos do mesmo boundary de execução.

## Riscos e edge cases

- Restrição de rede não ser efetiva no sistema operacional alvo.
- Processo filho deixar descendentes ou arquivos após timeout.
- Oracle depender de ordenação ou tempo não controlados.
- Limite de memória ser registrado, mas não aplicado.

## Fora de Escopo

- Recovery, blinding ou diversidade.
- Execução em browser real.
- Decisão sobre budgets definitivos do piloto.

## Critério de Pronto

- Código original e protegido é executado localmente sem rede e com limites aplicados.
- Divergências semânticas desqualificam o candidato e permanecem diagnosticadas.
- `CaseResult` preserva status, logs, conteúdos e hashes verificáveis sem omitir células falhas.
- Testes de isolamento e semântica passam.

## Dependências

- Passos 1, 2, 3, 4 e 5 concluídos.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 6 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs afetados estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [x] Nenhuma Open Question precisa ser resolvida neste passo.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 6 descrito em `@specs/steps/js-condom-polymorphism-poc-step-6.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Edite somente `package.json`, `package-lock.json`, `src/runner/sandbox.js`, `src/runner/semantic-runner.js` e `test/runner/semantic-runner.test.js`. Fixe no lockfile a dependência local de isolamento necessária ao AC18, entregue execução sem rede, filesystem descartável e limites do manifest, além da comparação por oracle e dos estados autocontidos de `CaseResult`. Não implemente recovery, LLM, blinding ou diversidade. O passo termina quando isolamento, equivalência e diagnósticos passam nos testes.
