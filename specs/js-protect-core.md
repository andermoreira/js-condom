# Spec: `js-protect` core v1

> **Status:** Draft — bloqueada pelo
> [POC comparativo de polimorfismo](js-protect-polymorphism-poc.md) e pelo aceite do
> [ADR 001](../adr/001-engine-propria-vs-orquestracao.md). Não autoriza Atomic Steps.

## Goal

Elevar de forma mensurável o custo de recuperação automatizada de lógica JavaScript distribuída,
por meio de uma ferramenta build-time open source e 100% offline que preserva a semântica do
subconjunto suportado.

## Non-goals

- Não prometer irreversibilidade, impossibilidade de análise manual ou derrota universal de LLMs.
- Não proteger secrets, tokens, credenciais ou dados disponíveis em runtime.
- Não aceitar TypeScript diretamente; o usuário compila e empacota TS antes da proteção.
- Não executar a ferramenta no browser; a API e CLI da v1 executam em Node.js.
- Não implementar V8 bytecode, `.jsc`, Bytenode ou VM customizada nesta spec.
- Não incluir plugins de webpack/esbuild/Vite, watch mode, domain lock, anti-debug, self-defending,
  watermarking ou proteção seletiva por comentário na v1.
- Não expor flags por transform; a v1 usa um pipeline avaliado e versionado como unidade.
- Não processar dependências/vendor, source trees não empacotadas ou múltiplos módulos com
  resolução própria.

## Classificação de escopo

### Requisitos atuais

- Operar offline e não iniciar conexões de rede durante proteção.
- Proteger arquivo ou diretório de JavaScript já compilado/bundled via CLI Node.js.
- Oferecer API programática Node.js com o mesmo contrato de configuração da CLI.
- Preservar 100% da semântica no subconjunto explicitamente suportado.
- Produzir output variável sem seed fixa e byte-idêntico com seed fixa sob ambiente definido.
- Gerar e compor source map separado sem exigir seed fixa.
- Falhar de forma segura diante de sintaxe, semântica dinâmica ou paths não suportados.
- Publicar metadados suficientes para reproduzir e auditar cada build.
- Só afirmar ganho de proteção se o POC atender ao threshold aprovado.

### Restrições atuais

- A engine será a alternativa aceita no ADR 001; esta spec não a antecipa.
- O pipeline de proteção é fixo e versionado na v1; não há extension point especulativo.
- A ferramenta trata a engine como pública: o atacante conhece algoritmo e implementação.
- O output é código JavaScript executável pelo adversário; proteção significa aumento de custo,
  não boundary de segurança.
- Apenas linhas Node.js em Active LTS ou Maintenance LTS na data do release podem executar a
  ferramenta.

### Considerações futuras

- Adapter Bytenode para Node.js/Electron.
- Engine Rust/Wasm, se o POC e profiling justificarem.
- Plugins de bundler e execução da API no browser.
- Proteção seletiva, watermarking, runtime integrity e VM customizada.
- Suporte direto a TypeScript, JSX/TSX e source trees com resolução de módulos.

### Rejeitado nesta spec

- Reimplementar transforms commodity para atingir paridade nominal com concorrentes.
- Medir proteção por linhas diferentes, tamanho do arquivo ou output visualmente complexo.
- Usar source map inline em artefato protegido.
- Tratar timeout/crash de desofuscador como sucesso de proteção.
- Implementar `.jsc` diretamente com `vm.Script.createCachedData()`.

## User stories

### US1 — Proteger bundle via CLI

**Given** um arquivo JavaScript bundled compatível e uma configuração válida

**When** o desenvolvedor executa `js-protect bundle.js --out-dir protected`

**Then** a ferramenta publica `protected/bundle.js` semanticamente equivalente e um relatório de
build, sem acessar a rede.

### US2 — Proteger diretório sem output parcial

**Given** um diretório com arquivos JavaScript compatíveis e um destino ainda inexistente

**When** todos os arquivos são protegidos com sucesso

**Then** a árvore é publicada no destino preservando paths relativos; se qualquer arquivo falhar,
o destino não é publicado.

### US3 — Integrar pela API Node.js

**Given** um pipeline de build Node.js com código, filename e configuração válidos

**When** o desenvolvedor chama `protect()`

**Then** recebe código, source map opcional e metadados de reprodução pelo mesmo contrato usado
pela CLI.

### US4 — Reproduzir build

**Given** o mesmo input, configuração, seed, versão da ferramenta, engine e runtime suportado

**When** a proteção é executada novamente

**Then** código, source map e metadados determinísticos são byte-idênticos.

### US5 — Compor source maps

**Given** um bundle acompanhado do source map válido gerado pelo compilador/bundler anterior

**When** a proteção é executada com source map habilitado

**Then** o mapa separado resultante compõe o output protegido até as fontes descritas no mapa de
entrada, sem incluir `sourcesContent` por padrão.

### US6 — Rejeitar semântica dinâmica perigosa

**Given** código cujo comportamento depende de direct `eval`, `with` ou
`Function.prototype.toString`

**When** o pipeline selecionado não comprova preservação para aquela construção

**Then** a ferramenta falha com `semantic_hazard`, linha/coluna e orientação acionável, sem
publicar output.

### US7 — Reportar sintaxe não suportada

**Given** input inválido ou fora da matriz de compatibilidade

**When** o parser rejeita o arquivo

**Then** CLI/API retornam `unsupported_syntax` com arquivo, linha e coluna, sem trecho do source e
sem output parcial.

## Assumptions

1. O input já foi transpilado, bundled e minificado conforme escolha do usuário; imports externos
   e resolução de módulos não são responsabilidade da v1.
2. Um arquivo pode ser `script`, `esm` ou `commonjs`; a combinação com target deve ser declarada.
3. O target do código gerado é `browser` ou `node`; isso não altera o runtime Node.js da ferramenta.
4. Source map até TypeScript/originais só é possível quando o usuário fornece o mapa de entrada.
5. Seed não é segredo e pode constar do relatório de build.
6. O pipeline selecionado no ADR terá identificador e versão próprios para reprodução.
7. Código fora da matriz suportada falha fechado; a v1 não oferece modo `unsafe`.
8. O POC pode invalidar a promessa de proteção; nesse caso Goal e escopo devem ser revistos antes
   do aceite desta spec.

## Risks

| Risco | Impacto | Mitigação atual |
|---|---|---|
| Pipeline altera semântica | Crítico | 100% no corpus suportado, multi-seed, hazards detectados e falha fechada |
| Ganho defensivo não supera baseline | Crítico | POC bloqueia ADR e spec; sem claim pública antes do threshold |
| Parser/codegen não cobre sintaxe real | Alto | Matriz explícita, fixtures por feature e `unsupported_syntax` |
| Build não determinístico impede reproduzir incidente | Alto | Seed efetiva, versões/hashes no metadata e teste byte-idêntico |
| Source map expõe código original | Alto | Separado, default off, `sourcesContent` false e documentação de custódia |
| Mapa protegido não compõe com mapa anterior | Alto | `filename` obrigatório, input map explícito e testes de composição |
| Diretório fica parcialmente protegido | Alto | Staging sibling e publicação somente após sucesso integral |
| Symlink/path escapa do escopo | Alto | Rejeitar symlinks, destino existente, output dentro do input e traversal |
| Input malicioso causa exaustão | Alto | Limite configurado após baseline, cancelamento e nenhuma execução do input |
| Output aumenta load/runtime além do aceitável | Alto | Budgets definidos a partir de medição antes do aceite da spec |
| Supply chain altera engine/binário publicado | Alto | Lockfile, hashes, provenance e verificação de artefato no release |
| Atacante adapta normalizador à engine OSS | Alto | Threat model white-box e benchmark adversarial versionado |

## API contract

### CLI

```text
js-protect <input> --out-dir <path> [options]

Arguments:
  input                         Arquivo .js ou diretório sem symlinks

Required:
  -o, --out-dir <path>          Destino novo, fora da árvore de input

Options:
  -c, --config <path>           Config JSON; flags explícitas têm precedência
  --target <target>             browser | node
  --module-format <format>      script | esm | commonjs
  --seed <value>                Seed textual para build reproduzível
  --source-map                  Emitir source map separado
  --input-source-map <path>     Mapa anterior para composição; arquivo único
  --include-sources-content     Opt-in para sourcesContent; nunca default
  --report <path>               Override do relatório JSON
  --help                        Ajuda
  --version                     Versão
```

Regras:

- `input`, config, source map e output são paths locais; URLs são inválidas.
- `--input-source-map` só é aceito para input de arquivo na v1.
- O destino deve ser inexistente e não pode estar dentro do input.
- Diretórios são percorridos por paths reais; symlinks são rejeitados, não seguidos.
- Arquivos que não terminam em `.js`, `.mjs` ou `.cjs` são ignorados e listados no relatório.
- A CLI nunca baixa schema, engine, configuração ou atualização durante a execução.
- O relatório é sempre escrito; por default usa `<out-dir>.js-protect-report.json`, fora do
  staging. `--report` apenas substitui esse path.

### API programática Node.js

```typescript
export type ProtectionTarget = 'browser' | 'node';
export type ModuleFormat = 'script' | 'esm' | 'commonjs';

export interface ProtectOptions {
  /** Logical input name, required for diagnostics and source maps. */
  filename: string;
  target: ProtectionTarget;
  moduleFormat: ModuleFormat;
  /** Omitted means a fresh random seed; effective value is always returned. */
  seed?: string;
  /** Exact identifiers that the selected pipeline must preserve. */
  reservedIdentifiers?: string[];
  sourceMap?: {
    emit: boolean;
    input?: string;
    includeSourcesContent?: boolean;
  };
}

export interface ProtectionMetadata {
  toolVersion: string;
  engineId: string;
  engineVersion: string;
  seedUsed: string;
  inputHash: string;
  outputHash: string;
  configHash: string;
  sourceMapHash?: string;
  target: ProtectionTarget;
  moduleFormat: ModuleFormat;
  warnings: ProtectionWarning[];
}

export interface ProtectionWarning {
  code: string;
  message: string;
  line?: number;
  column?: number;
}

export interface ProtectResult {
  code: string;
  sourceMap?: string;
  metadata: ProtectionMetadata;
}

export function protect(sourceCode: string, options: ProtectOptions): Promise<ProtectResult>;
```

Invariantes:

- `filename` é nome lógico, não autorização para leitura/escrita pela API.
- `sourceMap.input`, quando presente, deve ser JSON source map válido.
- `reservedIdentifiers` aceita nomes exatos; regex externa não faz parte da v1.
- `seedUsed` sempre existe, inclusive quando a seed foi gerada.
- `warnings` nunca contém source, secrets detectados ou stack interna.
- A API não lê arquivos, escreve output nem emite eventos globais.

## Data model

### Config file (`js-protect.config.json`)

```json
{
  "target": "browser",
  "moduleFormat": "esm",
  "seed": null,
  "reservedIdentifiers": [],
  "sourceMap": {
    "emit": false,
    "includeSourcesContent": false
  }
}
```

Semântica:

- `seed: null` equivale a seed omitida; a efetiva é gerada e reportada.
- O config não escolhe engine, transform ou algoritmo interno.
- Chaves desconhecidas são erro, não warning.
- O schema é distribuído dentro do pacote; `$schema` remoto não é necessário para execução offline.

### Build report

```typescript
export interface ProtectionBuildReport {
  schemaVersion: 1;
  status: 'succeeded' | 'failed';
  startedAt: string;
  completedAt: string;
  toolVersion: string;
  engineId: string;
  engineVersion: string;
  configHash: string;
  files: Array<{
    relativePath: string;
    status: 'protected' | 'ignored' | 'failed';
    metadata?: ProtectionMetadata;
    error?: {
      code: ProtectionErrorCode;
      line?: number;
      column?: number;
    };
  }>;
}
```

O relatório não contém source code, source maps, paths absolutos ou mensagens internas de parser.

## Error handling

```typescript
export type ProtectionErrorCode =
  | 'invalid_input'
  | 'invalid_config'
  | 'unsupported_syntax'
  | 'semantic_hazard'
  | 'source_map_invalid'
  | 'source_map_composition_failed'
  | 'protection_failed'
  | 'output_conflict'
  | 'resource_limit_exceeded'
  | 'internal_error';
```

| Código | Condição | CLI exit | Output publicado |
|---|---|---:|---:|
| `invalid_input` | Path ausente, extensão inválida, symlink ou combinação target/formato inválida | 2 | Não |
| `invalid_config` | JSON/schema inválido ou chave desconhecida | 2 | Não |
| `unsupported_syntax` | Parser não aceita feature ou arquivo inválido | 2 | Não |
| `semantic_hazard` | Construção dinâmica sem preservação comprovada | 2 | Não |
| `source_map_invalid` | Mapa de entrada inválido/incompatível | 2 | Não |
| `source_map_composition_failed` | Não foi possível compor o mapa | 1 | Não |
| `protection_failed` | Engine falha em transform/codegen | 1 | Não |
| `output_conflict` | Destino existe ou está dentro do input | 2 | Não |
| `resource_limit_exceeded` | Cancelamento, memória ou tamanho excede budget configurado | 1 | Não |
| `internal_error` | Bug não classificado | 1 | Não |

CLI escreve diagnóstico seguro em stderr no formato
`js-protect: <code>: <relative-file>:<line>:<column>: <message>`. Stack e detalhes internos só ficam
disponíveis em ambiente de desenvolvimento, nunca no relatório padrão.

Para diretório, qualquer falha mantém o destino ausente. O relatório de falha pode ser escrito no
path solicitado porque é diagnóstico, não artefato protegido.

## Observability

- API retorna `ProtectionMetadata`; não emite `process.emit`, logs ou telemetria.
- CLI gera opcionalmente `ProtectionBuildReport` e uma linha de status por arquivo em stderr.
- Duração e tamanhos podem constar no relatório como diagnósticos, mas não são métricas globais nem
  eventos do processo hospedeiro.
- Nenhum sinal contém source, source map, path absoluto, configuração completa ou identificadores
  reservados.
- A ferramenta não possui telemetria remota na v1.

## Quality attributes

| Atributo | Condição | Resposta verificável |
|---|---|---|
| Correção | Qualquer caso da matriz suportada, em todas as seeds do gate | 100% de equivalência; qualquer divergência bloqueia release |
| Determinismo | Mesmo input, config, seed, tool/engine version e runtime suportado | Código, mapa e metadata determinística byte-idênticos |
| Aleatoriedade | Seed omitida em execuções independentes | Seeds efetivas distintas e outputs distintos após normalização, sem claim automática de proteção |
| Offline | Execução CLI/API em ambiente sem rede | Todas as funções passam; nenhuma tentativa de conexão é observada |
| Source map | Input map válido e emissão habilitada | Mapeamento composto validado por posições sentinela até a fonte anterior |
| Falha atômica | Um arquivo falha durante processamento de diretório | Destino final permanece ausente; staging é removido |
| Auditabilidade | Build concluído | Versões, hashes e seed permitem identificar exatamente o pipeline usado |
| Proteção | POC adversarial aprovado | Resultado atende ao threshold registrado; sem POC conclusivo não há claim pública |
| Performance | Corpus e hardware de release definidos | Budget será preenchido a partir de baseline antes do aceite desta spec |
| Size/runtime overhead | Corpus representativo definido | Budgets serão preenchidos a partir do POC/calibração antes do aceite |

Números de latência, tamanho e runtime permanecem deliberadamente abertos: inventá-los antes da
medição repetiria o defeito da spec anterior.

## Compatibility matrix

A matriz final depende do parser/engine aceito, mas o contrato mínimo da v1 deve cobrir e testar:

- escopo léxico, closures e shadowing;
- functions, arrow functions, async/await e generators;
- classes, private fields suportados pelo parser e herança;
- exceptions, loops, switch e short-circuit;
- object/array literals, destructuring, spread/rest e optional chaining;
- `script`, ESM bundled e CommonJS bundled;
- source map de bundler anterior;
- direct `eval`, indirect `eval`, `with` e `Function.prototype.toString` como hazards explícitos;
- código estrito e não estrito quando o formato permitir.

Cada feature da matriz deve estar `supported`, `rejected` ou `not-applicable` por combinação de
target/formato. Não existe estado implícito.

## Threat model

### Ativos cuja recuperação se pretende dificultar

- regras de negócio e branches presentes no bundle;
- literais e estrutura necessários para compreender algoritmos;
- mapeamento direto entre artefato distribuído e fonte anterior.

### Ativos não protegidos

- secrets, tokens, endpoints públicos e dados presentes em runtime;
- integridade/autenticidade do artefato em execução;
- código revelado por source map entregue ao atacante;
- lógica observável por chamadas de rede, UI ou instrumentação runtime;
- disponibilidade contra código gerado com custo excessivo;
- análise manual ilimitada ou adversário capaz de modificar o runtime.

### Atores e vetores

| Ameaça | Postura da v1 |
|---|---|
| `webcrack`/normalizador automatizado | Medir por recovery tasks no POC; não confiar em formato conhecido |
| LLM sobre um único build | Claim somente se protocolo local registrado produzir evidência |
| Atacante conhece engine OSS | Assumido; segurança não depende de obscuridade do algoritmo |
| Geração de múltiplos builds pelo atacante | Assumido; seed não é segredo |
| Beautify e AST normalization | Métricas e POC operam depois de normalização |
| Debug/instrumentação runtime | Fora da barreira forte; não prometer anti-debug |
| Source map vazado | Default off, separado e sem `sourcesContent`; custódia é responsabilidade do usuário |
| Input malicioso no build | Não executar input; limitar parser/codegen e rejeitar paths/symlinks |
| Pacote/engine adulterado | Provenance, hashes e lockfile no release |

## Rollout / Rollback

- A v1 é publicada somente após POC conclusivo, ADR 001 `Accepted` e budgets preenchidos.
- SemVer governa API, CLI, config, errors e schema do report; bytes ofuscados não são API estável.
- Seed fixa garante reprodução somente com versão exata de tool, engine, config e runtime suportado.
- Mudança no pipeline incrementa `engineVersion`; não exige MAJOR se contratos públicos e semântica
  documentada permanecerem compatíveis.
- Rollback usa versão e lockfile anteriores mais o manifest/report do build original.
- Releases publicam checksums e provenance; a instalação pode ocorrer via rede, mas proteção e
  builds continuam offline.

## Acceptance criteria

1. **Gate arquitetural:** POC aprovado e ADR 001 em `Accepted`, com engine/pipeline escolhido por
   dados, antes de qualquer Atomic Step do core.
2. **Offline:** testes executam CLI/API com rede bloqueada e confirmam zero tentativa de conexão.
3. **CLI arquivo:** comando mínimo protege `.js`, `.mjs` ou `.cjs` suportado e publica código mais
   report semanticamente válido.
4. **CLI diretório:** processa árvore sem symlinks via staging e só publica destino novo após sucesso
   integral; qualquer falha deixa o destino ausente.
5. **API:** `protect()` implementa exatamente o contrato desta spec, sem I/O, evento global ou
   telemetria implícita.
6. **Config parity:** CLI flags, config e `ProtectOptions` usam os mesmos nomes, tipos, defaults e
   validações aplicáveis; chaves desconhecidas falham.
7. **Semântica:** 100% dos casos `supported` na compatibility matrix preservam oracles em todas as
   seeds do gate; uma divergência bloqueia release.
8. **Hazards:** direct `eval`, `with` e `Function.prototype.toString` são detectados e rejeitados
   quando o pipeline não possui prova específica de preservação.
9. **Sintaxe:** toda combinação target/formato/feature possui estado explícito e teste positivo ou
   negativo correspondente.
10. **Seed:** omissão gera e retorna `seedUsed`; seed fixa reproduz código, mapa e metadata
    determinística sob as condições declaradas.
11. **Source maps:** emissão funciona com ou sem seed fixa; composição com mapa anterior é validada
    por posições sentinela; output é separado e `sourcesContent` é opt-in.
12. **Errors:** todos os `ProtectionErrorCode` têm fixture e comportamento CLI/API consistente;
    nenhum erro publica output protegido parcial.
13. **Report:** relatório contém paths relativos, hashes, versões, seed e status por arquivo, sem
    source, mapa, path absoluto ou stack.
14. **Proteção:** qualquer claim pública referencia o protocolo/resultado do POC e atende ao
    threshold aprovado; diversidade estrutural isolada não satisfaz este AC.
15. **Budgets:** performance, output size, runtime overhead e limites de recurso têm baseline,
    ambiente, corpus e valores aprovados antes do aceite final desta spec.
16. **Supply chain:** release inclui lockfile, checksums e provenance verificáveis para pacote e
    engine distribuídos.
17. **Documentação:** README descreve ativos protegidos/não protegidos, compatibility matrix,
    hazards, source-map custody, reprodução e ausência de garantia de irreversibilidade.

## Evidence anchors

- [Benchmark corrigido](../benchmark-js-protection.md) — capacidades, evidência e lacunas do
  mercado, atualizado em 2026-08-09.
- [Spec do POC](js-protect-polymorphism-poc.md) — protocolo que valida eficácia e arquitetura.
- [ADR 001](../adr/001-engine-propria-vs-orquestracao.md) — decisão arquitetural ainda `Proposed`.
- [Node.js release lifecycle](https://nodejs.org/en/about/previous-releases) — linhas mantidas,
  acesso em 2026-08-09.
- [ECMAScript 2027: `eval`](https://tc39.es/ecma262/multipage/global-object.html#sec-eval-x),
  [`with`](https://tc39.es/ecma262/multipage/ecmascript-language-statements-and-declarations.html#sec-with-statement)
  e [`Function.prototype.toString`](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-function.prototype.tostring),
  acesso em 2026-08-09.
- [TC39 Source Map specification](https://tc39.es/source-map-spec/), acesso em 2026-08-09.

## Open questions

1. **Qual candidato vence o POC e qual `engineId` será aceito?** **Owner:** @andersonalves.
   **Deadline:** relatório do POC / aceite do ADR 001.
2. **Qual threshold adversarial sustenta a claim pública?** Deve ser congelado antes da matriz
   oficial. **Owner:** @andersonalves. **Deadline:** antes dos Atomic Steps do POC.
3. **Quais budgets de build time, tamanho e runtime overhead são aceitáveis?** Derivar do corpus e
   hardware de release. **Owner:** @andersonalves. **Deadline:** antes do aceite desta spec.
4. **Qual linha LTS mínima de Node será suportada no primeiro release?** Escolher entre linhas ainda
   mantidas na data, considerando dependências do engine. **Owner:** release. **Deadline:** antes dos
   Atomic Steps do core.
5. **Quais private fields/propostas ECMAScript entram na primeira compatibility matrix?** Responder
   a partir do parser aceito e corpus real. **Owner:** core. **Deadline:** antes do step de parser.
6. **Licença e nome do pacote:** confirmar licença compatível com engine/fork aceito e
   disponibilidade do nome. **Owner:** @andersonalves. **Deadline:** antes do release setup.

## Traceability

| Fonte atual | Acceptance criteria | Implementation plan |
|---|---|---|
| Gate arquitetural concluído fora do core | AC1 | POC plan 8–9; precondition dos steps do core |
| Operação 100% offline | AC2, AC5 | 1, 2 |
| CLI arquivo/diretório | AC3, AC4, AC12 | 4 |
| API Node.js sem efeitos implícitos | AC5, AC6 | 1, 2 |
| Semântica preservada e escopo explícito | AC7, AC8, AC9 | 2, 3, 5 |
| Polimorfismo reproduzível sem proxy falso | AC10, AC14 | 2, 5 |
| Source maps seguros e compostos | AC11, AC13 | 3, 4 |
| Erros estáveis e falha fechada | AC4, AC8, AC12 | 1, 3, 4 |
| Auditabilidade e reprodução | AC10, AC13 | 2, 4 |
| Eficácia e budgets baseados em dados | AC14, AC15 | 5 |
| Supply chain e documentação segura | AC16, AC17 | 6 |

## Implementation plan

1. **Congelar contratos públicos:** validar API, CLI, config, errors e report contra a engine aceita.
2. **Entregar fatia API de arquivo:** proteção offline de um arquivo, seed/metadata e equivalência.
3. **Adicionar compatibility/hazards/source maps:** matriz explícita, falha fechada e composição.
4. **Adicionar CLI e diretório transacional:** paths seguros, staging, report e paridade com API.
5. **Executar gates de correção/proteção/budgets:** corpus multi-seed, resultado adversarial e profiling.
6. **Preparar release e documentação:** supply chain verificável, limitações e contrato público.

---

> **Handoff bloqueado:** não criar Atomic Steps do core até o POC ser aprovado, o ADR 001 estar
> `Accepted` e as Open questions 2–4 terem respostas registradas.
