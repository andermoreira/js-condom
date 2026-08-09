# Spec: `js-condom` core v1

> **Status:** Draft — pronta para revisão e implementação após aprovação do contrato.
> **Decisão relacionada:** [ADR 002](../adr/002-evidencia-e-posicionamento-v1.md).

## Goal

Entregar uma camada build-time offline, auditável e reproduzível sobre
`javascript-obfuscator`, com defaults seguros, preservação semântica e diagnóstico consistente.

O produto é um wrapper operacional. Ele não promete irreversibilidade nem mede resistência
adversarial como critério de aceite do core v1.

## Non-goals

- Não proteger secrets, tokens, credenciais ou dados disponíveis em runtime.
- Não prometer impossibilidade de análise manual, derrota de LLMs ou aumento percentual de custo.
- Não implementar engine própria, VM customizada, V8 bytecode, `.jsc`, Bytenode ou WASM.
- Não aceitar TypeScript, JSX/TSX, source trees ou dependências não empacotadas diretamente.
- Não incluir plugins de webpack/esbuild/Vite, watch mode, domain lock, anti-debug,
  self-defending, watermarking ou proteção seletiva.
- Não executar no browser e não iniciar conexões de rede durante a proteção.
- Não processar diretórios ou múltiplos módulos no MVP; isso fica para uma spec posterior.
- Não expor flags arbitrárias da engine; o preset é versionado como unidade.
- Não gerar source maps no MVP; o formato será especificado separadamente quando houver caso de uso.

## Usuários e casos de uso

### US1 — Proteger um bundle via API

**Given** um texto JavaScript bundled compatível e opções válidas

**When** o consumidor chama `protect(sourceCode, options)`

**Then** recebe o código protegido e metadados suficientes para auditoria e reprodução.

### US2 — Proteger um arquivo via CLI

**Given** um arquivo `.js`, `.mjs` ou `.cjs` e um caminho de saída explícito

**When** o consumidor executa `js-condom protect input.js --output protected.js`

**Then** a ferramenta grava somente o artefato validado e um relatório opcional, sem rede.

### US3 — Diagnosticar entrada incompatível

**Given** sintaxe ou construção dinâmica fora do subconjunto suportado

**When** a proteção é solicitada

**Then** a operação falha fechada com código estável, mensagem acionável e nenhum output parcial.

## Escopo funcional

### Entrada

- API recebe `sourceCode: string` e `options` serializáveis.
- CLI aceita exatamente um arquivo com extensão `.js`, `.mjs` ou `.cjs`.
- A entrada é lida integralmente; limites de tamanho são configuráveis pelo processo e devem ser
  documentados no release.
- A ferramenta não resolve imports, não percorre diretórios e não acessa filesystem além da
  entrada, saída e relatório solicitados.

### Preset e configuração

- O preset v1 é fixo, versionado e encapsula as opções aprovadas de `javascript-obfuscator`.
- O consumidor pode definir `seed`; com seed fixa, o mesmo input, preset e versão produz bytes
  idênticos no ambiente suportado.
- Sem seed, a ferramenta gera uma seed efetiva e a devolve nos metadados; a seed não é segredo.
- Opções desconhecidas, incompatíveis ou que alterem o contrato do preset são rejeitadas.
- A versão da engine e do preset faz parte do resultado; upgrades exigem requalificação.

### Saída e relatório

- API retorna `{ code, metadata }`.
- `metadata` contém `toolVersion`, `engineVersion`, `presetVersion`, `seedUsed`,
  `inputSha256`, `outputSha256` e `configSha256`.
- CLI grava o código no caminho indicado e, quando `--report` é usado, grava JSON atômico no
  caminho indicado.
- A saída só é publicada depois de validação sintática e das verificações semânticas definidas
  no conjunto de testes do release.
- Reexecução com o mesmo input, preset, seed e versões deve produzir o mesmo relatório, exceto
  campos explicitamente temporais (que não fazem parte do contrato de hash).

### Compatibilidade semântica

- O suporte declarado cobre o subconjunto exercitado pela matriz de fixtures do release.
- A matriz deve incluir módulos ESM/CJS, async/await, classes, closures, generators,
  optional chaining, private fields e casos de exceção relevantes ao preset.
- `eval`, `with` e padrões conhecidos que dependam de representação textual de função são
  rejeitados quando detectáveis pelo analisador sintático fechado.
- Dependências dinâmicas não detectáveis não são convertidas em garantia; são limitação
  documentada do subconjunto suportado.
- O critério de aceite é equivalência observável nas fixtures, não igualdade textual.

### Erros

Os códigos públicos são: `INVALID_INPUT`, `INVALID_CONFIG`, `UNSUPPORTED_SYNTAX`,
`SEMANTIC_HAZARD`, `PROTECTION_FAILED`, `OUTPUT_CONFLICT` e `INTERNAL_ERROR`.

Mensagens não devem incluir código-fonte completo, secrets, paths fora do contexto solicitado ou
stack trace por padrão. A CLI usa stderr estruturado e exit code não zero para todos os erros.

## Requisitos não funcionais

- **Offline:** nenhuma chamada de rede, child process externo ou telemetria durante a operação.
- **Determinismo:** seed fixa implica output e hashes reproduzíveis dentro da matriz de versões.
- **Auditabilidade:** cada artefato pode ser associado a input, configuração, engine, preset e seed.
- **Fail closed:** falhas de parsing, validação, semântica ou escrita não publicam artefato parcial.
- **Runtime:** suporte inicial em Node.js 24 LTS; a compatibilidade deve ser verificada no CI.
- **Supply chain:** dependências devem passar por auditoria no release; o core não depende do
  sandbox experimental nem de `ses` enquanto a versão vulnerável permanecer no lockfile.
- **Privacidade:** nenhum dado de input/output sai do processo.

## Threat model e limites

O atacante conhece o algoritmo, possui o artefato e pode executar JavaScript em ambiente sob seu
controle. O wrapper não é boundary de segurança. Ele reduz exposição operacional e padroniza o
build, mas qualquer afirmação sobre custo de recuperação exige um POC adversarial separado,
reproduzível e aprovado antes de ser publicada.

## Critérios de aceite

1. A documentação do produto não contém promessa de resistência adversarial para o core v1.
2. API e CLI implementam o mesmo preset e rejeitam configuração divergente.
3. CLI processa um único `.js`, `.mjs` ou `.cjs`, exige saída explícita e não deixa output parcial.
4. Operações válidas não fazem chamadas de rede nem telemetria.
5. Seed fixa produz bytes e hashes idênticos em duas execuções no ambiente suportado.
6. Execução sem seed retorna `seedUsed` efetiva no metadata.
7. Matriz de fixtures passa equivalência observável para todo o subconjunto declarado.
8. Entradas com hazards detectáveis falham com `UNSUPPORTED_SYNTAX` ou `SEMANTIC_HAZARD`.
9. Erros públicos são estáveis, não vazam conteúdo sensível e retornam exit code não zero na CLI.
10. Metadata contém todos os hashes e versões definidos nesta spec.
11. CI verifica Node 24 LTS, lint, testes, `npm audit` e ausência de chamadas de rede no fluxo.
12. README documenta instalação, API, CLI, preset, seed, limitações e política de requalificação.

## Fora do escopo desta entrega

- Qualquer benchmark de recuperação, anti-LLM ou “percentage points”.
- Correção do evaluator experimental além do necessário para não ser dependência do core.
- Proteção de diretórios, source maps, plugins de bundler, TypeScript/JSX e múltiplas engines.
- Deploy, publicação de pacote ou alteração de infraestrutura externa.

## Plano de implementação

1. **Contrato e preset:** tipos, validação, erros públicos, hashes e configuração versionada.
2. **API e semântica:** wrapper da engine, análise de hazards, validação pós-transform e testes
   da matriz de fixtures.
3. **CLI e artefatos:** comando de arquivo único, escrita atômica, relatório e códigos de saída.
4. **Release gate:** CI Node 24, auditoria de dependências, documentação e revisão de segurança.

## Dependências e questões abertas

- A versão exata de `javascript-obfuscator` deve ser fixada e requalificada no Step 1.
- O subconjunto final de fixtures deve ser aprovado antes do Step 2.
- O limite de tamanho de entrada deve ser definido com base no ambiente de execução antes do Step 3.
- Source maps e diretórios exigem novas specs; não bloqueiam este MVP.

## Handoff

Esta spec está pronta para implementação após revisão. Os Atomic Steps abaixo são o plano
executável; nenhum passo autoriza claims adversariais ou alterações de infraestrutura.
