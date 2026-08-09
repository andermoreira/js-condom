# ADR 001 — Engine própria de ofuscação vs. orquestração de ferramentas existentes

## Context

A spec [`js-protect — Core Obfuscation Engine`](../specs/js-protect-core.md) define uma
ferramenta open source de proteção de código JS/TS, offline, com CLI e API programática.

O discovery ([`benchmark-js-protection.md`](../benchmark-js-protection.md), §6) recomendou
explicitamente que `js-protect` fosse um **wrapper/orquestrador** de ferramentas maduras já
existentes: `bytenode` (V8 bytecode no backend) + `javascript-obfuscator` (transforms AST no
frontend), unificados por um config file e plugins de bundler, "com custo zero e sem depender de
API externa".

Forças em conflito registradas pelos dados do benchmark:

- As 8 transforms AST-level do `javascript-obfuscator` free (name mangling, string encryption,
  control flow flattening, dead code injection, self-defending, debug protection, domain lock,
  numbers to expressions) são **revertidas por `webcrack` em segundos** (§2.1, §3).
- Apenas três classes de técnica resistem de forma relevante: **VM bytecode** (reversão "Alta"),
  **ofuscação polimórfica** (reversão "Muito Alta", derrota reconhecimento de padrão por LLM) e
  **anti-LLM** (reversão "Muito Alta") — §1.
- `javascript-obfuscator` free **não oferece** polimorfismo; ele é exclusivo do tier Pro (VM) e de
  ferramentas enterprise como Jscrambler (§2.1, §2.4).

Requisito não-funcional relevante da spec: output **polimórfico** (único por build) como
diferencial central de proteção, definido como flagship da v1 (Goal, US7, AC7).

## Problem

Para entregar o diferencial de polimorfismo definido na spec, `js-protect` deve **orquestrar
ferramentas de terceiros existentes** ou **implementar engine própria** de manipulação de AST?

A decisão determina a arquitetura do núcleo (parser + transforms + geração de código),
o esforço de engenharia e o teto de proteção alcançável.

## Alternatives Considered

### A. Orquestração de ferramentas existentes (recomendação do benchmark §6)
Wrapper sobre `bytenode` + `javascript-obfuscator` free, com config e plugins unificados.

- **Pros:** esforço mínimo; ferramentas maduras e mantidas; cobre backend (bytenode, proteção
  real e irreversível sem decompilador V8 público) com custo próximo de zero.
- **Cons:** **não permite implementar polimorfismo** — o `javascript-obfuscator` free não expõe
  esse controle e seu output é determinístico e casável por `webcrack`. O teto de proteção de
  frontend fica limitado ao que já é revertido em segundos. `js-protect` seria apenas uma camada
  de UX sobre ferramentas free, sem diferencial defensável frente aos dados do benchmark.

### B. Engine própria em Rust/Wasm com controle de AST
Parser (swc/oxc) + transforms próprias, com um PRNG seedado dirigindo todas as escolhas.

- **Pros:** controle no nível de AST habilita **polimorfismo real** — seed ausente gera output
  único por build; seed fixa dá build reproduzível. É o único caminho para o diferencial da spec.
  Base para técnicas futuras (VM bytecode, anti-LLM) sob o mesmo motor. Sem dependência de
  binários free de terceiros no caminho crítico.
- **Cons:** esforço de engenharia significativamente maior; risco de paridade incompleta de parsing
  de JS moderno (mitigado usando swc/oxc, não parser próprio); reimplementar as 8 transforms base
  não agrega proteção sobre o free **se isoladas** — o valor vem exclusivamente da camada
  polimórfica sobre elas.

### C. Híbrido — engine própria no frontend, `bytenode` orquestrado no backend
Engine própria para o output polimórfico do browser; delegar V8 bytecode ao `bytenode` no backend.

- **Pros:** reaproveita a proteção madura e irreversível do bytenode sem reimplementá-la; foca o
  esforço próprio onde há diferencial (polimorfismo).
- **Cons:** duas bases de manutenção e um contrato de config que precisa cobrir os dois mundos;
  o passo 12 da spec já prevê `vm.Script.createCachedData()` diretamente, tornando a dependência
  do bytenode opcional. Fica registrado como evolução possível, não como decisão da v1.

## Decision

Adotar **engine própria (Alternativa B)**: parser via swc/oxc + transforms próprias em Rust
compiladas para Wasm, com um PRNG seedado dirigindo o polimorfismo.

Motivo determinante: o diferencial de produto da v1 é o **polimorfismo**, e — segundo os dados do
próprio discovery — nenhuma ferramenta free orquestrável o entrega. Orquestrar `javascript-obfuscator`
free (Alternativa A) tem teto de proteção igual ao que `webcrack` reverte em segundos, sem
diferencial defensável. O controle de AST da engine própria é pré-requisito técnico do polimorfismo.

A escolha entre **swc e oxc** permanece aberta (Open question #1 da spec) e não é objeto deste ADR.
A compilação de V8 bytecode no backend é feita diretamente via `vm.Script.createCachedData()`
(passo 12 da spec), sem depender de `bytenode`; a orquestração híbrida (Alternativa C) fica como
consideração futura, não como escopo da v1.

## Consequences

- **Positive:** habilita o polimorfismo como diferencial central; controle total do pipeline de
  transforms; base única para técnicas futuras (VM bytecode, anti-LLM) sem trocar de arquitetura.
- **Negative:** maior esforço de engenharia e superfície de manutenção; a proteção das transforms
  base isoladas (sem a camada polimórfica) não supera o `javascript-obfuscator` free — o valor
  depende de a camada polimórfica ser efetiva.
- **Neutral / to monitor:** paridade de parsing de JS moderno (ES2022+) — mitigada por usar
  swc/oxc; performance da engine em Wasm para arquivos grandes (Open question #2 / POC), com
  fallback napi-rs previsto no risco correspondente da spec.

## Trade-offs

Aceita-se conscientemente **mais custo de engenharia** em troca de um **diferencial de proteção que
a orquestração de ferramentas free não alcança**. Fica preservada a opção futura de orquestrar
`bytenode` (Alternativa C) e de adicionar VM bytecode sobre a mesma engine.

Limite conhecido e gatilho de evolução: se o POC (Open question #2) demonstrar que o polimorfismo
em Wasm não atinge os alvos de performance da spec (p95 < 2s para 1MB/high) **e** o fallback
napi-rs não fechar a lacuna, reabrir este ADR para reavaliar a Alternativa C (orquestração no
backend) como forma de reduzir a superfície própria. Se, além disso, medições mostrarem que o
polimorfismo isolado não eleva materialmente o custo de reversão frente ao free, a premissa central
da decisão cai e o ADR deve ser reaberto.
