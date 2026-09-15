#!/usr/bin/env python3
"""
Verificador de Sinais de Controle MIPS (Monociclo & Multiciclo)
Permite consultar a tabela verdade de sinais para qualquer instrução padrão ou proposta na prova.
"""

import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

TABELA_MONOCICLO = {
    'r-type (add, sub, and, or, slt)': {
        'RegDst': '1 (rd)',
        'ALUSrc': '0 (reg B)',
        'MemtoReg': '0 (ALUOut)',
        'RegWrite': '1 (escreve)',
        'MemRead': '0',
        'MemWrite': '0',
        'Branch': '0',
        'ALUOp': '10 (funct)',
        'Jump': '0',
        'Caminho': 'PC -> I-Mem -> Regs -> ULA -> Mux MemtoReg -> Regs'
    },
    'lw': {
        'RegDst': '0 (rt)',
        'ALUSrc': '1 (offset estendido)',
        'MemtoReg': '1 (D-Mem)',
        'RegWrite': '1 (escreve)',
        'MemRead': '1 (lê)',
        'MemWrite': '0',
        'Branch': '0',
        'ALUOp': '00 (soma)',
        'Jump': '0',
        'Caminho': 'PC -> I-Mem -> Regs -> ULA (base+offset) -> D-Mem -> Mux MemtoReg -> Regs'
    },
    'sw': {
        'RegDst': 'X (Don\'t care)',
        'ALUSrc': '1 (offset estendido)',
        'MemtoReg': 'X (Don\'t care)',
        'RegWrite': '0 (não escreve)',
        'MemRead': '0',
        'MemWrite': '1 (escreve)',
        'Branch': '0',
        'ALUOp': '00 (soma)',
        'Jump': '0',
        'Caminho': 'PC -> I-Mem -> Regs -> ULA (base+offset) e Regs(ReadData2) -> D-Mem'
    },
    'beq': {
        'RegDst': 'X',
        'ALUSrc': '0 (reg B)',
        'MemtoReg': 'X',
        'RegWrite': '0',
        'MemRead': '0',
        'MemWrite': '0',
        'Branch': '1 (ativo se Zero=1)',
        'ALUOp': '01 (subtrai)',
        'Jump': '0',
        'Caminho': 'PC -> I-Mem -> Regs -> ULA (compara rs==rt via Zero) e PC+4 + (imm<<2) -> Mux PC'
    },
    'j (jump)': {
        'RegDst': 'X',
        'ALUSrc': 'X',
        'MemtoReg': 'X',
        'RegWrite': '0',
        'MemRead': '0',
        'MemWrite': '0',
        'Branch': '0',
        'ALUOp': 'XX',
        'Jump': '1',
        'Caminho': 'PC -> I-Mem -> PC[31:28] || (IR[25:0]<<2) -> Mux Jump -> PC'
    },
    'addi (imediato)': {
        'RegDst': '0 (rt)',
        'ALUSrc': '1 (imediato estendido)',
        'MemtoReg': '0 (ALUOut)',
        'RegWrite': '1 (escreve)',
        'MemRead': '0',
        'MemWrite': '0',
        'Branch': '0',
        'ALUOp': '00 (soma)',
        'Jump': '0',
        'Caminho': 'PC -> I-Mem -> Regs(rs) e SignExt(imm) -> ULA -> Mux MemtoReg -> Regs(rt)'
    },
    'lwi (load indexado - ex 4.2)': {
        'RegDst': '0 (rt)',
        'ALUSrc': '0 (reg Rd vindo do 2º operando)',
        'MemtoReg': '1 (D-Mem)',
        'RegWrite': '1 (escreve)',
        'MemRead': '1 (lê)',
        'MemWrite': '0',
        'Branch': '0',
        'ALUOp': '00 (soma)',
        'Jump': '0',
        'Caminho': 'PC -> I-Mem -> Regs(Rs e Rd) -> ULA(Rs+Rd) -> D-Mem -> Mux MemtoReg -> Regs(Rt)'
    },
    'jr (jump register - ex 5.8)': {
        'RegDst': 'X',
        'ALUSrc': 'X',
        'MemtoReg': 'X',
        'RegWrite': '0',
        'MemRead': '0',
        'MemWrite': '0',
        'Branch': '0',
        'ALUOp': 'XX',
        'Jump': '0',
        'JumpReg': '1 (novo sinal de controle)',
        'Caminho': 'PC -> I-Mem -> Regs(rs) -> Mux PC -> PC'
    }
}

TABELA_MULTICICLO_PASSOS = {
    'Passo 1 (Busca - Comum a todas)': {
        'RTL': 'IR = Mem[PC]; PC = PC + 4;',
        'Sinais': 'MemRead=1, IorD=0, IRWrite=1, ALUSelA=0, ALUSelB=01 (4), ALUOp=00 (soma), PCSource=00, PCWrite=1'
    },
    'Passo 2 (Decodificação - Comum a todas)': {
        'RTL': 'A = Reg[rs]; B = Reg[rt]; ALUOut = PC + (SignExt(imm)<<2);',
        'Sinais': 'ALUSelA=0 (PC), ALUSelB=11 (imm<<2), ALUOp=00 (soma antecipada do branch)'
    },
    'Passo 3 - Tipo R': {
        'RTL': 'ALUOut = A op B;',
        'Sinais': 'ALUSelA=1 (A), ALUSelB=00 (B), ALUOp=10 (olha funct)'
    },
    'Passo 3 - Memória (LW / SW)': {
        'RTL': 'ALUOut = A + SignExt(imm);',
        'Sinais': 'ALUSelA=1 (A), ALUSelB=10 (imm), ALUOp=00 (soma endereço)'
    },
    'Passo 3 - BEQ (Conclusão)': {
        'RTL': 'if (A == B) PC = ALUOut;',
        'Sinais': 'ALUSelA=1 (A), ALUSelB=00 (B), ALUOp=01 (subtrai), PCSource=01 (ALUOut), PCWriteCond=1'
    },
    'Passo 3 - Jump (Conclusão)': {
        'RTL': 'PC = PC[31:28] || (IR[25:0]<<2);',
        'Sinais': 'PCSource=10 (Jump Addr), PCWrite=1'
    },
    'Passo 4 - Tipo R (Conclusão)': {
        'RTL': 'Reg[rd] = ALUOut;',
        'Sinais': 'RegDst=1 (rd), MemtoReg=0 (ALUOut), RegWrite=1'
    },
    'Passo 4 - SW (Conclusão)': {
        'RTL': 'Mem[ALUOut] = B;',
        'Sinais': 'IorD=1 (ALUOut), MemWrite=1'
    },
    'Passo 4 - LW': {
        'RTL': 'MDR = Mem[ALUOut];',
        'Sinais': 'IorD=1 (ALUOut), MemRead=1'
    },
    'Passo 5 - LW (Conclusão)': {
        'RTL': 'Reg[rt] = MDR;',
        'Sinais': 'RegDst=0 (rt), MemtoReg=1 (MDR), RegWrite=1'
    }
}

def consultar_instrucao(nome):
    nome = nome.lower().strip()
    match = None
    for k in TABELA_MONOCICLO:
        if nome in k:
            match = k
            break

    if match:
        print("=" * 65)
        print(f" [SINAIS DE CONTROLE MONOCICLO]: {match.upper()}")
        print("=" * 65)
        for sig, val in TABELA_MONOCICLO[match].items():
            print(f"  {sig:12} : {val}")
        print("=" * 65)
    else:
        print(f"Instrução '{nome}' não encontrada. Opções disponíveis:")
        for k in TABELA_MONOCICLO:
            print(f" - {k}")

def exibir_passos_multiciclo():
    print("=" * 75)
    print(" [OS 5 PASSOS DE EXECUCAO DO MIPS MULTICICLO]")
    print("=" * 75)
    for passo, dados in TABELA_MULTICICLO_PASSOS.items():
        print(f"\n* {passo}:")
        print(f"   Transferência (RTL): {dados['RTL']}")
        print(f"   Sinais Ativos:      {dados['Sinais']}")
    print("\n" + "=" * 75)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        if sys.argv[1] == '--multi':
            exibir_passos_multiciclo()
        else:
            consultar_instrucao(sys.argv[1])
    else:
        print("\nUso do Verificador de Sinais:")
        print("  python ferramentas/verificador_sinais.py <instrucao>   (ex: lw, sw, r-type, beq, addi, lwi, jr)")
        print("  python ferramentas/verificador_sinais.py --multi       (mostra os 5 passos do multiciclo)")
        print("\nExemplo executando para 'lw':\n")
        consultar_instrucao('lw')
