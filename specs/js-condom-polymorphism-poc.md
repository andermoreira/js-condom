# Spec: POC comparativo de polimorfismo do `js-condom`

> **Status:** Approved — aprovada pelo usuário em 2026-08-09 para criação dos Atomic Steps
>
> **ADR relacionado:** [ADR 001 — Engine própria vs. orquestração](../adr/001-engine-propria-vs-orquestracao.md)

## Goal

Produzir evidência reproduzível para selecionar a alternativa de menor complexidade que preserve a
semântica do JavaScript suportado e demonstre redução material da taxa de recuperação dentro de um
budget fixo em relação ao baseline open source, usando custo até o sucesso como diagnóstico
secundário e o código não protegido como controle de validade.

## Non-goals

- Não entregar a engine, CLI ou API de produção do `js-condom`.
- Não reimplementar as oito transforms AST tradicionais como requisito do POC.
- Não implementar VM bytecode customizada, anti-LLM proprietário, domain lock, anti-debug ou
  self-defending.
- Não decidir Rust/Wasm por preferência, desempenho presumido ou utilidade futura.
- Não medir proteção por percentual de linhas diferentes, tamanho do arquivo ou aparência visual.
- Não combinar tempo, tentativas, prompts e tokens em um score composto único.
- Não executar nem enviar código proprietário a serviços externos.
- Não especificar o adapter Bytenode de Node.js/Electron; essa preocupação é independente e exige
  spec própria se permanecer na v1.

## Classificação de escopo

### Requisitos atuais

- Comparar um baseline OSS, uma extensão/fork mínimo e uma transform própria mínima sob o mesmo
  protocolo.
- Executar o código não protegido como controle positivo para validar cada par de tarefa de
  recuperação e avaliador antes de medir resistência.
- Preservar 100% da semântica no subconjunto de casos declarado como suportado.
- Medir separadamente diversidade estrutural, conclusão da recuperação dentro do budget e custo
  até a recuperação.
- Comprovar que `oss-extension` e `own-minimal` implementam a mesma fatia de transformação, a
  partir do mesmo estágio de input e sem transforms auxiliares não declaradas.
- Cegar rótulos e ordem dos artefatos para avaliações humanas e por LLM.
- Congelar corpus, seeds, repetições, budgets, endpoints, agregação, intervalos e regra de
  materialidade antes da matriz oficial.
- Produzir resultados reproduzíveis, auditáveis e utilizáveis para atualizar o ADR 001.
- Manter código, corpus e execução do POC offline.

### Restrições atuais

- O ADR 001 permanece `Proposed` até o resultado do POC.
- `javascript-obfuscator` free é o baseline porque já oferece transforms AST, aleatoriedade e seed.
- O atacante deve ser modelado como white-box: conhece o código dos candidatos e pode adaptar
  normalizadores.
- Qualquer candidato com divergência semântica no subconjunto suportado é inelegível para a v1.
- `unprotected-control` é braço de calibração obrigatório, não candidato arquitetural.
- Um par `recovery task × evaluator` que não satisfaz seu oracle no controle não protegido é
  inválido para aquela dimensão e nunca conta como resistência.
- Resultados de recuperação são preservados por tentativa; timeout e falha dentro do budget são
  observações distintas de erro da ferramenta e resultado inconclusivo.
- A matriz oficial só começa depois que o piloto congela o manifest resolvido e a política de
  análise.
- O endpoint primário é a redução absoluta, em pontos percentuais, da taxa de conclusão dentro do
  budget em relação a `oss-baseline`; custo até o sucesso é endpoint secundário.
- O valor numérico do threshold é calibrado no piloto e congelado antes da matriz oficial; o piloto
  não pode trocar endpoints nem a direção do efeito.

### Considerações futuras

- Engine Rust/Wasm de produção.
- VM bytecode customizada e anti-LLM.
- Plugins de bundler, watch mode, execução no browser e presets comerciais.
- Benchmark contínuo contra novos desofuscadores após a v1.

### Rejeitado neste POC

- Usar diferença textual ou de linhas como proxy de proteção.
- Tratar crash/timeout de uma ferramenta adversarial isolada como prova automática de resistência.
- Contar falha de uma recovery task que também falha sobre `unprotected-control` como proteção.
- Escolher retrospectivamente endpoint, threshold, casos, seeds, repetições ou forma de agregação.
- Criar abstração genérica de providers além dos três candidatos reais do experimento.

## User stories

### US1 — Comparar candidatos sob protocolo idêntico

**Given** um corpus versionado, tarefas de recuperação predefinidas, o controle não protegido e os
três candidatos do POC

**When** o pesquisador executa a matriz experimental com o manifest aprovado

**Then** recebe resultados comparáveis de correção, diversidade, recuperação, tamanho, build time e
runtime overhead, sem configuração, transform auxiliar ou ordem de avaliação privilegiar um
candidato.

### US2 — Reproduzir um resultado

**Given** o commit, versões de ferramentas, hashes do corpus, seeds, comandos e ambiente registrados

**When** outra execução usa o mesmo manifest em ambiente compatível

**Then** os artefatos determinísticos e as métricas determinísticas são reproduzidos, e dimensões
não determinísticas são identificadas como tais.

### US3 — Invalidar candidato que quebra semântica

**Given** um candidato que altera saída, exceção ou efeito observável de um caso suportado

**When** o runner diferencial compara original e protegido

**Then** o caso falha com diagnóstico, o artefato não entra nas métricas de proteção como sucesso e
o candidato é marcado como inelegível enquanto a divergência persistir.

### US4 — Não confundir falha da ferramenta adversarial com proteção

**Given** um crash, timeout ou sintaxe não suportada pelo `webcrack` ou pelo avaliador local

**When** o experimento consolida o resultado

**Then** registra o evento como erro ou resultado inconclusivo, preserva o artefato para inspeção e
não o classifica automaticamente como reversão impedida.

### US5 — Invalidar tarefa de recuperação quebrada

**Given** uma recovery task e um avaliador registrados no protocolo

**When** o avaliador não satisfaz o oracle sobre `unprotected-control` segundo a regra de
calibração congelada

**Then** o par task/evaluator é marcado como inválido, permanece visível no relatório e seus
resultados sobre artefatos protegidos não entram no denominador de resistência.

### US6 — Medir esforço sem perder o resultado binário

**Given** uma recovery task válida e um budget congelado

**When** o avaliador tenta recuperar o objetivo em um artefato

**Then** cada tentativa registra outcome, duração, número de tentativas e invocações e, quando
aplicável, tempo ativo humano ou prompts e tokens de LLM, sem converter dimensões heterogêneas em
um score implícito.

### US7 — Avaliar artefatos com rótulo cego

**Given** artefatos do controle e dos candidatos prontos para avaliação humana ou por LLM

**When** o harness prepara a fila de recuperação

**Then** substitui candidato, seed e engine por IDs opacos, randomiza a ordem e só revela o
mapeamento depois que os resultados e oracles estiverem fixados.

## Assumptions

1. O corpus usa apenas código open source ou fixtures sintéticas; nenhum código proprietário será
   submetido a avaliadores externos.
2. O POC executa como ferramenta de pesquisa local em Node.js; browser é target do output, não
   runtime do runner.
3. Cada caso possui um oracle semântico observável; cada recovery task possui objetivo, evaluator,
   budget e oracle de conclusão definidos antes da matriz oficial.
4. A comparação implementa uma fatia de proteção versionada e verificável nos candidatos
   customizados; quantidade de transforms não é critério de vitória, e qualquer diferença no
   estágio de input ou transform auxiliar é declarada e invalida a comparação causal até correção.
5. `webcrack` representa uma ameaça automatizada relevante, mas não cobre sozinho todo o espaço de
   engenharia reversa.
6. Avaliação por LLM só é válida com modelo, versão, prompt, parâmetros, contexto e repetições
   registrados; sem isso, a dimensão permanece `[UNVERIFIED]` e não decide arquitetura.
7. O POC pode concluir que nenhuma alternativa sustenta a promessa atual do produto.
8. Cegamento por rótulo reduz viés, mas não impede que um avaliador reconheça padrões próprios de
   uma ferramenta; essa limitação deve permanecer explícita no relatório.
9. Seeds da transformação e repetições do adversário são dimensões diferentes e nunca usam o
   mesmo identificador como se fossem observações equivalentes.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| Overfitting ao `webcrack` | Alto | Usar tarefas de recuperação independentes da ferramenta e inspeção do AST normalizado |
| Comparação injusta entre fork maduro e candidato próprio mínimo | Alto | Limitar os dois candidatos customizados à mesma fatia funcional e publicar configuração/código de cada candidato |
| Candidato recebe transforms auxiliares não equivalentes | Crítico | Versionar a fatia comum, o estágio de input, parâmetros lógicos e transforms permitidas; validar com fixtures de conformidade |
| Oracle semântico incompleto | Crítico | Predefinir efeitos observáveis por caso; falha ou ambiguidade invalida o caso, não vira sucesso |
| Recovery task quebrada parece proteção forte | Crítico | Exigir sucesso do par task/evaluator sobre `unprotected-control` antes de incluí-lo na análise |
| Custo de recuperação é reduzido a resultado binário | Crítico | Registrar outcome e esforço por tentativa; reportar separadamente conclusão no budget e custo até sucesso |
| LLM ou adversário não determinístico | Alto | Fixar versão/configuração, testar repetibilidade no piloto e congelar repetições por artefato |
| Corpus pequeno ou enviesado | Alto | Congelar total e mínimo por categoria, separar piloto da matriz oficial e publicar lacunas |
| Poucas seeds ou repetições tornam diferença indistinguível de ruído | Alto | Congelar N, análise pareada, agregação, intervalo e regra de materialidade antes da matriz oficial |
| Avaliador sabe qual candidato está julgando | Alto | IDs opacos, ordem randomizada e mapeamento oculto até os resultados serem fixados |
| Timeout interpretado como resistência | Alto | Classificar separadamente timeout, crash, output inválido e recuperação incompleta |
| Execução de corpus malicioso comprometer a máquina | Crítico | Sandbox sem rede, timeout, limite de memória e filesystem descartável para todo código executado |
| Métrica estrutural ser vencida por ruído | Alto | Normalizar whitespace, nomes e literais antes de comparar; manter estrutura como diagnóstico secundário |
| Fork criar custo de manutenção oculto | Médio | Registrar patch surface e conflitos com upstream como resultado do POC |

## Data model

### `ExperimentManifest`

Fonte única da configuração de uma execução:

```typescript
type CandidateId = 'oss-baseline' | 'oss-extension' | 'own-minimal';
type EvaluationSubjectId = 'unprotected-control' | CandidateId;

interface ExperimentManifest {
  schemaVersion: 1;
  experimentId: string;
  phase: 'pilot' | 'official';
  repositoryCommit: string;
  environment: {
    os: string;
    architecture: string;
    cpu: string;
    memoryBytes: number;
    nodeVersion: string;
  };
  environmentCompatibility: {
    exactMatchFields: Array<'os' | 'architecture' | 'cpu' | 'memoryBytes' | 'nodeVersion'>;
    informativeFields: Array<'os' | 'architecture' | 'cpu' | 'memoryBytes' | 'nodeVersion'>;
  };
  tools: Array<{
    name: string;
    version: string;
    source: string;
    integrity: string;
    command: string;
  }>;
  control: {
    id: 'unprotected-control';
    artifactPolicy: 'manifest-input';
  };
  transformationSlice: {
    id: string;
    version: string;
    appliesTo: Array<'oss-extension' | 'own-minimal'>;
    inputStageId: string;
    eligibleNodeTypes: string[];
    selectionPolicy: string;
    variantPolicy: string;
    logicalParameters: Record<string, unknown>;
    allowedAuxiliaryTransforms: string[];
  };
  candidates: Array<{
    id: CandidateId;
    commit: string;
    config: Record<string, unknown>;
    canonicalSeedProjection: string;
    inputStageId: string;
    auxiliaryTransforms: string[];
    sliceConformanceEvidenceIds: string[];
  }>;
  corpus: Array<{
    caseId: string;
    sourceHash: string;
    category: string;
    partition: 'pilot' | 'official';
    expectedBehaviorId: string;
    recoveryTaskIds: string[];
  }>;
  recoveryTasks: Array<{
    id: string;
    objective: string;
    evaluatorIds: string[];
    oracleId: string;
    budgetId: string;
  }>;
  evaluators: Array<{
    id: string;
    kind: 'automated' | 'llm' | 'human';
    toolName?: string;
    oracleMode: 'automated' | 'human-rubric';
    determinism: 'verified-deterministic' | 'variable';
  }>;
  seeds: string[];
  diversityMetrics: {
    token: { algorithm: string; version: string; range: [0, 1] };
    ast: { algorithm: string; version: string; range: [0, 1] };
    comparisonPolicy: 'all-seed-pairs-within-case-and-candidate';
  };
  sampling: {
    minimumTotalCases: number;
    minimumCasesPerCategory: Record<string, number>;
    seedsPerCase: number;
    repetitionsByEvaluator: Record<string, number>;
    aggregation: 'paired-by-case-seed-task-evaluator';
    intervalMethod: string;
  };
  decisionRule: {
    primaryEndpoint: 'completion-rate-within-budget';
    effect: 'absolute-percentage-point-reduction-vs-oss-baseline';
    secondaryEndpoints: ['cost-to-success'];
    threshold:
      | { status: 'pending-pilot' }
      | { status: 'frozen'; minimumReductionPercentagePoints: number };
    materialityRule: 'interval-lower-bound-meets-threshold';
    primaryTimeoutTreatment: 'not-completed-within-budget';
    secondaryCostTimeoutTreatment: 'right-censored-at-budget';
  };
  blinding: {
    artifactLabelScheme: 'random-opaque-id';
    randomizeEvaluationOrder: true;
    mappingArtifactHash: string;
    evaluatorViewHash: string;
    revealAfterResultsLocked: true;
  };
  budgets: {
    processTimeoutMs: number;
    memoryBytes: number;
    recovery: Array<{
      id: string;
      evaluatorId: string;
      wallClockMs: number;
      maxAttempts: number;
      maxToolInvocations: number;
      maxPrompts?: number;
      maxTotalTokens?: number;
    }>;
    llm?: {
      model: string;
      version: string;
      promptHash: string;
      contextHash: string;
      parameters: Record<string, unknown>;
    };
  };
}
```

### `CaseResult`

```typescript
interface RecoveryTrialResult {
  blindArtifactId: string;
  taskId: string;
  evaluatorId: string;
  trial: number;
  outcome: 'completed' | 'failed' | 'timeout' | 'tool_error' | 'inconclusive';
  oracle: {
    id: string;
    passed: boolean | null;
    mode: 'automated' | 'human-rubric';
  };
  effort: {
    wallClockMs: number;
    activeWorkMs?: number;
    attempts: number;
    toolInvocations: number;
    promptCount?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  recoveredArtifactHash?: string;
  diagnostics: string[];
}

interface CaseResult {
  experimentId: string;
  caseId: string;
  subjectId: EvaluationSubjectId;
  seed: string | null;
  status: 'valid' | 'semantic_mismatch' | 'tool_error' | 'timeout' | 'inconclusive';
  semantic: {
    equivalent: boolean;
    diagnostics: string[];
  };
  diversity?: Array<{
    comparisonSeed: string;
    tokenMetricId: string;
    astMetricId: string;
    normalizedTokenSimilarity: number;
    normalizedAstSimilarity: number;
  }>;
  recovery: RecoveryTrialResult[];
  performance?: {
    buildDurationMs: number;
    runtimeDurationMs?: number;
    inputBytes: number;
    outputBytes: number;
  };
  artifactHashes: Record<string, string>;
}
```

Invariantes:

- resultado `valid` exige `semantic.equivalent === true`;
- `environmentCompatibility.exactMatchFields` e `informativeFields` são disjuntos e, juntos,
  classificam todos os campos de `environment`;
- `transformationSlice.appliesTo` contém exatamente `oss-extension` e `own-minimal`; ambos têm o
  mesmo `inputStageId`, e suas transforms auxiliares são subconjunto da allowlist da fatia;
- `sampling.seedsPerCase` corresponde à quantidade de seeds canônicas e cada
  `repetitionsByEvaluator` possui evaluator e budget referenciáveis no manifest;
- manifest de `phase === 'pilot'` pode usar threshold `pending-pilot`; manifest de
  `phase === 'official'` exige threshold `frozen` com valor maior que zero;
- `seed === null` só é válido para `unprotected-control`; candidatos sempre usam a seed canônica
  textual e registram sua projeção por ferramenta;
- `diversity` só existe para candidatos, compara todos os pares de seeds do mesmo caso/candidato e
  usa valores em `[0, 1]` produzidos pelos algoritmos versionados no manifest;
- `outcome === 'completed'` exige `oracle.passed === true`; falha de oracle, timeout, `tool_error` e
  resultado inconclusivo permanecem estados distintos;
- cada par task/evaluator só entra na análise depois de satisfazer a regra de calibração sobre
  `unprotected-control`; falha do controle invalida o par, não demonstra resistência;
- timeout de recovery é censurado no budget congelado e nunca convertido em custo infinito ou
  sucesso defensivo automático;
- `wallClockMs`, tentativas e invocações são registrados em todo trial; avaliação humana registra
  `activeWorkMs`, e LLM registra prompts e tokens quando o runtime os disponibiliza;
- tempo, tentativas, invocações, prompts e tokens são agregados separadamente, sem score composto
  implícito;
- resultado sem hash do input, output e configuração não entra no relatório consolidado;
- métricas agregadas sempre preservam todos os trials individuais para auditoria, inclusive
  repetições divergentes.

## Error handling

| Cenário | Comportamento |
|---|---|
| Manifest inválido ou incompleto | Falhar antes da execução e listar campos inválidos |
| Hash do corpus divergente | Interromper; não executar corpus diferente sob o mesmo `experimentId` |
| Ambiente diverge em campo de igualdade obrigatória | Marcar reprodução incompatível; não comparar hashes como reprodução exata |
| Fatia comum ou estágio de input diverge entre candidatos customizados | Invalidar a comparação causal até que a conformidade seja restaurada |
| Candidato não gera JavaScript válido | Registrar `tool_error`; não executar nem contar como resistência |
| Divergência semântica | Registrar `semantic_mismatch`, diagnóstico e hashes; desqualificar o candidato |
| Task/evaluator falha no controle não protegido | Marcar o par inválido e excluir seus resultados protegidos do denominador de resistência |
| Processo excede budget | Encerrar no sandbox e registrar `timeout`, nunca sucesso defensivo automático |
| Desofuscador falha | Preservar stderr/exit code e classificar como `tool_error` ou `inconclusive` |
| Avaliador LLM indisponível | Concluir as dimensões determinísticas e marcar anti-LLM como não avaliado |
| Mesmo avaliador varia sobre o mesmo artefato | Preservar todos os trials e usar as repetições congeladas no piloto |
| Rótulo real é revelado antes de fixar a avaliação | Invalidar a avaliação afetada; repetir apenas com evaluator/sessão independente que não viu o mapeamento, preservando o incidente |
| Número mínimo de casos, seeds ou repetições não é atingido | Não publicar conclusão arquitetural; reportar evidência insuficiente |
| Resultado parcial | Não publicar agregado como completo; listar células ausentes da matriz |

Nenhum erro pode remover silenciosamente um caso ou seed do denominador.

## Observability

- Cada execução gera manifest resolvido, logs estruturados locais e um `CaseResult` por célula da
  matriz.
- Logs internos incluem `experimentId`, `caseId`, `subjectId`, `seed`, `taskId`, `evaluatorId`,
  `trial`, etapa, duração e status; a visão entregue ao avaliador contém apenas `blindArtifactId`.
- Código-fonte e respostas completas do corpus não são enviados a telemetria ou rede.
- O relatório Markdown é derivado dos resultados JSON; números agregados devem apontar para os
  registros individuais que os compõem.
- Erros, timeouts, tasks inválidas, censuras e exclusões aparecem como séries próprias, nunca
  agregados a “não recuperado”.
- O relatório apresenta separadamente conclusão dentro do budget, wall-clock, tempo ativo humano,
  tentativas, invocações, prompts e tokens; nenhum agregado perde a unidade original.

## Quality attributes

| Atributo | Condição | Resposta verificável |
|---|---|---|
| Correção | Qualquer caso declarado suportado, em qualquer seed registrada | 100% de equivalência semântica; uma divergência torna o candidato inelegível |
| Reprodutibilidade | Mesmo commit, manifest, corpus e igualdade nos campos de ambiente congelados | Artefatos e métricas determinísticas têm hashes idênticos; campos informativos podem divergir e exceções são explicitadas |
| Auditabilidade | Qualquer valor agregado do relatório | É possível rastrear até `CaseResult`, artefatos, configuração e comandos de origem |
| Validade da task | Qualquer par task/evaluator incluído na resistência | O oracle passa sobre `unprotected-control` segundo a regra de calibração congelada |
| Comparabilidade | Mesma célula de corpus/seed entre candidatos | Mesmo estágio de input, oracle, tarefa, budgets e fatia comum verificável são aplicados |
| Cegamento | Avaliação humana ou por LLM | IDs e ordem não revelam candidato/seed/engine; mapeamento só é aberto após resultados fixados |
| Robustez estatística | Agregado usado na decisão arquitetural | Mínimos de casos/seeds/repetições atendidos, comparação pareada, intervalo e regra de materialidade publicados |
| Repetibilidade adversarial | Avaliador executado repetidamente sobre o mesmo artefato no piloto | É classificado como determinístico ou recebe número fixo de repetições na matriz oficial |
| Isolamento | Execução do código original, protegido ou recuperado | Processo sem rede, com filesystem descartável, timeout e limite de memória |
| Honestidade da medição | Crash, timeout ou output inválido de ferramenta adversarial | Resultado inconclusivo/erro; nunca vitória automática |

Não há alvo de p95, overhead ou ganho percentual nesta spec sem baseline. O piloto mede a variação;
o owner congela o threshold numérico antes da matriz oficial. O relatório sempre mostra taxa de
conclusão no budget e custo até sucesso, ainda que apenas a primeira dimensão seja o gate primário.

### Regra de decisão adotada

- **Endpoint primário:** redução absoluta, em pontos percentuais, da taxa de conclusão dentro do
  budget de cada candidato em relação a `oss-baseline`, usando apenas pares task/evaluator válidos.
- **Denominador:** trials válidos com outcome `completed`, `failed` ou `timeout`; no endpoint
  primário, timeout conta como não concluído dentro do budget. `tool_error` e `inconclusive` não
  viram falha defensiva e tornam a matriz incompleta; somente retry previsto no protocolo pode
  substituí-los, preservando o trial original.
- **Materialidade:** o candidato atende ao gate somente se preservar 100% da semântica e o limite
  inferior do intervalo pré-declarado para a redução atingir o threshold congelado.
- **Endpoint secundário:** custo até o sucesso, com timeout censurado no budget e valores reportados
  separadamente por wall-clock, tempo ativo, tentativas, invocações, prompts e tokens, sem
  substituir o gate primário.
- **Controle:** `unprotected-control` valida task/evaluator e não entra no cálculo do ganho contra o
  baseline.
- **Calibração:** o piloto define o valor numérico do threshold e os budgets; a matriz oficial usa
  esses valores sem alteração retrospectiva.

## Threat model

### Ativos protegidos pelo experimento

- Integridade e reprodutibilidade dos resultados.
- Confidencialidade de qualquer fixture local não pública.
- Capacidade de distinguir diversidade cosmética de recuperação efetivamente dificultada.

### Ativos não protegidos

- Irreversibilidade absoluta de JavaScript entregue ao cliente.
- Segredo do algoritmo de ofuscação; o atacante conhece o código da engine.
- Resistência futura a ferramentas ou modelos não incluídos no protocolo.

### Atores e vetores

| Ator/vetor | Controle do POC |
|---|---|
| Candidato favorecido por configuração | Manifest único e comparação célula a célula |
| Autor escolhe endpoint ou resultados favoráveis | Endpoint e direção do efeito fixos nesta spec; corpus, seeds, repetições, budgets, threshold, intervalos e tarefas congelados antes da matriz oficial |
| Recovery task quebrada favorece todos os candidatos | Controle não protegido obrigatório por task/evaluator |
| Avaliador humano/LLM conhece a hipótese | IDs opacos, ordem randomizada e mapeamento oculto até resultados e oracles serem fixados |
| Candidato customizado recebe proteção auxiliar | Contrato versionado da fatia, estágio de input comum e fixtures de conformidade |
| Desofuscador adaptado ao código open source | Modelo white-box e publicação do patch/candidato usado |
| Adversário não determinístico produz cherry-picking | Piloto de repetibilidade, N congelado e preservação de todos os trials |
| Amostra pequena faz ruído parecer ganho | Mínimos por categoria, seeds e repetições, análise pareada e regra de materialidade prévia |
| Ruído textual vence métrica de diversidade | Normalização antes de tokens/AST; linhas não são métrica |
| Código do corpus abusa do host | Sandbox sem rede, timeout, memória limitada e filesystem descartável |
| LLM memoriza ou reconhece corpus público | Fixtures sintéticas complementares e resultado marcado com essa limitação |
| Source map revela o original | Source maps não são fornecidos ao atacante salvo cenário explicitamente separado |

## Rollout / Rollback

Não há rollout de produção. Código experimental fica isolado do pacote publicável. Se o POC for
abandonado, os artefatos podem ser removidos sem migração; manifest, resultados e relatório são
preservados como registro da decisão.

## Acceptance criteria

1. Um `ExperimentManifest` validado registra commits, versões, integridade, comandos, política de
   compatibilidade de ambiente, corpus, seeds canônicas e projeções, budgets, evaluators, tarefas,
   desenho amostral, regra de decisão, blinding e fatia comum antes da matriz oficial.
2. A matriz contém exatamente três candidatos arquiteturais reais — `oss-baseline`,
   `oss-extension` e `own-minimal` — mais `unprotected-control` como braço obrigatório de
   calibração; o controle não conta como quarto provider.
3. O corpus congela total mínimo e mínimo por categoria, separa casos `pilot` de `official` e cobre
   escopo léxico/closures, classes, async/promises, generators, exceptions, módulos/bundle,
   strings/literais e controle de fluxo, além dos casos perigosos `eval`, `with` e
   `Function.prototype.toString` com política esperada declarada.
4. Todo caso suportado possui oracle semântico; cada recovery task possui objetivo, evaluator,
   budget e oracle de conclusão predefinidos; usa oracle automatizado quando possível e registra
   rubrica humana a priori quando não for automatizável; qualquer exclusão é justificada antes da
   matriz oficial.
5. Cada par task/evaluator incluído na resistência satisfaz seu oracle sobre
   `unprotected-control` segundo a regra de calibração congelada; falha no controle invalida apenas
   aquele par e nunca conta como proteção dos candidatos.
6. Controle e candidatos são executados sobre as células aplicáveis do mesmo corpus, com mesmas
   tasks, evaluators e budgets; os candidatos usam as mesmas seeds canônicas e o controle é
   processado uma vez por caso como comparador comum; resultado ausente ou diferente do manifest
   invalida o agregado até correção.
7. Qualquer divergência semântica marca o candidato como inelegível e permanece visível no
   relatório; a taxa exigida no subconjunto suportado é 100%.
8. `oss-extension` e `own-minimal` usam a mesma fatia versionada, estágio de input, parâmetros
   lógicos e transforms auxiliares permitidas; fixtures de conformidade publicadas comprovam a
   equivalência, e qualquer desvio invalida a comparação causal.
9. Diversidade compara todos os pares de seeds do mesmo caso/candidato depois de normalização por
   tokens e AST, com algoritmos versionados, range `[0, 1]` e resultados individuais preservados;
   nenhuma decisão usa percentual de linhas idênticas.
10. A avaliação adversarial inclui `webcrack` e tarefas independentes da ferramenta; cada trial
    registra outcome, oracle, wall-clock, tentativas, invocações e, quando aplicável, tempo ativo
    humano ou prompts/tokens, mantendo crash, timeout e erro separados de recuperação impedida.
11. O endpoint primário é a redução absoluta da taxa de conclusão dentro do budget contra
    `oss-baseline`, onde timeout conta como não concluído; custo até sucesso é secundário e trata
    timeout como censura no budget; a regra de materialidade exige que o limite inferior do
    intervalo atinja o threshold calibrado no piloto e congelado antes da matriz oficial, sem score
    composto implícito.
12. Avaliação humana ou por LLM recebe apenas IDs opacos em ordem randomizada, sem candidato, seed
    ou engine; o hash do mapeamento é registrado antes da avaliação e o conteúdo só é revelado após
    resultados e oracles estarem fixados.
13. O piloto testa cada evaluator repetidamente sobre o mesmo artefato, classifica seu determinismo
    e congela repetições por artefato; a matriz oficial preserva todos os trials e nunca seleciona
    apenas o melhor resultado.
14. Se houver avaliação por LLM, ela usa somente corpus permitido e registra modelo, versão, hash
    do prompt/contexto, parâmetros, prompts, tokens e repetições; caso contrário, o relatório
    declara a dimensão anti-LLM inconclusiva.
15. O protocolo congela mínimos de casos, seeds e repetições, comparação pareada, ordem de
    agregação, método de intervalo e regra para distinguir efeito material de ruído; não atingir o
    N congelado força conclusão de evidência insuficiente.
16. O relatório apresenta dados por caso, categoria e agregados de correção, validade das tasks,
    recuperação, custo, diversidade, tamanho, build time e runtime overhead, incluindo limitações,
    intervalos e variação aplicáveis.
17. O relatório conclui uma de três opções: evidência favorece alternativa mais simples,
    evidência justifica engine própria, ou evidência insuficiente; conclusão inconclusiva não pode
    aprovar o ADR.
18. Nenhum código proprietário sai da máquina e toda execução de corpus ocorre em sandbox local
    sem rede.
19. ADR 001 e spec do core só são atualizados para uma arquitetura definitiva após aprovação
    humana do relatório.
20. O relatório justifica a escolha do `javascript-obfuscator` como baseline OSS frente ao
    `js-confuser` ou recomenda uma rodada adicional antes da decisão final.

## Open questions

1. **Qual redução mínima, em pontos percentuais, justifica o diferencial de produto?** O endpoint
   já está decidido: redução da taxa de conclusão dentro do budget contra `oss-baseline`. O piloto
   calibra o threshold numérico, que deve ser congelado no manifest oficial antes da matriz.
   **Owner:** @andersonalves. **Deadline:** fim do piloto, antes da matriz oficial.
2. **Qual corpus versionado representa o target real e qual N é suficiente?** Definir bundles,
   total mínimo, mínimo por categoria e separação entre piloto e matriz oficial, sem usar código
   proprietário. **Owner:** @andersonalves. **Deadline:** step de protocolo.
3. **Qual transform mínima comum será implementada em `oss-extension` e `own-minimal`?** Deve
   variar estrutura de forma normalizável e permitir comparação justa, sem reimplementar o produto.
   **Owner:** POC. **Deadline:** antes dos steps dos candidatos.
4. **Qual avaliador LLM local está disponível e pode ter versão fixada?** Sem resposta, anti-LLM
   permanece explicitamente inconclusivo. **Owner:** @andersonalves. **Deadline:** antes da execução.
5. **Quais budgets de CPU, memória e timeout refletem o ambiente de pesquisa?** Devem vir de uma
   execução piloto e ser congelados antes da matriz oficial. **Owner:** POC. **Deadline:** piloto.
6. **Quantas seeds e repetições por evaluator distinguem efeito material de ruído?** Definir no
   piloto também método de intervalo, ordem de agregação e política para evaluator variável.
   **Owner:** POC. **Deadline:** fim do piloto, antes da matriz oficial.
7. **Quais campos definem ambiente compatível para reprodução exata?** Congelar campos de igualdade
   obrigatória e campos apenas informativos no manifest. **Owner:** POC. **Deadline:** protocolo.
8. **O baseline OSS único é suficiente frente ao `js-confuser`?** Registrar justificativa no
   protocolo ou planejar rodada adicional sem contaminar a matriz mínima inicial. **Owner:**
   @andersonalves. **Deadline:** antes do aceite final do ADR 001.

## Traceability

| Fonte atual | Acceptance criteria | Implementation plan |
|---|---|---|
| Comparar controle, baseline, extensão e própria mínima | AC1, AC2, AC6, AC20 | 1, 3, 4, 5, 10, 11 |
| Validar recovery tasks contra código não protegido | AC2, AC4, AC5, AC16 | 2, 7, 10, 11 |
| Preservar semântica no escopo suportado | AC3, AC4, AC7 | 2, 6 |
| Comprovar equivalência da fatia customizada | AC1, AC8 | 1, 4, 5, 10 |
| Medir diversidade sem proxy textual | AC9, AC16 | 1, 8, 11 |
| Medir recuperação e custo por trial | AC10, AC11, AC14, AC16 | 1, 2, 7, 9, 10, 11 |
| Reduzir viés do avaliador | AC12, AC14 | 1, 7, 9, 11 |
| Tratar variação e tamanho amostral | AC3, AC13, AC15, AC16 | 1, 2, 10, 11 |
| Produzir decisão auditável | AC1, AC11, AC16, AC17, AC19 | 1, 10, 11, 12 |
| Operar offline e executar corpus com isolamento | AC14, AC18 | 1, 6, 7, 9 |

## Implementation plan

1. **Definir protocolo e manifest de piloto:** especificar schemas, controle, fatia comum, seeds,
   evaluators, budgets, cálculo do endpoint primário fixado, endpoint secundário, blinding, desenho
   amostral, compatibilidade de ambiente e política de classificação.
2. **Montar corpus e recovery tasks:** criar partições de piloto/oficial, mínimos por categoria,
   fixtures permitidas, oracles semânticos e tasks com objective/evaluator/oracle/budget.
3. **Implementar baseline OSS:** adapter mínimo para executar `javascript-obfuscator` free com
   configuração e seed registradas.
4. **Implementar extensão OSS:** patch/fork mínimo que introduz a variante estrutural escolhida,
   a partir do estágio comum e com evidência de conformidade da fatia.
5. **Implementar candidato próprio mínimo:** a mesma fatia de transformação sobre parser existente,
   a partir do estágio comum, sem bridge Wasm ou transforms auxiliares não declaradas.
6. **Implementar runner semântico isolado:** executar original e outputs em sandbox, comparar
   oracles e produzir `CaseResult`.
7. **Implementar harness de recovery cego:** gerar IDs opacos, randomizar ordem, executar controle e
   candidatos com `webcrack`, aplicar oracles e preservar esforço/outcome por trial.
8. **Implementar métricas de diversidade:** versionar normalizadores token/AST e comparar todos os
   pares de seeds do mesmo caso/candidato em `[0, 1]`.
9. **Implementar avaliador LLM condicional:** se aprovado, usar visão cega local, prompt/contexto
   hashados, budgets e trials registrados; caso contrário, manter a dimensão inconclusiva.
10. **Executar piloto e congelar protocolo oficial:** validar tasks no controle, conformidade da
    fatia, determinismo dos evaluators, compatibilidade de ambiente, budgets, N, intervalos e valor
    numérico do threshold antes da matriz oficial.
11. **Executar matriz oficial e publicar relatório:** preservar casos, trials, agregados por
    categoria, intervalos, limitações e conclusão entre as três opções do AC17.
12. **Atualizar decisão arquitetural:** propor a versão final do ADR 001 e revisar a spec do core a
    partir do relatório aprovado.

---

> **Handoff autorizado para Atomic Steps:** a spec foi aprovada em 2026-08-09. O threshold numérico
> da Open question 1 permanece saída obrigatória do piloto e deve estar congelado antes da matriz
> oficial.
