# Passo 12: Atualizar a decisão arquitetural

## Goal

Converter o relatório oficial aprovado em uma decisão arquitetural coerente, atualizando ADR, spec do core e benchmark sem extrapolar a evidência.

## Rastreabilidade

- Plano de implementação: item 12.
- Acceptance criteria: AC19 e AC20.
- Open question: OQ8 deve ser resolvida antes do aceite final do ADR 001.

## Arquivos previstos

- `adr/001-engine-propria-vs-orquestracao.md`
- `specs/js-condom-core.md`
- `benchmark-js-protection.md`

Total: 3 arquivos lógicos.

## Tarefas

1. Confirmar aprovação humana explícita do relatório oficial antes de alterar qualquer decisão definitiva (AC19).
2. Resolver OQ8 com a justificativa publicada para o baseline; se a evidência exigir `js-confuser`, manter o ADR sem aceite e registrar rodada adicional (AC20).
3. Atualizar ADR 001 com contexto, evidência, decisão, alternativas, consequências e status compatível com a conclusão do AC17; evidência insuficiente não pode virar `Accepted` (AC19 e AC20).
4. Alinhar `js-condom-core.md` apenas aos compromissos arquiteturais sustentados pelo relatório e manter itens inconclusivos como abertos/futuros (AC19).
5. Atualizar o benchmark para refletir protocolo, limites e próximos passos aprovados, preservando links para os artefatos oficiais (AC20).
6. Verificar ausência de contradições entre ADR, core, benchmark, relatório e spec do POC (AC19).

## Delta de complexidade planejado

- Abstrações: nenhuma.
- Dependências: nenhuma.
- Configuração: nenhuma.
- Extension points: nenhum.
- Camadas arquiteturais: nenhuma; este passo documenta a decisão aprovada.

## Riscos e edge cases

- Atualizar o ADR antes da aprovação humana.
- Tratar evidência insuficiente como aprovação da engine própria.
- Core assumir funcionalidades não avaliadas pelo POC.
- OQ8 ser omitida apesar de mudar a suficiência do baseline.

## Fora de Escopo

- Implementar código de produção.
- Executar nova matriz ou recalibrar resultados.
- Aprovar o ADR automaticamente.

## Critério de Pronto

- O relatório oficial possui aprovação humana registrada.
- OQ8 está resolvida; rodada adicional necessária mantém a decisão pendente.
- ADR, core e benchmark são consistentes com a evidência e entre si.
- Nenhuma afirmação definitiva excede a conclusão aprovada.

## Dependências

- Passo 11 concluído.
- Aprovação humana explícita do relatório oficial.
- Decisão explícita de `@andersonalves` para OQ8.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 12 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs e Open Questions afetadas estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [ ] Relatório oficial aprovado e OQ8 resolvida antes do handoff.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 12 descrito em `@specs/steps/js-condom-polymorphism-poc-step-12.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Antes de editar, confirme aprovação humana explícita do relatório oficial e decisão de OQ8; sem ambas, interrompa o handoff. Edite somente `adr/001-engine-propria-vs-orquestracao.md`, `specs/js-condom-core.md` e `benchmark-js-protection.md`. Não implemente código nem execute nova rodada. O passo termina quando os três documentos refletem a mesma decisão sustentada pela evidência, mantendo o ADR pendente se o resultado for insuficiente ou exigir `js-confuser`.
