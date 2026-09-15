#!/usr/bin/env python3
"""
Calculadora de Desempenho MIPS (Monociclo vs Multiciclo)
Calcula caminho crítico, período de clock, CPI médio, tempo de CPU e Speedup.
Inclui presets prontos das questões dos slides e do livro Patterson & Hennessy.
"""

import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def calcular_desempenho(latencias, mix, nome_cenario="Cenário Personalizado"):
    print("=" * 70)
    print(f" [ANALISE DE DESEMPENHO]: {nome_cenario}")
    print("=" * 70)

    # Latências dos blocos (em ps ou ns)
    t_imem = latencias.get('imem', 0)
    t_regs = latencias.get('regs', 0)
    t_alu = latencias.get('alu', 0)
    t_dmem = latencias.get('dmem', 0)
    t_mux = latencias.get('mux', 0)
    t_add = latencias.get('add', 0)

    # 1. Monociclo
    t_lw = t_imem + t_regs + t_alu + t_dmem + t_mux + t_regs
    t_r = t_imem + t_regs + t_alu + t_mux + t_regs
    t_sw = t_imem + t_regs + t_alu + t_dmem
    t_beq = t_imem + t_regs + t_alu + t_mux

    t_clock_mono = max(t_lw, t_r, t_sw, t_beq)

    print("\n[1] PROCESSADOR MONOCICLO (CPI = 1.0):")
    print(f"   - Latência LW (Caminho Crítico): {t_lw:.2f}")
    print(f"   - Latência Tipo R:              {t_r:.2f}")
    print(f"   - Latência SW:                  {t_sw:.2f}")
    print(f"   - Latência BEQ:                 {t_beq:.2f}")
    print(f"   -> Período Mínimo de Clock (T_mono): {t_clock_mono:.2f}")

    # 2. Multiciclo
    t_clock_multi = max(t_imem, t_regs, t_alu, t_dmem)

    # Ciclos padrão
    cpi_lw = 5
    cpi_sw = 4
    cpi_r = 4
    cpi_beq = 3
    cpi_j = 3

    p_lw = mix.get('lw', 0.0)
    p_sw = mix.get('sw', 0.0)
    p_r = mix.get('r', 0.0)
    p_beq = mix.get('beq', 0.0)
    p_j = mix.get('j', 0.0)

    total_pct = p_lw + p_sw + p_r + p_beq + p_j
    if abs(total_pct - 1.0) > 0.01:
        print(f"   [Aviso: a soma do mix é {total_pct*100:.1f}%, normalizando para 100%]")
        p_lw /= total_pct
        p_sw /= total_pct
        p_r /= total_pct
        p_beq /= total_pct
        p_j /= total_pct

    cpi_medio = (p_lw * cpi_lw) + (p_sw * cpi_sw) + (p_r * cpi_r) + (p_beq * cpi_beq) + (p_j * cpi_j)

    print("\n[2] PROCESSADOR MULTICICLO:")
    print(f"   - Período de Clock (Maior Estágio):  {t_clock_multi:.2f}")
    print(f"   - Mix de Instruções:")
    print(f"     * LW   ({p_lw*100:4.1f}%): {cpi_lw} ciclos")
    print(f"     * SW   ({p_sw*100:4.1f}%): {cpi_sw} ciclos")
    print(f"     * R    ({p_r*100:4.1f}%): {cpi_r} ciclos")
    print(f"     * BEQ  ({p_beq*100:4.1f}%): {cpi_beq} ciclos")
    print(f"     * JUMP ({p_j*100:4.1f}%): {cpi_j} ciclos")
    print(f"   -> CPI Médio Ponderado:              {cpi_medio:.3f}")

    # 3. Comparação de Tempo de Execução e Speedup
    tempo_medio_mono = 1.0 * t_clock_mono
    tempo_medio_multi = cpi_medio * t_clock_multi
    speedup = tempo_medio_mono / tempo_medio_multi

    print("\n[3] COMPARACAO FINAL:")
    print(f"   - Tempo médio por instrução (Mono):  {tempo_medio_mono:.2f}")
    print(f"   - Tempo médio por instrução (Multi): {tempo_medio_multi:.2f}")
    if speedup > 1.0:
        print(f"   -> SPEEDUP: Multiciclo é {speedup:.2f}x MAIS RÁPIDO que o Monociclo! (Ganho de {(speedup-1)*100:.1f}%)")
    else:
        desaceleracao = (1.0 / speedup) - 1.0
        print(f"   -> SPEEDUP: {speedup:.2f}x (Monociclo foi {1/speedup:.2f}x mais rápido devido à penalidade de estágio)")

    print("=" * 70)

def preset_slides_ufsm():
    # Slide 27 e 28 do material de multiciclo
    latencias = {
        'imem': 1.0,
        'regs': 0.5,
        'alu': 0.5,
        'dmem': 1.0,
        'mux': 0.0,
        'add': 0.3
    }
    mix = {
        'lw': 0.22,
        'sw': 0.11,
        'r': 0.49,
        'beq': 0.16,
        'j': 0.02
    }
    calcular_desempenho(latencias, mix, "Slide 27/28 - Exemplo do Professor (UFSM)")

def preset_exercicio_43():
    # Exercício 4.3 Patterson & Hennessy (mono.pdf slide 28)
    lat_sem = {'imem': 400, 'regs': 200, 'alu': 120, 'dmem': 350, 'mux': 30, 'add': 100}
    lat_com = {'imem': 400, 'regs': 200, 'alu': 420, 'dmem': 350, 'mux': 30, 'add': 100}
    mix = {'lw': 0.25, 'sw': 0.10, 'r': 0.50, 'beq': 0.15}

    print("\n--- EXERCÍCIO 4.3: SEM MELHORIA (ULA = 120ps) ---")
    calcular_desempenho(lat_sem, mix, "Exercício 4.3 Original")
    print("\n--- EXERCÍCIO 4.3: COM MULTIPLICADOR (ULA = 420ps, 5% menos instruções) ---")
    t_sem = 400 + 200 + 120 + 350 + 30
    t_com = 400 + 200 + 420 + 350 + 30
    speedup = t_sem / (0.95 * t_com)
    print(f"Tempo Sem: {t_sem} ps | Tempo Com: {0.95 * t_com:.1f} ps efetivos")
    print(f"Speedup Real com redução de instruções: {speedup:.3f} (Ficou {((1/speedup)-1)*100:.1f}% mais lento)")

def menu_interativo():
    print("\n--- CALCULADORA DE DESEMPENHO ARQUITETURA DE COMPUTADORES ---")
    print("1. Executar Preset dos Slides da Aula (UFSM Slide 27/28)")
    print("2. Executar Preset do Exercício 4.3 (Patterson & Hennessy)")
    print("3. Inserir valores personalizados")
    print("4. Sair")
    opcao = input("\nEscolha uma opção (1-4): ").strip()

    if opcao == '1':
        preset_slides_ufsm()
    elif opcao == '2':
        preset_exercicio_43()
    elif opcao == '3':
        try:
            print("\nInforme as latências (em ps ou ns):")
            imem = float(input("  Memória de Instruções: "))
            regs = float(input("  Banco de Registradores: "))
            alu = float(input("  ULA: "))
            dmem = float(input("  Memória de Dados: "))
            mux = float(input("  Multiplexador: "))

            print("\nInforme o percentual do Mix de Instruções (ex: 20 para 20%):")
            p_lw = float(input("  % Loads (LW): ")) / 100.0
            p_sw = float(input("  % Stores (SW): ")) / 100.0
            p_r = float(input("  % Tipo R: ")) / 100.0
            p_beq = float(input("  % Branches (BEQ): ")) / 100.0
            p_j = float(input("  % Jumps: ")) / 100.0

            calcular_desempenho(
                {'imem': imem, 'regs': regs, 'alu': alu, 'dmem': dmem, 'mux': mux},
                {'lw': p_lw, 'sw': p_sw, 'r': p_r, 'beq': p_beq, 'j': p_j},
                "Entrada Personalizada"
            )
        except ValueError:
            print("Erro: Digite apenas números válidos.")
    else:
        sys.exit(0)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--all':
        preset_slides_ufsm()
        preset_exercicio_43()
    else:
        menu_interativo()
