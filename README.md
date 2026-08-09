# js-condom

Build-time offline wrapper around `javascript-obfuscator` with a versioned preset, semantic
validation, and reproducible metadata.

This tool is an **operational wrapper**. It standardizes obfuscation defaults, validates supported
JavaScript subsets, and produces auditable artifacts. It is **not** a security boundary and does
**not** promise irreversibility, anti-LLM resistance, or measurable recovery cost.

## Contexto e direção do projeto

Estamos construindo uma camada de proteção para o momento de build, executada localmente e sem
rede, sobre uma engine open source já qualificada. O MVP concentra-se em um único arquivo
JavaScript empacotado e entrega uma API, uma CLI e um preset versionado com comportamento comum.

### Por que estamos fazendo isso

O objetivo é tornar a proteção previsível e auditável para quem gera artefatos JavaScript:

- reduzir decisões divergentes entre projetos por meio de defaults controlados;
- preservar a semântica do subconjunto de JavaScript que declaramos suportar;
- permitir builds reproduzíveis quando uma seed é fixada;
- registrar versões, configuração, seed e hashes para diagnóstico e auditoria;
- falhar de forma explícita diante de entradas incompatíveis, sem publicar artefatos parciais.

Uma investigação anterior mostrou que não há evidência suficiente para prometer resistência contra
desofuscação automatizada ou LLMs. Por isso, o resultado esperado desta fase é confiabilidade
operacional — não irreversibilidade. Qualquer alegação futura sobre custo de recuperação deverá ser
medida em um experimento adversarial separado, com protocolo e evidência próprios.

### Resultado esperado do MVP

Ao final desta fase, o projeto deverá oferecer:

1. uma função `protect(sourceCode, options)` com contrato estável;
2. o comando `js-condom protect input.js --output protected.js` para arquivos `.js`, `.mjs` e `.cjs`;
3. output semanticamente equivalente nas fixtures oficialmente suportadas;
4. bytes e hashes reproduzíveis com seed fixa;
5. metadata suficiente para repetir e investigar um build;
6. erros estruturados, política fail-closed e execução sem rede ou telemetria;
7. CI e documentação que permitam requalificar a engine antes de qualquer upgrade.

Diretórios, source maps, plugins de bundler, TypeScript/JSX e novas engines permanecem fora do MVP
e exigem decisões e especificações próprias.

## Requirements

- Node.js **24 LTS** (verified in CI)

## Installation

```bash
npm ci
```

The CLI is exposed as `js-condom` via the package `bin` field.

## API

```js
import { protect } from './src/core/protect.js';

const { code, metadata } = await protect(sourceCode, { seed: 'optional-seed' });
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `seed` | `string` (optional) | When omitted, a random seed is generated and returned in metadata. When set, output bytes and hashes are reproducible for the same input, preset, and engine version. |

### Result

```js
{
  code: string,
  metadata: {
    toolVersion: string,
    engineVersion: string,   // qualified javascript-obfuscator version
    presetVersion: string,   // e.g. "1.0.0"
    seedUsed: string,
    inputSha256: string,
    outputSha256: string,
    configSha256: string,
  }
}
```

Unknown options are rejected with `INVALID_CONFIG`. The public API does not expose raw engine flags.

## CLI

Protect a single JavaScript file:

```bash
js-condom protect input.js --output protected.js
```

Supported extensions: `.js`, `.mjs`, `.cjs`.

Optional flags:

```bash
js-condom protect input.mjs --output out.mjs --report report.json --seed my-seed
```

- `--output` is required.
- `--report` writes JSON metadata atomically when provided.
- Errors are written to stderr as structured JSON; exit code is non-zero on failure.
- Output paths must not collide with the input or existing files (fail closed).

## Preset v1

The preset is versioned as a single unit (`presetVersion: 1.0.0`). It encapsulates approved
`javascript-obfuscator` options (compact output, string array, no self-defending, no dead-code
injection, etc.). Consumers cannot pass arbitrary engine flags.

Qualified engine: `javascript-obfuscator@4.1.0` (see `package.json` → `jsCondom`).

## Seed behavior

- **Fixed seed:** same input + preset + engine version → identical output bytes and hashes.
- **Omitted seed:** `seedUsed` in metadata contains the effective seed (not a secret).
- Seeds are for reproducibility and audit trails, not confidentiality.

## Engine requalification policy

Any change to the qualified engine version or preset requires:

1. Re-run the full semantic fixture matrix (`npm test`).
2. Update `jsCondom.qualifiedEngineVersion` and/or `presetVersion` in `package.json`.
3. Record new reference hashes in the [release checklist](docs/release-checklist.md).
4. Security review of dependency changes (`npm audit --audit-level=high`).

Do not ship engine or preset upgrades without completing the checklist.

## Limitations

- **Single file only** — no directories, source maps, or bundler plugins in v1.
- **JavaScript only** — no TypeScript, JSX, or TSX.
- **Supported subset** — exercised by the release fixture matrix (ESM/CJS, async/await, classes,
  closures, generators, optional chaining, private fields, exceptions).
- **Rejected hazards (when detectable):** `eval`, `with`, `Function` constructor, and
  `function.prototype.toString` dependencies on function references.
- **Best-effort detection** — dynamic patterns not visible to static analysis are documented
  limitations, not guarantees.
- **No browser runtime** — protection runs in Node.js at build time.
- **No network or telemetry** during protection.

## Privacy

Input and output remain in the local process. The tool does not send source code, metadata, or
artifacts to external services during protection.

## Development

```bash
npm run lint    # syntax check (node --check) on core/cli sources
npm test        # full test suite including offline boundary tests
npm audit --audit-level=high
```

See [docs/release-checklist.md](docs/release-checklist.md) before tagging a release.
