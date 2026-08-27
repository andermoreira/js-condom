# Relatório de Code Review, Hardening e Análise de Segurança — `js-condom`

**Data:** 2026-08-27  
**Escopo do Review:** Arquitetura do Core (`src/core/`), CLI (`src/cli/`), Protocolo e Manifestos (`src/protocol/`), Runners de Avaliação e Sandboxing (`src/runner/`), Diversidade (`src/diversity/`), Recuperação e Adversários (`src/recovery/`), Candidatos (`src/candidates/`), Testes e Documentação (`README.md`, `docs/`, `adr/`, `specs/`).

---

## 1. Sumário Executivo e Veredito

O projeto **`js-condom`** atua como um wrapper operacional determinístico em tempo de build em torno do `javascript-obfuscator@4.1.0`. A proposta do projeto é padronizar flags de ofuscação através de um preset versionado (`1.0.0`), validar sintaxe e semântica antes da publicação, evitar saídas parciais (fail-closed), garantir reprodutibilidade byte a byte com seeds fixas e fornecer auditoria por hashes SHA-256 sem inventar alegações não comprovadas de segurança ("anti-LLM" ou irreversibilidade).

**Veredito:** **Aprovado com Hardening Implementado**.
O código apresenta excelente separação de responsabilidades e aderência a contratos de erro determinísticos. As vulnerabilidades e fragilidades identificadas durante o review (especialmente no smoke test de inicialização, detecção de hazards por regex e compatibilidade ESM em validação sintática) foram corrigidas e endurecidas.

---

## 2. Matriz Consolidada de Achados

| ID | Severidade | Componente / Arquivo | Descrição do Problema | Impacto / Risco | Remediação Aplicada |
|---|---|---|---|---|---|
| **CRIT-01** | Crítico | [`src/core/protect.js`](../../src/core/protect.js) | `smokeLoadProtectedCode` executava o código resultante diretamente no processo host Node via `import()` dinâmico. | Efeitos colaterais no topo de scripts (`process.exit`, I/O, loops, poluição global) travavam o executor da build. | Isolamento via parse AST + tratamento estrito com código `PROTECTION_FAILED`. |
| **SEC-01** | Alto | [`src/core/hazard-policy.js`](../../src/core/hazard-policy.js) | `rejectWithStatementInSource` usava regex `/\bwith\s*\(/` em texto cru. | Falso positivo quando "with (...)" aparecia em comentários legítimos ou strings literais. | Substituído por detecção em AST Acorn (`WithStatement` e erro em strict mode). |
| **COMPAT-01** | Alto | [`src/candidates/own-minimal.js`](../../src/candidates/own-minimal.js), [`oss-extension.js`](../../src/candidates/oss-extension.js), [`oss-baseline.js`](../../src/candidates/oss-baseline.js) | `validateOutput` usava `new Function(code)` para checar sintaxe. | Lançava `SyntaxError` falso em módulos ESM contendo declarações `import`/`export`. | Substituído por validação via AST Acorn com `detectSourceType`. |
| **SEC-02** | Médio | [`src/core/errors.js`](../../src/core/errors.js) | `sanitizeDetails` não executava sanitização recursiva profunda em objetos/arrays aninhados. | Possibilidade de vazamento de tokens/código se aninhados dentro de objetos em `error.details`. | Implementada função `sanitizeValue` recursiva com limite de profundidade (4 níveis). |
| **ARCH-01** | Médio | [`src/core/config.js`](../../src/core/config.js) | Flags do `PRESET_V1` careciam de documentação explícita de racional no código. | Dificuldade para novos mantenedores entenderem por que certas transforms (`selfDefending`, `controlFlowFlattening`) estão desativadas. | Documentação detalhada em JSDoc de cada flag e seu trade-off semântico. |
| **DOC-01** | Baixo | [`README.md`](../../README.md) | Documentação de erros e garantias de isolamento offline não detalhava o catálogo de erros serializáveis. | Consumidores da CLI/API precisavam inspecionar código para saber códigos de erro possíveis. | README atualizado com catálogo de erros, fluxo fail-closed e threat model. |

---

## 3. Análise Detalhada por Módulo

### 3.1. Core Engine e CLI (`src/core/`, `src/cli/`)
- **Deterministic Seed & Config**: `resolveProtectionConfig` e `buildConfigRecord` garantem a ordenação de chaves em árvore recursiva (`sortValue`), gerando hashes SHA-256 (`configSha256`) absolutamente reprodutíveis.
- **Fail-Closed File Protection**: `src/core/file-protection.js` usa nomes temporários com sufixo criptográfico aleatório (`.${fileName}.${suffix}.tmp`), seguido de renomeação atômica (`rename`), prevenindo condições de corrida de escrita parcial no disco e garantindo limpeza imediata em caso de erro.
- **Detecção de Hazards**: Análise estática AST bloqueia:
  - `eval(...)` direto ou membro global.
  - Construtor dinâmico `new Function(...)` e `Function(...)`.
  - Dependência reflexiva de `.toString()` sobre referências de função.
  - Declaração `with (...)`.

### 3.2. Sandboxing e Avaliação Semântica (`src/runner/`)
- **Isolamento de Processos**: `runModuleInSandbox` isola a execução de código do corpus em subprocessos descartáveis com:
  - Limitação estrita de memória heap (`--max-old-space-size`).
  - Timeout por temporizador com encerramento de árvore de processos (`terminateProcessTree` com `SIGKILL`).
  - Preload de bloqueio de rede que anula `fetch` e `XMLHttpRequest`.
  - Criação de diretório temporário isolado por teste e limpeza garantida em bloco `finally`.
  - Compartimentos SES (`new globalThis.Compartment`) para snippets isolados.

### 3.3. Preservação de Exports ESM (`src/runner/esm-export-preserver.js`)
- Módulos ESM com `export function`, `export class` e `export { a, b }` têm seus bindings extraídos por AST antes da ofuscação e re-anexados com segurança (`export { ... }`), permitindo que a engine ofusque o corpo sem quebrar o contrato público de exportação do módulo.

### 3.4. Avaliador LLM e Adversários (`src/recovery/`)
- `runLlmRecoveryTrial` implementa medição causal contra adversários, aplicando oracles automáticos e de rubrica humana com controle estrito de budgets (tentativas, chamadas de ferramenta, tokens e timeout).
- Bloqueio rigoroso de endpoints remotos (`assertLocalHostOnly`), restringindo o runtime LLM a servidores locais (`127.0.0.1`, `localhost`, `[::1]`).

---

## 4. Recomendações de Evolução Futura

1. **Suporte a Múltiplos Arquivos / Bundlers:**
   - Atualmente o escopo do MVP foca em bundles únicos (`.js`, `.mjs`, `.cjs`). Caso o projeto evolua para diretórios inteiros, adotar processamento em árvore com staging directory atômico para manter o princípio *fail-closed*.
2. **Integração com Source Maps de Entrada:**
   - Caso versões futuras suportem source maps, compor o mapa gerado pelo bundler anterior com o mapa de ofuscação, garantindo que mapas inline sejam proibidos em builds de produção para evitar vazamento do código original.
3. **Requalificação de Engine Automatizada em CI:**
   - Manter a esteira de CI executando o checklist de release ([`docs/release-checklist.md`](../release-checklist.md)) antes de qualquer bump em `qualifiedEngineVersion` (`javascript-obfuscator`).
