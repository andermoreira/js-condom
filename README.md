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

## Uso recomendado

O fluxo típico é:

1. gerar e empacotar o JavaScript da aplicação;
2. executar o `js-condom` no artefato final;
3. armazenar o código protegido e o relatório junto do registro do build;
4. guardar a `seedUsed`, o `presetVersion` e os hashes para reprodução ou diagnóstico.

### CLI

Depois de instalar as dependências, proteja um único arquivo:

```bash
npm ci
node src/cli/protect.js protect dist/app.js \
  --output dist/app.protected.js \
  --report dist/app.protected.json \
  --seed release-2026-08-09
```

Para builds reproduzíveis, mantenha a mesma seed, versão do pacote, versão da engine e preset.
Para builds independentes, omita `--seed`; a seed efetiva será registrada no relatório.

### API

Use a API quando o pipeline de build já for controlado por Node.js:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { protect } from './src/core/protect.js';

const source = await readFile('dist/app.js', 'utf8');
const result = await protect(source, { seed: 'release-2026-08-09' });

await writeFile('dist/app.protected.js', result.code, 'utf8');
await writeFile('dist/app.protected.json', `${JSON.stringify(result.metadata, null, 2)}\n`);
```

O `js-condom` rejeita opções desconhecidas e entradas fora do subconjunto suportado. Em caso de
erro, a CLI retorna código diferente de zero e escreve um objeto JSON no stderr. Nenhum artefato
deve ser tratado como publicado quando a operação falhar.

## O que o wrapper acrescenta

Quando usado com a mesma versão, preset e seed, o `js-condom` utiliza a mesma engine de
transformação do `javascript-obfuscator`. O ganho está no processo ao redor dela:

- preset controlado, em vez de flags divergentes por projeto;
- seed, versões, configuração e hashes registrados;
- validação de hazards e do output antes da publicação;
- API e CLI com o mesmo contrato;
- escrita atômica, prevenção de conflitos e erros estruturados;
- gates de CI, auditoria e execução sem rede.

Isso melhora previsibilidade, reprodução e diagnóstico. Não constitui uma camada adicional de
criptografia nem uma prova de resistência contra desofuscação, análise manual ou LLMs.

## Exemplo de output e desofuscação

Considere este código de entrada:

```js
export function greet(name) {
  return 'Hello, ' + name + '!';
}
```

Com o preset v1 e uma seed fixa, o output contém nomes hexadecimais, uma tabela de strings e um
decodificador gerado pela engine. Um trecho representativo do output atual é:

```js
function _0x5e01(_0x2a5f9d, _0x308dc7) {
  var _0x385af2 = _0x385a();
  return _0x5e01 = function (_0x5e0181, _0xf0dbdc) {
    _0x5e0181 = _0x5e0181 - 0x1de;
    return _0x385af2[_0x5e0181];
  }, _0x5e01(_0x2a5f9d, _0x308dc7);
}

// tabela e bootstrap omitidos neste exemplo

export function greet(_0x49708f) {
  var _0x2969d5 = _0x5e01;
  return _0x2969d5(0x1e6) + _0x49708f + '!';
}
```

Esse formato aumenta o trabalho de leitura, mas não esconde a lógica de forma permanente. Uma
desofuscação típica pode:

1. analisar o AST e localizar a tabela de strings;
2. executar ou avaliar estaticamente o decodificador;
3. substituir chamadas como `_0x2969d5(0x1e6)` pelo texto correspondente;
4. renomear identificadores e reformatar o código;
5. comparar o resultado com o comportamento do artefato original.

Depois dessas etapas, a lógica essencial pode voltar a uma forma próxima de:

```js
export function greet(name) {
  return 'Hello, ' + name + '!';
}
```

Portanto, o resultado esperado do `js-condom` é dificultar a leitura casual e padronizar o build,
não impedir engenharia reversa. A facilidade de recuperação depende do programa, do preset, da
engine e das ferramentas usadas pelo analista. Este repositório não publica uma taxa de sucesso,
tempo de recuperação ou vantagem contra LLMs; qualquer número desse tipo precisa de um benchmark
adversarial separado e reproduzível.

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
