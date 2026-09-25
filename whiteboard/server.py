#!/usr/bin/env python3
"""
Whiteboard Local Server for Arquitetura de Computadores
Provides real-time multi-user collaboration (WebSockets), static file serving,
and API endpoints for saving canvas state, exporting PNG for AI inspection,
and loading templates/feedback.
"""

import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import json
import base64
import time
import socket
import asyncio
import uuid
import webbrowser
import re
import shutil
import subprocess
import threading
from datetime import datetime

PORT = 8080
ACTUAL_PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if not os.path.exists(os.path.join(BASE_DIR, "index.html")) and os.path.exists(os.path.join(BASE_DIR, "whiteboard", "index.html")):
    BASE_DIR = os.path.join(BASE_DIR, "whiteboard")
REPO_DIR = os.path.dirname(BASE_DIR) if os.path.basename(BASE_DIR) == 'whiteboard' else BASE_DIR
TEMPLATES_DIR = os.path.join(BASE_DIR, 'templates')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
MATERIALS_DIR = os.path.join(BASE_DIR, 'materials')

os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(MATERIALS_DIR, exist_ok=True)

# Global Cloudflare Tunnel State
tunnel_proc = None
tunnel_url = None

def ensure_warp_connected():
    warp_bin = shutil.which('warp-cli') or shutil.which('warp-cli.exe')
    if warp_bin:
        try:
            status_res = subprocess.run([warp_bin, 'status'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=3)
            if 'Disconnected' in status_res.stdout:
                subprocess.run([warp_bin, 'connect'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
                time.sleep(1.5)
        except Exception:
            pass

def find_cloudflared():
    for candidate in [
        os.path.join(REPO_DIR, 'cloudflared.exe' if sys.platform.startswith('win') else 'cloudflared'),
        os.path.join(BASE_DIR, 'cloudflared.exe' if sys.platform.startswith('win') else 'cloudflared'),
        os.path.join(BASE_DIR, 'bin', 'cloudflared.exe' if sys.platform.startswith('win') else 'cloudflared'),
    ]:
        if os.path.exists(candidate):
            return candidate
    return shutil.which('cloudflared')

def copy_to_clipboard(text):
    try:
        if sys.platform.startswith('win'):
            p = subprocess.Popen('clip', stdin=subprocess.PIPE, shell=True)
            p.communicate(input=text.encode('utf-8'))
            return True
        elif sys.platform == 'darwin':
            p = subprocess.Popen(['pbcopy'], stdin=subprocess.PIPE)
            p.communicate(input=text.encode('utf-8'))
            return True
        else:
            for cmd in [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '--clipboard', '--input']]:
                if shutil.which(cmd[0]):
                    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
                    p.communicate(input=text.encode('utf-8'))
                    return True
    except Exception:
        pass
    return False

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('1.1.1.1', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'

def drain_stdout(proc):
    try:
        for _ in proc.stdout:
            pass
    except Exception:
        pass


# Curated catalog of all course diagrams
TEMPLATES_CATALOG = [
    # 0. Prova 2 (2026.1) - Pipeline, Forwarding, Desvios & VLIW (UFSM)
    {
        "filename": "prova2_2026_pag_1_forwarding_unit.jpg",
        "title": "Prova 2 (2026.1) - Pág 1: Forwarding Unit em C & Datapath",
        "category": "Prova Real (UFSM)",
        "badge": "Prova 2",
        "desc": "Questão 1 (4.0 pts). Implementação em C da lógica de detecção de dependência de dados nos estágios MEM/EX e WB/EX, com esquemático do Datapath completo e Forwarding Unit."
    },
    {
        "filename": "prova2_2026_pag_2_predicao_vliw.jpg",
        "title": "Prova 2 (2026.1) - Pág 2: Predição de Desvios & VLIW",
        "category": "Prova Real (UFSM)",
        "badge": "Prova 2",
        "desc": "Questão 2 (1.5 pts V/F Monociclo vs Pipeline), Questão 3 (1.5 pts Preditor 1-bit e Bimodal 2-bit com tabela de acertos) e Questão 4 (3.0 pts MIPS VLIW com latência de uso)."
    },
    {
        "filename": "prova2_2026_pag_3_pipeline_bimodal_hazards.jpg",
        "title": "Prova 2 (2026.1) - Pág 3: Pipeline 5 Estágios & Tabela Espaço-Tempo",
        "category": "Prova Real (UFSM)",
        "badge": "Prova 2",
        "desc": "Questão 1 (7.0 pts). Análise de Hazards RAW e WAR, erros de predição bimodal (100 iterações) e cronograma temporal com bolhas (IF, ID, EX, MEM, WB)."
    },
    {
        "filename": "prova2_2026_pag_4_pipeline_6estagios_vliw.jpg",
        "title": "Prova 2 (2026.1) - Pág 4: Pipeline 6 Estágios (2 MEM) & VLIW",
        "category": "Prova Real (UFSM)",
        "badge": "Prova 2",
        "desc": "Questão 1.d (3.0 pts). Pipeline de 6 estágios com 2 estágios de memória e forwarding sem bolhas no LW, e Questão 2 (3.0 pts) MIPS VLIW de 8 instruções."
    },

    # 1. Prova 1 Oficial (UFSM)
    {
        "filename": "prova_q1_add3.jpg",
        "title": "Prova Q1: add3 $rd, $rs, $rt (Monociclo)",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Questão 1 da prova real (3.0 pts). Adicionar instrução rd = rs + rt + rd modificando o banco de registradores e inserindo 2ª ULA."
    },
    {
        "filename": "prova_q2_subabs.jpg",
        "title": "Prova Q2: subabs $rd, $rs, $rt (Monociclo)",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Questão 2 da prova real (3.0 pts). Adicionar instrução rd = |rs - rt|. Cuidado com a seleção pelo bit de sinal!"
    },
    {
        "filename": "prova_q3_relu.jpg",
        "title": "Prova Q3: relu $rs (Multiciclo + FSM)",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Questão 3 da prova real (4.0 pts). Instrução if (rs > 0) rs = rs else rs = 0 no multiciclo com novos estados na FSM."
    },
    {
        "filename": "prova1_pag_1.jpg",
        "title": "Prova Completa - Página 1 (Q1 add3)",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Enunciado e datapath original da Questão 1 da prova."
    },
    {
        "filename": "prova1_pag_2.jpg",
        "title": "Prova Completa - Página 2 (Q2 subabs)",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Enunciado e datapath original da Questão 2 da prova."
    },
    {
        "filename": "prova1_pag_3.jpg",
        "title": "Prova Completa - Página 3 (Q3 relu)",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Enunciado e diagrama multiciclo original da Questão 3 da prova."
    },
    {
        "filename": "prova2024_pag_1_desempenho_sinais.jpg",
        "title": "Prova 2024 - Pág 1: Desempenho e Sinais (Add, Beq, Lw)",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Questões 1, 2 e 3 da Prova 2024 (Nota 10,0). Cálculo de CPI e falhas de sinais no Mono e Multiciclo."
    },
    {
        "filename": "prova2024_pag_2_jal_datapath.jpg",
        "title": "Prova 2024 - Pág 2: Datapaths JAL (Mono e Multi)",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Questão 4 da Prova 2024 (4.5 pts). Adicionar instrução JAL no Monociclo e no Multiciclo."
    },
    {
        "filename": "prova2024_pag_3_jal_fsm.jpg",
        "title": "Prova 2024 - Pág 3: FSM Multiciclo JAL",
        "category": "Prova Real (UFSM)",
        "badge": "Prova",
        "desc": "Questão 4 da Prova 2024. Máquina de estados completa para adicionar os passos de JAL."
    },

    # 1. Incompletos para Praticar / Preencher
    {
        "filename": "incompleto_mono_sem_controle.jpg",
        "title": "Monociclo em Branco (Sem Linhas de Controle)",
        "category": "Incompletos (Para Praticar)",
        "badge": "Treino",
        "desc": "Datapath completo com blocos e MUXes, mas sem fios de controle. Ideal para desenhar os sinais de cada instrução."
    },
    {
        "filename": "incompleto_multi_sem_controle.jpg",
        "title": "Multiciclo em Branco (Bloco Operacional com MUXes)",
        "category": "Incompletos (Para Praticar)",
        "badge": "Treino",
        "desc": "Bloco operacional com IR, MDR, A, B, ALUOut e MUXes, pronto para traçar a propagação dos passos."
    },
    {
        "filename": "incompleto_mono_add_sub_lw_sw.jpg",
        "title": "Monociclo Básico (ADD, SUB, LW, SW)",
        "category": "Incompletos (Para Praticar)",
        "badge": "Treino",
        "desc": "Datapath simplificado sem branch e sem jump, para praticar as primeiras instruções."
    },
    {
        "filename": "incompleto_mono_apenas_regs_alu.jpg",
        "title": "Monociclo Inicial (Apenas Banco de Registradores e ULA)",
        "category": "Incompletos (Para Praticar)",
        "badge": "Treino",
        "desc": "Blocos essenciais de operações Tipo R para entender o fluxo de dados entre registradores e ULA."
    },
    {
        "filename": "incompleto_multi_apenas_registradores.jpg",
        "title": "Multiciclo Inicial (Registradores Internos)",
        "category": "Incompletos (Para Praticar)",
        "badge": "Treino",
        "desc": "Esquemático com os registradores temporários IR, MDR, A, B, ALUOut para praticar a lógica de multiplexação."
    },

    # 2. Completos de Referência
    {
        "filename": "completo_mono_datapath_controle.jpg",
        "title": "Monociclo Completo com Controle",
        "category": "Completos (Referência)",
        "badge": "Completo",
        "desc": "Caminho de dados monociclo com unidade de controle principal, ALU Control e todos os barramentos azuis."
    },
    {
        "filename": "completo_mono_com_jump.jpg",
        "title": "Monociclo Completo com Jump",
        "category": "Completos (Referência)",
        "badge": "Completo",
        "desc": "Datapath completo com suporte à instrução incondicional Jump (formato J) e MUX do PC."
    },
    {
        "filename": "completo_mono_tabela_sinais.jpg",
        "title": "Tabela da Verdade dos Sinais de Controle (Monociclo)",
        "category": "Completos (Referência)",
        "badge": "Tabela",
        "desc": "Tabela oficial dos sinais RegDst, ALUSrc, MemtoReg, RegWrite, MemRead, MemWrite, Branch, ALUOp."
    },
    {
        "filename": "completo_multi_datapath.jpg",
        "title": "Multiciclo Completo com Controle",
        "category": "Completos (Referência)",
        "badge": "Completo",
        "desc": "Caminho de dados multiciclo completo com sinais IorD, ALUSelA, ALUSelB, PCSource, IRWrite, etc."
    },
    {
        "filename": "completo_multi_fsm_10_estados.png",
        "title": "FSM Multiciclo Completa (10 Estados)",
        "category": "Completos (Referência)",
        "badge": "FSM",
        "desc": "Máquina de estados finitos detalhada de 10 estados (0 a 9) com todas as condições de transição e sinais."
    },
    {
        "filename": "completo_multi_excecoes.jpg",
        "title": "Multiciclo Completo com Exceções",
        "category": "Completos (Referência)",
        "badge": "Exceções",
        "desc": "Hardware estendido para suporte a exceções (EPC, Cause, registrador de status, vetor 0x80000180)."
    },
    {
        "filename": "completo_multi_fsm_excecoes.jpg",
        "title": "FSM Completa com Estados de Exceção (10 e 11)",
        "category": "Completos (Referência)",
        "badge": "FSM",
        "desc": "FSM estendida com os estados 10 (Instrução Indefinida) e 11 (Overflow Aritmético)."
    },

    # 3. Os 5 Passos do Multiciclo
    {
        "filename": "passo_1_busca_fetch.jpg",
        "title": "Passo 1: Busca de Instrução (IR = Mem[PC]; PC = PC + 4)",
        "category": "Passos Multiciclo",
        "badge": "Passo 1",
        "desc": "Destaque do caminho percorrido durante a busca da instrução e incremento do PC."
    },
    {
        "filename": "passo_2_decodificacao_branch.jpg",
        "title": "Passo 2: Decodificação e Branch Antecipado",
        "category": "Passos Multiciclo",
        "badge": "Passo 2",
        "desc": "Leitura de registradores (A e B) e cálculo antecipado do endereço de salto na ULA."
    },
    {
        "filename": "passo_3_tipo_r_execucao.jpg",
        "title": "Passo 3: Execução Tipo R (ALUOut = A op B)",
        "category": "Passos Multiciclo",
        "badge": "Passo 3",
        "desc": "Cálculo da operação aritmética ou lógica na ULA para instruções Tipo R."
    },
    {
        "filename": "passo_4_tipo_r_writeback.jpg",
        "title": "Passo 4: Write-Back Tipo R (Reg[rd] = ALUOut)",
        "category": "Passos Multiciclo",
        "badge": "Passo 4",
        "desc": "Gravação do resultado da ULA no registrador de destino rd."
    },
    {
        "filename": "passo_3_memoria_endereco.jpg",
        "title": "Passo 3: Memória (Cálculo de Endereço A + offset)",
        "category": "Passos Multiciclo",
        "badge": "Passo 3",
        "desc": "Cálculo do endereço efetivo de memória para instruções LW e SW."
    },
    {
        "filename": "passo_4_load_leitura.jpg",
        "title": "Passo 4: Leitura da Memória (MDR = Mem[ALUOut])",
        "category": "Passos Multiciclo",
        "badge": "Passo 4",
        "desc": "Acesso de leitura à memória de dados para instrução LW."
    },
    {
        "filename": "passo_5_load_writeback.jpg",
        "title": "Passo 5: Write-Back LW (Reg[rt] = MDR)",
        "category": "Passos Multiciclo",
        "badge": "Passo 5",
        "desc": "Conclusão do LW: gravação do dado da memória no registrador rt."
    },
    {
        "filename": "passo_4_store_memoria.jpg",
        "title": "Passo 4: Escrita na Memória SW (Mem[ALUOut] = B)",
        "category": "Passos Multiciclo",
        "badge": "Passo 4",
        "desc": "Gravação do dado do registrador B na memória de dados (conclusão do SW)."
    },
    {
        "filename": "passo_3_branch_desvio.jpg",
        "title": "Passo 3: Decisão de Branch (if A == B then PC = ALUOut)",
        "category": "Passos Multiciclo",
        "badge": "Passo 3",
        "desc": "Comparação de registradores na ULA e atualização condicional do PC."
    },
    {
        "filename": "passo_3_jump_salto.jpg",
        "title": "Passo 3: Salto Incondicional Jump",
        "category": "Passos Multiciclo",
        "badge": "Passo 3",
        "desc": "Atualização do PC com o endereço de 26 bits deslocado."
    },

    # 4. Exercícios dos Slides
    {
        "filename": "exercicio_4_1_and.jpg",
        "title": "Exercício 4.1: Sinais e Recursos da Instrução AND",
        "category": "Exercícios dos Slides",
        "badge": "Ex 4.1",
        "desc": "Identificar sinais de controle e blocos ativos/inativos para a instrução AND Rd, Rs, Rt."
    },
    {
        "filename": "exercicio_4_2_lwi.jpg",
        "title": "Exercício 4.2: Implementando Nova Instrução LWI Rt, Rd(Rs)",
        "category": "Exercícios dos Slides",
        "badge": "Ex 4.2",
        "desc": "Load Word com deslocamento em registrador. Quais blocos e sinais adicionar ao datapath?"
    },
    {
        "filename": "exercicio_4_3_speedup.jpg",
        "title": "Exercício 4.3: Latências, Multiplicador e Speedup",
        "category": "Exercícios dos Slides",
        "badge": "Ex 4.3",
        "desc": "Calcular tempo de ciclo com e sem multiplicador e avaliar o ganho real de desempenho."
    },
    {
        "filename": "exercicio_4_4_caminho_critico.jpg",
        "title": "Exercício 4.4: Caminho Crítico e Tempo de Relógio",
        "category": "Exercícios dos Slides",
        "badge": "Ex 4.4",
        "desc": "Calcular o ciclo para processadores que só fazem fetch, branch relativo ou condicional."
    },
    {
        "filename": "exercicio_5_8_jr.jpg",
        "title": "Exercício 5.8: Adicionando Instrução JR $ra (Jump Register)",
        "category": "Exercícios dos Slides",
        "badge": "Ex 5.8",
        "desc": "Desenhar as modificações necessárias no caminho de dados para suportar PC = Reg[rs]."
    },
    {
        "filename": "exercicio_5_11_lwpi.jpg",
        "title": "Exercício 5.11 a 5.14: LWPI (Pós-Incremento) e SWAP",
        "category": "Exercícios dos Slides",
        "badge": "Ex 5.11",
        "desc": "Por que o Monociclo não suporta LWPI sem duplicar portas e como o Multiciclo resolve em 6 ciclos."
    },
    {
        "filename": "exercicio_5_29_stuck_at.jpg",
        "title": "Exercício 5.29: Falhas Presas (Stuck-at) no Multiciclo",
        "category": "Exercícios dos Slides",
        "badge": "Ex 5.29",
        "desc": "Efeito de sinais presos em 0 ou 1 (IRWrite=0, PCWrite=0, PCWriteCond=0, etc.)."
    },
    {
        "filename": "exercicio_5_49_eret.jpg",
        "title": "Exercício 5.49 e 5.50: Instrução ERET e Tratamento de Exceções",
        "category": "Exercícios dos Slides",
        "badge": "Ex 5.49",
        "desc": "Implementação do retorno de exceção PC = EPC no caminho de dados e FSM."
    }
]

def get_local_ip():
    """Detects real local LAN IP of the current machine (e.g. 192.168.x.x)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.1)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'

# Boards directory and Multi-Board Metadata
BOARDS_DIR = os.path.join(BASE_DIR, 'boards')
os.makedirs(BOARDS_DIR, exist_ok=True)
METADATA_FILE = os.path.join(BOARDS_DIR, 'metadata.json')
active_board_id = "arq-prova1"

# In-memory canonical state of board elements
current_board_elements = []
connected_clients = {}  # clientId -> { "ws": WebSocket, "name": str, "color": str }
ACTUAL_PORT = PORT

# In-memory canonical state of pipeline simulator
current_pipeline_state = {
    "scenarioId": "raw_classic",
    "instructions": [
        {"id": "i1", "op": "SUB", "rd": "$2", "rs": "$1", "rt": "$3", "isBubble": False},
        {"id": "i2", "op": "AND", "rd": "$12", "rs": "$2", "rt": "$5", "isBubble": False},
        {"id": "i3", "op": "OR", "rd": "$13", "rs": "$6", "rt": "$2", "isBubble": False},
        {"id": "i4", "op": "ADD", "rd": "$14", "rs": "$2", "rt": "$2", "isBubble": False},
        {"id": "i5", "op": "SW", "rd": "$15", "rs": "$2", "offset": 100, "isBubble": False}
    ],
    "currentCycle": 0,
    "forwardingEnabled": False,
    "hazardMode": "manual",
    "isPlaying": False
}

def load_metadata():
    """Load boards metadata or return default structure."""
    if os.path.exists(METADATA_FILE):
        try:
            with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Aviso ao carregar metadata.json: {e}")
    # Default fallback
    return {
        "activeBoardId": "arq-prova1",
        "subjects": [
            {
                "id": "arq",
                "name": "Arquitetura de Computadores",
                "icon": "cpu",
                "boards": [
                    {
                        "id": "arq-prova1",
                        "title": "Arquitetura - Prova 1 & Datapaths",
                        "gridType": "dots",
                        "createdAt": datetime.now().isoformat(),
                        "updatedAt": datetime.now().isoformat()
                    }
                ]
            }
        ]
    }

def save_metadata(data):
    """Save metadata to metadata.json."""
    try:
        with open(METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao salvar metadata.json: {e}")

def load_initial_elements():
    """Load vector elements for the active board."""
    global current_board_elements, active_board_id
    meta = load_metadata()
    active_board_id = meta.get("activeBoardId", "arq-prova1")
    board_file = os.path.join(BOARDS_DIR, f"{active_board_id}.json")
    if not os.path.exists(board_file):
        board_file = os.path.join(BASE_DIR, 'current_board.json')

    if os.path.exists(board_file):
        try:
            with open(board_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict) and 'elements' in data:
                    current_board_elements = data['elements']
                elif isinstance(data, list):
                    current_board_elements = data
        except Exception as e:
            print(f"Aviso ao carregar quadro inicial ({board_file}): {e}")

load_initial_elements()
for element in current_board_elements:
    element.setdefault('id', str(uuid.uuid4()))


def apply_board_patch(changes):
    """Apply board changes (create, update, delete) to the canonical shared board elements."""
    result = []
    for change in changes:
        element_id = change.get('id')
        if not element_id:
            continue
        index = next((i for i, el in enumerate(current_board_elements) if el.get('id') == element_id), None)
        after = change.get('after')
        if after is None:
            if index is not None:
                current_board_elements.pop(index)
            result.append({'id': element_id, 'after': None, 'afterIndex': None})
        else:
            if isinstance(after, dict) and after.get('id') != element_id:
                after['id'] = element_id
            if index is not None:
                current_board_elements[index] = after
                result.append({'id': element_id, 'after': after, 'afterIndex': index})
            else:
                position = change.get('afterIndex')
                if position is None or position < 0 or position > len(current_board_elements):
                    position = len(current_board_elements)
                current_board_elements.insert(position, after)
                result.append({'id': element_id, 'after': after, 'afterIndex': position})
    return result

def save_elements_to_disk():
    """Save vector elements to the active board JSON and mirror to current_board.json."""
    global active_board_id
    try:
        board_json = os.path.join(BOARDS_DIR, f"{active_board_id}.json")
        current_json = os.path.join(BASE_DIR, 'current_board.json')
        payload = {'elements': current_board_elements}
        with open(board_json, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False)
        with open(current_json, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False)
    except Exception as e:
        print(f"Erro ao persistir quadro ({active_board_id}): {e}")

save_task = None
def schedule_save_elements():
    global save_task
    try:
        loop = asyncio.get_running_loop()
        if save_task and not save_task.done():
            save_task.cancel()

        async def _delayed_save():
            await asyncio.sleep(1.0)
            save_elements_to_disk()

        save_task = loop.create_task(_delayed_save())
    except Exception:
        save_elements_to_disk()

async def broadcast(message: dict, exclude: str = None):
    text = json.dumps(message, ensure_ascii=False)
    to_remove = []
    for cid, client in list(connected_clients.items()):
        if exclude and cid == exclude:
            continue
        try:
            await client["ws"].send_text(text)
        except Exception:
            to_remove.append(cid)
    for cid in to_remove:
        if cid in connected_clients:
            del connected_clients[cid]

# ==================== FastAPI App Setup ====================
try:
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, HTTPException
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

    app = FastAPI(title="Whiteboard MIPS - Colaborativo")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_no_cache_headers(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.endswith((".js", ".css", ".html", ".json")) or path == "/":
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


    @app.get("/api/network-info")
    async def api_network_info():
        ip = get_local_ip()
        return {
            "local_ip": ip,
            "port": ACTUAL_PORT,
            "local_url": f"http://{ip}:{ACTUAL_PORT}",
            "clients_count": len(connected_clients)
        }

    # ==================== Multi-Boards & Subjects Endpoints ====================
    @app.get("/api/boards")
    async def api_get_boards():
        meta = load_metadata()
        return meta

    @app.post("/api/boards/select")
    async def api_select_board(request: Request):
        global active_board_id, current_board_elements
        payload = await request.json()
        new_board_id = payload.get("boardId")
        if not new_board_id:
            raise HTTPException(status_code=400, detail="boardId é obrigatório")

        # Salva o board atual antes de trocar
        save_elements_to_disk()

        meta = load_metadata()
        board_file = os.path.join(BOARDS_DIR, f"{new_board_id}.json")
        if not os.path.exists(board_file):
            raise HTTPException(status_code=404, detail="Quadro não encontrado")

        try:
            with open(board_file, 'r', encoding='utf-8') as f:
                b_data = json.load(f)
                current_board_elements.clear()
                if isinstance(b_data, dict) and 'elements' in b_data:
                    current_board_elements.extend(b_data['elements'])
                elif isinstance(b_data, list):
                    current_board_elements.extend(b_data)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro ao ler arquivo do quadro: {e}")

        active_board_id = new_board_id
        meta["activeBoardId"] = active_board_id
        save_metadata(meta)
        save_elements_to_disk()

        grid_type = "dots"
        for subj in meta.get("subjects", []):
            for b in subj.get("boards", []):
                if b.get("id") == new_board_id:
                    grid_type = b.get("gridType", "dots")
                    break

        await broadcast({
            "type": "board_sync",
            "boardId": active_board_id,
            "elements": current_board_elements,
            "gridType": grid_type
        })

        return {
            "status": "ok",
            "boardId": active_board_id,
            "elements": current_board_elements,
            "gridType": grid_type
        }

    @app.post("/api/boards/create")
    async def api_create_board(request: Request):
        global active_board_id, current_board_elements
        payload = await request.json()
        subject_id = payload.get("subjectId")
        title = payload.get("title", "Novo Caderno").strip()
        grid_type = payload.get("gridType", "dots")

        if not subject_id:
            raise HTTPException(status_code=400, detail="subjectId é obrigatório")

        meta = load_metadata()
        target_subject = next((s for s in meta.get("subjects", []) if s.get("id") == subject_id), None)
        if not target_subject:
            raise HTTPException(status_code=404, detail="Matéria não encontrada")

        import re
        slug = re.sub(r'[^a-zA-Z0-9]', '', title.lower())[:12] or "caderno"
        new_board_id = f"{subject_id}-{slug}-{uuid.uuid4().hex[:6]}"

        new_board = {
            "id": new_board_id,
            "title": title,
            "gridType": grid_type,
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat()
        }

        new_board_file = os.path.join(BOARDS_DIR, f"{new_board_id}.json")
        with open(new_board_file, 'w', encoding='utf-8') as f:
            json.dump({"elements": []}, f, ensure_ascii=False)

        target_subject.setdefault("boards", []).append(new_board)
        save_metadata(meta)

        return {"status": "ok", "board": new_board, "metadata": meta}

    @app.post("/api/boards/rename")
    async def api_rename_board(request: Request):
        payload = await request.json()
        board_id = payload.get("boardId")
        new_title = payload.get("title", "").strip()
        grid_type = payload.get("gridType")

        if not board_id or not new_title:
            raise HTTPException(status_code=400, detail="boardId e title são obrigatórios")

        meta = load_metadata()
        found = False
        for subj in meta.get("subjects", []):
            for b in subj.get("boards", []):
                if b.get("id") == board_id:
                    b["title"] = new_title
                    if grid_type:
                        b["gridType"] = grid_type
                    b["updatedAt"] = datetime.now().isoformat()
                    found = True
                    break
            if found:
                break

        if not found:
            raise HTTPException(status_code=404, detail="Quadro não encontrado")

        save_metadata(meta)
        return {"status": "ok", "metadata": meta}

    @app.post("/api/boards/delete")
    async def api_delete_board(request: Request):
        global active_board_id, current_board_elements
        payload = await request.json()
        board_id = payload.get("boardId")

        if not board_id:
            raise HTTPException(status_code=400, detail="boardId é obrigatório")

        meta = load_metadata()
        all_boards = [b for s in meta.get("subjects", []) for b in s.get("boards", [])]
        if len(all_boards) <= 1:
            raise HTTPException(status_code=400, detail="Não é permitido excluir o único quadro existente")

        found = False
        for subj in meta.get("subjects", []):
            original_len = len(subj.get("boards", []))
            subj["boards"] = [b for b in subj.get("boards", []) if b.get("id") != board_id]
            if len(subj["boards"]) < original_len:
                found = True
                break

        if not found:
            raise HTTPException(status_code=404, detail="Quadro não encontrado")

        bfile = os.path.join(BOARDS_DIR, f"{board_id}.json")
        if os.path.exists(bfile):
            try:
                os.remove(bfile)
            except Exception:
                pass

        switched = False
        if active_board_id == board_id:
            remaining_boards = [b for s in meta.get("subjects", []) for b in s.get("boards", [])]
            if remaining_boards:
                new_active = remaining_boards[0]["id"]
                active_board_id = new_active
                meta["activeBoardId"] = active_board_id
                new_bfile = os.path.join(BOARDS_DIR, f"{active_board_id}.json")
                if os.path.exists(new_bfile):
                    with open(new_bfile, 'r', encoding='utf-8') as f:
                        b_data = json.load(f)
                        current_board_elements.clear()
                        if isinstance(b_data, dict) and 'elements' in b_data:
                            current_board_elements.extend(b_data['elements'])
                        elif isinstance(b_data, list):
                            current_board_elements.extend(b_data)
                save_elements_to_disk()
                switched = True

        save_metadata(meta)

        if switched:
            await broadcast({
                "type": "board_sync",
                "boardId": active_board_id,
                "elements": current_board_elements
            })

        return {"status": "ok", "metadata": meta, "activeBoardId": active_board_id}

    @app.post("/api/subjects/create")
    async def api_create_subject(request: Request):
        payload = await request.json()
        name = payload.get("name", "").strip()
        icon = payload.get("icon", "book").strip() or "book"

        if not name:
            raise HTTPException(status_code=400, detail="Nome da matéria é obrigatório")

        meta = load_metadata()
        import re
        subj_id = re.sub(r'[^a-zA-Z0-9]', '', name.lower())[:8] or "subj"
        subj_id = f"{subj_id}-{uuid.uuid4().hex[:4]}"

        first_board_id = f"{subj_id}-caderno-1"
        first_board = {
            "id": first_board_id,
            "title": f"Caderno 1 · {name}",
            "gridType": "dots",
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat()
        }

        with open(os.path.join(BOARDS_DIR, f"{first_board_id}.json"), 'w', encoding='utf-8') as f:
            json.dump({"elements": []}, f, ensure_ascii=False)

        new_subject = {
            "id": subj_id,
            "name": f"{icon} {name}",
            "icon": icon,
            "boards": [first_board]
        }

        meta.setdefault("subjects", []).append(new_subject)
        save_metadata(meta)

        return {"status": "ok", "subject": new_subject, "metadata": meta}

    @app.post("/api/subjects/rename")
    async def api_rename_subject(request: Request):
        payload = await request.json()
        subject_id = payload.get("subjectId")
        new_name = payload.get("name", "").strip()
        new_icon = payload.get("icon", "").strip()

        if not subject_id or not new_name:
            raise HTTPException(status_code=400, detail="subjectId e name são obrigatórios")

        meta = load_metadata()
        subj = next((s for s in meta.get("subjects", []) if s.get("id") == subject_id), None)
        if not subj:
            raise HTTPException(status_code=404, detail="Matéria não encontrada")

        if new_icon:
            subj["icon"] = new_icon
            subj["name"] = f"{new_icon} {new_name}"
        else:
            subj["name"] = new_name
        save_metadata(meta)
        return {"status": "ok", "metadata": meta}

    @app.post("/api/subjects/delete")
    async def api_delete_subject(request: Request):
        global active_board_id, current_board_elements
        payload = await request.json()
        subject_id = payload.get("subjectId")

        if not subject_id:
            raise HTTPException(status_code=400, detail="subjectId é obrigatório")

        meta = load_metadata()
        subjects = meta.get("subjects", [])
        if len(subjects) <= 1:
            raise HTTPException(status_code=400, detail="Não é possível excluir a única matéria existente")

        target_subj = next((s for s in subjects if s.get("id") == subject_id), None)
        if not target_subj:
            raise HTTPException(status_code=404, detail="Matéria não encontrada")

        for b in target_subj.get("boards", []):
            bid = b.get("id")
            bpath = os.path.join(BOARDS_DIR, f"{bid}.json")
            if os.path.exists(bpath):
                try:
                    os.remove(bpath)
                except Exception:
                    pass

        meta["subjects"] = [s for s in subjects if s.get("id") != subject_id]

        board_ids_deleted = {b.get("id") for b in target_subj.get("boards", [])}
        if active_board_id in board_ids_deleted:
            remaining_boards = [b for s in meta["subjects"] for b in s.get("boards", [])]
            if remaining_boards:
                active_board_id = remaining_boards[0]["id"]
                meta["activeBoardId"] = active_board_id
                new_bfile = os.path.join(BOARDS_DIR, f"{active_board_id}.json")
                if os.path.exists(new_bfile):
                    with open(new_bfile, 'r', encoding='utf-8') as f:
                        b_data = json.load(f)
                        current_board_elements.clear()
                        if isinstance(b_data, dict) and 'elements' in b_data:
                            current_board_elements.extend(b_data['elements'])
                        elif isinstance(b_data, list):
                            current_board_elements.extend(b_data)
                save_elements_to_disk()

        save_metadata(meta)
        return {"status": "ok", "metadata": meta, "activeBoardId": active_board_id}

    @app.get("/api/materials")
    async def api_get_materials(subjectId: str = ""):
        meta = load_metadata()
        subj_id = subjectId.strip() if subjectId else meta.get("subjects", [{}])[0].get("id", "arq")

        target_subj = next((s for s in meta.get("subjects", []) if s.get("id") == subj_id), None)
        materials_list = []

        if target_subj:
            materials_list.extend(target_subj.get("materials", []))

        subj_mat_dir = os.path.join(MATERIALS_DIR, subj_id)
        if os.path.exists(subj_mat_dir):
            existing_filenames = {m.get("filename") for m in materials_list}
            for fname in os.listdir(subj_mat_dir):
                if fname not in existing_filenames and any(fname.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.webp', '.svg']):
                    materials_list.append({
                        "id": f"fs-{fname}",
                        "title": os.path.splitext(fname)[0].replace('_', ' ').title(),
                        "filename": fname,
                        "url": f"/materials/{subj_id}/{fname}",
                        "category": "Uploads",
                        "badge": "Material",
                        "isCustom": True
                    })

        if subj_id == "arq":
            for item in TEMPLATES_CATALOG:
                fpath = os.path.join(TEMPLATES_DIR, item['filename'])
                if os.path.exists(fpath):
                    materials_list.append({
                        "id": f"template-{item['filename']}",
                        "title": item['title'],
                        "filename": item['filename'],
                        "url": f"/templates/{item['filename']}",
                        "category": item['category'],
                        "badge": item.get('badge', 'MIPS'),
                        "desc": item.get('desc', ''),
                        "isCustom": False
                    })

        return {"status": "ok", "subjectId": subj_id, "materials": materials_list}

    @app.post("/api/materials/upload")
    async def api_upload_material(request: Request):
        try:
            payload = await request.json()
            subject_id = payload.get("subjectId")
            title = payload.get("title", "").strip() or "Material de Estudo"
            image_data = payload.get("image", "")
            category = payload.get("category", "Geral").strip() or "Geral"

            if not subject_id or not image_data.startswith("data:image"):
                raise HTTPException(status_code=400, detail="subjectId e imagem válidos são obrigatórios")

            meta = load_metadata()
            target_subj = next((s for s in meta.get("subjects", []) if s.get("id") == subject_id), None)
            if not target_subj:
                raise HTTPException(status_code=404, detail="Matéria não encontrada")

            header, b64_str = image_data.split(',', 1)
            ext = '.png'
            if 'jpeg' in header or 'jpg' in header:
                ext = '.jpg'
            elif 'webp' in header:
                ext = '.webp'

            subj_mat_dir = os.path.join(MATERIALS_DIR, subject_id)
            os.makedirs(subj_mat_dir, exist_ok=True)

            file_id = uuid.uuid4().hex[:10]
            clean_title_slug = re.sub(r'[^a-zA-Z0-9]', '_', title.lower())[:16] or "material"
            filename = f"{clean_title_slug}_{file_id}{ext}"
            filepath = os.path.join(subj_mat_dir, filename)

            img_bytes = base64.b64decode(b64_str)
            try:
                from PIL import Image
                import io
                with Image.open(io.BytesIO(img_bytes)) as im:
                    w, h = im.size
                    max_dim = 2560
                    if w > max_dim or h > max_dim:
                        scale = min(max_dim / w, max_dim / h)
                        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
                    im.save(filepath, optimize=True)
            except Exception:
                with open(filepath, 'wb') as f:
                    f.write(img_bytes)

            mat_obj = {
                "id": f"mat-{file_id}",
                "title": title,
                "filename": filename,
                "url": f"/materials/{subject_id}/{filename}",
                "category": category,
                "badge": "Custom",
                "isCustom": True,
                "addedAt": datetime.now().isoformat()
            }

            target_subj.setdefault("materials", []).append(mat_obj)
            save_metadata(meta)

            return {"status": "ok", "material": mat_obj}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro ao salvar material: {e}")

    @app.post("/api/materials/delete")
    async def api_delete_material(request: Request):
        payload = await request.json()
        subject_id = payload.get("subjectId")
        material_id = payload.get("materialId")

        if not subject_id or not material_id:
            raise HTTPException(status_code=400, detail="subjectId e materialId são obrigatórios")

        meta = load_metadata()
        target_subj = next((s for s in meta.get("subjects", []) if s.get("id") == subject_id), None)
        if not target_subj:
            raise HTTPException(status_code=404, detail="Matéria não encontrada")

        materials = target_subj.get("materials", [])
        mat_to_delete = next((m for m in materials if m.get("id") == material_id), None)
        if mat_to_delete:
            target_subj["materials"] = [m for m in materials if m.get("id") != material_id]
            fname = mat_to_delete.get("filename")
            if fname:
                fpath = os.path.join(MATERIALS_DIR, subject_id, fname)
                if os.path.exists(fpath):
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass
            save_metadata(meta)

        return {"status": "ok"}

    @app.get("/api/tunnel/status")
    async def api_tunnel_status():
        global tunnel_proc, tunnel_url
        is_running = bool(tunnel_proc and tunnel_proc.poll() is None and tunnel_url)
        port = ACTUAL_PORT or 8080
        local_ip = get_local_ip()
        return {
            "status": "ok",
            "active": is_running,
            "url": tunnel_url if is_running else None,
            "localUrl": f"http://{local_ip}:{port}"
        }

    @app.post("/api/tunnel/start")
    async def api_tunnel_start():
        global tunnel_proc, tunnel_url
        port = ACTUAL_PORT or 8080
        local_ip = get_local_ip()
        local_url = f"http://{local_ip}:{port}"

        if tunnel_proc and tunnel_proc.poll() is None and tunnel_url:
            return {
                "status": "ok",
                "url": tunnel_url,
                "localUrl": local_url,
                "alreadyRunning": True
            }

        cf_bin = find_cloudflared()
        if not cf_bin:
            raise HTTPException(status_code=500, detail="Binário cloudflared não encontrado no sistema.")

        ensure_warp_connected()

        try:
            cmd = [
                cf_bin,
                'tunnel',
                '--edge-ip-version', '4',
                '--url', f'http://localhost:{port}'
            ]
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                encoding='utf-8',
                errors='replace'
            )
            tunnel_proc = proc

            url_pattern = re.compile(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
            loop = asyncio.get_event_loop()

            def wait_for_tunnel():
                nonlocal proc
                start = time.time()
                url = None
                registered = False
                for line in proc.stdout:
                    if not url:
                        m = url_pattern.search(line)
                        if m:
                            url = m.group(0)
                    if 'Registered tunnel connection' in line or 'Connection registered' in line:
                        registered = True
                        break
                    if any(err in line for err in ['TLS handshake with edge error', 'forcibly closed', 'failed to dial to edge']):
                        break
                    if time.time() - start > 25 or proc.poll() is not None:
                        break

                threading.Thread(target=drain_stdout, args=(proc,), daemon=True).start()
                return url, registered

            url, registered = await loop.run_in_executor(None, wait_for_tunnel)

            if url and registered:
                tunnel_url = url
                copy_to_clipboard(url)
                return {
                    "status": "ok",
                    "url": url,
                    "localUrl": local_url,
                    "alreadyRunning": False
                }
            elif url:
                tunnel_url = url
                copy_to_clipboard(url)
                return {
                    "status": "ok",
                    "url": url,
                    "localUrl": local_url,
                    "warning": "Túnel gerado. Se houver lentidão externa, verifique se o Cloudflare WARP está ativo ou use o link de rede local.",
                    "alreadyRunning": False
                }
            else:
                if proc.poll() is None:
                    proc.terminate()
                raise HTTPException(status_code=500, detail="Não foi possível estabelecer conexão com o Cloudflare Tunnel. Verifique se o Cloudflare WARP está ativo ou use a rede local.")
        except Exception as e:
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/tunnel/stop")
    async def api_tunnel_stop():
        global tunnel_proc, tunnel_url
        if tunnel_proc and tunnel_proc.poll() is None:
            try:
                tunnel_proc.terminate()
            except Exception:
                pass
        tunnel_proc = None
        tunnel_url = None
        return {"status": "ok"}


    @app.get("/api/templates")
    async def api_templates():
        templates = []
        for item in TEMPLATES_CATALOG:
            fpath = os.path.join(TEMPLATES_DIR, item['filename'])
            if os.path.exists(fpath):
                templates.append({
                    'filename': item['filename'],
                    'url': f"/templates/{item['filename']}",
                    'title': item['title'],
                    'category': item['category'],
                    'badge': item.get('badge', ''),
                    'desc': item.get('desc', '')
                })
        return templates

    @app.get("/api/status")
    async def api_status():
        board_png = os.path.join(BASE_DIR, 'current_board.png')
        feedback_file = os.path.join(BASE_DIR, 'ai_feedback.json')

        has_board = os.path.exists(board_png)
        mtime = os.path.getmtime(board_png) if has_board else 0

        has_feedback = os.path.exists(feedback_file)
        feedback_mtime = os.path.getmtime(feedback_file) if has_feedback else 0

        return {
            'has_board': has_board,
            'board_last_modified': datetime.fromtimestamp(mtime).isoformat() if has_board else None,
            'has_feedback': has_feedback,
            'feedback_last_modified': datetime.fromtimestamp(feedback_mtime).isoformat() if has_feedback else None
        }

    @app.get("/api/ai-feedback")
    async def api_get_ai_feedback():
        feedback_file = os.path.join(BASE_DIR, 'ai_feedback.json')
        if os.path.exists(feedback_file):
            try:
                with open(feedback_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                return {"error": str(e), "notes": []}
        return {"notes": [], "timestamp": None}

    @app.post("/api/ai-feedback")
    async def api_post_ai_feedback(request: Request):
        feedback_file = os.path.join(BASE_DIR, 'ai_feedback.json')
        try:
            payload = await request.json()
            with open(feedback_file, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            return {'status': 'ok', 'saved': True}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Erro ao salvar feedback: {e}')

    @app.post("/api/upload")
    async def api_upload_image(request: Request):
        """Accepts base64 image data from paste or file input, writes to disk and returns clean URL."""
        try:
            payload = await request.json()
            image_data = payload.get('image', '')
            if not image_data.startswith('data:image'):
                raise HTTPException(status_code=400, detail="Formato de imagem inválido.")

            header, b64_str = image_data.split(',', 1)
            ext = '.png'
            if 'jpeg' in header or 'jpg' in header:
                ext = '.jpg'
            elif 'webp' in header:
                ext = '.webp'

            img_bytes = base64.b64decode(b64_str)
            filename = f"pasted_{uuid.uuid4().hex[:12]}{ext}"
            filepath = os.path.join(UPLOADS_DIR, filename)

            w, h = 800, 600
            try:
                from PIL import Image
                import io
                with Image.open(io.BytesIO(img_bytes)) as im:
                    w, h = im.size
                    max_dim = 2048
                    if w > max_dim or h > max_dim:
                        scale = min(max_dim / w, max_dim / h)
                        im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
                        w, h = im.size
                    im.save(filepath, optimize=True)
            except Exception:
                with open(filepath, 'wb') as f:
                    f.write(img_bytes)

            return {
                'status': 'ok',
                'url': f'/uploads/{filename}',
                'width': w,
                'height': h
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Erro ao fazer upload da imagem: {e}')

    @app.post("/api/save")
    async def api_save_board(request: Request):
        try:
            payload = await request.json()
            image_data = payload.get('image', '')
            state_data = payload.get('state', {})
            timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S')

            # Process Base64 PNG image (only when explicitly requested)
            if image_data.startswith('data:image'):
                header, b64_str = image_data.split(',', 1)
                img_bytes = base64.b64decode(b64_str)

                current_png = os.path.join(BASE_DIR, 'current_board.png')
                try:
                    from PIL import Image
                    import io
                    with Image.open(io.BytesIO(img_bytes)) as im:
                        w, h = im.size
                        max_dim = 2560
                        if w > max_dim or h > max_dim:
                            scale = min(max_dim / w, max_dim / h)
                            im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
                        im.save(current_png, format='PNG', optimize=True)
                except Exception:
                    with open(current_png, 'wb') as f:
                        f.write(img_bytes)

            # Save current_board.json (vector elements compactly)
            if state_data:
                current_json = os.path.join(BASE_DIR, 'current_board.json')
                with open(current_json, 'w', encoding='utf-8') as f:
                    json.dump(state_data, f, ensure_ascii=False)

                new_elements = state_data.get('elements')
                if new_elements is not None:
                    current_board_elements.clear()
                    current_board_elements.extend(new_elements)

            return {
                'status': 'ok',
                'timestamp': timestamp_str,
                'message': 'Quadro salvo com sucesso! O assistente de IA já consegue visualizar o desenho.',
                'image_path': 'whiteboard/current_board.png'
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Erro ao salvar quadro: {e}')

    @app.get("/api/board/export")
    async def api_board_export():
        return {
            'elements': current_board_elements,
            'exported_at': datetime.now().isoformat()
        }

    @app.post("/api/board/import")
    async def api_board_import(request: Request):
        try:
            payload = await request.json()
            new_elements = payload.get('elements', [])
            current_board_elements.clear()
            current_board_elements.extend(new_elements)
            for el in current_board_elements:
                el.setdefault('id', str(uuid.uuid4()))
            save_elements_to_disk()
            await broadcast({
                "type": "board_sync",
                "elements": current_board_elements
            })
            return {'status': 'ok', 'count': len(current_board_elements)}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        global active_board_id
        await websocket.accept()
        client_id = str(uuid.uuid4())[:8]
        connected_clients[client_id] = {
            "ws": websocket,
            "name": "Amigo",
            "color": "#2563eb"
        }

        try:
            # 1. Send initial board state & client ID
            meta = load_metadata()
            # find gridType for active board
            active_grid = "dots"
            for subj in meta.get("subjects", []):
                for b in subj.get("boards", []):
                    if b.get("id") == active_board_id:
                        active_grid = b.get("gridType", "dots")
                        break

            await websocket.send_text(json.dumps({
                "type": "init",
                "clientId": client_id,
                "activeBoardId": active_board_id,
                "boardsMeta": meta,
                "gridType": active_grid,
                "elements": current_board_elements,
                "pipelineState": current_pipeline_state,
                "userCount": len(connected_clients)
            }, ensure_ascii=False))

            # 2. Notify all others about presence
            await broadcast({
                "type": "presence",
                "userCount": len(connected_clients),
                "joined": client_id
            }, exclude=client_id)

            # 3. Message loop
            while True:
                data_text = await websocket.receive_text()
                try:
                    msg = json.loads(data_text)
                except Exception:
                    continue

                msg_type = msg.get("type")

                if msg_type == "join":
                    connected_clients[client_id]["name"] = msg.get("name", "Amigo")
                    connected_clients[client_id]["color"] = msg.get("color", "#2563eb")
                    await broadcast({
                        "type": "presence",
                        "userCount": len(connected_clients),
                        "user": {
                            "clientId": client_id,
                            "name": connected_clients[client_id]["name"],
                            "color": connected_clients[client_id]["color"]
                        }
                    })

                elif msg_type == "cursor":
                    msg["clientId"] = client_id
                    await broadcast(msg, exclude=client_id)

                elif msg_type == "stroke_live":
                    msg["clientId"] = client_id
                    await broadcast(msg, exclude=client_id)

                elif msg_type == "laser_point":
                    msg["clientId"] = client_id
                    await broadcast(msg, exclude=client_id)

                elif msg_type == "board_patch":
                    changes = apply_board_patch(msg.get('changes', []))
                    schedule_save_elements()
                    await broadcast({'type': 'board_patch', 'changes': changes, 'clientId': client_id})

                elif msg_type == "element_add":
                    el = msg.get("element")
                    if el:
                        current_board_elements.append(el)
                        schedule_save_elements()
                    msg["clientId"] = client_id
                    await broadcast(msg, exclude=client_id)

                elif msg_type == "board_sync":
                    elements = msg.get("elements")
                    if elements is not None:
                        current_board_elements.clear()
                        current_board_elements.extend(elements)
                        schedule_save_elements()
                    msg["clientId"] = client_id
                    await broadcast(msg, exclude=client_id)

                elif msg_type == "board_clear":
                    current_board_elements.clear()
                    schedule_save_elements()
                    msg["clientId"] = client_id
                    await broadcast(msg, exclude=client_id)

                elif msg_type == "board_switch":
                    bid = msg.get("boardId")
                    if bid and bid != active_board_id:
                        save_elements_to_disk()
                        bfile = os.path.join(BOARDS_DIR, f"{bid}.json")
                        if os.path.exists(bfile):
                            with open(bfile, 'r', encoding='utf-8') as f:
                                b_data = json.load(f)
                                current_board_elements.clear()
                                if isinstance(b_data, dict) and 'elements' in b_data:
                                    current_board_elements.extend(b_data['elements'])
                                elif isinstance(b_data, list):
                                    current_board_elements.extend(b_data)
                            active_board_id = bid
                            meta = load_metadata()
                            meta["activeBoardId"] = bid
                            save_metadata(meta)
                            save_elements_to_disk()

                            grid_type = "dots"
                            for subj in meta.get("subjects", []):
                                for b in subj.get("boards", []):
                                    if b.get("id") == bid:
                                        grid_type = b.get("gridType", "dots")
                                        break

                            await broadcast({
                                "type": "board_sync",
                                "boardId": active_board_id,
                                "elements": current_board_elements,
                                "gridType": grid_type
                            })
                    await broadcast(msg, exclude=client_id)

                elif msg_type == "pipeline_action":
                    if "state" in msg and isinstance(msg["state"], dict):
                        current_pipeline_state.clear()
                        current_pipeline_state.update(msg["state"])
                    msg["clientId"] = client_id
                    await broadcast(msg, exclude=client_id)

        except WebSocketDisconnect:
            pass
        except Exception as err:
            import traceback
            traceback.print_exc()
        finally:
            if client_id in connected_clients:
                del connected_clients[client_id]
            await broadcast({
                "type": "presence",
                "userCount": len(connected_clients),
                "left": client_id
            })
            await broadcast({
                "type": "cursor_remove",
                "clientId": client_id
            })

    # Serve index.html with no-cache headers for instant updates
    @app.get("/")
    async def get_index():
        return FileResponse(
            os.path.join(BASE_DIR, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )

    # Mount static files (style.css, app.js, templates, etc.)
    app.mount("/", StaticFiles(directory=BASE_DIR), name="static")

    HAS_FASTAPI = True

except ImportError:
    HAS_FASTAPI = False


def run_server(port=PORT, open_browser=True):
    global ACTUAL_PORT
    actual_port = port

    # Check port availability
    for p in range(port, port + 10):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("", p))
                actual_port = p
                break
            except OSError:
                continue

    ACTUAL_PORT = actual_port
    local_ip = get_local_ip()

    url_local = f"http://localhost:{actual_port}"
    url_wifi = f"http://{local_ip}:{actual_port}"

    print("=" * 68)
    print(" [COLLAB WHITEBOARD] SESSAO COLABORATIVA EM TEMPO REAL")
    print(f" -> Localhost:                  {url_local}")
    print(f" -> Rede Wi-Fi / Mesma rede:    {url_wifi}")
    print("-" * 68)
    print(" -> Acesso externo (Internet):")
    print(f"    Terminal: npx localtunnel --port {actual_port}")
    print(f"    ou:       cloudflared tunnel --url http://localhost:{actual_port}")
    print("=" * 68)
    print(" Dica: Desenhe, cole prints (Ctrl+V) ou carregue diagramas da matéria.")
    print(" Todos os desenhos e ponteiros dos amigos sincronizam em tempo real!")
    print(" Pressione Ctrl+C no terminal para encerrar.")
    print("=" * 68)

    if open_browser:
        try:
            # Avoid attempting GUI browser launch in headless Linux / SSH / Docker environments
            is_headless_linux = sys.platform.startswith('linux') and not (os.environ.get('DISPLAY') or os.environ.get('WAYLAND_DISPLAY'))
            if not is_headless_linux:
                webbrowser.open(url_local)
        except Exception:
            pass

    if HAS_FASTAPI:
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=actual_port, log_level="warning")
    else:
        # Fallback to standard library http.server
        import http.server
        import socketserver

        class FallbackHandler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=BASE_DIR, **kwargs)

        with socketserver.TCPServer(("", actual_port), FallbackHandler) as httpd:
            httpd.serve_forever()

if __name__ == '__main__':
    open_b = '--no-browser' not in sys.argv
    run_server(PORT, open_browser=open_b)
