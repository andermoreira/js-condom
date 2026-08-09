# Revisão profunda — rodada 2 — specs e ADR do `js-condom`

**Data:** 2026-08-09

**Artefatos revisados:** `specs/js-condom-core.md`, `specs/js-condom-polymorphism-poc.md`,
`adr/001-engine-propria-vs-orquestracao.md` (com `benchmark-js-protection.md` como contexto).

**Relação com a rodada 1:** [`2026-08-09-js-condom-spec-adr-review.md`](2026-08-09-js-condom-spec-adr-review.md)
avaliou os rascunhos anteriores (nota 34/100). Esta rodada avalia o estado pós-remediação.

**Camada mecânica:** `node scripts/lint-specs.cjs` não existe neste repositório; o linter não foi
executado. Todos os achados abaixo são de julgamento, ancorados em trecho e linha.

## Veredictos

| Artefato | Veredicto | Motivo |
|---|---|---|
| `specs/js-condom-polymorphism-poc.md` | **BLOCKED** | Open question 1 (threshold adversarial) é decisão exclusiva do owner e o próprio handoff a exige antes dos Atomic Steps. Sem achado bloqueante estrutural: resolvida a OQ1 e aprovada a spec, ela sustenta a geração de steps. |
| `specs/js-condom-core.md` | **BLOCKED** (por design) + 3 achados a resolver antes do aceite | A spec se autodeclara bloqueada pelo POC, pelo ADR 001 e pelas OQ 2–4 — correto. Mas há três defeitos que devem ser corrigidos durante essa janela, antes do aceite. |
| `adr/001-engine-propria-vs-orquestracao.md` | **Manter `Proposed`** — coerente | Alternativas comparáveis, condições de aceite falsificáveis, fatos com tag de evidência. Um ajuste de alinhamento com a spec do core (achado C7). |

## O que a remediação da rodada 1 resolveu

Os 22 achados anteriores foram endereçados. Em particular:

- **Críticos 1–4:** a premissa sobre polimorfismo do free foi corrigida (ADR cita PRNG/seed
  `[VERIFIED]`); a promessa de segurança agora é gated pelo POC com recovery tasks; o erro sobre
  `vm.Script.createCachedData()` foi corrigido no benchmark §4.2 e a implementação direta de `.jsc`
  está em "Rejeitado nesta spec"; o critério de correção subiu de ≥95% para 100% com falha fechada.
- **Altos:** rastreabilidade agora tem tabela `Fonte → AC → Plan` nas duas specs; métrica de linhas
  idênticas foi explicitamente rejeitada; threat model assume atacante white-box; alternativas do
  ADR incluem fork/extensão e engine TS; budgets deixaram de ser inventados (AC15 exige baseline);
  Node 18 saiu e a regra passou a ser "linhas LTS mantidas na data do release".
- **Médios/baixos:** `process.emit` removido; SemVer separado de bytes gerados; conclusão do
  benchmark reescrita sem contradição free/Pro; status documental (`Draft`/`Proposed`) consistente.

Dois achados antigos deixaram resíduo: paridade API/config/CLI (agora C4) e semântica de diretório
para source maps (agora C5).

## Achados — `specs/js-condom-core.md`

### C1 — Detecção de dependência de `Function.prototype.toString` não é especificável como está

- Severity: blocking (para o aceite da spec; steps do core já estão bloqueados)
- Type: testability
- Location: linhas 114–121 — `**Given** código cujo comportamento depende de direct eval, with ou
  Function.prototype.toString […] **Then** a ferramenta falha com semantic_hazard, linha/coluna`
- Why: direct `eval` e `with` são detectáveis sintaticamente; **dependência de comportamento** de
  `Function.prototype.toString` não é — `fn.toString()`, `String(fn)`, `` `${fn}` `` e coerção
  implícita são superfícies distintas e o caso geral é indecidível. Como está, AC8 (linhas 448–449)
  não tem oracle: não dá para escrever o teste negativo "não deixou passar um dependente de
  toString" sem definir o que conta como detecção.
- Suggestion: definir a detecção como lista fechada de padrões sintáticos (ex.: qualquer acesso a
  `.toString` ou `Function.prototype.toString` sobre referência de função, template/concatenação
  com identificador de função) e declarar explicitamente a política para falsos negativos
  (documentação + hazard best-effort), ou rebaixar `toString` de "detectado e rejeitado" para
  "documentado como hazard não detectável com heurística best-effort".
- Blocks steps: yes (do core, junto dos bloqueios já declarados)

### C2 — "Prova específica de preservação" cria loophole no fail-closed

- Severity: blocking
- Type: ambiguity
- Location: linhas 448–449 — `são detectados e rejeitados quando o pipeline não possui prova
  específica de preservação`; conflita com a Assumption 7 (linha 140) — `Código fora da matriz
  suportada falha fechado; a v1 não oferece modo unsafe`
- Why: a cláusula condicional permite que um pipeline "com prova" aceite direct `eval`/`with`, mas
  a spec não define o que constitui prova (fixture? entrada `supported` na matriz? demonstração
  formal?). Sem esse critério, o AC8 é intestável e o fail-closed da Assumption 7 tem uma exceção
  não regulada.
- Suggestion: na v1, remover a condicional — hazards sempre rejeitam — e mover "pipeline com prova
  de preservação" para Considerações futuras; ou definir "prova" como estado `supported` na
  compatibility matrix com fixtures positivas obrigatórias por hazard.
- Blocks steps: yes

### C3 — `reservedIdentifiers` é elemento órfão (sem fonte atual)

- Severity: blocking (per contrato de rastreabilidade)
- Type: speculative-design
- Location: linhas 211–212 — `/** Exact identifiers that the selected pipeline must preserve. */
  reservedIdentifiers?: string[];`; também linha 254 e config linha 268
- Why: nenhum requisito atual, user story ou AC origina esse campo. Ele aparece só no contrato da
  API, na config e na observabilidade. A necessidade real existe (globals que o rename não pode
  tocar em bundles que interagem com APIs externas), mas a spec não a declara — e um campo público
  sem AC não tem teste que o proteja.
- Suggestion: adicionar um requisito atual + AC ("identificadores listados sobrevivem à proteção
  byte a byte, com fixture") ou cortar o campo da v1 e movê-lo para Considerações futuras.
- Blocks steps: yes

### C4 — Paridade CLI/config/API tem lacunas que tornam AC6 intestável nas bordas

- Severity: improvement
- Type: testability
- Location: linhas 444–445 — `CLI flags, config e ProtectOptions usam os mesmos nomes, tipos,
  defaults e validações aplicáveis`; config exemplo (linhas 263–274) não possui `filename` nem
  `sourceMap.input`; CLI usa `--input-source-map <path>` (linha 180) enquanto a API usa
  `sourceMap.input` com **conteúdo** JSON (linhas 214–216, 253)
- Why: "aplicáveis" esconde três decisões não tomadas: (a) quais chaves são exclusivas de cada
  superfície (`filename` é API-only? `sourceMap.input` é proibido no config, já que "chaves
  desconhecidas são erro"?); (b) a regra de projeção de nomes (`--input-source-map` ↔
  `sourceMap.input`); (c) a diferença de tipo path vs. conteúdo. Sem tabela canônica, o teste de
  paridade do AC6 não tem gabarito.
- Suggestion: publicar um modelo canônico de opções com coluna por superfície (CLI/config/API),
  marcando exclusividades e a regra de projeção. Cabe no item 1 do Implementation plan.
- Blocks steps: no (resolvível no step de contratos)

### C5 — Diretório + `--source-map` sem semântica definida

- Severity: improvement
- Type: coverage
- Location: linhas 179–181 (`--source-map`, `--input-source-map` "arquivo único") e US2 (linhas
  77–84), que não menciona mapas
- Why: a spec define composição de mapa apenas para input de arquivo, mas não diz o que
  `--source-map` faz em diretório: um mapa por arquivo? Nomeação? Ficam no staging e são publicados
  juntos? O AC11 só cobre o caso arquivo.
- Suggestion: declarar explicitamente — ex.: em diretório, cada arquivo emite `<nome>.js.map`
  sibling sem composição (input map é rejeitado, como já implícito), publicados na mesma transação.
- Blocks steps: no

### C6 — `warnings` sem condição geradora e sem código estável

- Severity: improvement
- Type: ambiguity
- Location: linhas 234–239 — `export interface ProtectionWarning { code: string; … }`; linha 256
- Why: nenhum cenário da spec produz warning (tudo que falha, falha fechado; arquivos ignorados
  vão ao report). Um canal público sem produtor definido é superfície especulativa; e `code: string`
  livre contrasta com o enum estável de erros.
- Suggestion: ou remover `warnings` da v1, ou declarar o primeiro produtor concreto (ex.: arquivo
  ignorado por extensão no modo diretório) e tipar os códigos como union estável.
- Blocks steps: no

### C7 — Tensão sobre Bytenode na v1 entre spec e ADR

- Severity: improvement
- Type: adr-conflict (leve — alinhamento de escrita, não contradição de decisão)
- Location: spec linhas 19–20 e 52 (`Não implementar […] Bytenode […] nesta spec` /
  `Considerações futuras: Adapter Bytenode`); ADR linhas 117–118 (`Para bytecode V8, a hipótese da
  v1 é a Alternativa E`)
- Why: o ADR mantém Bytenode como hipótese **da v1** (via spec separada); a spec do core o coloca
  em "Considerações futuras", que na taxonomia do documento significa pós-v1. Um leitor não sabe
  se o adapter é candidato à v1 ou não.
- Suggestion: na spec do core, mover o adapter Bytenode de "Considerações futuras" para uma nota
  em "Classificação de escopo" dizendo "fora **desta spec**; candidato à v1 somente via spec
  própria, conforme ADR 001".
- Blocks steps: no

## Achados — `specs/js-condom-polymorphism-poc.md`

### P1 — Métricas de diversidade sem definição operacional

- Severity: improvement
- Type: ambiguity
- Location: linhas 188–191 — `normalizedTokenSimilarity: number; normalizedAstSimilarity: number;`
  e AC7 (linhas 301–302)
- Why: não está definido o conjunto comparado (pares de builds do mesmo caso entre seeds?
  todas as combinações?), o range (0–1?), nem o algoritmo (n-gramas? tree edit distance?). O plano
  item 1 ("congelar protocolo") pode resolver, mas o AC7 hoje não tem gabarito para dizer que a
  medição foi feita "certa".
- Suggestion: fixar no protocolo: comparação par a par entre seeds do mesmo caso/candidato,
  métrica em [0,1], algoritmo nomeado e versionado no manifest.
- Blocks steps: no (desde que o step do plano 1 tenha essa entrega explícita)

### P2 — Julgamento de recovery task não definido

- Severity: improvement
- Type: testability
- Location: linhas 192–197 — `recovery?: { tool: string; completedTaskIds: string[]; … }` e AC8
  (linhas 303–304)
- Why: quem decide que uma task foi "completada" — grader automatizado com oracle por task,
  ou julgamento humano? Sem isso, `completedTaskIds` é opinião, e a métrica central do POC
  (recuperação) herda a subjetividade que o protocolo quer eliminar.
- Suggestion: exigir, no plano item 2, um oracle por recovery task (asserção executável sobre o
  artefato recuperado) e marcar tasks sem oracle automatizável como avaliação humana registrada
  com critério escrito a priori.
- Blocks steps: no (mesma condição do P1)

### P3 — Item 7 do plano acumula três trabalhos

- Severity: improvement
- Type: slicing
- Location: linhas 363–364 — `Implementar avaliação adversarial: integrar webcrack, normalização
  token/AST e, se aprovado, avaliador LLM local`
- Why: integração de desofuscador, implementação de métricas de normalização e harness de LLM são
  preocupações independentes com dependências diferentes (o LLM depende da OQ4). Num handoff de
  ≤5 arquivos lógicos, dificilmente cabem juntos.
- Suggestion: fatiar em 7a (webcrack + classificação de resultado), 7b (normalização/métricas) e
  7c (LLM, condicional à OQ4).
- Blocks steps: no

### P4 — "Ambiente compatível" em US2 não é critério

- Severity: improvement
- Type: ambiguity
- Location: linhas 72–75 — `**When** outra execução usa o mesmo manifest em ambiente compatível`
- Why: o manifest registra `os/architecture/cpu/memoryBytes/nodeVersion`, mas "compatível" não diz
  quais campos podem divergir sem invalidar a reprodução. Reprodutibilidade é AC central do POC.
- Suggestion: definir compatibilidade como igualdade de `nodeVersion` + `architecture` (mínimo) e
  declarar os demais campos como informativos, ou o que o protocolo decidir — mas por escrito.
- Blocks steps: no

### P5 — Tipo de seed divergente entre POC e core

- Severity: improvement (menor)
- Type: contradiction (fraca)
- Location: POC linha 161 — `seeds: Array<string | number>` vs. core linhas 209–210 — `seed?:
  string` e `--seed <value>` textual
- Why: justificável (o baseline `javascript-obfuscator` usa seed numérica), mas o relatório do POC
  alimentará contratos do core; sem regra de conversão, "mesma seed" entre candidatos fica ambíguo.
- Suggestion: registrar no manifest a seed canônica como string e a projeção por ferramenta.
- Blocks steps: no

## Achados — `adr/001-engine-propria-vs-orquestracao.md`

Nenhum achado bloqueante. O ADR está no melhor estado dos três artefatos: alternativas A–E
comparáveis, decisão em duas fases explícita, hipótese inicial separada de arquitetura aceita
(linhas 112–115), condições de aceite falsificáveis (linhas 138–143) e cláusula honesta de que
fork inviável é evidência a favor de engine própria, não falha do processo (linhas 129–131).
Resíduo: o alinhamento com a spec do core sobre Bytenode na v1 (achado C7, correção na spec).

## Rastreabilidade — estado atual

- **Core:** os 17 ACs estão todos cobertos pela tabela `Fonte → AC → Plan` e todos os itens do
  plano têm AC de origem. Elementos técnicos órfãos encontrados: `reservedIdentifiers` (C3) e
  `warnings` (C6). O restante do contrato (staging, report, hashes, seed efetiva) tem fonte em
  requisito ou risco declarado.
- **POC:** os 14 ACs mapeiam para os 9 itens do plano sem ciclo; candidatos restritos a três por
  union type fecham a porta à abstração especulativa (AC2). Nenhum elemento órfão encontrado.

## Decisão sugerida

- **POC:** [D] discutir/resolver a Open question 1 (threshold) e aprovar a spec — os achados P1–P5
  podem ser absorvidos pelo step do plano item 1 (protocolo) sem nova rodada de spec.
- **Core:** [R] revisar C1–C3 (e opcionalmente C4–C7) durante a janela em que a spec já está
  bloqueada pelo POC; nada disso atrasa o POC.
- **ADR:** manter `Proposed`; nenhuma ação além do alinhamento C7 (na spec, não no ADR).
