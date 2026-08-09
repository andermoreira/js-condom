# ADR 001 — Engine própria de ofuscação vs. orquestração de ferramentas existentes

> **Status:** Proposed — decisão final bloqueada pelo [POC comparativo de polimorfismo](../specs/js-condom-polymorphism-poc.md)
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
elevar o custo de reversão. Essa é a hipótese que o POC deve testar.

## Problem

Qual é a alternativa de menor complexidade que, operando offline, demonstra ganho material de
resistência à desofuscação automatizada sem quebrar a semântica do código suportado?

A decisão precisa separar duas preocupações independentes:

1. proteção AST de código distribuído ao browser;
2. empacotamento em bytecode V8 para Node.js/Electron.

## Alternatives Considered

### A. Orquestrar ferramentas existentes sem extensão

Usar `javascript-obfuscator` free para AST e Bytenode para Node.js/Electron, com CLI e configuração
unificadas.

- **Pros:** menor esforço inicial; parsers, transforms e loaders já exercitados; entrega offline.
- **Cons:** não cria diferencial técnico demonstrado; padrões conhecidos podem continuar sendo
  reconhecidos por desofuscadores; a camada de frontend pode se limitar a UX sobre ferramentas
  existentes.

### B. Estender ou manter fork mínimo de uma engine OSS

Usar parser e pipeline de uma engine OSS existente, adicionando variantes estruturais específicas
e um protocolo explícito de seed. A hipótese inicial usa `javascript-obfuscator`; `js-confuser`
permanece alternativa OSS que o relatório do POC deve justificar excluir ou recomendar para rodada
adicional.

- **Pros:** testa a hipótese de diversidade sem reimplementar parser e oito transforms commodity;
  menor tempo até evidência; licença BSD-2-Clause permite modificação e redistribuição, preservados
  seus termos `[VERIFIED: licença do repositório oficial, acesso em 2026-08-09]`.
- **Cons:** custo de manter fork; arquitetura interna pode limitar variantes desejadas; qualquer
  ganho continua dependente de medição adversarial.

### C. Engine própria em TypeScript sobre parser existente

Implementar apenas as transforms diferenciadoras sobre AST de SWC/Oxc/Babel, mantendo a execução
da ferramenta no Node.js.

- **Pros:** controle do pipeline sem bridge Wasm; integração direta com o ecossistema de build;
  permite substituir incrementalmente componentes comprovadamente limitantes.
- **Cons:** ainda cria engine nova; precisa provar paridade de parsing/generation e manutenção
  superior ao fork.

### D. Engine própria em Rust/Wasm

Usar SWC/Oxc em Rust, transforms próprias e bridge Wasm para Node.js.

- **Pros:** controle de AST e potencial de desempenho/portabilidade a validar; caminho adequado se
  o POC demonstrar que as alternativas anteriores não expressam as variantes necessárias.
- **Cons:** maior superfície inicial: parser, transforms, codegen, source maps, ABI Wasm e pacote
  npm; performance superior e ganho defensivo permanecem `[UNVERIFIED]` até medição.

### E. Bytecode V8 como adapter independente

Usar Bytenode para o caso Node.js/Electron, sem acoplar essa decisão à engine AST de frontend.

- **Pros:** reutiliza loader e compatibilidade já documentados; impede que uma decisão de backend
  seja usada como justificativa para a arquitetura frontend.
- **Cons:** adiciona dependência e exige matriz explícita de Node/Electron/V8; código dependente de
  `Function.prototype.toString` e alguns casos com arrow functions têm limitações documentadas.

## Decision

Adotar, enquanto este ADR estiver **Proposed**, uma decisão em duas fases:

1. executar o [POC comparativo de polimorfismo](../specs/js-condom-polymorphism-poc.md), usando a
   Alternativa A como baseline e comparando ao menos uma extensão/fork mínimo (B) e uma transform
   própria mínima (C ou D);
2. selecionar, após o relatório do POC, a alternativa de menor complexidade que preserve 100% da
   semântica no subconjunto suportado e demonstre ganho adversarial suficiente para a proposta do
   produto.

A Alternativa B é a **hipótese inicial recomendada**, não a arquitetura aceita: é o caminho mais
barato para falsificar a necessidade de engine própria. Rust/Wasm só será aceito se o POC mostrar
uma limitação concreta das alternativas mais simples ou um benefício mensurado que justifique sua
superfície adicional.

Para bytecode V8, a hipótese da v1 é a Alternativa E. Não será implementado um loader próprio sobre
`vm.Script.createCachedData()` nesta decisão sem uma spec separada demonstrando necessidade.

Nenhum item futuro de VM customizada ou anti-LLM fundamenta a escolha atual.

## Consequences

- **Positive:** evita reimplementar transforms frágeis antes de validar o diferencial; produz
  evidência comparável; separa frontend AST de backend bytecode; mantém aberta a evolução para
  engine própria.
- **Negative:** adia a decisão final e qualquer promessa pública de resistência por polimorfismo;
  exige um POC adversarial antes da implementação do core.
- **Neutral / to monitor:** um fork pode se tornar inviável por custo de merge ou limites internos;
  esse resultado é evidência válida a favor de engine própria, não falha do processo.

## Trade-offs

Aceita-se um atraso curto de discovery para evitar um investimento arquitetural grande baseado em
uma claim ainda não medida. A v1 perde a narrativa imediata de “engine própria”, mas ganha um
critério verificável para decidir se essa engine é necessária.

Este ADR poderá mudar de `Proposed` para `Accepted` somente depois que:

1. o protocolo e o corpus do POC estiverem versionados;
2. todas as alternativas comparadas passarem ou falharem explicitamente na equivalência semântica;
3. o relatório separar diversidade estrutural de custo real de reversão;
4. o owner registrar a decisão e a justificativa a partir dos dados.

Se nenhuma alternativa demonstrar ganho defensivo suficiente, o requisito de polimorfismo deverá
ser reformulado ou removido antes de aprovar a spec do core.

## Fontes primárias

- [`javascript-obfuscator` — opções, seed e licença](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [`js-confuser` — alternativa OSS, capacidades e licença](https://github.com/MichaelXF/js-confuser)
- [`webcrack` — escopo declarado de desofuscação](https://github.com/j4k0xb/webcrack)
- [Node.js `vm.Script.createCachedData()`](https://nodejs.org/api/vm.html#scriptcreatecacheddata)
- [Bytenode — loader, compatibilidade e limitações](https://github.com/bytenode/bytenode)
