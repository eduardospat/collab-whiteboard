# Caderno de Treino Oficial para o Whiteboard — Prova 1

Este caderno foi formatado sem códigos matemáticos truncados para você copiar e colar qualquer enunciado diretamente na ferramenta de texto do seu Whiteboard ou rascunhar enquanto desenha.

Todos os templates citados já estão cadastrados no menu superior do Whiteboard!

---

## BLOCO 1: Desempenho, CPI e Tempo de CPU (Cálculos de Prova)

### Exercício 1.1 — O Clássico da Prova 2024 (Nota 10,0)
- **Template no Whiteboard:** ` Prova 2024 - Pág 1: Desempenho e Sinais (Add, Beq, Lw)`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 1.1 - DESEMPENHO E CPI]
Um programa executa 750 milhões de instruções (N = 750 * 10^6).
Estatísticas de uso das instruções:
- Tipo R: 45%
- BEQ:    20%
- LW:     20%
- SW:     15%

a) MIPS Multiciclo a 333 MHz:
   - Ciclos por instrução: R = 4 ciclos, BEQ = 3 ciclos, LW = 5 ciclos, SW = 4 ciclos.
   - Encontre o CPI médio.
   - Encontre o tempo de execução (T_exec em segundos).

b) MIPS Monociclo a 1.5 GHz:
   - No monociclo, CPI = 1 para todas as instruções.
   - Encontre o tempo de execução (T_exec em segundos).

Fórmulas:
- CPI_medio = (0.45 * 4) + (0.20 * 3) + (0.20 * 5) + (0.15 * 4)
- T_exec = (N * CPI) / Frequencia
- 333 MHz = 333 * 10^6 Hz
- 1.5 GHz = 1500 * 10^6 Hz
```

---

### Exercício 1.2 — Caminho Crítico e Período de Clock (Monociclo)
- **Template no Whiteboard:** ` Exercício 4.4: Caminho Crítico e Tempos`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 1.2 - CAMINHO CRÍTICO NO MONOCICLO]
Considere os atrasos dos componentes do MIPS:
- Memória de Instruções: 200 ps
- Leitura do Banco de Registradores: 100 ps
- Operação da ULA: 200 ps
- Memória de Dados (leitura ou escrita): 250 ps
- Escrita no Banco de Registradores: 100 ps
- Somadores auxiliares (PC+4 e Branch): 100 ps
- Multiplexadores e fios: desprezíveis

a) Calcule o tempo total exigido por cada instrução:
   - R-type (add, sub)
   - Load Word (lw)
   - Store Word (sw)
   - Branch Equal (beq)

b) Qual instrução determina o período mínimo de clock do Monociclo? Por quê?
c) Qual deve ser a frequência máxima de clock deste processador Monociclo?
```

---

## BLOCO 2: Análise de Sinais de Controle e Falhas (Sim/Não e Por quê?)

### Exercício 2.1 — Falha de Sinais no Monociclo (Prova 2024)
- **Template no Whiteboard:** ` Prova 2024 - Pág 1: Desempenho e Sinais (Add, Beq, Lw)` ou ` Monociclo Completo com Controle`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 2.1 - SINAIS NO MONOCICLO]
Para cada situação abaixo, diga se a instrução continua funcionando (SIM ou NÃO) e JUSTIFIQUE:

1) Instrução ADD:
   a) Se RegDst = 1   --> [Sim / Não]? Por quê?
   b) Se MemtoReg = 1 --> [Sim / Não]? Por quê?
   c) Se ALUSrc = 1   --> [Sim / Não]? Por quê?

2) Instrução BEQ:
   a) Se RegDst = 1   --> [Sim / Não]? Por quê?
   b) Se MemtoReg = 1 --> [Sim / Não]? Por quê?
   c) Se ALUSrc = 1   --> [Sim / Não]? Por quê?

Dica: No BEQ, o processador NÃO escreve em nenhum registrador (RegWrite = 0).
Portanto, sinais de destino e dado de escrita são irrelevantes ("don't care").
Já no ADD, a escrita correta no registrador rd é mandatória!
```

---

### Exercício 2.2 — Sinais no 4º Ciclo do Multiciclo (Prova 2024)
- **Template no Whiteboard:** ` Prova 2024 - Pág 1: Desempenho e Sinais (Add, Beq, Lw)` ou ` Passo 4 - Load (Leitura da Memória)`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 2.2 - 4º CICLO DO MULTICICLO]
Analise o que acontece durante o QUARTO ciclo de relógio de cada instrução:

1) Instrução LW (4º Ciclo = Acesso à Memória de Dados / MDR = Mem[ALUOut]):
   a) RegDst = 0   --> [Sim / Não]? Por quê?
   b) MemtoReg = 1 --> [Sim / Não]? Por quê?
   c) IorD = 1     --> [Sim / Não]? Por quê?
   d) ALUSrcB = 11 --> [Sim / Não]? Por quê?

2) Instrução ADD (4º Ciclo = Escrita no Registrador / Reg[rd] = ALUOut):
   a) RegDst = 0   --> [Sim / Não]? Por quê?
   b) MemtoReg = 0 --> [Sim / Não]? Por quê?
   c) IorD = 1     --> [Sim / Não]? Por quê?
   d) ALUSrcB = 10 --> [Sim / Não]? Por quê?
```

---

## BLOCO 3: Modificação de Datapath no Monociclo (Provas Reais)

### Exercício 3.1 — Instrução `add3 $rd, $rs, $rt` (Prova 2026 - 3,0 pts)
- **Template no Whiteboard:** ` Prova Q1: add3 $rd, $rs, $rt (Monociclo)`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 3.1 - INSTRUÇÃO ADD3 NO MONOCICLO]
Operação:
add3 $rd, $rs, $rt  -->  rd = rs + rt + rd

Tarefas no Whiteboard:
1. Identifique o problema de hardware no Banco de Registradores padrão (precisa ler 3 registradores ao mesmo tempo).
2. Desenhe uma 3ª porta de leitura no Banco de Registradores (Read register 3 conectada nos bits [15-11] e Read data 3).
3. Adicione uma 2ª ULA (ou somador) para somar o resultado da 1ª ULA com Read data 3.
4. Conecte o resultado final no MUX MemtoReg e no Write data.
5. Preencha a tabela de sinais de controle:
   - RegDst = ?
   - ALUSrc = ?
   - MemtoReg = ?
   - RegWrite = ?
   - MemRead = ?
   - MemWrite = ?
   - Branch = ?
   - ALUOp (1ª ULA) = ?
   - ALUOp2 (2ª ULA) = ?
```

---

### Exercício 3.2 — Instrução `subabs $rd, $rs, $rt` (Prova 2026 - 3,0 pts)
- **Template no Whiteboard:** ` Prova Q2: subabs $rd, $rs, $rt (Monociclo)`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 3.2 - INSTRUÇÃO SUBABS NO MONOCICLO]
Operação:
subabs $rd, $rs, $rt  -->  rd = |rs - rt|  (módulo / valor absoluto)

Tarefas no Whiteboard:
1. Faça a ULA principal calcular a subtração (rs - rt).
2. Na saída da ULA, separe o barramento de 32 bits em dois caminhos:
   - Caminho 1: O valor direto (se for positivo).
   - Caminho 2: Um bloco inversor/negador (complemento de 2: inverte e soma 1).
3. Coloque um MUX 2:1 selecionando entre o caminho direto e o caminho negado.
4. QUAL É O SINAL DE SELEÇÃO DESTE MUX?
   --> O bit 31 (bit de sinal) da saída da ULA!
   Se bit 31 == 0 (positivo) --> seleciona caminho direto.
   Se bit 31 == 1 (negativo) --> seleciona caminho negado.
5. Conecte a saída do MUX no Write data do Banco de Registradores.
6. Preencha os sinais de controle (RegDst, ALUSrc, RegWrite, MemtoReg, etc.).
```

---

### Exercício 3.3 — Instrução `jal target` (Jump and Link) no Monociclo (Prova 2024 - 4,5 pts)
- **Template no Whiteboard:** ` Prova 2024 - Pág 2: Datapaths JAL (Mono e Multi)`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 3.3 - JAL NO MONOCICLO]
Operação:
R[31] = PC + 4    (salva o endereço de retorno no registrador $ra = $31)
PC = Jump Address (salta para o destino)

Tarefas no Whiteboard:
1. No MUX RegDst: adicione uma entrada com a constante 31 (vira MUX de 3 para 1).
2. No MUX MemtoReg: adicione uma entrada trazendo o valor de PC + 4 (saída do somador superior).
3. Ajuste os sinais de controle:
   - RegDst = 10 (seleciona o número 31)
   - MemtoReg = 10 (seleciona PC + 4)
   - RegWrite = 1 (habilita escrita em $31)
   - Jump = 1 (atualiza PC com o endereço de salto)
   - ALUSrc, MemRead, MemWrite, Branch = 0
```

---

## BLOCO 4: Modificação de Datapath e FSM no Multiciclo (Provas Reais)

### Exercício 4.1 — Instrução `relu $rs` no Multiciclo (Prova 2026 - 4,0 pts)
- **Template no Whiteboard:** ` Prova Q3: relu $rs (Multiciclo + FSM)`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 4.1 - RELU NO MULTICICLO]
Operação:
Se rs > 0  --> rs = rs  (não altera nada)
Se rs <= 0 --> rs = 0   (zera o registrador rs)

Tarefas no Whiteboard:
1. Modificação no Datapath:
   - No MUX RegDst: adicione a entrada Instruction[25:21] (bits do campo rs) para gravar em rs.
   - No MUX MemtoReg: adicione a entrada fixa com a constante 0 (0x00000000).
2. Modificação na Máquina de Estados (FSM):
   - Passo 1 (Estado 0): Busca normal (IR = Mem[PC], PC = PC + 4).
   - Passo 2 (Estado 1): Decodificação normal (A = Reg[rs], B = Reg[rt]).
   - Do Estado 1, quando Op = relu, crie o Estado 12 (Teste ReLU):
     * A ULA compara o registrador A com 0.
     * Se A > 0: Volta imediatamente ao Estado 0 (leva apenas 3 ciclos!).
     * Se A <= 0: Vai para o Estado 13 (Zera Rs).
   - Estado 13 (Zera Rs):
     * RegDst = rs (bits 25-21)
     * MemtoReg = 0 (constante zero)
     * RegWrite = 1
     * Próximo estado: Volta ao Estado 0 (leva 4 ciclos).
```

---

### Exercício 4.2 — Instrução `jal target` no Multiciclo (Prova 2024 - 4,5 pts)
- **Template no Whiteboard:** ` Prova 2024 - Pág 2: Datapaths JAL (Mono e Multi)` e ` Prova 2024 - Pág 3: FSM Multiciclo JAL`
- **Enunciado para copiar no quadro:**

```text
[EXERCÍCIO 4.2 - JAL NO MULTICICLO]
Operação:
Passo 1 (Estado 0): IR = Mem[PC]; PC = PC + 4;
Passo 2 (Estado 1): Decodificação e cálculo preventivo de branch.
Passo 3 (Novo Estado 10):
- Gravar o PC atual no registrador $31:
  * RegDst = 31 (nova entrada no MUX RegDst)
  * MemtoReg = PC (nova entrada no MUX MemtoReg)
  * RegWrite = 1
Passo 4 (Novo Estado 11 ou junto no Passo 3):
- Atualizar o PC com o endereço de salto:
  * PCSource = 10 (endereço de salto concatenado)
  * PCWrite = 1
- Volta ao Estado 0.
```
