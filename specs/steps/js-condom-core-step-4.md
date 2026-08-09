# Atomic Step 4 — Release gate e documentação

## Goal

Fechar a primeira entrega com CI, auditoria de dependências, documentação operacional e revisão de
segurança coerentes com o wrapper offline.

## Rastreabilidade

- Spec: `specs/js-condom-core.md`, Requisitos não funcionais, Threat model, AC 1, 4, 11 e 12.
- Dependência: Step 3.

## Arquivos previstos

- `.github/workflows/ci.yml`
- `README.md`
- `package-lock.json`
- `test/core/offline-boundary.test.js`
- `docs/release-checklist.md`

## Tarefas

1. Fixar e verificar Node 24 LTS no CI.
2. Executar lint, testes, `npm audit` e teste de ausência de rede.
3. Documentar instalação, API, CLI, preset, seed, limitações e requalificação da engine.
4. Registrar checklist de release sem métricas adversariais.
5. Revisar segredos, paths, permissões e dependências transitivas antes do tag.

## Fora de escopo

- Publicação automática, deploy ou alteração de infraestrutura externa.
- Correção ampla do sandbox/evaluator experimental.

## Critério de pronto

- CI verde no Node 24 LTS e bloqueia regressões de offline, audit e determinismo.
- README permite executar o MVP sem conhecimento do código interno.
- Checklist registra versões, hashes, limitações e aprovação de segurança.

## Dependências

- Steps 1–3 concluídos.
- Decisão de versão da engine registrada no package lock.

## Checklist pré-handoff

- [ ] Frontmatter não se aplica: este repositório não usa o pipeline prosa.
- [ ] `npm test`, lint e auditoria passam.
- [ ] Nenhuma saída afirma resistência adversarial.
- [ ] Revisão de segurança confirma que input/output não deixam o processo.

## Prompt para implementação

Implemente apenas gates e documentação da entrega. Não publique pacote, não altere infraestrutura
externa e não reative claims ou componentes experimentais.
