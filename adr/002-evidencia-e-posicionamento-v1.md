# ADR 002 — Evidência do POC e posicionamento operacional da v1

> **Status:** Accepted — decisão registrada em 2026-08-09.
>
> **Supersedes:** a interpretação de eficácia e de prontidão para o core registrada no ADR 001.
> A escolha de orquestração OSS é mantida; a conclusão de 0 pp adversarial deixa de ser aceita como
> evidência válida.

## Context

O POC oficial preservou 144/144 células semânticas, mas o evaluator primário chamou `webcrack` com
`deobfuscate: false` e `unpack: false`, validando depois apenas o oracle de execução. Isso não mede
recuperação de lógica. A dimensão anti-LLM também foi executada com `maxToolInvocations: 0`, sem
chamadas ao modelo.

## Problem

Como avançar sem transformar um harness de execução semântica em uma claim de resistência
adversarial e sem investir em uma engine própria cuja vantagem não foi demonstrada?

## Alternatives Considered

### A. Continuar o core com a claim de proteção mensurável

Rejeitada: a evidência central não mede o comportamento alegado e os critérios de proteção não
estão satisfeitos.

### B. Repetir imediatamente a POC adversarial

Rejeitada como próximo passo padrão: só é justificável se resistência adversarial continuar sendo
um requisito de produto. O harness precisaria de nova spec, evaluator causalmente adequado e
isolamento de sistema operacional.

### C. Entregar um wrapper operacional sobre o baseline OSS

Selecionada: preserva a decisão de menor complexidade, entrega valor verificável em offline,
reprodução, hazards, semântica e auditabilidade, e não depende de uma claim de segurança não
demonstrada.

## Decision

Adotar a alternativa C para o posicionamento da v1: uma camada build-time offline, auditável e
reproduzível sobre `javascript-obfuscator`, com defaults seguros e preservação semântica.

A v1 não promete polimorfismo defensivo, irreversibilidade, derrota de LLMs ou aumento mensurado
do custo de recuperação. Não iniciar os Atomic Steps do core atual até a spec ser reformulada e
aprovada.

Qualquer nova claim de resistência exige uma spec de POC própria, com evaluator que execute a
transformação de recuperação pretendida, oracles que meçam recuperação de lógica e sandbox de
sistema operacional para código não confiável.

## Consequences

- A arquitetura de entrega permanece simples e não exige fork ou engine própria.
- O POC atual passa a ser registro de semântica, diversidade e falhas de protocolo, não benchmark
  de eficácia adversarial.
- O core precisa reduzir o Goal para segurança operacional, reprodução e integração de build.
- O projeto deve resolver o isolamento do runner, o `ses` vulnerável, a compatibilidade de Node e
  os timers pendentes antes de qualquer release.

## Trade-offs

Aceita-se abrir mão de uma narrativa de diferenciação defensiva até haver evidência válida. Em
troca, a v1 pode ser especificada e implementada com menor risco, sem vender uma garantia que o
repositório não consegue provar.
