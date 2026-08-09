# Spec: js-protect — Core Obfuscation Engine

## Goal

Reduzir a viabilidade de engenharia reversa de lógica JavaScript/TypeScript proprietária distribuída ao cliente, gerando output **polimórfico** (único por build) que resiste a reconhecimento de padrão por ferramentas de desofuscação automatizadas e por LLMs — operando 100% offline.

> Entregue como ferramenta open source, com engine própria em Rust (compilada para Wasm), exposta via CLI e API programática para Node.js, Browser e Electron. A decisão de engine própria vs. orquestração de ferramentas existentes está registrada em [ADR 001](../adr/001-engine-propria-vs-orquestracao.md).

---

## Non-goals

- **Não** é um serviço SaaS/cloud — opera 100% offline, sem envio de código para servidores externos
- **Não** implementa VM bytecode obfuscation com opcodes customizados (tipo obfuscator.io Pro) na v1 — a resposta de frontend da v1 é o polimorfismo; VM fica como consideração futura
- **Não** é um minificador — opera sobre código já empacotado/bundled, complementar a Terser/esbuild
- **Não** protege contra extração de secrets ou API keys do frontend (responsabilidade do backend)
- **Não** faz watermarking de código na v1
- **Não** suporta Internet Explorer ou runtimes anteriores a ES2015

---

## User stories

### US1 — Proteger projeto Node.js via CLI
**Given** um projeto Node.js com arquivos `.js` no diretório `dist/`
**When** o dev executa `js-protect dist/ --output dist-protected/ --preset high`
**Then** todos os arquivos `.js` são processados com ofuscação (name mangling, control flow flattening, string encryption) e salvos em `dist-protected/`

### US2 — Proteger seletivamente funções sensíveis
**Given** um arquivo com funções públicas e uma função `validateLicense()` proprietária
**When** o dev adiciona `/* js-protect:high */` antes de `validateLicense()` e executa o CLI
**Then** apenas a função marcada recebe todas as transformações; o restante recebe ofuscação leve ou nenhuma

### US3 — Compilar para V8 bytecode (Node.js)
**Given** módulos Node.js que o dev quer distribuir sem source code legível
**When** o dev executa `js-protect compile src/server.js --target node --bytecode`
**Then** o arquivo é compilado para V8 bytecode (`.jsc`) que pode ser importado com `require()` normalmente

### US4 — Integrar com webpack
**Given** um projeto React com webpack
**When** o dev adiciona `JsProtectWebpackPlugin` com options de ofuscação
**Then** o bundle final de produção sai ofuscado automaticamente após o build

### US5 — API programática
**Given** um script Node.js que gera código dinamicamente
**When** o dev chama `import { obfuscate } from 'js-protect'` e passa o código fonte como string
**Then** recebe de volta o código ofuscado como string, com source map opcional

### US6 — Erro claro em código inválido
**Given** um arquivo JavaScript com sintaxe inválida (ex: `const x =`)
**When** o dev tenta ofuscar esse arquivo
**Then** o CLI reporta o erro de parsing com linha/coluna e nome do arquivo, sem produzir output corrompido

### US7 — Output polimórfico entre builds
**Given** o mesmo arquivo fonte e nenhuma `seed` fixa configurada
**When** o dev executa a ofuscação duas vezes em builds distintos
**Then** os dois outputs são estruturalmente diferentes (layout do string array, nomes de identificadores, ordem de blocos) porém semanticamente equivalentes; com `seed` fixa, o output é byte-idêntico entre execuções

---

## Assumptions

1. O código de entrada é JavaScript válido (ES2015+). TypeScript deve ser compilado para JS antes da ofuscação
2. O ambiente Node.js alvo é ≥ 18.x (LTS ativo em 2026)
3. A CLI opera sobre código já bundled (webpack/esbuild output), não sobre source com imports
4. Para V8 bytecode, a versão do Node.js que compila deve ser idêntica à versão que executa
5. O usuário mantém os source maps originais em local seguro; a ferramenta pode gerar source maps do código ofuscado para debugging
6. Wasm runtime disponível no Node.js (built-in desde Node 12, sem flag experimental desde Node 18)
7. O usuário entende que ofuscação não é criptografia e não substitui guardar secrets no backend

---

## Risks

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Wasm performance inferior a native em arquivos grandes (>10MB) | Média | Alto | Oferecer fallback via napi-rs (native binary) se Wasm for gargalo |
| Parsing de JS moderno (ES2022+) incompleto no parser Rust | Média | Alto | Usar swc (parser consolidado, usado pelo Next.js) em vez de implementar parser próprio |
| Ofuscação quebrar semântica do código (falso positivo) | Alta | Crítico | Test suite extensa com projetos reais; source maps para debug; smoke test pós-ofuscação |
| Ferramentas de deobfuscação (webcrack, de4js) reverterem as transforms AST em camada única | Alta | Crítico | Polimorfismo (output único por build) como barreira principal — remove o padrão estável que o desofuscador precisa casar; técnicas em camadas; V8 bytecode para backend |
| Não-determinismo do polimorfismo quebrar source maps e testes de regressão | Alta | Alto | `seed` fixa obrigatória em CI/debug e para gerar source map estável; suite de equivalência semântica roda sobre múltiplos seeds |
| Reprodução de bug de produção dificultada (cada build é diferente) | Média | Médio | `seed` efetiva registrada em `ObfuscateStats` e logada no artefato de release para reproduzir o build exato |
| Código gerado ser maior que o original e impactar load time | Média | Médio | Métricas de tamanho no output; presets balanceados; recomendação de GZIP/Brotli no servidor |
| Incompatibilidade com V8 bytecode entre versões Node | Média | Baixo | Documentar claramente; checksum validation no load; BYTENODE_DEBUG env para diagnóstico |
| Supply chain attack no Wasm binary distribuído | Baixa | Alto | Build reprodutível; checksums no release; CI com attestation de provenance |

---

## API contract

### CLI

```
js-protect <input> [options]

Arguments:
  input                    Arquivo ou diretório de entrada (caminho ou glob)

Options:
  -o, --output <path>      Arquivo ou diretório de saída
  -c, --config <path>      Caminho para js-protect.config.json
  -p, --preset <name>      Preset: low | medium | high | maximum
  -t, --target <target>    Ambiente alvo: node | browser | electron
  --bytecode               Compilar para V8 bytecode (.jsc) — Node.js apenas
  --seed <number>          Seed fixa → build determinístico/reproduzível (omitido = polimórfico)
  --source-map             Gerar source maps do código ofuscado
  --source-map-mode <mode> inline | separate (default: separate)
  --exclude <glob>         Excluir arquivos do processamento (aceita múltiplos)
  --watch                  Re-ofuscar em mudanças nos arquivos fonte
  --dry-run                Mostrar o que seria feito sem escrever arquivos
  --verbose                Log detalhado das transformações aplicadas
  -v, --version            Versão da ferramenta
  -h, --help               Ajuda

Commands:
  js-protect compile <input>  Compila para V8 bytecode (.jsc)
  js-protect init             Cria js-protect.config.json no diretório atual
```

### API programática (TypeScript)

```typescript
export interface ObfuscateOptions {
  /** Preset name or custom configuration */
  preset?: 'low' | 'medium' | 'high' | 'maximum';
  /** Target environment */
  target?: 'node' | 'browser' | 'electron';
  /** Specific transforms and their configs */
  transforms?: TransformsConfig;
  /** Generate source map */
  sourceMap?: boolean;
  /** Source map mode */
  sourceMapMode?: 'inline' | 'separate';
  /**
   * Seed do gerador. Omitida/undefined → output polimórfico (aleatório por build, default).
   * Valor fixo → build determinístico e reproduzível (debug, source maps estáveis, CI).
   */
  seed?: number;
  /** Reserved identifier patterns (regex strings) */
  reservedNames?: string[];
  /** Reserved string patterns (regex strings) */
  reservedStrings?: string[];
  /** Compact output to single line */
  compact?: boolean;
}

export interface ObfuscateResult {
  /** Obfuscated code string */
  code: string;
  /** Source map (if enabled) */
  sourceMap?: string;
  /** Statistics about applied transforms */
  stats: ObfuscateStats;
}

export interface ObfuscateStats {
  originalSize: number;
  obfuscatedSize: number;
  identifiersRenamed: number;
  stringsEncrypted: number;
  deadCodeBlocksInjected: number;
  durationMs: number;
  /** Seed efetivamente usada — registrar para reproduzir builds polimórficos */
  seedUsed: number;
}

export function obfuscate(
  sourceCode: string,
  options?: ObfuscateOptions
): Promise<ObfuscateResult>;

export interface CompileOptions {
  /** Output path */
  output?: string;
  /** Compress bytecode with Brotli */
  compress?: boolean;
}

export function compileToBytecode(
  sourceCode: string,
  options?: CompileOptions
): Promise<Buffer>;
```

---

## Data model

### Config file (`js-protect.config.json`)

```json
{
  "$schema": "https://raw.githubusercontent.com/.../js-protect/schemas/config.json",
  "preset": "high",
  "target": "browser",
  "transforms": {
    "nameMangling": {
      "enabled": true,
      "generator": "hexadecimal"
    },
    "stringEncryption": {
      "enabled": true,
      "encoding": "base64",
      "threshold": 0.8
    },
    "controlFlowFlattening": {
      "enabled": true,
      "threshold": 0.5
    },
    "deadCodeInjection": {
      "enabled": false,
      "threshold": 0.3
    },
    "selfDefending": {
      "enabled": true
    },
    "debugProtection": {
      "enabled": true,
      "interval": 0
    },
    "domainLock": {
      "enabled": false,
      "domains": [],
      "redirectUrl": "about:blank"
    },
    "numbersToExpressions": {
      "enabled": true
    },
    "polymorphic": {
      "enabled": true
    }
  },
  "sourceMap": false,
  "exclude": ["**/vendor/**", "**/*.test.js"],
  "compact": true,
  "seed": null,
  "reservedNames": [],
  "reservedStrings": []
}
```

---

## Error handling

| Cenário | Comportamento | Exit code |
|---|---|---|
| Arquivo de entrada não encontrado | `Error: Input file not found: <path>` | 1 |
| JavaScript sintaticamente inválido | `ParseError: <file>:<line>:<col> — <message>` | 2 |
| Arquivo maior que 50MB | `Error: File exceeds maximum size (50MB): <path>` | 3 |
| Opção de config inválida | `ConfigError: Unknown option "foo". Did you mean "bar"?` | 4 |
| Preset inválido | `Error: Unknown preset "ultra". Available: low, medium, high, maximum` | 5 |
| Bytecode com Node.js incompatível | `BytecodeError: Compiled with Node v20.x, but running on Node v22.x` | 6 |
| Wasm não carregado | `Error: WebAssembly runtime not available` | 7 |
| Permissão negada ao escrever output | `Error: Cannot write to <path>: EACCES` | 8 |
| Auto-defendendo detectou modificação (runtime) | Código lança erro interno com mensagem genérica (não revela que é self-defending) | N/A |

Todo erro no CLI é emitido em stderr com formato `js-protect: <type>: <message>`.

---

## Observability

| Sinal | Tipo | Descrição |
|---|---|---|
| `js_protect_obfuscation_duration_ms` | Métrica | Duração total da ofuscação por arquivo |
| `js_protect_original_size_bytes` | Métrica | Tamanho original (por arquivo) |
| `js_protect_obfuscated_size_bytes` | Métrica | Tamanho ofuscado (por arquivo) |
| `js_protect_transforms_applied` | Métrica | Contador de transforms aplicados (por tipo) |
| `js_protect_parse_errors` | Métrica | Contador de erros de parsing |
| `--verbose` flag | Log textual | Detalhamento de cada transform aplicada por arquivo |
| Stats retornados na API | Estruturado | `ObfuscateStats` com contadores e tamanhos |

Métricas expostas como eventos via `process.emit('js-protect:stats', stats)` para integração com sistemas de monitoramento do usuário.

---

## Quality attributes

| Atributo | Cenário | Resposta | Medida |
|---|---|---|---|
| Performance | Arquivo JS de 1MB com preset `high` em Node.js 20 | CLI conclui ofuscação | p95 < 2s em hardware moderno (M1/M2 ou equivalente x86) |
| Performance | Arquivo JS de 10MB com preset `medium` | CLI conclui ofuscação | p95 < 10s |
| Correctness | Código JS com 100% de cobertura de AST features ES2015-ES2022 | Output semanticamente equivalente ao input | Test suite com ≥ 95% de pass rate em corpus de projetos reais |
| Size overhead | Preset `high` em arquivo de 100KB | Output não excede | 3x o tamanho original antes de GZIP |
| Size overhead | Preset `medium` em arquivo de 100KB | Output não excede | 2x o tamanho original antes de GZIP |
| Polimorfismo | Dois builds com seeds distintos do mesmo input de 100KB | Outputs divergentes, semântica preservada | < 5% de linhas idênticas e nenhum string array com layout compartilhado; 100% de equivalência semântica |
| Determinismo | Dois builds com a mesma `seed` fixa | Output reproduzível | Byte-idêntico entre execuções |

---

## Threat model

### Ativos protegidos
- Lógica de negócio proprietária em JavaScript (algoritmos, validações, regras)
- Estrutura do código fonte (nomes de funções, fluxo de controle)
- Strings sensíveis em código (mensagens, paths, valores de configuração não-secretos)

### Ativos NÃO protegidos (fora de escopo)
- Segredos (API keys, tokens, senhas) — nunca devem estar no frontend
- Dados de usuário em runtime (memória do browser)
- Integridade contra atacantes com acesso físico ao servidor

### Vetores de ameaça

| Ameaça | Técnica de mitigação |
|---|---|
| Engenharia reversa via pretty-print + inspeção manual | Name mangling + control flow flattening + dead code injection |
| Desofuscação automatizada (webcrack, de4js) | **Polimorfismo** (sem padrão estável entre builds para o desofuscador casar) como barreira principal; string encryption + números para expressões como camadas. Nota: self-defending apenas eleva custo marginal — não impede webcrack sozinho |
| Debugging via Chrome DevTools / Node inspector | Debug protection (interval-based debugger statement injection) |
| Cópia não autorizada do código para outro domínio | Domain lock — dissuasão **fraca**: bypassável removendo o check; não é barreira forte |
| Tampering do código em runtime (monkey patching) | Self-defending + integrity checks |
| Análise estática por LLMs (Claude, GPT) | **Polimorfismo** elimina padrões reconhecíveis entre builds (reduz eficácia de reconhecimento por LLM); camadas combinadas; V8 bytecode como opção forte para backend |
| Extração de strings via análise estática | String array encryption + threshold parcial |

---

## Rollout / Rollback

- **Distribuição**: publicação no npm sob semver. Mudança de comportamento de qualquer transform ou do formato de output é **breaking** (MAJOR), pois altera o artefato protegido de builds do usuário.
- **V8 bytecode**: o acoplamento de versão do Node (assumption 4) é comunicado via `engines` no `package.json` e validado em runtime no load do `.jsc` (erro `BytecodeError`, exit code 6). Bump de major do Node alvo → nova major da ferramenta.
- **Deprecação**: transforms ou flags removidas passam por um ciclo de major com aviso em `--verbose` e no CHANGELOG antes da remoção.
- **Rollback do usuário**: pinar a versão anterior no `package.json` e re-rodar o build reproduz o output anterior desde que a `seed` seja fixa; builds polimórficos (sem seed) não são reproduzíveis entre versões — documentar que releases sensíveis devem fixar `seed`.

---

## Acceptance criteria

1. **CLI funcional**: `js-protect src/ -o dist/ --preset high` processa todos os `.js` de `src/` e escreve em `dist/` com código ofuscado funcionalmente equivalente
2. **API programática**: `import { obfuscate } from 'js-protect'` disponível como função assíncrona que aceita string e retorna `ObfuscateResult`
3. **Presets**: `low`, `medium`, `high`, `maximum` pré-configurados e documentados com combinações de transforms adequadas
4. **Config file**: `js-protect init` gera arquivo de configuração com schema; `js-protect -c config.json` lê e aplica
5. **Transforms implementados**: name mangling, string encryption, control flow flattening, dead code injection, self-defending, debug protection, domain lock, numbers to expressions, **polymorphic** — todos funcionais e testados
6. **Semântica preservada**: suite de testes de regressão com ≥ 50 arquivos JS de projetos open source reais, executada sobre **múltiplos seeds**; ≥ 95% passam em equivalência semântica em todos os seeds
7. **Polimorfismo**: sem `seed`, dois builds do mesmo input produzem outputs estruturalmente distintos (< 5% de linhas idênticas, string arrays sem layout compartilhado) e semanticamente equivalentes; com `seed` fixa, o output é byte-idêntico entre execuções e a `seed` efetiva é reportada em `ObfuscateStats`
8. **V8 bytecode**: `js-protect compile --bytecode` produz `.jsc` carregável via `require()` no Node.js mesma versão
9. **Source maps**: `--source-map` (com `seed` fixa) gera source maps que mapeiam código ofuscado de volta ao original para debugging
10. **Watch mode**: `--watch` re-ofusca arquivos quando modificados
11. **Error handling**: todos os cenários da tabela de erros cobertos com mensagens claras e exit codes corretos
12. **3 bundler plugins**: plugins para webpack, esbuild e vite publicados e funcionais com presets
13. **Documentação**: README com quickstart, documentação de API, documentação de cada transform e suas opções

---

## Open questions

1. **Parser Rust**: `swc` (ecosystem SWC) vs `oxc` (ecosystem Oxc)? — swc é mais maduro, oxc é mais rápido. Fora do escopo do [ADR 001](../adr/001-engine-propria-vs-orquestracao.md). **Owner**: @andersonalves, **Deadline**: POC / ADR de parser
2. **Wasm vs napi-rs**: confirmar se Wasm é suficiente para perf em arquivos grandes ou se precisamos de fallback nativo. **Owner**: @andersonalves, **Deadline**: POC
3. **Licença**: MIT ou Apache 2.0? — MIT é mais comum no ecossistema JS. **Owner**: @andersonalves
4. **Nome do pacote npm**: `js-protect` pode conflitar. Alternativas: `@js-protect/core`, `protect-js`? **Owner**: verificar disponibilidade no npm
5. **V8 bytecode no Electron ≥ 42**: a compilação deve ocorrer no main process. A ferramenta deve spawnar um processo Electron? Ou documentar que o usuário deve rodar o comando dentro do contexto Electron? **Owner**: @andersonalves, **Deadline**: antes da spec do módulo Electron
6. **Suporte a TypeScript como input direto?** Hoje a spec assume JS. Compilar TS via esbuild internamente antes de ofuscar é scope creep ou feature necessária? **Owner**: @andersonalves

---

## Implementation plan

1. **Scaffolding do projeto**: monorepo com Rust crate + pacote npm TypeScript + configs de build
2. **Parser + AST em Rust**: integração com swc/oxc para parsing de JavaScript como AST manipulável
3. **Transform: name mangling**: renomear identificadores locais com nomes hex/mangled, preservando globais e reserved names
4. **Transform: string encryption**: extrair strings para array + função de acesso com encoding base64
5. **Transform: control flow flattening**: achatar estruturas de controle (if/while/for) em switch-case + dispatcher
6. **Transform: dead code injection**: injetar blocos de código morto com predicações falsas no AST
7. **Transform: self-defending + debug protection**: injetar código de runtime que detecta formatação e debugger
8. **Transform: domain lock + numbers**: injetar verificação de domínio no topo; converter números para expressões equivalentes
9. **Transform: polymorphic (flagship)**: PRNG seedado dirigindo escolhas de todas as transforms (nomes, layout do string array, ordem de blocos, variantes de expressão) — `seed` ausente = aleatório por build; `seed` fixa = reproduzível; expor `seedUsed`
10. **Wasm bridge + API JS**: exportar função `obfuscate()` do Wasm via wasm-bindgen para o pacote npm
11. **CLI em TypeScript**: comandos `js-protect` com clipanion/commander, config file, presets, watch mode, flag `--seed`
12. **V8 bytecode compiler**: módulo que usa `vm.Script.createCachedData()` para gerar `.jsc` a partir de JS ofuscado
13. **Bundler plugins**: plugins para webpack (Rspack compat), esbuild, e vite
14. **Test suite**: testes unitários dos transforms Rust, testes de integração da API JS, smoke tests com projetos reais, equivalência semântica multi-seed
15. **Documentação + CI**: README, API docs, exemplos, GitHub Actions para build/test/release

---

> **Status:** Aguardando aprovação do usuário para avançar para ADR e Atomic Steps.
