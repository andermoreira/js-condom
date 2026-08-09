# Benchmark de proteção JS/TS — discovery corrigido

> **Status:** Discovery ativo, corrigido em 2026-08-09
>
> **Objetivo:** registrar capacidades documentadas, evidência disponível e lacunas que o
> [POC comparativo de polimorfismo](specs/js-protect-polymorphism-poc.md) deve resolver. Este
> documento não aprova arquitetura.

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

### 3.2 O que continua não demonstrado

O termo “polimorfismo” é usado comercialmente para propriedades mais fortes do que trocar nomes e
embaralhar arrays. Obfuscator.io Pro afirma gerar opcodes e estrutura de VM únicos por build;
Jscrambler afirma produzir outputs únicos e resistentes a reconhecimento automatizado/LLM.

`[VENDOR CLAIM: páginas oficiais dos fornecedores, acesso em 2026-08-09]`

Não há, neste repositório, experimento que demonstre que:

- diversidade do free aumenta materialmente o custo de reversão;
- variantes adicionais em fork superam o free;
- uma engine própria supera fork/extensão;
- output único derrota análise de um único artefato por LLM;
- similaridade textual ou estrutural prediz tempo do atacante.

Todas essas claims permanecem `[UNVERIFIED]` até o POC.

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
o contrato do `js-protect`.

### 4.4 Outras alternativas relevantes

`js-confuser` é MIT e documenta variable renaming, control-flow obfuscation, string concealing,
function obfuscation, domain/date locks e detecção de alterações.

`[VERIFIED: repositório oficial do js-confuser, acesso em 2026-08-09]`

Não há resultado adversarial reproduzível deste projeto comparando `js-confuser` ao
`javascript-obfuscator`; eficácia relativa permanece `[UNVERIFIED]`. Ele não entra como quarto
candidato no POC inicial para preservar a comparação mínima já definida, mas o relatório final
deve justificar por que o baseline escolhido representa melhor a ameaça ou recomendar uma rodada
adicional. Ignorá-lo sem justificativa deixaria a análise de alternativas incompleta.

PreEmptive JSDefender documenta um produto comercial de proteção JavaScript. Claims de força,
anti-tamper e resistência pertencem ao fornecedor e não foram medidas neste repositório.

`[VENDOR CLAIM: página oficial do JSDefender, acesso em 2026-08-09]`

Ele não é candidato de implementação da v1 open source; permanece referência comercial.

## 5. Matriz de capacidades e evidência

| Alternativa | Offline | Output variável documentado | Bytecode | Eficácia medida neste repo | Papel atual |
|---|---:|---:|---:|---:|---|
| `javascript-obfuscator` free | Sim | Sim, PRNG/seed e opções aleatórias | Não | Não | Baseline obrigatório |
| `js-confuser` | Sim | Opções/transforms documentadas; variabilidade a medir | Não | Não | Alternativa OSS excluída do POC inicial com justificativa pendente |
| Fork/extensão OSS | Sim | A implementar no POC | Não | Não | Candidato recomendado |
| Engine própria mínima TS | Sim | A implementar no POC | Não | Não | Candidato comparativo |
| Engine própria Rust/Wasm | Sim em tese | A implementar | Não por si só | Não | Consideração futura condicionada |
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

### Fase atual — evidência

Executar a spec [`js-protect-polymorphism-poc.md`](specs/js-protect-polymorphism-poc.md):

1. `javascript-obfuscator` free como baseline real, incluindo sua randomização nativa;
2. fork/extensão mínima como hipótese de menor complexidade;
3. transform própria mínima sobre parser existente;
4. 100% de equivalência semântica no subconjunto suportado;
5. recuperação medida por tarefas predefinidas, não aparência ou linhas;
6. relatório reproduzível antes de aceitar arquitetura.

### Depois do POC

- Se o fork/extensão atender ao threshold aprovado, adotá-lo na v1.
- Se apenas engine própria demonstrar ganho suficiente, aceitar sua complexidade em ADR atualizado.
- Se nenhuma alternativa demonstrar ganho, reformular a promessa de polimorfismo em vez de
  reimplementar transforms commodity.
- Tratar Bytenode em spec separada; não usá-lo para decidir arquitetura frontend.

## 8. O que este benchmark não conclui

- Não conclui que polimorfismo derrota LLMs.
- Não conclui que Rust/Wasm é mais rápido ou mais seguro.
- Não conclui que free, fork ou engine própria resistem a um atacante white-box.
- Não conclui que Bytenode é portável entre arquiteturas sem teste.
- Não conclui que ausência de decompilador público torna bytecode irreversível.
- Não autoriza implementação do core antes do POC e do ADR aceito.

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

## 10. Lacunas a fechar pelo POC

| Claim | Estado atual | Evidência necessária |
|---|---|---|
| As oito transforms free são revertidas em segundos | `[DISCOVERY INPUT]` | Corpus, versões, comandos, artefatos e tempos |
| Diversidade nativa do free não basta | `[UNVERIFIED]` | Baseline adversarial sob recovery tasks |
| Fork acrescenta resistência material | `[UNVERIFIED]` | Comparação célula a célula contra baseline |
| Engine própria supera fork | `[UNVERIFIED]` | Mesma fatia funcional, corpus, seeds e budgets |
| `javascript-obfuscator` representa melhor baseline OSS que `js-confuser` | `[UNVERIFIED]` | Justificativa no relatório ou rodada adicional |
| Polimorfismo reduz sucesso de LLM | `[UNVERIFIED]` | Modelo/version/prompt/budget/repetições registrados |
| Rust/Wasm atende performance de arquivos grandes | `[UNVERIFIED]` | Benchmark após necessidade arquitetural demonstrada |
| `.jsc` funciona entre x86 e ARM | `[CONFLICT]` | Matriz de compilação/execução por runtime e arquitetura |
