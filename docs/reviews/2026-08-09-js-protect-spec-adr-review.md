# Revisão crítica — Spec e ADR do `js-protect`

**Data:** 2026-08-09

**Artefatos revisados:** `specs/js-protect-core.md`, `adr/001-engine-propria-vs-orquestracao.md` e `benchmark-js-protection.md`

> **Nota histórica:** os achados e números de linha registram os rascunhos anteriores à remediação
> iniciada em 2026-08-09. O ADR 001 e a spec do core foram alterados depois deste review; o estado
> corrente deve ser avaliado junto de `specs/js-protect-polymorphism-poc.md`.

Veredito: **reprovar a spec e manter o ADR como Proposed**. Engine própria pode continuar sendo a direção desejada, mas a justificativa atual não prova que ela entrega proteção superior ao OSS existente.

## Achados

### Crítico

1. **[`adr/001-engine-propria-vs-orquestracao.md:22`](../../adr/001-engine-propria-vs-orquestracao.md) — A premissa “free não oferece polimorfismo” usa uma definição incompatível com a própria spec.** A spec define polimorfismo como variar nomes, layout de strings e blocos por build ([`specs/js-protect-core.md:54`](../../specs/js-protect-core.md), [`specs/js-protect-core.md:366`](../../specs/js-protect-core.md)), mas o `javascript-obfuscator` free já possui `seed: 0` não determinística, shuffle/rotate aleatórios e escolhas probabilísticas. [VERIFIED: documentação oficial do projeto](https://github.com/javascript-obfuscator/javascript-obfuscator#seed). Consequência: “engine própria é o único caminho” em [`adr/001-engine-propria-vs-orquestracao.md:51-52`](../../adr/001-engine-propria-vs-orquestracao.md) e [`adr/001-engine-propria-vs-orquestracao.md:74-77`](../../adr/001-engine-propria-vs-orquestracao.md) não se sustenta. Correção: definir o que “polimorfismo real” acrescenta além da randomização free e executar um POC comparando, no mínimo, OSS sem seed, fork/extensão do OSS e engine própria.

2. **[`specs/js-protect-core.md:5`](../../specs/js-protect-core.md) — A principal promessa de segurança não possui teste causal.** O benchmark classifica polimorfismo como “Muito Alta” ([`benchmark-js-protection.md:20`](../../benchmark-js-protection.md)), mas a evidência concreta usada é marketing do fornecedor em [`benchmark-js-protection.md:78-80`](../../benchmark-js-protection.md); não há experimento mostrando que este polimorfismo proposto eleva custo de reversão ou impede LLMs. Um atacante analisa um artefato por vez; diversidade entre releases reduz reuso de assinaturas, mas não prova resistência daquele artefato. A alegação continua `[UNVERIFIED]`. Correção: definir adversário, ferramentas, corpus, orçamento e medir tempo/taxa de recuperação contra `webcrack`, análise manual e LLM; diversidade sintática não pode ser proxy do resultado de segurança.

3. **[`specs/js-protect-core.md:369`](../../specs/js-protect-core.md) — `vm.Script.createCachedData()` não implementa sozinho um `.jsc` importável por `require()`.** A API produz cache de compilação para ser reapresentado ao construtor junto do código-fonte, podendo ainda ser rejeitado pelo V8; não é um formato autônomo de módulo. [VERIFIED: documentação do Node.js](https://nodejs.org/api/vm.html#scriptcreatecacheddata). O Bytenode precisa de dummy source, `Module.wrap`, loader e registro de extensão para oferecer esse comportamento. [VERIFIED: README do Bytenode](https://github.com/bytenode/bytenode#bytenodecompilefileargs-output--promisestring). Consequência: US3, AC8 e a rejeição do híbrido em [`adr/001-engine-propria-vs-orquestracao.md:65-67`](../../adr/001-engine-propria-vs-orquestracao.md) repousam sobre uma implementação inexistente. Correção: adotar Bytenode na v1 ou especificar integralmente loader, wrapping CJS/ESM, dummy source, validação `cachedDataRejected` e compatibilidade por runtime.

4. **[`specs/js-protect-core.md:284`](../../specs/js-protect-core.md) — O critério de correção aceita quebrar até 5% do corpus.** AC6 repete `≥95%` em [`specs/js-protect-core.md:334`](../../specs/js-protect-core.md), permitindo que 2–3 dos 50 arquivos produzam comportamento incorreto, embora quebra semântica seja risco crítico. “Equivalência semântica” também não tem oracle definido para tempo, aleatoriedade, I/O ou efeitos colaterais. Correção: exigir 100% no subconjunto oficialmente suportado, falha fechada para construções não suportadas e um protocolo diferencial com saídas, exceções, efeitos e timeouts observáveis.

### Alto

5. **[`specs/js-protect-core.md:356-372`](../../specs/js-protect-core.md) — A rastreabilidade bidirecional está quebrada.**

| Elemento | Defeito |
|---|---|
| US2, proteção seletiva ([`specs/js-protect-core.md:29-32`](../../specs/js-protect-core.md)) | Não possui AC, campo de configuração nem item no plano. |
| API para Browser/Electron ([`specs/js-protect-core.md:7`](../../specs/js-protect-core.md)) | Não há contrato de carregamento Wasm, exports condicionais ou AC por runtime. |
| Fallback `napi-rs` ([`specs/js-protect-core.md:77`](../../specs/js-protect-core.md)) | Mitigação de risco sem AC ou trabalho responsável. |
| Attestation/checksums ([`specs/js-protect-core.md:85`](../../specs/js-protect-core.md)) | Mitigação de supply chain não aparece no plano nem no aceite. |
| Rspack, `wasm-bindgen`, `clipanion/commander` ([`specs/js-protect-core.md:367-370`](../../specs/js-protect-core.md)) | Dependências/capabilities concretas sem requisito ou ADR de origem. |
| `process.emit` ([`specs/js-protect-core.md:274`](../../specs/js-protect-core.md)) | Nova superfície pública, incompatível com browser, sem AC ou item de implementação. |
| Limite de 50 MB ([`specs/js-protect-core.md:250`](../../specs/js-protect-core.md)) | Restrição inventada, sem baseline de memória ou configuração. |

Consequência: há scope creep e requisitos órfãos. Correção: adicionar matriz `Requirement/Constraint → AC → Plan`, retirar itens sem origem e criar trabalho explícito para cada requisito mantido.

6. **[`specs/js-protect-core.md:287`](../../specs/js-protect-core.md) — “<5% de linhas idênticas” não mede polimorfismo nem segurança.** Com `compact: true` em [`specs/js-protect-core.md:235`](../../specs/js-protect-core.md), cada output tende a ter uma única linha, tornando o resultado praticamente 0% ou 100%; whitespace também permite vencer o gate sem alterar estrutura. “Nenhum layout compartilhado” não tem algoritmo de comparação. Correção: usar AST normalizada, similaridade de tokens/n-gramas, tree-edit distance e, sobretudo, sucesso/custo de desofuscação após normalização.

7. **[`specs/js-protect-core.md:308-314`](../../specs/js-protect-core.md) — Transforms derrotadas pelo benchmark continuam apresentadas como mitigação efetiva.** Name mangling, flattening, dead code, debug protection e string array aparecem vinculadas diretamente às ameaças, embora a própria spec admita em [`specs/js-protect-core.md:80`](../../specs/js-protect-core.md) que a camada AST é revertida. Além disso, `base64` em [`specs/js-protect-core.md:201-204`](../../specs/js-protect-core.md) é codificação reversível, não “encryption”. Consequência: presets podem transmitir força inexistente. Correção: classificar essas transforms como dissuasão/custo marginal, renomear base64 para encoding e medir contribuição incremental de cada preset.

8. **[`specs/js-protect-core.md:81`](../../specs/js-protect-core.md) — A spec confunde determinismo com validade de source map.** Um build aleatório pode gerar seu próprio mapa correto; seed fixa é necessária para reproduzir o artefato, não para mapear aquele build. A API também recebe apenas uma string e não possui `inputFileName` ou source map anterior ([`specs/js-protect-core.md:123-145`](../../specs/js-protect-core.md)), portanto não consegue compor o mapa até o TS original. `inline` pode ainda embutir o fonte no artefato distribuído. Correção: separar mapa por build de reprodução por seed, aceitar `inputFileName`/`inputSourceMap`, definir composição e proibir source maps inline em release por padrão.

9. **[`specs/js-protect-core.md:63-68`](../../specs/js-protect-core.md) — O domínio sintático e de runtime não está definido.** A entrada é “ES2015+”, o risco fala em ES2022+, a qualidade promete “100% de AST features ES2015–ES2022”, o produto se apresenta como JS/TS e a CLI diz operar apenas em bundles. Não há matriz para ESM/CJS, JSX, decorators, top-level `await`, import dinâmico ou propostas posteriores a ES2022. Correção: publicar uma matriz de sintaxe/módulos/runtime por parser e transformar qualquer construção fora dela em erro explícito, nunca output parcial.

10. **[`specs/js-protect-core.md:360-366`](../../specs/js-protect-core.md) — Casos semanticamente perigosos não têm política.** Name mangling e flattening podem alterar programas que dependem de `eval`, `with`, reflexão, nomes de funções/classes ou `Function.prototype.toString`; bytecode já tem quebra documentada para `toString` e arrow functions em Electron. [VERIFIED: limitações oficiais do Bytenode](https://github.com/bytenode/bytenode#known-issues-and-limitations). Correção: detectar essas construções, definir `reject/skip/unsafe opt-in` por transform e incluí-las no corpus de regressão.

11. **[`specs/js-protect-core.md:292-315`](../../specs/js-protect-core.md) — O threat model omite o cenário mais forte: o atacante conhece integralmente a engine open source.** Também faltam source-map leakage, input malicioso causando exaustão de CPU/memória, ReDoS em `reservedNames`, symlink/path overwrite, CSP/browser sem `eval` e DoS causado por anti-debug. A configuração aceita regex externas em [`specs/js-protect-core.md:139-142`](../../specs/js-protect-core.md), enquanto não há limites. Correção: assumir white-box, adicionar trust boundaries build-time/runtime e controles de recursos, paths, regex, CSP e distribuição do Wasm.

12. **[`adr/001-engine-propria-vs-orquestracao.md:38-67`](../../adr/001-engine-propria-vs-orquestracao.md) — As alternativas não são comparadas de forma justa.** O ADR contrapõe wrapper sem modificação a reimplementação completa, omitindo fork/extensão do `javascript-obfuscator`, transform customizada sobre parser existente e POC em JS; a alternativa C é majoritariamente uma decisão de backend, não uma alternativa ao motor frontend. O benefício “base para VM/anti-LLM futuras” em [`adr/001-engine-propria-vs-orquestracao.md:53-54`](../../adr/001-engine-propria-vs-orquestracao.md) é scope creep futuro. Correção: incluir extensão/fork como alternativa e avaliar esforço, licenciamento, performance, cobertura sintática e ganho de reversão com a mesma matriz.

13. **[`adr/001-engine-propria-vs-orquestracao.md:101-106`](../../adr/001-engine-propria-vs-orquestracao.md) — Os gatilhos de reabertura são incoerentes e não falsificáveis.** Falha de performance do Wasm no frontend não é corrigida por adotar Bytenode no backend; “eleva materialmente o custo” não define adversário, unidade ou threshold. Correção: separar gatilhos — performance por runtime, taxa de quebra semântica, custo de manutenção e aumento mensurado de tempo/taxa de reversão.

14. **[`specs/js-protect-core.md:282-288`](../../specs/js-protect-core.md) — p95, overhead e thresholds foram fixados sem baseline.** “M1/M2 ou equivalente x86” não define CPU, memória, versão, warm-up, I/O, amostragem ou quantidade de execuções; o ADR usa esse número inventado como gate. Correção: mover os valores para hipótese do POC, registrar hardware/protocolo/baseline e só então promovê-los a AC.

15. **[`specs/js-protect-core.md:64`](../../specs/js-protect-core.md) — Node 18 não é LTS ativo em 2026.** Está EOL desde março de 2025. [VERIFIED: calendário oficial do Node.js](https://nodejs.org/en/about/previous-releases). Além disso, `engines` não garante que compilação e execução do bytecode usem versão/V8 idênticos. Correção: suportar linhas LTS mantidas, embutir metadados exatos de Node/V8/process type no `.jsc` e validar no loader.

### Médio

16. **[`specs/js-protect-core.md:123-182`](../../specs/js-protect-core.md) — API, config e CLI divergem.** `seed?: number` conflita com `"seed": null`; `polymorphic.enabled` pode desligar o diferencial sem semântica definida; `CompileOptions.compress` não aparece no CLI/AC; `Buffer` impede contrato browser; `compile --bytecode` duplica comando e flag. Correção: definir um modelo canônico de opções, validação/ranges, defaults e projeção explícita para CLI, Node, browser e Electron.

17. **[`specs/js-protect-core.md:246-258`](../../specs/js-protect-core.md) — Processamento de diretório não possui semântica de falha.** Não se sabe se um parse error após dez arquivos deixa output parcial, se escrita é atômica, como tratar colisões, symlinks, permissões, arquivos removidos em watch ou input=output. Correção: especificar staging/rename atômico, cleanup, política fail-fast versus relatório agregado e preservação da árvore.

18. **[`specs/js-protect-core.md:274`](../../specs/js-protect-core.md) — As “métricas” não têm mecanismo coerente de consumo.** `process.emit` é efeito global Node-only, pode colidir com aplicações e não existe no browser; nomes de métricas não equivalem a exporter. Correção: manter `stats` no resultado e, se necessário, definir callback/event emitter próprio como requisito separado.

19. **[`specs/js-protect-core.md:320-323`](../../specs/js-protect-core.md) — A política de SemVer confunde contrato público com bytes gerados.** Qualquer ajuste de transform virar MAJOR impediria evolução defensiva, enquanto o AC de determinismo não delimita versão, parser, plataforma e configuração. Correção: prometer byte-identidade apenas para versão/config/runtime fixos e reservar MAJOR para quebra de API/config ou semântica documentada.

20. **[`benchmark-js-protection.md:169-176`](../../benchmark-js-protection.md) — A conclusão do discovery é internamente contraditória.** Ela recomenda frontend free “com custo zero e sem API externa”, mas diz que “com VM fica sólido”; o próprio benchmark registra que VM é Pro, paga e cloud-only em [`benchmark-js-protection.md:36-43`](../../benchmark-js-protection.md). Correção: separar claramente solução zero-cost/free da solução Pro/cloud e refazer a matriz econômica.

21. **[`specs/js-protect-core.md:376`](../../specs/js-protect-core.md) — O estado documental viola a própria sequência do processo.** A spec diz aguardar aprovação “para avançar para ADR”, embora o ADR já exista, e o ADR não declara status, data ou supersessão. Correção: marcar ambos como `Proposed`, realizar os POCs bloqueantes e só então registrar aceite; ADR aceita não deve depender de open questions que podem invalidá-la.

### Baixo

22. **[`specs/js-protect-core.md:256`](../../specs/js-protect-core.md) — O erro runtime “auto-defendendo” não possui código, contrato nem vínculo com o CLI.** Isso contradiz a tabela de erros estáveis e AC11. Correção: definir se é comportamento do código gerado ou da ferramenta, além de tipo, observabilidade e teste próprios.

## O que está bem-feito

- A spec explicita corretamente que ofuscação não é criptografia e que secrets não pertencem ao frontend ([`specs/js-protect-core.md:16`](../../specs/js-protect-core.md), [`specs/js-protect-core.md:69`](../../specs/js-protect-core.md)).
- As limitações de domain lock e self-defending não são escondidas ([`specs/js-protect-core.md:309-311`](../../specs/js-protect-core.md)).
- Seed efetiva no resultado é uma boa base para reprodução, embora ainda falte um manifesto de release ([`specs/js-protect-core.md:156-164`](../../specs/js-protect-core.md)).
- O ADR reconhece honestamente que as oito transforms isoladas não superam o free ([`adr/001-engine-propria-vs-orquestracao.md:55-58`](../../adr/001-engine-propria-vs-orquestracao.md)).

## Nota final: 34/100

- Rastreabilidade: **12/30**
- Consistência factual: **7/25**
- Coerência interna: **6/15**
- Qualidade da decisão ADR: **4/15**
- Qualidade, riscos e threat model: **5/15**

Não discordo de engine própria como aposta estratégica. Discordo de registrá-la como decisão sustentada: hoje o ADR confunde randomização já disponível no free com polimorfismo defensivo ainda não definido, não mede aumento de custo de reversão e rejeita a alternativa híbrida com base em uma implementação incorreta de V8 cached data.
