# Spec: POC comparativo de polimorfismo do `js-protect`

> **Status:** Draft — aguardando aprovação do usuário antes de Atomic Steps
>
> **ADR relacionado:** [ADR 001 — Engine própria vs. orquestração](../adr/001-engine-propria-vs-orquestracao.md)

## Goal

Produzir evidência reproduzível para selecionar a alternativa de menor complexidade que preserve a
semântica do JavaScript suportado e aumente de forma observável a resistência à recuperação
automatizada em relação ao baseline open source.

## Non-goals

- Não entregar a engine, CLI ou API de produção do `js-protect`.
- Não reimplementar as oito transforms AST tradicionais como requisito do POC.
- Não implementar VM bytecode customizada, anti-LLM proprietário, domain lock, anti-debug ou
  self-defending.
- Não decidir Rust/Wasm por preferência, desempenho presumido ou utilidade futura.
- Não medir proteção por percentual de linhas diferentes, tamanho do arquivo ou aparência visual.
- Não executar nem enviar código proprietário a serviços externos.
- Não especificar o adapter Bytenode de Node.js/Electron; essa preocupação é independente e exige
  spec própria se permanecer na v1.

## Classificação de escopo

### Requisitos atuais

- Comparar um baseline OSS, uma extensão/fork mínimo e uma transform própria mínima sob o mesmo
  protocolo.
- Preservar 100% da semântica no subconjunto de casos declarado como suportado.
- Medir separadamente diversidade estrutural e recuperação adversarial.
- Produzir resultados reproduzíveis, auditáveis e utilizáveis para atualizar o ADR 001.
- Manter código, corpus e execução do POC offline.

### Restrições atuais

- O ADR 001 permanece `Proposed` até o resultado do POC.
- `javascript-obfuscator` free é o baseline porque já oferece transforms AST, aleatoriedade e seed.
- O atacante deve ser modelado como white-box: conhece o código dos candidatos e pode adaptar
  normalizadores.
- Qualquer candidato com divergência semântica no subconjunto suportado é inelegível para a v1.

### Considerações futuras

- Engine Rust/Wasm de produção.
- VM bytecode customizada e anti-LLM.
- Plugins de bundler, watch mode, execução no browser e presets comerciais.
- Benchmark contínuo contra novos desofuscadores após a v1.

### Rejeitado neste POC

- Usar diferença textual ou de linhas como proxy de proteção.
- Tratar crash/timeout de uma ferramenta adversarial isolada como prova automática de resistência.
- Criar abstração genérica de providers além dos três candidatos reais do experimento.

## User stories

### US1 — Comparar candidatos sob protocolo idêntico

**Given** um corpus versionado, tarefas de recuperação predefinidas e os três candidatos do POC

**When** o pesquisador executa a matriz experimental com o manifest aprovado

**Then** recebe resultados comparáveis de correção, diversidade, recuperação, tamanho, build time e
runtime overhead, sem configuração privilegiar um candidato.

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

## Assumptions

1. O corpus usa apenas código open source ou fixtures sintéticas; nenhum código proprietário será
   submetido a avaliadores externos.
2. O POC executa como ferramenta de pesquisa local em Node.js; browser é target do output, não
   runtime do runner.
3. Cada caso possui um oracle observável e determinístico ou declara explicitamente as fontes de
   não determinismo controladas pelo harness.
4. A comparação implementa a mesma fatia de proteção nos candidatos customizados; quantidade de
   transforms não é critério de vitória.
5. `webcrack` representa uma ameaça automatizada relevante, mas não cobre sozinho todo o espaço de
   engenharia reversa.
6. Avaliação por LLM só é válida com modelo, versão, prompt, parâmetros, contexto e repetições
   registrados; sem isso, a dimensão permanece `[UNVERIFIED]` e não decide arquitetura.
7. O POC pode concluir que nenhuma alternativa sustenta a promessa atual do produto.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| Overfitting ao `webcrack` | Alto | Usar tarefas de recuperação independentes da ferramenta e inspeção do AST normalizado |
| Comparação injusta entre fork maduro e candidato próprio mínimo | Alto | Limitar todos à mesma fatia funcional e publicar configuração/código de cada candidato |
| Oracle semântico incompleto | Crítico | Predefinir efeitos observáveis por caso; falha ou ambiguidade invalida o caso, não vira sucesso |
| LLM não determinístico ou atualizado durante o estudo | Alto | Fixar modelo quando possível, registrar metadados e repetir; não usar LLM como gate único |
| Corpus pequeno ou enviesado | Alto | Cobrir categorias sintáticas e padrões de bundle predefinidos; publicar lacunas |
| Timeout interpretado como resistência | Alto | Classificar separadamente timeout, crash, output inválido e recuperação incompleta |
| Execução de corpus malicioso comprometer a máquina | Crítico | Sandbox sem rede, timeout, limite de memória e filesystem descartável para todo código executado |
| Métrica estrutural ser vencida por ruído | Alto | Normalizar whitespace, nomes e literais antes de comparar; manter estrutura como diagnóstico secundário |
| Fork criar custo de manutenção oculto | Médio | Registrar patch surface e conflitos com upstream como resultado do POC |

## Data model

### `ExperimentManifest`

Fonte única da configuração de uma execução:

```typescript
interface ExperimentManifest {
  schemaVersion: 1;
  experimentId: string;
  repositoryCommit: string;
  environment: {
    os: string;
    architecture: string;
    cpu: string;
    memoryBytes: number;
    nodeVersion: string;
  };
  tools: Array<{
    name: string;
    version: string;
    source: string;
    integrity: string;
  }>;
  candidates: Array<{
    id: 'oss-baseline' | 'oss-extension' | 'own-minimal';
    commit: string;
    config: Record<string, unknown>;
  }>;
  corpus: Array<{
    caseId: string;
    sourceHash: string;
    category: string;
    expectedBehaviorId: string;
    recoveryTaskIds: string[];
  }>;
  seeds: Array<string | number>;
  budgets: {
    processTimeoutMs: number;
    memoryBytes: number;
    llm?: {
      model: string;
      version: string;
      repetitions: number;
      parameters: Record<string, unknown>;
    };
  };
}
```

### `CaseResult`

```typescript
interface CaseResult {
  experimentId: string;
  caseId: string;
  candidateId: ExperimentManifest['candidates'][number]['id'];
  seed: string | number;
  status: 'valid' | 'semantic_mismatch' | 'tool_error' | 'timeout' | 'inconclusive';
  semantic: {
    equivalent: boolean;
    diagnostics: string[];
  };
  diversity?: {
    normalizedTokenSimilarity: number;
    normalizedAstSimilarity: number;
  };
  recovery?: {
    tool: string;
    completedTaskIds: string[];
    failedTaskIds: string[];
    diagnostics: string[];
  };
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
- `timeout` e `tool_error` não equivalem a tarefa de recuperação derrotada;
- resultado sem hash do input, output e configuração não entra no relatório consolidado;
- métricas agregadas sempre preservam resultados individuais para auditoria.

## Error handling

| Cenário | Comportamento |
|---|---|
| Manifest inválido ou incompleto | Falhar antes da execução e listar campos inválidos |
| Hash do corpus divergente | Interromper; não executar corpus diferente sob o mesmo `experimentId` |
| Candidato não gera JavaScript válido | Registrar `tool_error`; não executar nem contar como resistência |
| Divergência semântica | Registrar `semantic_mismatch`, diagnóstico e hashes; desqualificar o candidato |
| Processo excede budget | Encerrar no sandbox e registrar `timeout`, nunca sucesso defensivo automático |
| Desofuscador falha | Preservar stderr/exit code e classificar como `tool_error` ou `inconclusive` |
| Avaliador LLM indisponível | Concluir as dimensões determinísticas e marcar anti-LLM como não avaliado |
| Resultado parcial | Não publicar agregado como completo; listar células ausentes da matriz |

Nenhum erro pode remover silenciosamente um caso ou seed do denominador.

## Observability

- Cada execução gera manifest resolvido, logs estruturados locais e um `CaseResult` por célula da
  matriz.
- Logs incluem `experimentId`, `caseId`, `candidateId`, `seed`, etapa, duração e status.
- Código-fonte e respostas completas do corpus não são enviados a telemetria ou rede.
- O relatório Markdown é derivado dos resultados JSON; números agregados devem apontar para os
  registros individuais que os compõem.
- Erros, timeouts e exclusões aparecem como séries próprias, nunca agregados a “não recuperado”.

## Quality attributes

| Atributo | Condição | Resposta verificável |
|---|---|---|
| Correção | Qualquer caso declarado suportado, em qualquer seed registrada | 100% de equivalência semântica; uma divergência torna o candidato inelegível |
| Reprodutibilidade | Mesmo commit, manifest, corpus e ambiente compatível | Artefatos e métricas determinísticas têm hashes idênticos; exceções são explicitadas |
| Auditabilidade | Qualquer valor agregado do relatório | É possível rastrear até `CaseResult`, artefatos, configuração e comandos de origem |
| Comparabilidade | Mesma célula de corpus/seed entre candidatos | Mesmo oracle, tarefa de recuperação e budgets são aplicados |
| Isolamento | Execução do código original, protegido ou recuperado | Processo sem rede, com filesystem descartável, timeout e limite de memória |
| Honestidade da medição | Crash, timeout ou output inválido de ferramenta adversarial | Resultado inconclusivo/erro; nunca vitória automática |

Não há alvo de p95, overhead ou ganho percentual nesta spec sem baseline. O POC mede esses valores;
o owner define o limite de produto antes de usar qualquer resultado para aceitar o ADR.

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
| Autor escolhe apenas resultados favoráveis | Corpus, seeds, budgets e tarefas registrados antes da execução |
| Desofuscador adaptado ao código open source | Modelo white-box e publicação do patch/candidato usado |
| Ruído textual vence métrica de diversidade | Normalização antes de tokens/AST; linhas não são métrica |
| Código do corpus abusa do host | Sandbox sem rede, timeout, memória limitada e filesystem descartável |
| LLM memoriza ou reconhece corpus público | Fixtures sintéticas complementares e resultado marcado com essa limitação |
| Source map revela o original | Source maps não são fornecidos ao atacante salvo cenário explicitamente separado |

## Rollout / Rollback

Não há rollout de produção. Código experimental fica isolado do pacote publicável. Se o POC for
abandonado, os artefatos podem ser removidos sem migração; manifest, resultados e relatório são
preservados como registro da decisão.

## Acceptance criteria

1. Um `ExperimentManifest` validado registra commits, versões, integridade, ambiente, corpus,
   seeds, budgets, candidatos e tarefas antes da execução comparativa.
2. A matriz contém exatamente três candidatos reais: `oss-baseline`, `oss-extension` e
   `own-minimal`; não há provider abstrato sem quarto consumidor.
3. O corpus cobre, no mínimo, escopo léxico/closures, classes, async/promises, generators,
   exceptions, módulos/bundle, strings/literais e controle de fluxo, além dos casos explicitamente
   perigosos `eval`, `with` e `Function.prototype.toString` com política esperada declarada.
4. Todo caso suportado possui oracle semântico e tarefas de recuperação predefinidas; exclusões são
   justificadas antes da execução.
5. Cada candidato é executado sobre os mesmos casos, seeds e budgets; resultados ausentes ou
   diferentes do manifest invalidam o agregado até correção.
6. Qualquer divergência semântica marca o candidato como inelegível e permanece visível no
   relatório; a taxa exigida no subconjunto suportado é 100%.
7. Diversidade é medida depois de normalização por tokens e AST; nenhuma decisão usa percentual de
   linhas idênticas.
8. A avaliação adversarial inclui `webcrack` e tarefas de recuperação independentes da ferramenta;
   crash e timeout são separados de recuperação impedida.
9. Se houver avaliação por LLM, ela usa somente corpus permitido e registra modelo, versão, prompt,
   parâmetros e repetições; caso contrário, o relatório declara a dimensão anti-LLM inconclusiva.
10. O relatório apresenta dados por caso e agregados de correção, recuperação, diversidade,
    tamanho, build time e runtime overhead, incluindo limitações e intervalos/variação quando
    aplicáveis.
11. O relatório conclui uma de três opções: evidência favorece alternativa mais simples,
    evidência justifica engine própria, ou evidência insuficiente; conclusão inconclusiva não pode
    aprovar o ADR.
12. Nenhum código proprietário sai da máquina e toda execução de corpus ocorre em sandbox local
    sem rede.
13. ADR 001 e spec do core só são atualizados para uma arquitetura definitiva após aprovação
    humana do relatório.
14. O relatório justifica a escolha do `javascript-obfuscator` como baseline OSS frente ao
    `js-confuser` ou recomenda uma rodada adicional antes da decisão final.

## Open questions

1. **Qual ganho de recuperação justifica o diferencial de produto?** O threshold deve ser
   registrado no manifest antes da execução para impedir escolha retrospectiva. **Owner:**
   @andersonalves. **Deadline:** antes de aprovar os Atomic Steps.
2. **Qual corpus versionado representa o target real?** Definir bundles e categorias sem usar
   código proprietário. **Owner:** @andersonalves. **Deadline:** step de protocolo.
3. **Qual transform mínima comum será implementada em `oss-extension` e `own-minimal`?** Deve
   variar estrutura de forma normalizável e permitir comparação justa, sem reimplementar o produto.
   **Owner:** POC. **Deadline:** antes dos steps dos candidatos.
4. **Qual avaliador LLM local está disponível e pode ter versão fixada?** Sem resposta, anti-LLM
   permanece explicitamente inconclusivo. **Owner:** @andersonalves. **Deadline:** antes da execução.
5. **Quais budgets de CPU, memória e timeout refletem o ambiente de pesquisa?** Devem vir de uma
   execução piloto e ser congelados antes da matriz oficial. **Owner:** POC. **Deadline:** piloto.
6. **O baseline OSS único é suficiente frente ao `js-confuser`?** Registrar justificativa no
   protocolo ou planejar rodada adicional sem contaminar a matriz mínima inicial. **Owner:**
   @andersonalves. **Deadline:** antes do aceite final do ADR 001.

## Traceability

| Fonte atual | Acceptance criteria | Implementation plan |
|---|---|---|
| Comparar baseline, extensão e própria mínima | AC1, AC2, AC5, AC14 | 1, 3, 4, 5, 8 |
| Preservar semântica no escopo suportado | AC3, AC4, AC6 | 2, 6 |
| Medir diversidade sem proxy textual | AC7, AC10 | 7, 8 |
| Medir recuperação adversarial | AC8, AC9, AC10 | 2, 7, 8 |
| Produzir decisão auditável | AC1, AC10, AC11, AC13 | 1, 8, 9 |
| Operar offline e executar corpus com isolamento | AC9, AC12 | 1, 6, 7 |

## Implementation plan

1. **Congelar protocolo e manifest:** definir schema, versões, seeds, budgets, comandos e política
   de classificação antes de comparar candidatos.
2. **Montar corpus e recovery tasks:** criar fixtures/casos permitidos, oracles semânticos e
   tarefas de recuperação predefinidas.
3. **Implementar baseline OSS:** adapter mínimo para executar `javascript-obfuscator` free com
   configuração e seed registradas.
4. **Implementar extensão OSS:** patch/fork mínimo que introduz a variante estrutural escolhida,
   sem criar abstração de providers genérica.
5. **Implementar candidato próprio mínimo:** a mesma fatia de transformação sobre parser existente,
   sem bridge Wasm ou transforms não necessárias ao experimento.
6. **Implementar runner semântico isolado:** executar original e outputs em sandbox, comparar
   oracles e produzir `CaseResult`.
7. **Implementar avaliação adversarial:** integrar `webcrack`, normalização token/AST e, se
   aprovado, avaliador LLM local sob budgets registrados.
8. **Executar matriz e publicar relatório:** preservar resultados individuais, agregados,
   limitações e conclusão entre as três opções do AC11.
9. **Atualizar decisão arquitetural:** propor a versão final do ADR 001 e revisar a spec do core a
   partir do relatório aprovado.

---

> **Handoff bloqueado:** não criar Atomic Steps nem código do POC antes da aprovação explícita
> desta spec e da resolução da Open question 1.
