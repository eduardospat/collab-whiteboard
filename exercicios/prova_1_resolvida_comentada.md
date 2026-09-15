# Gabarito Comentado e Análise da Prova 1 Real (Prof. Mateus Beck Rutzig)

Este documento analisa minuciosamente a **Prova 1 da UFSM** contida em `materiais/mono e multi prova.pdf`.
A prova vale **10,0 pontos** e é composta por **3 questões de criação/modificação de caminhos de dados**.

---

## O Formato da Prova: O que o professor cobra?

A prova avalia se você é capaz de:
1. **Identificar limitações do hardware existente** (ex: falta de portas de leitura/escrita, multiplexadores que não selecionam o registrador desejado).
2. **Desenhar novos componentes e barramentos** (portas de leitura extras, novos somadores/blocos lógicos, novos MUXes).
3. **Definir a tabela de sinais de controle** (tanto os sinais padrão quanto os novos sinais criados por você).
4. **No Multiciclo:** Desenhar os **novos estados da FSM**, definindo em qual ciclo cada ação ocorre e quais sinais são ativados em cada estado.

---

## Questão 1 (3,0 pontos): Instrução `add3 $rd, $rs, $rt` (Monociclo)

### Enunciado:
> *"A instrução `add3` ao ser incorporada no MIPS pode aumentar a eficiência do processador pela diminuição no número total de instruções executadas ao desenvolver a soma de 3 operandos. Desenhe e explique as modificações no datapath e defina os sinais de controle do MIPS Monociclo para adicionar essa instrução."*
>
> $$\text{add3 } \$rd, \$rs, \$rt \implies rd = rs + rt + rd$$

### 1. Diagnóstico do Hardware Padrão:
- No MIPS padrão, o Banco de Registradores possui **2 portas de leitura** (`Read register 1` e `Read register 2`) e **1 porta de escrita**.
- Na instrução `add3`, precisamos ler **3 registradores ao mesmo tempo**:
  1. `rs` (`Instruction[25:21]`)
  2. `rt` (`Instruction[20:16]`)
  3. `rd` (`Instruction[15:11]`) — observe que `rd` aqui é **fonte de leitura E destino da escrita**!
- Além disso, a ULA padrão só soma **2 operandos de 32 bits por ciclo**.

### 2. Modificações Necessárias no Caminho de Dados:
1. **No Banco de Registradores:**
   - Adicionar uma **3ª porta de leitura de endereço** (`Read register 3`), conectada aos bits `Instruction[15:11]` (`rd`).
   - Adicionar uma **3ª porta de saída de dados** (`Read data 3`), que fornecerá o valor atual de `rd`.
2. **Nas Unidades Aritméticas:**
   - A ULA principal realiza a soma dos dois primeiros operandos: $\text{Soma}_1 = \text{Read data 1} + \text{Read data 2} = rs + rt$.
   - Adiciona-se uma **segunda ULA** (ou um **somador de 32 bits adicional**):
     - Entrada A: Saída da ULA principal ($rs + rt$).
     - Entrada B: Saída `Read data 3` ($rd$).
     - Saída: Resultado final ($rs + rt + rd$).
3. **No Multiplexador de Escrita:**
   - A saída do novo somador vai para uma nova entrada do MUX `MemtoReg` (ou substitui a saída da ULA quando for `add3`), que então entrega o resultado para `Write data` do Banco de Registradores.
   - O MUX `RegDst` seleciona `Instruction[15:11]` (`rd`) como registrador de destino da escrita.

### 3. Sinais de Controle para `add3`:
| Sinal | Valor | Justificativa |
| :--- | :---: | :--- |
| `RegDst` | **1** | Seleciona `rd` (`Instruction[15:11]`) como destino da escrita. |
| `ALUSrc` | **0** | A 2ª entrada da 1ª ULA vem do registrador `Read data 2` (`rt`). |
| `MemtoReg` | **0** (ou novo código) | Seleciona a saída da soma de 3 operandos para gravar no registrador. |
| `RegWrite` | **1** | Habilita a gravação do resultado em `rd`. |
| `MemRead` | **0** | Não acessa memória de dados. |
| `MemWrite` | **0** | Não acessa memória de dados. |
| `Branch` | **0** | Não é instrução de desvio. |
| `Jump` | **0** | Não é instrução de salto. |
| `ALUOp` | **10** (funct) ou **00** | Configura a 1ª ULA para executar soma (`ADD`). |
| `ALUOp2` (novo) | **Soma** | Configura a 2ª ULA / Somador para executar soma. |

---

## Questão 2 (3,0 pontos): Instrução `subabs $rd, $rs, $rt` (Monociclo)

### Enunciado:
> *"Operações com módulo são muito utilizadas em processamento digital de sinais, a instrução `subabs` ao ser incorporada no MIPS pode aumentar a eficiência do processador neste tipo de aplicações. Desenhe e explique as modificações no datapath e defina os sinais de controle do MIPS Monociclo para adicionar essa instrução."*
>
> $$\text{subabs } \$rd, \$rs, \$rt \implies rd = |rs - rt|$$

### 1. Diagnóstico do Hardware Padrão e Onde Muitos Perdem Nota:
- A aluna na prova tirou 2,0 / 3,0 nesta questão porque apenas escreveu *"coloca um bloco ABS que inverte o sinal"*.
- **Por que isso é incompleto?**
  - Em complemento de 2, se o resultado da subtração $rs - rt$ for **positivo ou zero** (bit 31 = 0), o valor **já é o módulo correto** e NÃO deve ser alterado!
  - Se o resultado for **negativo** (bit 31 = 1), aí sim ele deve ser negado (inverter os bits e somar 1, ou calcular $0 - \text{resultado}$).
  - Portanto, o circuito precisa ser **condicional** baseado no **bit mais significativo (MSB / bit de sinal: bit 31)** da saída da ULA!

### 2. Modificações Necessárias no Caminho de Dados:
1. **ULA Principal:**
   - Realiza a subtração: $\text{Resultado} = rs - rt$.
   - Sinais: `ALUSrc = 0`, `ALUOp` configurado para subtração.
2. **Bloco de Módulo (ABS) Condicional:**
   - A saída de 32 bits da ULA se divide em dois caminhos:
     - **Caminho Direto:** O próprio valor da subtração ($rs - rt$).
     - **Caminho Negador (Complemento de 2):** Um bloco negador que calcula $-(rs - rt)$ (inverte os bits e soma 1).
   - Um **Multiplexador de 2 para 1** (MUX ABS):
     - Entrada 0: Valor original positivo.
     - Entrada 1: Valor negado (positivo).
     - **Sinal de Seleção:** É controlado pelo **bit 31 da saída da ULA** (`ALU_Result[31]`)!
       - Se bit 31 = 0 (positivo) $\rightarrow$ seleciona entrada 0.
       - Se bit 31 = 1 (negativo) $\rightarrow$ seleciona entrada 1.
3. **Envio para o Banco de Registradores:**
   - A saída do MUX ABS vai para a entrada do MUX `MemtoReg`, que repassa o valor positivo final para a entrada `Write data`.

### 3. Sinais de Controle para `subabs`:
| Sinal | Valor | Justificativa |
| :--- | :---: | :--- |
| `RegDst` | **1** | Destino é `rd` (`Instruction[15:11]`). |
| `ALUSrc` | **0** | 2º operando vem do registrador `rt`. |
| `MemtoReg` | **0** (ou novo seletor) | Seleciona o valor após o bloco de módulo. |
| `RegWrite` | **1** | Habilita a gravação do resultado positivo no registrador `rd`. |
| `MemRead` | **0** | Não acessa memória. |
| `MemWrite` | **0** | Não acessa memória. |
| `Branch` | **0** | Não é branch. |
| `ALUOp` | **01** ou **10** (sub) | Configura a ULA para subtração (`SUB`). |

---

## Questão 3 (4,0 pontos): Instrução `relu $rs` no MIPS Multiciclo

### Enunciado:
> *"A ReLU é uma abreviação para rectified linear unit, uma função de ativação largamente utilizada em redes neurais. Ela produz resultados no intervalo $[0, \infty)$. A função ReLU retorna 0 para todos os valores negativos, e o próprio valor para valores positivos. Desenhe e explique as modificações no datapath e na máquina de estados do MIPS Multiciclo para adicionar essa instrução."*
>
> $$\text{relu } \$rs \implies \begin{cases} rs = rs, & \text{se } rs > 0 \\ rs = 0, & \text{senão } (rs \le 0) \end{cases}$$

### 1. Diagnóstico no Multiciclo:
- No multiciclo, cada passo é um ciclo de relógio curto.
- **Passo 1 (Busca):** `IR = Mem[PC]; PC = PC + 4;` (Estado 0 - inalterado).
- **Passo 2 (Decodificação):** `A = Reg[rs]; B = Reg[rt];` (Estado 1 - inalterado).
- **Passo 3 (Execução / Teste da Condição):**
  - Precisamos verificar se $rs > 0$.
  - A ULA recebe o registrador `A` (`rs`) e o valor `0`:
    - `ALUSelA = 1` (seleciona registrador A).
    - `ALUSelB = 00` (com registrador `$zero`) ou simplesmente inspecionamos o bit de sinal de A (`A[31]`) e a flag `Zero` da ULA!
    - Se `A[31] == 1` ou `Zero == 1`: o número é $\le 0$.
    - Se `A[31] == 0` e `Zero == 0`: o número é $> 0$.

### 2. Modificações no Caminho de Dados:
1. **Destino da Escrita (`Write register`):**
   - No multiciclo padrão, o MUX `RegDst` só seleciona entre `rt` (`[20:16]`) e `rd` (`[15:11]`).
   - A instrução `relu $rs` precisa escrever de volta no próprio registrador **`rs` (`Instruction[25:21]`)**!
   - Logo, expande-se o MUX `RegDst` para 3 entradas, adicionando a entrada `Instruction[25:21]`.
2. **Dado de Escrita (`Write data`):**
   - Quando $rs \le 0$, precisamos gravar a **constante 0**.
   - Adiciona-se uma entrada com a constante `0x00000000` (ou barramento vindo de `$zero`) no MUX `MemtoReg`.

### 3. Modificações na Máquina de Estados Finitos (FSM):
Criam-se novos estados a partir do **Estado 1** (quando `Op = 'relu'`):

```
                        [ Estado 1: Decodificação ]
                                     |
                                (Op = 'relu')
                                     v
                        [ Estado 12: Teste ReLU ]
                         ALUSelA = 1, ALUSelB = 00
                         ALUOp = 01 (subtrai A - 0)
                                     |
                       +-------------+-------------+
                       |                           |
                  (Se Rs > 0)                 (Se Rs <= 0)
                       |                           |
                       v                           v
              [ Volta ao Estado 0 ]     [ Estado 13: Zera Rs ]
              (rs já tem o valor;        RegDst = 'rs' (bits 25-21)
               não precisa gravar nada!)  MemtoReg = 'zero' (constante 0)
                                         RegWrite = 1
                                                   |
                                                   v
                                         [ Volta ao Estado 0 ]
```

- **Ciclos totais de `relu`:**
  - Se $rs > 0$: completa em **3 ciclos** (Busca $\rightarrow$ Decod $\rightarrow$ Teste)!
  - Se $rs \le 0$: completa em **4 ciclos** (Busca $\rightarrow$ Decod $\rightarrow$ Teste $\rightarrow$ Grava 0)!
