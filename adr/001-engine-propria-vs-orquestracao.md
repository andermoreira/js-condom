# ADR 001 — Engine própria de ofuscação vs. orquestração de ferramentas existentes

> **Status:** Accepted — matriz oficial concluída com `evidencia-favorece-alternativa-mais-simples`;
> **Alternativa A** (orquestração de `javascript-obfuscator` free) selecionada. Relatório oficial
> aprovado por @andersonalves em 2026-08-09 (reexecução após correção de exports ESM).
>
> **Data:** 2026-08-09
> **Owner:** @andersonalves

## Context

A spec [`js-condom — Core Obfuscation Engine`](../specs/js-condom-core.md) propõe uma ferramenta
open source e offline para dificultar engenharia reversa de JavaScript distribuído. O diferencial
pretendido é reduzir o reuso de padrões de desofuscação entre builds por meio de diversidade
estrutural controlada por seed.

O discovery inicial ([`benchmark-js-protection.md`](../benchmark-js-protection.md)) registrou que:

- `webcrack` declara suporte à desofuscação de output do obfuscator.io
  `[VERIFIED: repositório oficial, acesso em 2026-08-09]`;
- as transforms AST tradicionais, isoladas, não são tratadas como proteção forte no produto;
- VM bytecode, técnicas comercializadas como polimórficas e defesas anti-LLM aparecem como as
  classes de maior resistência no benchmark, mas o ganho causal do polimorfismo proposto pelo
  `js-condom` ainda está `[UNVERIFIED]`;
- o `javascript-obfuscator` free já possui PRNG configurável: `seed: 0` opera sem seed fixa, e a
  ferramenta oferece shuffle, rotate e escolhas probabilísticas
  `[VERIFIED: documentação oficial, acesso em 2026-08-09]`;
- `vm.Script.createCachedData()` cria cache de compilação para ser usado junto de código fonte no
  construtor de `vm.Script`; não define sozinho um módulo `.jsc` carregável por `require()`
  `[VERIFIED: documentação Node.js v26.7.0, acesso em 2026-08-09]`;
- Bytenode acrescenta wrapping, dummy source e loader para produzir módulos `.jsc`, com restrições
  documentadas de versão/process type do V8
  `[VERIFIED: repositório oficial, acesso em 2026-08-09]`.

O [POC comparativo de polimorfismo](../specs/js-condom-polymorphism-poc.md) foi executado. A matriz
oficial (`experimentId: official-2026-08-09`) produziu conclusão `evidencia-favorece-alternativa-mais-simples`:
semântica preservada em 144/144 células candidatas, mas **zero** redução adversarial (0 pp) frente
ao threshold congelado de 5 pp. A evidência **não justifica** fork, extensão ou engine própria.

## Problem

Qual é a alternativa de menor complexidade que, operando offline, demonstra ganho material de
resistência à desofuscação automatizada sem quebrar a semântica do código suportado?

A decisão precisa separar duas preocupações independentes:

1. proteção AST de código distribuído ao browser;
2. empacotamento em bytecode V8 para Node.js/Electron.

Após a matriz oficial reexecutada, a arquitetura de **entrega** pode ser decidida (orquestração OSS),
mas a **claim de polimorfismo defensivo** do produto não foi sustentada: todos os candidatos atingiram
100% de conclusão adversarial no endpoint primário.

## Resultado do POC (matriz oficial)

Relatório aprovado: [`experiments/official/report.md`](../experiments/official/report.md)
(gerado em 2026-08-09T18:47:03Z após correção de exports ESM).
Dados completos: [`experiments/official/results.json`](../experiments/official/results.json).

### Conclusão (AC17)

- **Decisão:** `evidencia-favorece-alternativa-mais-simples`
- Limite inferior do intervalo pareado de `own-minimal`: 0 pp — abaixo do threshold congelado de 5 pp.
- Evidência não justifica engine própria sobre o baseline OSS congelado.

### Endpoint primário — taxa de conclusão dentro do budget

| Candidato | Taxa de conclusão | Redução vs baseline |
|---|---|---|
| `oss-baseline` | 100% | — |
| `oss-extension` | 100% | 0 pp |
| `own-minimal` | 100% | 0 pp |

Nenhum candidato customizado reduziu a taxa de conclusão adversarial. `webcrack` + tarefas de
recovery recuperaram todos os artefatos protegidos no corpus oficial dentro do budget.

### Cobertura e validação

- Células esperadas: 160; executadas: 160; casos suportados: 16.
- Células de candidato semanticamente válidas: **144/144**.
- Calibração de controle: 4/4 pares task/evaluator válidos.
- Blinding: hashes do manifest alinhados com pré-avaliação.

### Baseline OSS (AC20 / OQ8 resolvida)

- `javascript-obfuscator` 4.1.0 é o baseline OSS congelado.
- `js-confuser` excluído da matriz mínima com justificativa publicada e aceita por @andersonalves.

### Dimensão anti-LLM (AC14)

- Status: **medido** — 0/480 trials LLM concluíram recuperação dentro do budget.
- Não sustenta claim anti-LLM; não bloqueou dimensões determinísticas.

### Limitações registradas

- Seis casos hazard (`eval`, `with`, `function-tostring`) excluídos por política reject-before-protection.
- Corpus oficial não inclui código proprietário nem adversário adaptado além do protocolo congelado.

## Alternatives Considered

### A. Orquestrar ferramentas existentes sem extensão

Usar `javascript-obfuscator` free para AST e Bytenode para Node.js/Electron, com CLI e configuração
unificadas.

- **Pros:** menor esforço inicial; parsers, transforms e loaders já exercitados; entrega offline;
  alinhado à conclusão AC17 de menor complexidade.
- **Cons:** não demonstra ganho adversarial adicional no POC (0 pp); padrões conhecidos continuam
  reversíveis por `webcrack` no corpus medido.
- **Status após POC:** **selecionada** para v1 — orquestração sobre baseline OSS congelado.

### B. Estender ou manter fork mínimo de uma engine OSS

- **Status após POC:** `oss-extension` sem ganho adversarial (0 pp); semântica válida após correção
  de exports. **Não selecionada.**

**OQ8 resolvida:** `javascript-obfuscator` suficiente como baseline OSS nesta rodada.

### C. Engine própria em TypeScript sobre parser existente

- **Status após POC:** `own-minimal` sem ganho adversarial (0 pp). **Não selecionada.**

### D. Engine própria em Rust/Wasm

- **Status após POC:** não justificada. **Não selecionada.**

### E. Bytecode V8 como adapter independente

- **Status após POC:** hipótese futura independente; não medida nesta matriz.

## Decision

A matriz oficial do [POC comparativo de polimorfismo](../specs/js-condom-polymorphism-poc.md)
conclui `evidencia-favorece-alternativa-mais-simples` (AC17).

**Adotar a Alternativa A** para a v1: orquestrar `javascript-obfuscator` free (baseline OSS
congelado no manifest oficial) com CLI/API unificadas, sem fork, extensão ou engine própria.

**Rejeitar** Alternativas B, C e D: nenhuma demonstrou redução adversarial; limite inferior do
intervalo pareado de `own-minimal` (0 pp) não atinge o threshold congelado (5 pp).

**Não prometer** polimorfismo defensivo como diferencial de produto com base nesta matriz — a
evidência medida não suporta a claim. Reformulação do Goal da spec do core é pré-requisito antes
de claim pública de proteção.

Para bytecode V8, a hipótese continua sendo a Alternativa E em spec separada.

`engineId` de referência para reprodução: `oss-baseline` / `javascript-obfuscator` 4.1.0 conforme
manifest oficial.

## Consequences

- **Positive:** decisão arquitetural fechada com evidência auditável; investimento mínimo; baseline
  OSS justificado; semântica 144/144 no corpus oficial.
- **Negative:** sem ganho adversarial mensurado; produto não pode afirmar polimorfismo defensivo
  sem reformular Goal ou nova rodada com corpus/adversário mais exigente.
- **Neutral / to monitor:** diversidade estrutural medida separadamente não substitui endpoint
  primário; anti-LLM medido sem sucesso no budget.

## Trade-offs

Aceita-se orquestração OSS em vez de engine própria porque a evidência favorece menor complexidade
e não justifica superfície adicional. A v1 entrega ferramenta offline sobre baseline conhecido, sem
narrativa de irreversibilidade ou polimorfismo defensivo até nova evidência ou reposicionamento.

Critérios de aceite do POC:

1. Protocolo e corpus versionados — **cumprido**.
2. Equivalência semântica no subconjunto suportado — **cumprido** (144/144).
3. Relatório separa diversidade de reversão — **cumprido**.
4. Owner registrou decisão a partir dos dados — **cumprido**; ADR `Accepted` com Alternativa A.

## Fontes primárias

- [`javascript-obfuscator` — opções, seed e licença](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [`js-confuser` — alternativa OSS, capacidades e licença](https://github.com/MichaelXF/js-confuser)
- [`webcrack` — escopo declarado de desofuscação](https://github.com/j4k0xb/webcrack)
- [Node.js `vm.Script.createCachedData()`](https://nodejs.org/api/vm.html#scriptcreatecacheddata)
- [Bytenode — loader, compatibilidade e limitações](https://github.com/bytenode/bytenode)
- [Relatório oficial do POC](../experiments/official/report.md) — matriz `official-2026-08-09`
- [Resultados completos](../experiments/official/results.json)
- [Manifest oficial](../experiments/official/manifest.json)
