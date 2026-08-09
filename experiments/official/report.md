# Official Matrix Report — js-condom polymorphism POC

Experiment ID: official-2026-08-09
Repository commit: b7be0574f4f4140c91536eca0bb1d0b5ffb27686
Generated at: 2026-08-09T17:57:49.618Z

## Conclusion (AC17)

- **Decision:** evidencia-insuficiente
- 39 candidate cell(s) failed semantic validation

## Environment

| Field | Value |
| --- | --- |
| os | Darwin 25.5.0 |
| architecture | arm64 |
| cpu | unknown |
| memoryBytes | 17179869184 |
| nodeVersion | v26.7.0 |

## Matrix completeness

- Expected cells: 160
- Actual cells: 160
- Supported cases executed: 16

## Semantic coverage

- Valid candidate cells: 105/144

## Calibration

- task-recover-exports × eval-webcrack: valid
- task-recover-control-flow × eval-webcrack: valid
- task-recover-control-flow × eval-ast-compare: invalid (evaluator_not_implemented: eval-ast-compare; control calibration failed)
- task-explain-behavior × eval-human-rubric: invalid (evaluator_not_implemented: eval-human-rubric; control calibration failed)

## Primary endpoint — completion rate within budget

- Baseline completion rate: 35.29%
- oss-extension completion rate: 82.35%
- oss-extension reduction vs baseline: -47.06 pp
- oss-extension paired reduction interval: [-56.86, -37.25] pp (mean -47.06)
- oss-extension traceable trial pairs: 102
- own-minimal completion rate: 88.24%
- own-minimal reduction vs baseline: -52.94 pp
- own-minimal paired reduction interval: [-62.75, -43.14] pp (mean -52.94)
- own-minimal traceable trial pairs: 102

## Secondary costs (completed trials)

- Wall-clock p50: 62 ms
- Wall-clock p95: 73 ms
- Traceable completed trials: 210

## Diversity, build time and runtime

- Case-level metric rows: 144
- Build duration p95: 6 ms

## Category aggregates

- closures: completion rate 100% (54 trials)
- classes: completion rate 66.67% (36 trials)
- async-promises: completion rate 83.33% (36 trials)
- generators: completion rate 100% (18 trials)
- exceptions: completion rate 66.67% (36 trials)
- modules-bundle: completion rate 11.11% (54 trials)
- strings-literals: completion rate 66.67% (36 trials)
- control-flow: completion rate 83.33% (36 trials)
- eval: completion rate n/a% (0 trials)
- with: completion rate n/a% (0 trials)
- function-tostring: completion rate n/a% (0 trials)

## Blinding audit (AC12)

- Pre-evaluation mapping hash: sha256-730d5444035714e2d76101eca705587e3e068e4b69301fa77ddd47ab23e1d567
- Pre-evaluation evaluator view hash: sha256-9029d07e2bdb82f2e7e341a7e2e4e8019c696696d1533c6ca0884136e50fe24e
- Manifest mapping hash: sha256-3658b3e07eb9557f3d7019d2c78c34ed11270f099dc3614d1f5124f5ccb96c8a
- **Limitation:** manifest blinding hashes differ from official matrix pre-evaluation hashes
- Mapping revealed after lock: yes

## Anti-LLM dimension (AC14)

- Status: inconclusive
- Summary: LLM evaluator approved in OQ4 but not integrated into recovery harness for official matrix

## Baseline OSS justification (AC20)

- javascript-obfuscator 4.1.0 is the frozen OSS baseline: AST transforms, canonical seed projection and reproducible config are already recorded in the official manifest.
- js-confuser was intentionally excluded from the minimum matrix; OQ8 remains pending human acceptance in step 12.
- No retrospective baseline swap was performed; any js-confuser comparison requires a separately approved round.

## Limitations

- eval-ast-compare and eval-human-rubric are not implemented in the recovery harness; their trials are inconclusive.
- Anti-LLM dimension requires a local Ollama daemon and is not integrated into the recovery harness for this matrix.
- Six hazard cases (eval, with, function-tostring) are excluded from protection by reject-before-protection policy.
- Manifest blinding hashes were copied from the pilot partition and do not match the official matrix pre-evaluation hashes.
- 2 task/evaluator pair(s) failed control calibration and were excluded from resistance denominators.
