# Official Matrix Report — js-condom polymorphism POC

Experiment ID: official-2026-08-09
Repository commit: b7be0574f4f4140c91536eca0bb1d0b5ffb27686
Generated at: 2026-08-09T18:47:03.257Z

## Conclusion (AC17)

- **Decision:** evidencia-favorece-alternativa-mais-simples
- own-minimal interval lower bound 0 pp does not meet frozen threshold 5 pp
- evidence does not justify a proprietary engine over the frozen OSS baseline path

## Environment

| Field | Value |
| --- | --- |
| os | Darwin 25.5.0 |
| architecture | arm64 |
| cpu | Apple M1 |
| memoryBytes | 17179869184 |
| nodeVersion | v26.7.0 |

## Matrix completeness

- Expected cells: 160
- Actual cells: 160
- Supported cases executed: 16

## Semantic coverage

- Valid candidate cells: 144/144

## Calibration

- task-recover-exports × eval-webcrack: valid
- task-recover-control-flow × eval-webcrack: valid
- task-recover-control-flow × eval-ast-compare: valid
- task-explain-behavior × eval-human-rubric: valid

## Primary endpoint — completion rate within budget

- Baseline completion rate: 100%
- oss-extension completion rate: 100%
- oss-extension reduction vs baseline: 0 pp
- oss-extension paired reduction interval: [0, 0] pp (mean 0)
- oss-extension traceable trial pairs: 102
- own-minimal completion rate: 100%
- own-minimal reduction vs baseline: 0 pp
- own-minimal paired reduction interval: [0, 0] pp (mean 0)
- own-minimal traceable trial pairs: 102

## Secondary costs (completed trials)

- Wall-clock p50: 57 ms
- Wall-clock p95: 68 ms
- Traceable completed trials: 306

## Diversity, build time and runtime

- Case-level metric rows: 144
- Build duration p95: 6 ms

## Category aggregates

- closures: completion rate 100% (54 trials)
- classes: completion rate 100% (36 trials)
- async-promises: completion rate 100% (36 trials)
- generators: completion rate 100% (18 trials)
- exceptions: completion rate 100% (36 trials)
- modules-bundle: completion rate 100% (54 trials)
- strings-literals: completion rate 100% (36 trials)
- control-flow: completion rate 100% (36 trials)
- eval: completion rate n/a% (0 trials)
- with: completion rate n/a% (0 trials)
- function-tostring: completion rate n/a% (0 trials)

## Blinding audit (AC12)

- Pre-evaluation mapping hash: sha256-730d5444035714e2d76101eca705587e3e068e4b69301fa77ddd47ab23e1d567
- Pre-evaluation evaluator view hash: sha256-a4f4949ed0e3164a541181bb8f5678576fab8281200ec9a596bbdf1d6f560bc7
- Manifest mapping hash: sha256-730d5444035714e2d76101eca705587e3e068e4b69301fa77ddd47ab23e1d567
- Mapping revealed after lock: yes

## Anti-LLM dimension (AC14)

- Status: measured
- Summary: LLM anti-recovery trials: 0/480 completed within budget

## Baseline OSS justification (AC20)

- javascript-obfuscator 4.1.0 is the frozen OSS baseline: AST transforms, canonical seed projection and reproducible config are already recorded in the official manifest.
- js-confuser was excluded from the minimum matrix; OQ8 resolved — javascript-obfuscator is sufficient as OSS baseline for this round.
- No retrospective baseline swap was performed; any js-confuser comparison requires a separately approved round.

## Limitations

- Six hazard cases (eval, with, function-tostring) are excluded from protection by reject-before-protection policy.
