# Banco de Questões de Treino para a Prova 1

Use estas questões para praticar diretamente no **Whiteboard**!
Desenhe o caminho de dados ou faça os cálculos no quadro, salve com **" Salvar para IA"** e peça minha avaliação no chat antes de abrir os gabaritos abaixo.

---

## Questão 1: Adicionando `addi` e `bne` ao Monociclo

### Enunciado:
Considere o datapath MIPS monociclo padrão (capaz de executar `add`, `sub`, `and`, `or`, `slt`, `lw`, `sw`, `beq`, `j`).

1. A instrução `addi $rt, $rs, constante` já é suportada pelo hardware existente? Se sim, quais devem ser os sinais de controle gerados para ela?
2. O que precisa ser alterado no hardware para suportar a instrução `bne $rs, $rt, Label` (Branch if Not Equal)?

<details>
<summary><b> Ver Gabarito Comentado</b></summary>

### Resposta 1:
**Sim, o hardware existente já suporta `addi` sem alterar nenhum fio do datapath!**
- O formato de `addi` é tipo I (`opcode`, `rs`, `rt`, `imediato16`).
- O operando `rs` entra na ULA via `Read data 1`.
- O imediato passa pelo `Sign-extend` e é selecionado para a 2ª entrada da ULA com `ALUSrc = 1`.
- A ULA executa soma com `ALUOp = 00`.
- O resultado da ULA é selecionado com `MemtoReg = 0`.
- O dado é escrito no registrador `rt` com `RegDst = 0` e `RegWrite = 1`.
- Não há acesso à memória (`MemRead = 0`, `MemWrite = 0`) nem branch (`Branch = 0`).

### Resposta 2:
Para suportar `bne`:
- No `beq`, o desvio ocorre se o sinal `Zero` da ULA for `1` (`PCSrc = Branch AND Zero`).
- No `bne`, o desvio ocorre se o sinal `Zero` for **`0`** (ou seja, `NOT Zero`).
- **Modificação no Hardware:**
  - Adiciona-se uma porta inversora (NOT) ou uma porta XOR controlada por um novo sinal `BranchNotEqual` da Unidade de Controle:
  $$\text{PCSrc} = (\text{Branch} \land \text{Zero}) \lor (\text{BranchNotEqual} \land \overline{\text{Zero}})$$
  - Ou simplesmente um multiplexador de 2 para 1 selecionando entre `Zero` e `NOT Zero`.
</details>

---

## Questão 2: Nova Instrução no Multiciclo — `jal` (Jump and Link)

### Enunciado:
Deseja-se implementar a instrução `jal target` no processador MIPS multiciclo.
Lembre-se que `jal` realiza duas tarefas:
1. Salva o endereço de retorno `PC` (que já aponta para `PC + 4` após o passo 1) no registrador `$ra` (`$31`).
2. Atualiza o PC com o endereço de salto: `PC = PC[31:28] || (IR[25:0] << 2)`.

Descreva detalhadamente:
- Em qual ciclo da FSM esta instrução termina?
- Quais conexões adicionais no caminho de dados são necessárias?
- Quais sinais de controle devem ser gerados em cada passo?

<details>
<summary><b> Ver Gabarito Comentado</b></summary>

### Resposta:
- **Duração:** Termina no **Passo 3** (3 ciclos totais: Ciclo 1 = Busca, Ciclo 2 = Decodificação, Ciclo 3 = Atualização do PC e Escrita em `$31`).

### Modificações no Caminho de Dados:
1. **Destino da escrita no Banco de Registradores:** O registrador de escrita deve poder ser fixado em `31` (`$ra`). Adiciona-se uma 3ª entrada `31` no multiplexador `RegDst` (que passa a ser de 3 para 1).
2. **Dado de escrita no Banco de Registradores:** O dado a ser escrito é o `PC` atual. Conecta-se o valor de `PC` como uma nova entrada no multiplexador `MemtoReg` (ou cria-se um caminho do PC até a entrada `Write data`).

### Sinais no Passo 3 (Novo Estado de JAL):
- `RegDst = 10` (seleciona o número 31).
- `MemtoReg = 10` (seleciona o valor do `PC`).
- `RegWrite = 1` (grava em `$31`).
- `PCSource = 10` (seleciona o endereço de salto concatenado).
- `PCWrite = 1` (atualiza o PC com o endereço de destino).
</details>

---

## Questão 3: Cálculo de Caminho Crítico com Componentes Complexos

### Enunciado:
Considere um processador monociclo com os seguintes tempos de atraso:
- Memória de Instruções = $250\text{ ps}$
- Banco de Registradores (leitura ou escrita) = $150\text{ ps}$
- ULA = $180\text{ ps}$
- Memória de Dados = $300\text{ ps}$
- Extensor de Sinal = $20\text{ ps}$
- Multiplexadores = $25\text{ ps}$
- Somadores do PC/Branch = $100\text{ ps}$
- Lógica de Controle = $80\text{ ps}$

1. Calcule a latência de cada uma das seguintes instruções: `lw`, `sw`, `add`, `beq`.
2. Qual deve ser o período mínimo de relógio do processador monociclo?
3. Se transformarmos este processador em multiciclo onde cada unidade funcional é um passo, qual será o novo período de relógio e qual será o speedup para um programa composto por:
   - $25\%$ LW, $10\%$ SW, $50\%$ Tipo R, $15\%$ BEQ?

<details>
<summary><b> Ver Gabarito Comentado</b></summary>

### 1. Latência por Instrução:
- **`lw`:** $\text{I-Mem} + \text{RegRead} + \text{ALU} + \text{D-Mem} + \text{Mux} + \text{RegWrite(setup)}$
  $$T_{\text{lw}} = 250 + 150 + 180 + 300 + 25 = \mathbf{905\text{ ps}}$$
- **`sw`:** $\text{I-Mem} + \text{RegRead} + \text{ALU} + \text{D-Mem}$
  $$T_{\text{sw}} = 250 + 150 + 180 + 300 = \mathbf{880\text{ ps}}$$
- **Tipo R (`add`):** $\text{I-Mem} + \text{RegRead} + \text{ALU} + \text{Mux} + \text{RegWrite}$
  $$T_{\text{add}} = 250 + 150 + 180 + 25 = \mathbf{605\text{ ps}}$$
- **`beq`:** $\text{I-Mem} + \text{RegRead} + \text{ALU} + \text{Mux}$
  $$T_{\text{beq}} = 250 + 150 + 180 + 25 = \mathbf{605\text{ ps}}$$

### 2. Período Mínimo do Monociclo:
$$T_{\text{clk, mono}} = \max(905, 880, 605, 605) = \mathbf{905\text{ ps}}$$

### 3. Versão Multiciclo:
O ciclo é delimitado pela maior unidade individual:
$$\text{Maior unidade} = \text{D-Mem} = \mathbf{300\text{ ps}} \implies T_{\text{clk, multi}} = 300\text{ ps}$$

Cálculo do CPI médio:
$$\text{CPI} = (0.25 \times 5) + (0.10 \times 4) + (0.50 \times 4) + (0.15 \times 3)$$
$$\text{CPI} = 1.25 + 0.40 + 2.00 + 0.45 = \mathbf{4.10}$$

Tempo médio de instrução:
- Monociclo: $1 \times 905\text{ ps} = 905\text{ ps}$
- Multiciclo: $4.10 \times 300\text{ ps} = 1230\text{ ps}$

$$\text{Speedup} = \frac{905}{1230} \approx \mathbf{0.736} \quad (\text{Multiciclo é mais lento devido aos 300ps da memória!})$$
*(Se a memória de dados fosse dividida em 2 ciclos de 150 ps, o relógio seria 180 ps da ULA e o multiciclo venceria).*
</details>

---

## Questão 4: Análise de Sinais e Caminho de Dados em Falha Presa

### Enunciado:
Um engenheiro de testes detectou que o bit de controle `MemtoReg` ficou permanentemente curto-circuitado para nível alto (`MemtoReg = 1`).

1. A instrução `lw $t0, 0($t1)` continuará funcionando? Justifique.
2. A instrução `add $s0, $s1, $s2` continuará funcionando? Justifique.
3. A instrução `sw $t0, 4($sp)` continuará funcionando? Justifique.

<details>
<summary><b> Ver Gabarito Comentado</b></summary>

### Resposta:
1. **`lw`:** **Sim, funcionará perfeitamente**, pois a instrução `lw` exige exatamente `MemtoReg = 1` para gravar o dado vindo da memória no registrador.
2. **`add`:** **Não funcionará**. Em instruções Tipo R, `MemtoReg` deveria ser `0` para transferir o resultado da ULA para o registrador. Com `MemtoReg = 1`, o banco de registradores gravará o que estiver na saída de leitura da memória de dados (lixo/dado antigo), destruindo o valor correto do cálculo.
3. **`sw`:** **Sim, continuará funcionando**, porque `sw` tem `RegWrite = 0` (não escreve no banco de registradores), logo o sinal `MemtoReg` é irrelevante (*Don't Care*).
</details>
