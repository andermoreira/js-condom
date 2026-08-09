# Atomic Step 3 — CLI de arquivo único e artefatos

## Goal

Entregar o fluxo CLI para um único arquivo JavaScript, com escrita atômica, relatório opcional e
exit codes consistentes com a API.

## Rastreabilidade

- Spec: `specs/archive/2026-08-09-js-condom-core/js-condom-core.md`, seções Entrada, Saída e relatório, Erros e AC 3, 9, 10.
- Dependência: Step 2.

## Arquivos previstos

- `src/cli/protect.js`
- `src/core/file-protection.js`
- `test/cli/protect.test.js`
- `test/core/file-protection.test.js`
- `package.json`

## Tarefas

1. Aceitar somente `.js`, `.mjs` e `.cjs`, um input e `--output` explícito.
2. Mapear erros públicos para stderr estruturado e exit codes não zero.
3. Escrever código e relatório em arquivos temporários e publicar atomicamente.
4. Recusar conflito de saída e remover temporários em falhas.
5. Garantir que CLI e API compartilham preset, metadata e política de validação.

## Fora de escopo

- Diretórios, watch mode, plugins de bundler e source maps.
- Alterações em pipeline de CI ou publicação de pacote.

## Critério de pronto

- Comando válido gera somente o artefato validado no caminho solicitado.
- Falha não deixa output parcial e comunica código estável.
- Testes cobrem extensões suportadas, conflito, permissão e relatório.

## Dependências

- Step 2 concluído.

## Checklist pré-handoff

- [ ] Frontmatter não se aplica: este repositório não usa o pipeline prosa.
- [ ] Testes de CLI passam sem rede.
- [ ] O pacote expõe o binário documentado.
- [ ] `git diff --check` passa.

## Prompt para implementação

Implemente apenas o fluxo de arquivo único. Não adicione descoberta de diretórios, flags da engine
ou comportamentos de recuperação adversarial.
