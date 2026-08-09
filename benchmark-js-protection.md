# Benchmark de Ferramentas de Proteção JS/TS — Agosto/2026

> Pesquisa baseada em dados públicos, documentação oficial, npm stats e GitHub.

---

## 1. Técnicas de Proteção (Taxonomia)

| Técnica                                    | Dificuldade de Reversão       | Impacto Perf.           |
| ------------------------------------------ | ----------------------------- | ----------------------- |
| Minificação (Terser/esbuild)               | Trivial (beautifier)          | Nenhum-negativo (reduz) |
| Name Mangling (renomear vars/funções)      | Baixa (manual)                | Nenhum                  |
| String Encryption (base64/RC4)             | Baixa-média (webcrack derrota) | Baixo                   |
| Control Flow Flattening                    | Média                         | 1.5x mais lento         |
| Dead Code Injection                        | Média                         | Baixo-médio (+200% tamanho) |
| Self-Defending (anti-beautify)             | Média                         | Baixo                   |
| Debug Protection (anti-DevTools)           | Média                         | Baixo                   |
| Domain/Date Locking                        | Baixa (basta bypassar if)     | Nenhum                  |
| VM Bytecode (ofuscador.io Pro)             | Alta                           | 10-12x mais lento       |
| Polymorphic Obfuscation                    | Muito Alta                     | Médio                   |
| Anti-LLM Defenses                          | Muito Alta                     | Médio-alto              |
| bytenode (V8 bytecode nativo)              | Alta (sem decompilador público) | Aprox. nativo        |

---

## 2. Comparativo das Ferramentas

### 2.1 javascript-obfuscator (obfuscator.io)

- **Tipo**: Open source (free) + Pro API (pago)
- **Stars**: 16.2k GitHub
- **npm**: ~1M downloads/semana
- **Licença**: BSD-2-Clause
- **Versão**: 5.5.0
- **Técnicas (Free)**: name mangling, string array + base64/RC4, control flow flattening, dead code injection, self-defending, debug protection, domain lock, números para expressões
- **Técnicas (Pro - obfuscator.io)**: VM bytecode obfuscation com opcodes customizados, bytecode encryption, anti-hooking, anti-LLM, bytecode encoding, stateful opcodes, macro ops, decoy opcodes, stack encoding, runtime opcode derivation, jumps encoding
- **Integração**: Webpack, esbuild, Vite, Rollup, Gulp, Grunt, Netlify
- **Reversibilidade (Free)**: `webcrack` (9.6k downloads/sem) reverte em segundos
- **Reversibilidade (Pro VM)**: Não há desofuscador automatizado público. Segundo o site, exige "semanas de esforço dedicado". Claude Opus 4.7 reportado como incapaz de reverter com VM Self Defending ativo
- **Perf (Free)**: 15-80% mais lento dependendo das opções
- **Perf (Pro VM)**: ~10x (low preset), ~12x (anti-LLM preset)
- **Preço (Pro)**: Planos a partir de ~$9/mês (Pro) — Precisa de API token
- **Ponto fraco**: Pro API é cloud-only (requer envio de código para servidor)

### 2.2 js-confuser

- **Tipo**: Open source (MIT)
- **Stars**: 515 GitHub
- **npm**: 22.4k downloads/semana
- **Versão**: 2.1.3
- **Manutenção**: Ativa (2 meses desde último publish)
- **Técnicas**: Variable renaming, control flow obfuscation, string concealing, function obfuscation, domain/date locks, integrity checks, generator-based control flow
- **Diferencial**: Usa funções geradoras (`function*`), `with` statements, e abusa de código gerado proceduralmente para ofuscar o fluxo
- **Reversibilidade**: Mais difícil que obfuscator.io free pela complexidade do código gerado, mas ainda é JavaScript legível por runtime. Sem defesas anti-LLM documentadas
- **Perf**: Significativo — gera muito código boilerplate (ex: Fibonacci vira centenas de linhas)
- **Limitação**: 4 dependências, comunidade pequena, sem plugins de bundler

### 2.3 bytenode

- **Tipo**: Open source (MIT)
- **npm**: 52k downloads/semana
- **Versão**: 1.6.0
- **Técnica**: Compila JS → V8 bytecode nativo (`.jsc`), mesmo mecanismo usado pelo Node.js internamente para caching
- **Segurança**: Não há decompilador público de V8 bytecode. Reverter exige engenharia reversa do serializador do V8. Código fonte original é completamente removido
- **Compatibilidade**: Precisa mesma versão Node.js para compilar e executar. CPU-agnóstico (bytecode é portável entre arquiteturas x86/ARM)
- **Limitações**:
  - Arrow functions quebram no Puppeteer/Electron
  - `Function.prototype.toString` não funciona (código fonte foi removido)
  - Electron >= 42 requer compilação no main process (`compileElectronMainCode`)
  - Não funciona em debug mode no Node 10.x
- **Perf**: Praticamente nativo (é bytecode V8 real, não emulado)
- **Ideal para**: Node.js backend, Electron (com `compileElectronMainCode`), CLI tools

### 2.4 Jscrambler (Enterprise)

- **Tipo**: Comercial SaaS/On-premise
- **Clientes**: Netflix, Airbnb, Booking.com, Nubank, Zara, Marriott, AXA, Epic Games, BT, KLM, Hermes, GAP, NBC
- **Técnicas**: Polymorphic obfuscation (cada build gera código único), control flow flattening, anti-debugging, anti-tampering, self-healing, code locks (browser/date/domain/OS), anti monkey-patching, code watermarking, runtime code protection, countermeasures
- **Diferencial**: Polimorfismo — mesmo código fonte gera outputs completamente diferentes a cada build, impossibilitando reconhecimento de padrões por LLMs
- **LLM-Resilient**: Explicitamente documentado e comercializado como proteção contra AI-assisted reverse engineering
- **Runtime Protection**: Detecta e neutraliza ataques em tempo real — vai além de só ofuscar, monitora tentativas de tampering/debugging em produção
- **Compliance**: PCI DSS v4, HIPAA, GDPR, EU AI Act, OWASP Top 10
- **Integração**: CI/CD, todos frameworks modernos (React, Vue, Angular, Next.js, etc.)
- **Preço**: Não público (enterprise, solicitar demo)
- **Ponto fraco**: Custo elevado, fornecedor externo, possível vendor lock-in

### 2.5 PreEmptive JSDefender

- **Tipo**: Comercial on-premise
- **Empresa**: PreEmptive (parte do grupo Sembi, mesma dona do TestRail, Ranorex)
- **Clientes**: Microsoft, Merrill Lynch, Barclays, Boeing, Symantec (+80% Fortune 500 usam alguma ferramenta PreEmptive)
- **Técnicas**: Layered obfuscation, control flow protection, function reordering, literal transformations, string extraction, domain/date locking, anti-debugging (DevTools blocking), tamper detection, runtime integrity checks
- **Diferencial**: On-premise (código nunca sai da sua infra), partial protection (inline directives), integração com bundlers (CLI + plugins)
- **Preço**: Free trial disponível + demo online
- **Compatibilidade**: React, Angular, Vue, Node.js
- **Ponto fraco**: Não menciona explicitamente anti-LLM ou VM obfuscation no mesmo nível do Jscrambler

### 2.6 Outras ferramentas notáveis

| Ferramenta          | Tipo        | Status                  | Notas                                                |
| ------------------- | ----------- | ----------------------- | ---------------------------------------------------- |
| pkg (Vercel)        | Open source | **Arquivado** (Jan 2024) | Compilava Node.js em binário standalone              |
| nexe                | Open source | Baixa manutenção        | Similar ao pkg, empacota Node.js + código em executável |
| bun compile         | Built-in    | Ativo                   | Compila para standalone binary, mas extrai JS em disco na execução |
| deno compile        | Built-in    | Ativo                   | Similar ao bun, snapshot V8 para executável único    |

---

## 3. Ferramentas de Desofuscação (Ameaça)

| Ferramenta          | Downloads/sem | Alvos                                                    |
| ------------------- | ------------- | -------------------------------------------------------- |
| **webcrack**        | 9.6k          | obfuscator.io free, webpack/browserify unpack, unminify, transpile |
| **de4js**           | Popular       | Múltiplos ofuscadores free                               |
| **synchrony**       | Nicho         | jsfuck, aaencode                                         |
| **Chrome DevTools** | Universal     | Debugger, pretty-print, breakpoints                      |
| **LLMs (Claude, GPT)** | Crescente   | Conseguem reverter obfuscators free com sucesso          |

**Fato**: `webcrack` reverte output do javascript-obfuscator free em segundos. É uma ferramenta mantida ativamente com suporte a Node 22/24.

---

## 4. Matriz de Decisão por Caso de Uso

| Caso de Uso                                  | Proteção Adequada                                   | Custo       |
| -------------------------------------------- | --------------------------------------------------- | ----------- |
| Biblioteca open source                       | Minificação (Terser/esbuild)                        | Grátis      |
| SaaS frontend (proteção básica)              | obfuscator.io free                                  | Grátis      |
| SaaS frontend (contra LLMs/competidores)     | obfuscator.io Pro (VM)                              | ~$9-50/mês  |
| Node.js backend distribuído                  | bytenode (.jsc)                                     | Grátis      |
| Electron app                                 | bytenode (`compileElectronMainCode`) + obfuscator.io free | Grátis |
| HTML5 Games / IP crítico                     | Jscrambler ou obfuscator.io Pro VM                  | $$-$$$$     |
| Enterprise (bancos, compliance)              | Jscrambler                                          | $$$$        |
| .NET/Java + JS (multi-plataforma)            | PreEmptive JSDefender (+Dotfuscator/DashO)          | $$$         |
| Proteção máxima custo zero                   | bytenode (backend) + obfuscator.io free (frontend)  | Grátis      |

---

## 5. Recomendação: Solução em Camadas

Nenhuma ferramenta única resolve todos os cenários. A abordagem sólida é **defesa em profundidade**:

```
Camada 1 — Build-time
├── TypeScript → compila para JS (remove type annotations)
├── Bundler (esbuild/webpack) com minificação agressiva
└── obfuscator.io free (control flow flattening + string encryption + self-defending)

Camada 2 — Lógica crítica (seletiva)
├── Frontend: obfuscator.io Pro VM apenas em funções sensíveis
│   (marcar com /* javascript-obfuscator:vm */)
└── Backend: bytenode para módulos Node.js críticos (.jsc)

Camada 3 — Runtime
├── Domain lock (se browser)
├── Debug protection
└── Integrity checks / anti-tampering

Camada 4 — Processo
├── CI/CD pipeline com ofuscação automatizada
├── Source maps NUNCA deployed em produção
└── Secrets NUNCA no frontend (proxy via backend)
```

---

## 6. Direção proposta para o projeto `js-protect`

Wrapper CLI/API unificado que orquestra múltiplas ferramentas em camadas, resolvendo lacunas que cada uma deixa individualmente:

1. **bytenode** — compilar módulos Node.js críticos para bytecode V8
2. **javascript-obfuscator** — ofuscar o código restante (frontend ou módulos não-críticos)
3. **API própria para configuração unificada** — um config file que controla ambas as ferramentas
4. **Plugins de bundler** — integração com esbuild, webpack, vite

Isso cobre o gap principal: **proteção forte para backend** (bytenode, irreversível sem decompilador V8 público) + **proteção para frontend** (obfuscator.io, derrotável mas com VM obfuscation fica sólido), tudo com custo zero e sem depender de API externa.

---

## 7. Fontes

- https://obfuscator.io/ — Site oficial e documentação de VM obfuscation
- https://github.com/javascript-obfuscator/javascript-obfuscator — Repositório GitHub (16.2k stars)
- https://www.npmjs.com/package/javascript-obfuscator — npm (5.5.0, ~1M downloads/sem)
- https://github.com/MichaelXF/js-confuser — Repositório GitHub (515 stars)
- https://www.npmjs.com/package/js-confuser — npm (2.1.3, 22.4k downloads/sem)
- https://www.npmjs.com/package/bytenode — npm (1.6.0, 52k downloads/sem)
- https://github.com/bytenode/bytenode — Repositório GitHub (3k+ stars)
- https://www.npmjs.com/package/webcrack — npm (2.16.0, 9.6k downloads/sem)
- https://jscrambler.com/ — Site oficial
- https://jscrambler.com/jscrambler-vs-javascript-obfuscation-tools/ — Comparativo oficial vs ferramentas free
- https://jscrambler.com/code-integrity/ — Página do produto Code Integrity
- https://www.preemptive.com/products/jsdefender/ — Site oficial JSDefender
