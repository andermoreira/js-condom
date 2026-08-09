# Passo 3: Implementar o baseline OSS

## Goal

Disponibilizar um adapter mínimo e reproduzível para o `javascript-obfuscator` free como baseline do experimento.

## Rastreabilidade

- Plano de implementação: item 3.
- Acceptance criteria: AC6 e AC20.

## Arquivos previstos

- `package.json`
- `package-lock.json`
- `src/candidates/oss-baseline.js`
- `test/candidates/oss-baseline.test.js`

Total: 4 arquivos lógicos.

## Tarefas

1. Fixar a versão e integridade do `javascript-obfuscator` nos manifests do npm (AC20).
2. Implementar um adapter com input, configuração e seed canônica explícitos, produzindo JavaScript e metadados necessários ao manifest sem defaults ocultos (AC6).
3. Rejeitar configuração, seed ou output inválido com diagnóstico, sem classificar falha da ferramenta como resistência (AC6).
4. Testar projeção determinística da seed, registro da configuração e geração repetível para a mesma entrada (AC6).

## Delta de complexidade planejado

- Abstrações: adapter concreto de `javascript-obfuscator` → AC6; a API da ferramenta não recebe diretamente a seed canônica nem produz os metadados exigidos pelo manifest.
- Dependências: `javascript-obfuscator` free fixado no lockfile → AC20; ele é o baseline OSS que a matriz precisa executar e justificar.
- Configuração: none; toda configuração atual vem do manifest validado para evitar defaults paralelos.
- Extension points: none; a spec rejeita um provider genérico para candidatos futuros.
- Camadas arquiteturais: none; `src/candidates` apenas agrupa os três adapters concretos do experimento.

## Riscos e edge cases

- Defaults da biblioteca variarem entre versões.
- Seed canônica sofrer projeção silenciosa ou colisão.
- Adapter habilitar transforms não declaradas.

## Fora de Escopo

- Comparar resultados com `js-confuser`.
- Implementar a extensão OSS ou o candidato próprio.
- Executar o corpus ou medir proteção.

## Critério de Pronto

- A dependência está fixada e o adapter registra versão, configuração e seed projetada.
- A mesma entrada/configuração/seed produz output reproduzível ou falha explícita.
- Testes do adapter passam offline.

## Dependências

- Passos 1 e 2 concluídos.

## Checklist pré-handoff

- [x] Goal, arquivos e tarefas correspondem ao item 3 do plano.
- [x] O passo possui no máximo 5 arquivos lógicos.
- [x] ACs afetados estão explícitos.
- [x] Fora de Escopo não contradiz o Critério de Pronto.
- [x] Nenhuma Open Question bloqueia este adapter.
- [x] Frontmatter não se aplica: este repositório não usa o pipeline `prosa`.

---

## Prompt Cursor

Implemente o Passo 3 descrito em `@specs/steps/js-condom-polymorphism-poc-step-3.md`, seguindo `@specs/js-condom-polymorphism-poc.md`.

Edite somente `package.json`, `package-lock.json`, `src/candidates/oss-baseline.js` e `test/candidates/oss-baseline.test.js`. Crie apenas o adapter concreto do `javascript-obfuscator`, com versão, configuração e seed registradas. Não implemente providers genéricos, outros candidatos, execução do corpus ou comparação com `js-confuser`. O passo termina quando a reprodução e os erros do adapter estão cobertos por testes offline.
