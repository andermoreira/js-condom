# ADR 001 — Engine própria de ofuscação vs. orquestração de ferramentas existentes

> **Status:** Proposed — matriz oficial do POC concluída com conclusão `evidencia-insuficiente`; nenhuma
> alternativa selecionada. Relatório oficial aprovado por @andersonalves em 2026-08-09.
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

Esses fatos invalidam duas premissas do rascunho anterior deste ADR: que output free é sempre
determinístico e que uma engine Rust/Wasm é, sem experimento, o único caminho para output único por
build. Também não demonstram o oposto: randomização sintática do free pode ser insuficiente para
elevar o custo de reversão.

O [POC comparativo de polimorfismo](../specs/js-condom-polymorphism-poc.md) foi executado. A matriz
oficial (`experimentId: official-2026-08-09`, commit `b7be057`) não produziu evidência suficiente
para aceitar qualquer alternativa arquitetural nem para promover este ADR a `Accepted`.

## Problem

Qual é a alternativa de menor complexidade que, operando offline, demonstra ganho material de
resistência à desofuscação automatizada sem quebrar a semântica do código suportado?

A decisão precisa separar duas preocupações independentes:

1. proteção AST de código distribuído ao browser;
2. empacotamento em bytecode V8 para Node.js/Electron.

Após a matriz oficial, o problema permanece aberto: nenhuma alternativa comparada demonstrou ganho
adversarial suficiente, e 39 células de candidato falharam validação semântica — impedindo conclusão
favorável sobre fork, extensão ou engine própria mínima.

## Resultado do POC (matriz oficial)

Relatório aprovado: [`experiments/official/report.md`](../experiments/official/report.md).
Dados completos: [`experiments/official/results.json`](../experiments/official/results.json).

### Conclusão (AC17)

- **Decisão:** `evidencia-insuficiente`
- 39 células de candidato falharam validação semântica.

### Endpoint primário — taxa de conclusão dentro do budget

| Candidato | Taxa de conclusão | Redução vs baseline |
|---|---|---|
| `oss-baseline` | 35,29% | — |
| `oss-extension` | 82,35% | −47,06 pp (candidato *piores* que baseline) |
| `own-minimal` | 88,24% | −52,94 pp (candidato *piores* que baseline) |

Os candidatos customizados apresentaram taxa de conclusão adversarial *maior* que o baseline — ou seja,
recuperação mais fácil, não mais difícil. Isso não sustenta a hipótese de ganho defensivo.

### Cobertura e validação

- Células esperadas: 160; executadas: 160; casos suportados: 16.
- Células de candidato semanticamente válidas: 105/144.
- Pares task/evaluator com calibração de controle inválida: 2 (`eval-ast-compare`,
  `eval-human-rubric`).

### Baseline OSS (AC20 / OQ8 resolvida)

- `javascript-obfuscator` 4.1.0 é o baseline OSS congelado: transforms AST, projeção canônica de
  seed e configuração reproduzível registrados no manifest oficial.
- `js-confuser` foi excluído da matriz mínima; a justificativa foi publicada e aceita por
  @andersonalves: o obfuscator representa baseline OSS adequado para esta rodada; comparação com
  `js-confuser` não é pré-requisito para a decisão atual.
- Nenhuma troca retrospectiva de baseline foi realizada.

### Limitações que impedem conclusão favorável

- `eval-ast-compare` e `eval-human-rubric` não implementados no harness de recovery; trials
  inconclusivos.
- Dimensão anti-LLM inconclusiva (OQ4 aprovada, avaliador não integrado à matriz oficial).
- Seis casos hazard (`eval`, `with`, `function-tostring`) excluídos por política reject-before-protection.
- Hashes de blinding do manifest diferem dos hashes pré-avaliação da matriz oficial.
- Dois pares task/evaluator falharam calibração de controle e foram excluídos dos denominadores de
  resistência.

## Alternatives Considered

### A. Orquestrar ferramentas existentes sem extensão

Usar `javascript-obfuscator` free para AST e Bytenode para Node.js/Electron, com CLI e configuração
unificadas.

- **Pros:** menor esforço inicial; parsers, transforms e loaders já exercitados; entrega offline.
- **Cons:** não cria diferencial técnico demonstrado; padrões conhecidos podem continuar sendo
  reconhecidos por desofuscadores; a camada de frontend pode se limitar a UX sobre ferramentas
  existentes.
- **Status após POC:** baseline medido; candidatos custom não superaram o baseline no endpoint
  primário; evidência insuficiente para adotar A como arquitetura de produto com claim de polimorfismo.

### B. Estender ou manter fork mínimo de uma engine OSS

Usar parser e pipeline de uma engine OSS existente, adicionando variantes estruturais específicas
e um protocolo explícito de seed. A hipótese inicial usava `javascript-obfuscator`.

- **Pros:** testa a hipótese de diversidade sem reimplementar parser e oito transforms commodity;
  menor tempo até evidência; licença BSD-2-Clause permite modificação e redistribuição, preservados
  seus termos `[VERIFIED: licença do repositório oficial, acesso em 2026-08-09]`.
- **Cons:** custo de manter fork; arquitetura interna pode limitar variantes desejadas; qualquer
  ganho continua dependente de medição adversarial.
- **Status após POC:** `oss-extension` não demonstrou ganho adversarial; 39 células falharam
  validação semântica. **Não selecionada.**

**OQ8 resolvida:** `javascript-obfuscator` representa baseline OSS adequado para a matriz mínima.
`js-confuser` permanece alternativa OSS documentada, mas comparação direta não é pré-requisito para
esta rodada — transforms AST, seed configurável e integridade npm já registrados no manifest oficial
sustentam a escolha.

### C. Engine própria em TypeScript sobre parser existente

Implementar apenas as transforms diferenciadoras sobre AST de SWC/Oxc/Babel, mantendo a execução
da ferramenta no Node.js.

- **Pros:** controle do pipeline sem bridge Wasm; integração direta com o ecossistema de build;
  permite substituir incrementalmente componentes comprovadamente limitantes.
- **Cons:** ainda cria engine nova; precisa provar paridade de parsing/generation e manutenção
  superior ao fork.
- **Status após POC:** `own-minimal` não demonstrou ganho adversarial; participou das mesmas falhas
  de validação semântica. **Não selecionada.**

### D. Engine própria em Rust/Wasm

Usar SWC/Oxc em Rust, transforms próprias e bridge Wasm para Node.js.

- **Pros:** controle de AST e potencial de desempenho/portabilidade a validar; caminho adequado se
  o POC demonstrar que as alternativas anteriores não expressam as variantes necessárias.
- **Cons:** maior superfície inicial: parser, transforms, codegen, source maps, ABI Wasm e pacote
  npm; performance superior e ganho defensivo permanecem `[UNVERIFIED]` até medição.
- **Status após POC:** não justificada — candidatos mais simples (B, C) não demonstraram ganho e
  falharam em validação semântica. **Não selecionada.**

### E. Bytecode V8 como adapter independente

Usar Bytenode para o caso Node.js/Electron, sem acoplar essa decisão à engine AST de frontend.

- **Pros:** reutiliza loader e compatibilidade já documentados; impede que uma decisão de backend
  seja usada como justificativa para a arquitetura frontend.
- **Cons:** adiciona dependência e exige matriz explícita de Node/Electron/V8; código dependente de
  `Function.prototype.toString` e alguns casos com arrow functions têm limitações documentadas.
- **Status após POC:** hipótese futura independente; não medida nesta matriz. **Não selecionada
  nesta rodada.**

## Decision

A matriz oficial do [POC comparativo de polimorfismo](../specs/js-condom-polymorphism-poc.md) foi
executada. O relatório oficial conclui `evidencia-insuficiente` (AC17).

**Nenhuma alternativa** (A estendida, B, C ou D) demonstra ganho adversarial suficiente para a
proposta do produto. Os candidatos customizados (`oss-extension`, `own-minimal`) apresentaram taxa
de conclusão adversarial *superior* ao baseline — recuperação mais fácil, não mais difícil. A
evidência é **insuficiente** para aceitar fork, engine própria ou prometer polimorfismo defensivo.

A hipótese inicial B **não foi aceita** e **não foi falsificada positivamente**: os candidatos
falharam em validação semântica (39 células) e não superaram o baseline no endpoint primário.

Para bytecode V8, a hipótese da v1 continua sendo a Alternativa E, tratada em spec separada. Não
será implementado loader próprio sobre `vm.Script.createCachedData()` sem spec demonstrando
necessidade.

Nenhum item futuro de VM customizada ou anti-LLM fundamenta a escolha atual.

**Este ADR permanece `Proposed`.** A conclusão `evidencia-insuficiente` proíbe promoção a
`Accepted` (AC19). Aceite futuro exige nova evidência: corrigir falhas de validação semântica,
implementar evaluators faltantes, alinhar blinding e possivelmente executar nova matriz oficial.

## Consequences

- **Positive:** evidência auditável produzida; baseline OSS justificado (OQ8 resolvida); processo
  evitou investimento prematuro em engine própria; separação frontend AST / backend bytecode
  preservada.
- **Negative:** produto sem claim de polimorfismo defensivo; spec do core continua bloqueada;
  possível reformulação do Goal se nova rodada também não produzir ganho adversarial.
- **Neutral / to monitor:** falhas de validação semântica podem ser corrigíveis; nova matriz após
  correções pode alterar a conclusão; fork pode se tornar inviável por custo de merge — evidência
  válida, não falha do processo.

## Trade-offs

O atraso de discovery produziu critério verificável em vez de narrativa de “engine própria” sem
evidência. A v1 perde a promessa imediata de polimorfismo defensivo, mas evita arquitetura grande
baseada em claim não medida.

Este ADR poderá mudar de `Proposed` para `Accepted` somente depois que:

1. o protocolo e o corpus do POC estiverem versionados — **cumprido**;
2. todas as alternativas comparadas passarem ou falharem explicitamente na equivalência semântica —
   **parcialmente cumprido** (39 falhas semânticas impedem conclusão favorável);
3. o relatório separar diversidade estrutural de custo real de reversão — **cumprido**;
4. o owner registrar a decisão e a justificativa a partir dos dados — **cumprido para
   `evidencia-insuficiente`**; aceite de alternativa específica exige conclusão favorável futura.

Se nenhuma alternativa demonstrar ganho defensivo suficiente após correções e nova rodada, o
requisito de polimorfismo deverá ser reformulado ou removido antes de aprovar a spec do core.

## Fontes primárias

- [`javascript-obfuscator` — opções, seed e licença](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [`js-confuser` — alternativa OSS, capacidades e licença](https://github.com/MichaelXF/js-confuser)
- [`webcrack` — escopo declarado de desofuscação](https://github.com/j4k0xb/webcrack)
- [Node.js `vm.Script.createCachedData()`](https://nodejs.org/api/vm.html#scriptcreatecacheddata)
- [Bytenode — loader, compatibilidade e limitações](https://github.com/bytenode/bytenode)
- [Relatório oficial do POC](../experiments/official/report.md) — matriz `official-2026-08-09`
- [Resultados completos](../experiments/official/results.json) — trials, agregados e limitações
- [Manifest oficial](../experiments/official/manifest.json) — protocolo congelado
