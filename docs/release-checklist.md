# Release checklist — js-condom core v1

Use this checklist before tagging a release. No adversarial recovery metrics belong in this
process — the product is an operational wrapper, not a demonstrated security boundary.

## Versions

- [ ] `toolVersion` in `package.json` updated if applicable
- [ ] `jsCondom.qualifiedEngineVersion` matches installed `javascript-obfuscator` (current: **4.1.0**)
- [ ] `jsCondom.presetVersion` matches `PRESET_VERSION` in `src/core/config.js` (current: **1.0.0**)
- [ ] Node.js **24 LTS** declared in `engines` and verified in CI

## Reference hashes (canonical fixture)

Computed with:

- Source: `export function add(a, b) { return a + b; }`
- Seed: `js-condom-semantic-fixture-seed` (`FIXED_SEED` in `test/core/fixtures/semantic-fixtures.js`)
- Engine: `javascript-obfuscator@4.1.0`, preset `1.0.0`

Recompute after any engine or preset change:

```bash
node --input-type=module -e "
import { protect } from './src/core/protect.js';
import { FIXED_SEED } from './test/core/fixtures/semantic-fixtures.js';
const r = await protect('export function add(a, b) { return a + b; }', { seed: FIXED_SEED });
console.log(r.metadata);
"
```

- [ ] `inputSha256` recorded: `c4b7a01cbde242bf0e133e7afefc62e73fffdac917b0efd9cb40f26ed25d26f0`
- [ ] `outputSha256` recorded: `7a4c8c9099d496dea05049fe5560826ad32dad6e97e1da932b35b81941b7eb43`
- [ ] `configSha256` recorded: `53d3d3b787664c74a0ca7419446ab11645cb1227a375b17e21a1d276093c63b4`

## Dependencies

- [ ] `npm ci` succeeds on Node 24
- [ ] `npm audit --audit-level=high` reports **0** vulnerabilities
- [ ] Core import graph (`src/core`, `src/cli`) uses only: `acorn`, `estraverse`,
  `javascript-obfuscator`, and Node builtins
- [ ] Experimental packages (`ses`, `webcrack`, `ollama`) are not imported by the core release path
- [ ] Lockfile integrity reviewed (`package-lock.json` committed)

## CI gate

- [ ] `.github/workflows/ci.yml` green: lint, tests, offline boundary, audit
- [ ] `npm run lint` passes
- [ ] `npm test` passes (including semantic fixture matrix)
- [ ] `node --test test/core/offline-boundary.test.js` passes

## Documentation

- [ ] `README.md` documents installation, API, CLI, preset, seed, limitations, requalification
- [ ] No README or release notes claim adversarial resistance, irreversibility, or anti-LLM efficacy
- [ ] Limitations and hazard policy match `specs/js-condom-core.md`

## Security approval

- [ ] Confirmed: input and output do not leave the process during protection (no network, no
  telemetry)
- [ ] CLI writes only to explicit `--output` and `--report` paths; atomic publish on success
- [ ] Public errors do not include full source code, secrets, or stack traces
- [ ] File permissions and path collisions reviewed for CLI (`OUTPUT_CONFLICT` on existing outputs)
- [ ] Maintainer sign-off: _____________________ Date: ___________

## Release (manual)

- [ ] Tag created locally (no automated publish in this step)
- [ ] Changelog or release notes reviewed for operational wording only
