# Benchmark de proteção JS/TS — discovery corrigido

> **Status:** POC oficial executado em 2026-08-09; protocolo de eficácia adversarial considerado
> inconclusivo após revisão do harness. ADR 002 mantém a orquestração OSS como decisão de
> simplicidade, sem aceitar a medição de 0 pp como evidência de resistência.
>
> **Objetivo:** registrar capacidades documentadas, evidência disponível e lacunas. A matriz oficial
> do [POC comparativo de polimorfismo](specs/js-condom-polymorphism-poc.md) foi executada; este
> documento reflete os resultados sem extrapolar a evidência.

## 1. Método e níveis de evidência

O benchmark anterior misturava capacidade de produto, marketing de fornecedor, popularidade e
eficácia defensiva como se fossem evidências equivalentes. Esta versão usa a seguinte taxonomia:

| Tag | Significado | Pode decidir arquitetura? |
|---|---|---|
| `[VERIFIED]` | Comportamento confirmado em documentação ou código-fonte oficial, com data de acesso | Sim, para comportamento da ferramenta/API |
| `[DISCOVERY INPUT]` | Fato fornecido como premissa do produto, ainda sem artefato reproduzível neste repositório | Não sozinho; deve virar experimento versionado |
| `[VENDOR CLAIM]` | Alegação comercial do fabricante sobre eficácia ou resistência | Não |
| `[HEURISTIC]` | Inferência técnica ou experiência, sem experimento controlado | Não para decisão irreversível |
| `[UNVERIFIED]` | Claim sem fonte primária suficiente ou medição local | Não |
| `[CONFLICT]` | Fontes ou trechos primários incompatíveis | Não até reconciliação |

Stars, downloads, lista de clientes e preço podem informar adoção ou aquisição, mas não medem
resistência. Eles foram removidos da matriz arquitetural.

### Regras de interpretação

1. Capacidade documentada não prova eficácia contra engenharia reversa.
2. Output diferente entre builds não prova, por si só, maior custo de reversão.
3. Crash ou timeout de um desofuscador não prova irreversibilidade.
4. Ausência de decompilador público conhecido não prova impossibilidade de decompilação.
5. Claims de proteção contra LLM exigem modelo, versão, prompt, budget, corpus e repetições.
6. Todo resultado de segurança deve preservar semântica; código quebrado não é código protegido.

## 2. Baseline factual: transforms AST tradicionais

O `javascript-obfuscator` free documenta as seguintes capacidades:

- renomeação de identificadores;
- string array com encoding base64 ou RC4;
- control flow flattening;
- dead code injection;
- self-defending;
- debug protection;
- domain lock;
- numbers to expressions;
- source maps;
- PRNG configurável por `seed`.

`[VERIFIED: README oficial do branch master, acesso em 2026-08-09]`

A documentação oficial também alerta que:

- o output continua sendo JavaScript;
- a combinação de opções pode aumentar significativamente tamanho e custo de runtime;
- o projeto cita degradação de 15–80%, dependente das opções;
- `selfDefending` força output compacto e alterações posteriores podem quebrar o código;
- debug protection pode congelar DevTools/browser;
- certas opções de rename podem quebrar o programa.

`[VERIFIED: README oficial do branch master, acesso em 2026-08-09]`

### Reversibilidade

O repositório oficial do `webcrack` declara que a ferramenta desofusca output do obfuscator.io,
além de unminify e unpack de bundles webpack/browserify.

`[VERIFIED: repositório oficial do webcrack, acesso em 2026-08-09]`

O discovery do produto estabelece como premissa que as oito transforms AST do free são revertidas
por `webcrack` em segundos, incluindo que self-defending não impede a ferramenta e domain lock é
bypassável removendo a condição.

`[DISCOVERY INPUT: ainda sem corpus, versões, comandos, artefatos e tempos registrados neste repo]`

Conclusão válida para planejamento: as transforms tradicionais não podem ser apresentadas como
barreira forte até que um experimento demonstre o contrário. Conclusão inválida: afirmar que cada
transform, isoladamente e em qualquer configuração, foi cientificamente medida como reversível em
segundos.

## 3. Randomização, diversidade e polimorfismo

### 3.1 O que o free já oferece

O `javascript-obfuscator` documenta `seed: 0` como execução do gerador aleatório sem seed fixa. A
ferramenta também possui shuffle/rotate de string array, thresholds probabilísticos e escolhas
aleatórias de encoding/layout.

`[VERIFIED: documentação oficial da opção seed e string array, acesso em 2026-08-09]`

Portanto, são incorretas as claims absolutas de que o free:

- gera sempre output determinístico;
- não consegue produzir output diferente entre builds;
- não expõe qualquer controle de seed ou randomização.

### 3.2 O que a matriz oficial mediu

A matriz oficial (`official-2026-08-09`, reexecutada após correção de exports ESM) comparou
`oss-baseline`, `oss-extension` e `own-minimal` sob protocolo congelado. A revisão posterior
classificou a eficácia adversarial como `evidencia-insuficiente`: o evaluator primário desabilitou
`deobfuscate` e `unpack` no `webcrack` e validou apenas a execução do resultado.

- Semântica: **144/144** células candidatas válidas; calibração 4/4.
- Endpoint primário publicado: **100%** conclusão em baseline, `oss-extension` e `own-minimal` —
  **não válido como medição de recuperação**, porque a etapa de desofuscação foi desabilitada.
- A escolha de orquestração OSS é uma decisão de simplicidade e ausência de evidência favorável a
  uma engine própria; não é prova de eficácia relativa.
- Anti-LLM: **inconclusivo** — 480 trials foram registrados com `maxToolInvocations: 0`, sem
  chamadas ao modelo.

Claims **não** sustentadas pelo POC:

- polimorfismo defensivo como diferencial de produto;
- fork ou engine própria superam baseline adversarial no corpus oficial;
- anti-LLM reduz recuperação no protocolo congelado.

Fonte: [`experiments/official/report.md`](experiments/official/report.md) (2026-08-09T18:47:03Z).

### 3.3 Definição operacional para o projeto

Neste projeto, usar os termos de forma separada:

- **randomização:** escolhas controladas por PRNG que podem variar o output;
- **diversidade estrutural:** diferença de tokens/AST entre builds depois de normalização;
- **resistência adversarial:** redução mensurada de tarefas de recuperação concluídas sob protocolo
  e budget predefinidos;
- **polimorfismo defensivo:** diversidade estrutural que também demonstra resistência adversarial,
  sem divergência semântica.

Somente o último pode sustentar o diferencial de produto.

## 4. VM customizada, V8 cached data e Bytenode

Esses mecanismos não são equivalentes.

### 4.1 VM customizada comercial

Obfuscator.io Pro documenta compilação de funções para bytecode próprio executado por uma VM
embutida, com opcodes/estrutura por build. O acesso ocorre por API Pro com token e assinatura; a
tabela oficial marca a operação Pro como não offline.

`[VERIFIED: README oficial do javascript-obfuscator, acesso em 2026-08-09]`

Claims de “proteção mais forte”, anti-decompilation e resistência anti-LLM são declarações do
fornecedor, não resultados independentes deste projeto.

`[VENDOR CLAIM]`

Consequência: VM Pro não atende à restrição de produto 100% offline, salvo oferta diferente
explicitamente verificada no futuro.

### 4.2 `vm.Script.createCachedData()`

Node.js documenta `createCachedData()` como criação de code cache que pode ser fornecido ao
construtor de `vm.Script` junto do source correspondente. O cache serializa metadados conhecidos
pelo V8, pode conter funções ainda marcadas para compilação lazy e pode ser rejeitado pelo runtime.

`[VERIFIED: Node.js v26.7.0, acesso em 2026-08-09]`

Consequência: essa API não especifica sozinha um `.jsc` autônomo nem um módulo carregável por
`require()`. Implementar esse contrato exige wrapping, dummy source, loader e validação adicionais.

### 4.3 Bytenode

Bytenode documenta:

- geração de bytecode V8 e arquivos `.jsc`;
- wrapping de módulos e loader próprio;
- necessidade de executar `.jsc` com a mesma versão de Node usada na compilação;
- quebra de código dependente de `Function.prototype.toString`;
- problemas documentados com arrow functions em Puppeteer/Electron;
- em Electron recente, necessidade de compilar no mesmo process type que carregará o bytecode.

`[VERIFIED: README oficial do Bytenode, acesso em 2026-08-09]`

O README afirma simultaneamente que o `.jsc` deve usar a “same architecture” e que é
“CPU-agnostic”, com possíveis sanity checks de CPU. Isso não basta para garantir portabilidade
x86/ARM sem teste do artefato e runtime alvo.

`[CONFLICT: README oficial do Bytenode, seção require/compatibility, acesso em 2026-08-09]`

Consequência: portabilidade entre arquiteturas permanece requisito de teste, não fato aceito para
o contrato do `js-condom`.

### 4.4 Outras alternativas relevantes

`js-confuser` é MIT e documenta variable renaming, control-flow obfuscation, string concealing,
function obfuscation, domain/date locks e detecção de alterações.

`[VERIFIED: repositório oficial do js-confuser, acesso em 2026-08-09]`

Não há resultado adversarial reproduzível comparando `js-confuser` ao `javascript-obfuscator` neste
repositório; eficácia relativa permanece `[UNVERIFIED]`. `javascript-obfuscator` foi mantido como
baseline operacional da rodada mínima por transforms AST, seed configurável e integridade npm no
manifest. Comparação direta com `js-confuser` exige rodada separadamente aprovada.

PreEmptive JSDefender documenta um produto comercial de proteção JavaScript. Claims de força,
anti-tamper e resistência pertencem ao fornecedor e não foram medidas neste repositório.

`[VENDOR CLAIM: página oficial do JSDefender, acesso em 2026-08-09]`

Ele não é candidato de implementação da v1 open source; permanece referência comercial.

## 5. Matriz de capacidades e evidência

| Alternativa | Offline | Output variável documentado | Bytecode | Eficácia medida neste repo | Papel atual |
|---|---:|---:|---:|---:|---|
| `javascript-obfuscator` free | Sim | Sim, PRNG/seed e opções aleatórias | Não | Não medido de forma válida neste POC | Baseline operacional da v1 |
| `js-confuser` | Sim | Opções/transforms documentadas; variabilidade a medir | Não | Não medido | Alternativa OSS; fora da rodada mínima |
| Fork/extensão OSS | Sim | Medido no POC | Não | Inconclusivo; semântica válida | **Não selecionada** |
| Engine própria mínima TS | Sim | Medido no POC | Não | Inconclusivo; semântica válida | **Não selecionada** |
| Engine própria Rust/Wasm | Sim em tese | Não medido | Não por si só | Não | Consideração futura condicionada |
| Bytenode | Sim | Não é objetivo primário | V8 cached data + loader | Não para resistência | Adapter futuro Node/Electron |
| Obfuscator.io Pro | Não, segundo tabela oficial | Sim, VM/opcodes | VM customizada | Não | Fora da restrição offline |
| Jscrambler | Oferta comercial | Vendor claim | Técnicas proprietárias | Não | Referência de mercado, não baseline técnico |

“Sim em tese” para Rust/Wasm significa que o mecanismo pode operar localmente; não significa que
performance, compatibilidade ou distribuição já foram comprovadas.

## 6. Threat model derivado do discovery

### Atacante assumido

- possui o artefato protegido e pode executá-lo/depurá-lo;
- conhece o código completo da engine open source;
- pode gerar múltiplos outputs da ferramenta e adaptar normalizadores;
- usa beautifier, AST, `webcrack`, instrumentação runtime, análise manual e LLM;
- não precisa recuperar nomes originais para recuperar regra de negócio.

### Consequências

- segurança não pode depender do segredo do algoritmo ou da seed;
- diversidade entre builds reduz potencialmente o reuso de assinaturas, mas não elimina análise do
  build atual;
- string encoding não protege segredo disponível em runtime;
- domain lock e anti-debug são dissuasão operacional, não boundary de segurança;
- source maps entregues junto do artefato anulam parte relevante da proteção;
- qualquer claim de “irreversível” é inadequada para JavaScript executável pelo adversário.

## 7. Direção recomendada

### POC concluído

A matriz oficial (`official-2026-08-09`) foi executada. Artefatos:

- [`experiments/official/manifest.json`](experiments/official/manifest.json)
- [`experiments/official/report.md`](experiments/official/report.md)
- [`experiments/official/results.json`](experiments/official/results.json)
- [`experiments/official/blinding-map.json`](experiments/official/blinding-map.json)

O relatório permanece como artefato histórico, mas sua conclusão de eficácia foi reclassificada
como `evidencia-insuficiente` pelo ADR 002.

### Depois do POC — estado atual

- **ADR 002 `Accepted`:** orquestrar `javascript-obfuscator` free como wrapper operacional, sem fork nem engine própria.
- Fork/extensão e engine própria: não selecionadas por simplicidade; eficácia relativa inconclusiva.
- **Polimorfismo defensivo não demonstrado** → não fazer essa claim.
- Spec do core: **bloqueada** para Atomic Steps (AC14 / OQ2–4 pendentes).
- Bytenode: spec separada; não decide arquitetura frontend.

### Próximos passos de produto (não implementação imediata do core)

1. Aprovar a spec de correção e reformular o Goal do core para operação offline, reprodução e
   auditabilidade.
2. Fazer nova rodada somente se resistência adversarial continuar sendo requisito de produto.

## 8. O que este benchmark não conclui

- Não conclui que polimorfismo derrota LLMs.
- Não conclui que Rust/Wasm é mais rápido ou mais seguro.
- Não conclui que free, fork ou engine própria resistem a um atacante white-box.
- Não conclui que Bytenode é portável entre arquiteturas sem teste.
- Não conclui que ausência de decompilador público torna bytecode irreversível.
- Não autoriza implementação do core com claim de proteção: o endpoint publicado é inconclusivo;
  o ADR 002 aceita apenas a orquestração OSS como decisão operacional de menor complexidade.

## 9. Fontes primárias consultadas

Todas acessadas em 2026-08-09:

- [`javascript-obfuscator` — capacidades free, seed, source maps, limites e Pro API](https://github.com/javascript-obfuscator/javascript-obfuscator)
- [`js-confuser` — capacidades e licença](https://github.com/MichaelXF/js-confuser)
- [`webcrack` — escopo declarado](https://github.com/j4k0xb/webcrack)
- [Node.js v26.7.0 — `vm.Script.createCachedData()`](https://nodejs.org/api/vm.html#scriptcreatecacheddata)
- [Node.js — calendário de releases](https://nodejs.org/en/about/previous-releases)
- [Bytenode — loader, compatibilidade e limitações](https://github.com/bytenode/bytenode)
- [Jscrambler — claims de proteção polimórfica e LLM](https://jscrambler.com/llm-resilient-code-protection/)
- [PreEmptive JSDefender — claims de produto](https://www.preemptive.com/products/jsdefender/)
- [Relatório oficial do POC](experiments/official/report.md) — matriz `official-2026-08-09`
- [Resultados completos](experiments/official/results.json)
- [Manifest oficial](experiments/official/manifest.json)
- [Mapa de blinding](experiments/official/blinding-map.json)

## 10. Lacunas — estado após matriz oficial

| Claim | Estado atual | Evidência / próximo passo |
|---|---|---|
| As oito transforms free são revertidas em segundos | `[DISCOVERY INPUT]` | Tempos absolutos ainda não registrados neste repo |
| Diversidade nativa do free não basta | **Inconclusivo** | evaluator primário não executou desofuscação; corrigir harness se a claim permanecer |
| Fork acrescenta resistência material | **Inconclusivo** | semântica 144/144, mas endpoint de recuperação inválido |
| Engine própria supera fork | **Inconclusivo** | semântica válida, sem comparação adversarial causal |
| `javascript-obfuscator` vs `js-confuser` | **Não medido** | `javascript-obfuscator` permanece baseline operacional; comparação de eficácia exige rodada própria |
| Polimorfismo reduz sucesso de LLM | **Inconclusivo** | 0/480 trials fizeram chamada; `maxToolInvocations: 0` |
| Rust/Wasm atende performance de arquivos grandes | `[UNVERIFIED]` | Benchmark após necessidade arquitetural |
| `.jsc` funciona entre x86 e ARM | `[CONFLICT]` | Matriz de compilação/execução por runtime |
