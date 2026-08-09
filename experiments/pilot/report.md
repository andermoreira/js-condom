# Pilot Report — js-condom polymorphism POC

Experiment ID: pilot-2026-08-09
Repository commit: b7be0574f4f4140c91536eca0bb1d0b5ffb27686
Generated at: 2026-08-09T17:48:11.501Z

## Environment

| Field | Value |
| --- | --- |
| os | Darwin 25.5.0 |
| architecture | arm64 |
| cpu | unknown |
| memoryBytes | 17179869184 |
| nodeVersion | v26.7.0 |

## Calibration

- task-recover-exports × eval-webcrack: valid
- task-recover-control-flow × eval-webcrack: valid
- task-recover-control-flow × eval-ast-compare: invalid (evaluator_not_implemented: eval-ast-compare; control calibration failed)
- task-explain-behavior × eval-human-rubric: invalid (evaluator_not_implemented: eval-human-rubric; control calibration failed)

## Evaluator determinism

- task-recover-exports × eval-webcrack: verified-deterministic (3 probes)
- task-recover-control-flow × eval-webcrack: verified-deterministic (3 probes)
- task-recover-control-flow × eval-ast-compare: verified-deterministic (3 probes, not implemented)
- task-explain-behavior × eval-human-rubric: variable (3 probes, not implemented)

## Evidence — OQ1 (threshold)

- Baseline completion rate: 44.44%
- oss-extension completion rate: 88.89%
- own-minimal completion rate: 100%
- Observed reduction (own-minimal): -55.56 pp
- Recommended threshold: -55.56 pp
- **Frozen threshold (owner):** 5 pp

## Evidence — OQ5 (budgets)

- Observed build p95: 9 ms
- Observed runtime p95: 74 ms
- Observed recovery wall-clock p95: 192 ms
- **Frozen process timeout (owner):** 60000 ms
- **Frozen memory budget (owner):** 536870912 bytes

## Evidence — OQ6 (seeds, repetitions, intervals)

- Pilot seeds: pilot-seed-1, pilot-seed-2
- Interval method: bootstrap-percentile
- Variable evaluator policy: preserve-all-trials-no-cherry-picking
- **Frozen seeds (owner):** pilot-seed-1, pilot-seed-2, official-seed-3
- **Frozen repetitions (owner):** {"eval-webcrack":2,"eval-ast-compare":2,"eval-human-rubric":3}

## OQ4 (LLM evaluator)

- Status: approved
- Summary: Ollama local runtime approved for blind anti-LLM evaluation

## Limitations

- eval-ast-compare and eval-human-rubric are not implemented in the recovery harness; their trials are inconclusive.
- Anti-LLM dimension requires a local Ollama daemon and remains environment-dependent.

## Semantic coverage

- Valid candidate cells: 44/48

## Frozen official manifest

- Experiment ID: official-2026-08-09
- Threshold: 5 pp
- Official cases: 22
- Seeds per case: 3
