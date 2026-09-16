/**
 * Whiteboard de Arquitetura de Computadores (Mono & Multiciclo)
 * Catálogo visual completo de diagramas (em branco e completos),
 * carregamento instantâneo, ferramentas de desenho e sincronização com IA.
 */

// Canvas & Context
const canvas = document.getElementById('whiteboardCanvas');
const ctx = canvas.getContext('2d');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
const wrapper = document.getElementById('canvasWrapper');

// State
let width = 0;
let height = 0;
let dpr = window.devicePixelRatio || 1;

// Viewport Transform (Pan & Zoom)
let zoom = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let spacePressed = false;

// Drawing State
let currentTool = 'pen';
let currentColor = localStorage.getItem('whiteboard_current_color') || '#1e293b';
let currentSize = parseFloat(localStorage.getItem('whiteboard_stroke_size')) || 2.5;
let isDrawing = false;
let startX = 0;
let startY = 0;

// ==================== Color & Geometry Math Utilities ====================
function hsvToRgb(h, s, v) {
  let r, g, b;
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  if (!hex) return { r: 30, g: 41, b: 59 };
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) return { r: 30, g: 41, b: 59 };
  const num = parseInt(c, 16);
  if (isNaN(num)) return { r: 30, g: 41, b: 59 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, v };
}

function pointInTriangle(px, py, p1, p2, p3) {
  const d1 = (px - p2.x) * (p1.y - p2.y) - (p1.x - p2.x) * (py - p2.y);
  const d2 = (px - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (py - p2.y);
  const d3 = (px - p1.x) * (p3.y - p1.y) - (p1.x - p3.x) * (py - p1.y);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

// Data Layers
let elements = []; // { type: 'path'|'line'|'arrow'|'rect'|'circle'|'triangle'|'diamond'|'axes'|'sticky'|'mux'|'alu'|'text'|'image', ... }
let undoStack = [];
let redoStack = [];
let pendingUndoState = null;
const MAX_UNDO_STACK = 100;
let currentPath = null;
let drawStartState = null;
let selectedElement = null;
let selectedElements = []; // Multi-element selection array
let isAreaSelecting = false;
let areaSelectStartPt = null;
let areaSelectCurrentPt = null;
let isDraggingElement = false;
let dragStartState = null;
let dragStartPt = null;
let dragOriginalData = null;
let dragOriginalDataList = [];

let isResizingElement = false;
let resizeHandle = null;
let resizeStartPt = null;
let resizeStartState = null;
let resizeOriginalBox = null;

// Multi-Board & Subject Hub State
let activeBoardId = 'arq-prova1';
let boardsMetadata = null;
let currentGridType = localStorage.getItem('whiteboard_grid_type') || 'dots';

// Sticky Note Colors & Presets
const STICKY_PALETTE = [
  { bg: '#fef08a', text: '#713f12', name: 'Amarelo' },
  { bg: '#bae6fd', text: '#0369a1', name: 'Azul' },
  { bg: '#bbf7d0', text: '#14532d', name: 'Verde' },
  { bg: '#fbcfe8', text: '#831843', name: 'Rosa' },
  { bg: '#e9d5ff', text: '#581c87', name: 'Roxo' },
  { bg: '#fed7aa', text: '#7c2d12', name: 'Laranja' }
];
let currentStickyColor = STICKY_PALETTE[0];

// Auto-save debounce timer
let autoSaveTimer = null;

// ==================== WebSocket Collaboration State ====================
let ws = null;
let wsClientId = null;
let wsConnected = false;
let wsReconnectTimer = null;
let myUserName = localStorage.getItem('whiteboard_username') || ('Amigo ' + Math.floor(100 + Math.random() * 900));
let myUserColor = localStorage.getItem('whiteboard_usercolor') || '#2563eb';
const peerCursors = new Map(); // clientId -> { x, y, name, color, tool, lastSeen }
const peerLiveStrokes = new Map(); // clientId -> { type, points, color, size, tool }
let lastCursorBroadcastTime = 0;
let lastStrokeBroadcastTime = 0;
let hasSentInitialSync = false;

// Static Curated Templates Catalog (Fallback guarantee!)
const STATIC_TEMPLATES = [
  // 0. Prova Real Oficial (UFSM)
  {
    filename: "prova_q1_add3.jpg",
    title: "Prova Q1: add3 $rd, $rs, $rt (Monociclo)",
    category: "Prova Real (UFSM)",
    badge: "prova",
    badgeText: "PROVA",
    desc: "Questão 1 da prova real (3.0 pts). Adicionar instrução rd = rs + rt + rd modificando o banco de registradores e inserindo 2ª ULA."
  },
  {
    filename: "prova_q2_subabs.jpg",
    title: "Prova Q2: subabs $rd, $rs, $rt (Monociclo)",
    category: "Prova Real (UFSM)",
    badge: "prova",
    badgeText: "PROVA",
    desc: "Questão 2 da prova real (3.0 pts). Adicionar instrução rd = |rs - rt|. Cuidado com o cálculo de módulo e seleção pelo bit de sinal!"
  },
  {
    filename: "prova_q3_relu.jpg",
    title: "Prova Q3: relu $rs (Multiciclo + FSM)",
    category: "Prova Real (UFSM)",
    badge: "prova",
    badgeText: "PROVA",
    desc: "Questão 3 da prova real (4.0 pts). Instrução if (rs > 0) rs = rs else rs = 0 no multiciclo com novos estados na FSM."
  },
  {
    filename: "prova1_pag_1.jpg",
    title: "Prova Completa - Página 1 (Q1 add3)",
    category: "Prova Real (UFSM)",
    badge: "prova",
    badgeText: "PROVA",
    desc: "Enunciado e datapath original da Questão 1 da prova."
  },
  {
    filename: "prova1_pag_2.jpg",
    title: "Prova Completa - Página 2 (Q2 subabs)",
    category: "Prova Real (UFSM)",
    badge: "prova",
    badgeText: "PROVA",
    desc: "Enunciado e datapath original da Questão 2 da prova."
  },
  {
    filename: "prova1_pag_3.jpg",
    title: "Prova Completa - Página 3 (Q3 relu)",
    category: "Prova Real (UFSM)",
    badge: "prova",
    badgeText: "PROVA",
    desc: "Enunciado e diagrama multiciclo original da Questão 3 da prova."
  },

  // 1. Incompletos (Para Praticar / Preencher)
  {
    filename: "incompleto_mono_sem_controle.jpg",
    title: "Monociclo em Branco (Sem Linhas de Controle)",
    category: "Incompletos (Para Praticar)",
    badge: "treino",
    badgeText: "Treino",
    desc: "Datapath completo com blocos e MUXes, mas sem fios de controle. Ideal para desenhar os sinais de cada instrução."
  },
  {
    filename: "incompleto_multi_sem_controle.jpg",
    title: "Multiciclo em Branco (Bloco Operacional com MUXes)",
    category: "Incompletos (Para Praticar)",
    badge: "treino",
    badgeText: "Treino",
    desc: "Bloco operacional com IR, MDR, A, B, ALUOut e MUXes, pronto para traçar a propagação dos passos."
  },
  {
    filename: "incompleto_mono_add_sub_lw_sw.jpg",
    title: "Monociclo Básico (ADD, SUB, LW, SW)",
    category: "Incompletos (Para Praticar)",
    badge: "treino",
    badgeText: "Treino",
    desc: "Datapath simplificado sem branch e sem jump, para praticar as primeiras instruções."
  },
  {
    filename: "incompleto_mono_apenas_regs_alu.jpg",
    title: "Monociclo Inicial (Apenas Banco de Registradores e ULA)",
    category: "Incompletos (Para Praticar)",
    badge: "treino",
    badgeText: "Treino",
    desc: "Blocos essenciais de operações Tipo R para entender o fluxo de dados entre registradores e ULA."
  },
  {
    filename: "incompleto_multi_apenas_registradores.jpg",
    title: "Multiciclo Inicial (Registradores Internos)",
    category: "Incompletos (Para Praticar)",
    badge: "treino",
    badgeText: "Treino",
    desc: "Esquemático com os registradores temporários IR, MDR, A, B, ALUOut para praticar a lógica de multiplexação."
  },

  // 2. Completos (Referência & Estudo)
  {
    filename: "completo_mono_datapath_controle.jpg",
    title: "Monociclo Completo com Controle",
    category: "Completos (Referência)",
    badge: "completo",
    badgeText: "Completo",
    desc: "Caminho de dados monociclo com unidade de controle principal, ALU Control e todos os barramentos azuis."
  },
  {
    filename: "completo_mono_com_jump.jpg",
    title: "Monociclo Completo com Jump",
    category: "Completos (Referência)",
    badge: "completo",
    badgeText: "Completo",
    desc: "Datapath completo com suporte à instrução incondicional Jump (formato J) e MUX do PC."
  },
  {
    filename: "completo_mono_tabela_sinais.jpg",
    title: "Tabela de Sinais de Controle (Monociclo)",
    category: "Completos (Referência)",
    badge: "completo",
    badgeText: "Tabela",
    desc: "Tabela oficial dos sinais RegDst, ALUSrc, MemtoReg, RegWrite, MemRead, MemWrite, Branch, ALUOp."
  },
  {
    filename: "completo_multi_datapath.jpg",
    title: "Multiciclo Completo com Controle",
    category: "Completos (Referência)",
    badge: "completo",
    badgeText: "Completo",
    desc: "Caminho de dados multiciclo completo com sinais IorD, ALUSelA, ALUSelB, PCSource, IRWrite, etc."
  },
  {
    filename: "completo_multi_fsm_10_estados.png",
    title: "FSM Multiciclo Completa (10 Estados)",
    category: "Completos (Referência)",
    badge: "completo",
    badgeText: "FSM",
    desc: "Máquina de estados finitos detalhada de 10 estados (0 a 9) com todas as condições de transição e sinais."
  },
  {
    filename: "completo_multi_excecoes.jpg",
    title: "Multiciclo Completo com Exceções",
    category: "Completos (Referência)",
    badge: "completo",
    badgeText: "Exceções",
    desc: "Hardware estendido para suporte a exceções (EPC, Cause, registrador de status, vetor 0x80000180)."
  },
  {
    filename: "completo_multi_fsm_excecoes.jpg",
    title: "FSM Completa com Exceções (Estados 10 e 11)",
    category: "Completos (Referência)",
    badge: "completo",
    badgeText: "FSM",
    desc: "FSM estendida com os estados 10 (Instrução Indefinida) e 11 (Overflow Aritmético)."
  },

  // 3. Passos do Multiciclo
  {
    filename: "passo_1_busca_fetch.jpg",
    title: "Passo 1: Busca de Instrução (IR = Mem[PC]; PC = PC + 4)",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 1",
    desc: "Destaque do caminho percorrido durante a busca da instrução e incremento do PC."
  },
  {
    filename: "passo_2_decodificacao_branch.jpg",
    title: "Passo 2: Decodificação e Branch Antecipado",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 2",
    desc: "Leitura de registradores (A e B) e cálculo antecipado do endereço de salto na ULA."
  },
  {
    filename: "passo_3_tipo_r_execucao.jpg",
    title: "Passo 3: Execução Tipo R (ALUOut = A op B)",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 3",
    desc: "Cálculo da operação aritmética ou lógica na ULA para instruções Tipo R."
  },
  {
    filename: "passo_4_tipo_r_writeback.jpg",
    title: "Passo 4: Write-Back Tipo R (Reg[rd] = ALUOut)",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 4",
    desc: "Gravação do resultado da ULA no registrador de destino rd."
  },
  {
    filename: "passo_3_memoria_endereco.jpg",
    title: "Passo 3: Memória (Cálculo de Endereço A + offset)",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 3",
    desc: "Cálculo do endereço efetivo de memória para instruções LW e SW."
  },
  {
    filename: "passo_4_load_leitura.jpg",
    title: "Passo 4: Leitura da Memória (MDR = Mem[ALUOut])",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 4",
    desc: "Acesso de leitura à memória de dados para instrução LW."
  },
  {
    filename: "passo_5_load_writeback.jpg",
    title: "Passo 5: Write-Back LW (Reg[rt] = MDR)",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 5",
    desc: "Conclusão do LW: gravação do dado da memória no registrador rt."
  },
  {
    filename: "passo_4_store_memoria.jpg",
    title: "Passo 4: Escrita na Memória SW (Mem[ALUOut] = B)",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 4",
    desc: "Gravação do dado do registrador B na memória de dados (conclusão do SW)."
  },
  {
    filename: "passo_3_branch_desvio.jpg",
    title: "Passo 3: Decisão de Branch (if A == B then PC = ALUOut)",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 3",
    desc: "Comparação de registradores na ULA e atualização condicional do PC."
  },
  {
    filename: "passo_3_jump_salto.jpg",
    title: "Passo 3: Salto Incondicional Jump",
    category: "Passos Multiciclo",
    badge: "passo",
    badgeText: "Passo 3",
    desc: "Atualização do PC com o endereço de 26 bits deslocado."
  },

  // 4. Exercícios dos Slides
  {
    filename: "exercicio_4_1_and.jpg",
    title: "Exercício 4.1: Sinais e Recursos da Instrução AND",
    category: "Exercícios dos Slides",
    badge: "ex",
    badgeText: "Ex 4.1",
    desc: "Identificar sinais de controle e blocos ativos/inativos para a instrução AND Rd, Rs, Rt."
  },
  {
    filename: "exercicio_4_2_lwi.jpg",
    title: "Exercício 4.2: Implementando Nova Instrução LWI Rt, Rd(Rs)",
    category: "Exercícios dos Slides",
    badge: "ex",
    badgeText: "Ex 4.2",
    desc: "Load Word com deslocamento em registrador. Quais blocos e sinais adicionar ao datapath?"
  },
  {
    filename: "exercicio_4_3_speedup.jpg",
    title: "Exercício 4.3: Latências, Multiplicador e Speedup",
    category: "Exercícios dos Slides",
    badge: "ex",
    badgeText: "Ex 4.3",
    desc: "Calcular tempo de ciclo com e sem multiplicador e avaliar o ganho real de desempenho."
  },
  {
    filename: "exercicio_4_4_caminho_critico.jpg",
    title: "Exercício 4.4: Caminho Crítico e Tempo de Relógio",
    category: "Exercícios dos Slides",
    badge: "ex",
    badgeText: "Ex 4.4",
    desc: "Calcular o ciclo para processadores que só fazem fetch, branch relativo ou condicional."
  },
  {
    filename: "exercicio_5_8_jr.jpg",
    title: "Exercício 5.8: Adicionando Instrução JR $ra (Jump Register)",
    category: "Exercícios dos Slides",
    badge: "ex",
    badgeText: "Ex 5.8",
    desc: "Desenhar as modificações necessárias no caminho de dados para suportar PC = Reg[rs]."
  },
  {
    filename: "exercicio_5_11_lwpi.jpg",
    title: "Exercício 5.11 a 5.14: LWPI (Pós-Incremento) e SWAP",
    category: "Exercícios dos Slides",
    badge: "ex",
    badgeText: "Ex 5.11",
    desc: "Por que o Monociclo não suporta LWPI sem duplicar portas e como o Multiciclo resolve em 6 ciclos."
  },
  {
    filename: "exercicio_5_29_stuck_at.jpg",
    title: "Exercício 5.29: Falhas Presas (Stuck-at) no Multiciclo",
    category: "Exercícios dos Slides",
    badge: "ex",
    badgeText: "Ex 5.29",
    desc: "Efeito de sinais presos em 0 ou 1 (IRWrite=0, PCWrite=0, PCWriteCond=0, etc.)."
  },
  {
    filename: "exercicio_5_49_eret.jpg",
    title: "Exercício 5.49 e 5.50: Instrução ERET e Tratamento de Exceções",
    category: "Exercícios dos Slides",
    badge: "ex",
    badgeText: "Ex 5.49",
    desc: "Implementação do retorno de exceção PC = EPC no caminho de dados e FSM."
  }
];

// DOM Elements
const templateSelect = document.getElementById('templateSelect');
const optgroupExam = document.getElementById('optgroup-exam');
const optgroupIncomplete = document.getElementById('optgroup-incomplete');
const optgroupComplete = document.getElementById('optgroup-complete');
const optgroupSteps = document.getElementById('optgroup-steps');
const optgroupExercises = document.getElementById('optgroup-exercises');
const btnOpenGallery = document.getElementById('btnOpenGallery');
const galleryModal = document.getElementById('galleryModal');
const btnCloseGallery = document.getElementById('btnCloseGallery');
const galleryGrid = document.getElementById('galleryGrid');
const gallerySubjectTitle = document.getElementById('gallerySubjectTitle');
const galleryFilterButtons = document.getElementById('galleryFilterButtons');
const btnUploadMaterial = document.getElementById('btnUploadMaterial');
const materialFileInput = document.getElementById('materialFileInput');

const btnShareCloudflare = document.getElementById('btnShareCloudflare');
const cloudflareModal = document.getElementById('cloudflareModal');
const btnCloseCloudflareModal = document.getElementById('btnCloseCloudflareModal');
const cfLoadingState = document.getElementById('cfLoadingState');
const cfActiveState = document.getElementById('cfActiveState');
const cfPublicUrlInput = document.getElementById('cfPublicUrlInput');
const btnCopyCfUrl = document.getElementById('btnCopyCfUrl');
const btnReloadOnCfUrl = document.getElementById('btnReloadOnCfUrl');
const btnStopCfTunnel = document.getElementById('btnStopCfTunnel');

const btnNewSubject = document.getElementById('btnNewSubject');
const newSubjectModal = document.getElementById('newSubjectModal');
const btnCloseNewSubjectModal = document.getElementById('btnCloseNewSubjectModal');
const newSubjectIconInput = document.getElementById('newSubjectIconInput');
const newSubjectNameInput = document.getElementById('newSubjectNameInput');
const btnConfirmCreateSubject = document.getElementById('btnConfirmCreateSubject');

const btnSaveAI = document.getElementById('btnSaveAI');
const btnSaveAIFocus = document.getElementById('btnSaveAIFocus');
const btnExportPNG = document.getElementById('btnExportPNG');
const btnExportFullPNG = document.getElementById('btnExportFullPNG');
const btnExportJSON = document.getElementById('btnExportJSON');
const importJsonInput = document.getElementById('importJsonInput');
const exportDropdown = document.getElementById('exportDropdown');
const btnExportMenu = document.getElementById('btnExportMenu');
const btnGridToggle = document.getElementById('btnGridToggle');
const btnShortcuts = document.getElementById('btnShortcuts');
const shortcutsModal = document.getElementById('shortcutsModal');
const btnCloseShortcuts = document.getElementById('btnCloseShortcuts');
const btnClearCanvas = document.getElementById('btnClearCanvas');
const syncBadge = document.getElementById('syncBadge');
const syncText = document.getElementById('syncText');
const fileInput = document.getElementById('fileInput');
const zoomLevelEl = document.getElementById('zoomLevel');
const btnZoomIn = document.getElementById('btnZoomIn');
const btnZoomOut = document.getElementById('btnZoomOut');
const btnZoomReset = document.getElementById('btnZoomReset');
const btnZoomFit = document.getElementById('btnZoomFit');
const toolPalette = document.getElementById('toolPalette');
const btnTogglePalette = document.getElementById('btnTogglePalette');
const studySidebar = document.getElementById('studySidebar');
const btnToggleSidebar = document.getElementById('btnToggleSidebar');
const btnCloseSidebar = document.getElementById('btnCloseSidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const strokeSizeSlider = document.getElementById('strokeSizeSlider');
const strokeSizeLabel = document.getElementById('strokeSizeLabel');
const strokePreviewDot = document.getElementById('strokePreviewDot');

function setStrokeSize(size, updateSlider = true) {
  const parsed = parseFloat(size);
  if (isNaN(parsed) || parsed <= 0) return;
  currentSize = Math.max(0.5, Math.min(36, parsed));
  localStorage.setItem('whiteboard_stroke_size', currentSize.toString());

  if (updateSlider && strokeSizeSlider) {
    strokeSizeSlider.value = currentSize;
  }
  if (strokeSizeLabel) {
    strokeSizeLabel.textContent = `${currentSize} px`;
  }
  const strokeSizeBadge = document.getElementById('strokeSizeBadge');
  if (strokeSizeBadge) {
    strokeSizeBadge.textContent = currentSize.toString();
  }
  updateStrokePreview();
  updateEraserCursorSize();

  document.querySelectorAll('.size-chip').forEach(chip => {
    if (parseFloat(chip.dataset.size) === currentSize) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

function updateStrokePreview() {
  const strokePreviewDot = document.getElementById('strokePreviewDot');
  if (strokePreviewDot) {
    const d = Math.min(16, Math.max(3, Math.round(currentSize)));
    strokePreviewDot.style.width = `${d}px`;
    strokePreviewDot.style.height = `${d}px`;
    strokePreviewDot.style.backgroundColor = currentColor;
  }
  const strokeSizeBadge = document.getElementById('strokeSizeBadge');
  if (strokeSizeBadge) {
    strokeSizeBadge.textContent = currentSize.toString();
  }
}

const canvasHint = document.getElementById('canvasHint');

// Grid state (dots, lines, none)
let gridMode = localStorage.getItem('whiteboard_grid') || 'dots';

// Collaboration DOM Elements
const btnCollaborate = document.getElementById('btnCollaborate');
const collabModal = document.getElementById('collabModal');
const btnCloseCollab = document.getElementById('btnCloseCollab');
const collabBadge = document.getElementById('collabBadge');
const collabLocalUrl = document.getElementById('collabLocalUrl');
const btnCopyLocalUrl = document.getElementById('btnCopyLocalUrl');
const btnCopyTunnelCmd = document.getElementById('btnCopyTunnelCmd');
const btnCopyCloudflareCmd = document.getElementById('btnCopyCloudflareCmd');
const collabUsernameInput = document.getElementById('collabUsernameInput');
const collabColorPicker = document.getElementById('collabColorPicker');
const collabStatusText = document.getElementById('collabStatusText');
const collabStatusIndicator = document.getElementById('collabStatusIndicator');

// Initialize
window.addEventListener('load', () => {
  try { resizeCanvas(); } catch (e) { console.error('resizeCanvas:', e); }
  try { populateDropdown(STATIC_TEMPLATES); } catch (e) { console.error('populateDropdown:', e); }
  try { buildGalleryModal(STATIC_TEMPLATES); } catch (e) { console.error('buildGalleryModal:', e); }
  try { loadTemplateOptions(); } catch (e) { console.error('loadTemplateOptions:', e); }
  try { loadSavedBoard(); } catch (e) { console.error('loadSavedBoard:', e); }
  try { setupEventListeners(); } catch (e) { console.error('setupEventListeners:', e); }
  try { setStrokeSize(currentSize, true); } catch (e) { console.error('setStrokeSize:', e); }
  try { setupHotkeys(); } catch (e) { console.error('setupHotkeys:', e); }
  try { setupSelectionHud(); } catch (e) { console.error('setupSelectionHud:', e); }
  try { updateUndoRedoUI(); } catch (e) { console.error('updateUndoRedoUI:', e); }
  try { setupCollabUI(); } catch (e) { console.error('setupCollabUI:', e); }
  try { setupHubUI(); } catch (e) { console.error('setupHubUI:', e); }
  try { loadBoardsMetadata(); } catch (e) { console.error('loadBoardsMetadata:', e); }
  try { applyGridPattern(currentGridType, false); } catch (e) { console.error('applyGridPattern:', e); }
  try { initWebSocket(); } catch (e) { console.error('initWebSocket:', e); }

  // Watch for container resizes dynamically
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
      resizeCanvas();
    });
    ro.observe(wrapper);
  }

  // Prevent browser viewport zoom on Ctrl+Wheel / trackpad pinch
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      if (!wrapper.contains(e.target)) {
        handleWheel(e);
      }
    }
  }, { passive: false });

  // Prevent browser-level pinch-to-zoom gestures (iOS / iPad / macOS / touch trackpads)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
    window.addEventListener(evt, (e) => {
      e.preventDefault();
    }, { passive: false });
  });

  // Fade out hint after 8s
  setTimeout(() => {
    if (canvasHint) canvasHint.style.opacity = '0';
  }, 8000);
});

window.addEventListener('resize', resizeCanvas);

function resizeCanvas() {
  width = wrapper.clientWidth;
  height = wrapper.clientHeight;
  dpr = window.devicePixelRatio || 1;

  const pixelW = Math.floor(width * dpr);
  const pixelH = Math.floor(height * dpr);

  canvas.width = pixelW;
  canvas.height = pixelH;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  if (overlayCanvas) {
    overlayCanvas.width = pixelW;
    overlayCanvas.height = pixelH;
    overlayCanvas.style.width = `${width}px`;
    overlayCanvas.style.height = `${height}px`;
  }

  render();
}

// Coordinate conversions (Screen <-> Virtual Canvas)
function screenToCanvas(sx, sy) {
  return {
    x: (sx - panX) / zoom,
    y: (sy - panY) / zoom
  };
}

function canvasToScreen(cx, cy) {
  return {
    x: cx * zoom + panX,
    y: cy * zoom + panY
  };
}

// Image cache for fast, flicker-free undo/redo
const imageCache = new Map();

function ensureElementIds() {
  const seen = new Set();
  for (const el of elements) {
    if (!el.id || seen.has(el.id)) {
      el.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
    seen.add(el.id);
  }
}

function serializeBoardState() {
  ensureElementIds();
  return JSON.stringify(elements, (key, value) => {
    if (key === 'imgObj') return undefined;
    return value;
  });
}

function updateUndoRedoUI() {
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  if (btnUndo) {
    btnUndo.disabled = undoStack.length === 0;
    btnUndo.style.opacity = undoStack.length === 0 ? '0.45' : '1';
    btnUndo.style.cursor = undoStack.length === 0 ? 'not-allowed' : 'pointer';
  }
  if (btnRedo) {
    btnRedo.disabled = redoStack.length === 0;
    btnRedo.style.opacity = redoStack.length === 0 ? '0.45' : '1';
    btnRedo.style.cursor = redoStack.length === 0 ? 'not-allowed' : 'pointer';
  }
}

// Each history entry contains only the changes made by this browser.
function boardChanges(before, after) {
  const old = new Map(before.map((el, index) => [el.id, { el, index }]));
  const next = new Map(after.map((el, index) => [el.id, { el, index }]));
  return [...new Set([...old.keys(), ...next.keys()])].flatMap(id => {
    const a = old.get(id), b = next.get(id);
    if (JSON.stringify(a?.el) === JSON.stringify(b?.el)) return [];
    return [{ id, before: a?.el || null, after: b?.el || null,
      beforeIndex: a?.index, afterIndex: b?.index }];
  });
}

function applyBoardChanges(board, changes) {
  const result = board.slice();
  for (const change of changes) {
    const index = result.findIndex(el => el.id === change.id);
    if (change.after === null) {
      if (index >= 0) result.splice(index, 1);
    } else {
      if (index >= 0) result.splice(index, 1);
      const position = change.afterIndex ?? (index >= 0 ? index : result.length);
      // History values must remain immutable when the restored element is edited.
      result.splice(position, 0, JSON.parse(JSON.stringify(change.after)));
    }
  }
  return result;
}

function pushUndoState(stateStr) {
  pendingUndoState = stateStr;
}

function recordState() {
  pushUndoState(serializeBoardState());
  scheduleAutoSave();
}

function commitLocalAction() {
  if (pendingUndoState === null) return false;
  const changes = boardChanges(JSON.parse(pendingUndoState), JSON.parse(serializeBoardState()));
  pendingUndoState = null;
  if (changes.length) {
    undoStack.push(changes);
    if (undoStack.length > MAX_UNDO_STACK) undoStack.shift();
    redoStack = [];
    sendWsMessage({ type: 'board_patch', changes });
  }
  updateUndoRedoUI();
  return true;
}

function reverseChanges(changes) {
  return changes.map(change => ({ id: change.id, before: change.after, after: change.before,
    beforeIndex: change.afterIndex, afterIndex: change.beforeIndex }));
}

function travelHistory(from, to, label) {
  if (isDrawing || isDraggingElement || isResizingElement || from.length === 0) return;
  const current = JSON.parse(serializeBoardState());
  const entry = from.pop();
  if (!entry) return;
  const rawChanges = reverseChanges(entry);
  const changes = rawChanges.filter(change => {
    const el = current.find(e => e.id === change.id) || null;
    // Undoing creation: element must be on board to be removed
    if (change.after === null) {
      return el !== null;
    }
    // Undoing deletion: can always be restored
    if (change.before === null) {
      return true;
    }
    // Undoing modification (move, resize, text change)
    return el !== null;
  });

  if (changes.length) {
    elements = applyBoardChanges(current, changes);
    to.push(changes);
    if (to.length > MAX_UNDO_STACK) to.shift();
    selectedElements = [];
    selectedElement = null;
    rehydrateImages();
    render();
    scheduleAutoSave();
    sendWsMessage({ type: 'board_patch', changes });
    showSyncBadge(label, 'saved');
  } else {
    showSyncBadge('Ação já alterada ou desfeita', 'saving');
  }
  updateUndoRedoUI();
}

function undo() {
  travelHistory(undoStack, redoStack, 'Sua ação foi desfeita');
}

function redo() {
  travelHistory(redoStack, undoStack, 'Sua ação foi refeita');
}

// Remote changes also update the starting point of an ongoing gesture,
// so they are never recorded as part of that local action.
function receiveBoardChanges(changes) {
  const rebase = state => state === null ? null : JSON.stringify(applyBoardChanges(JSON.parse(state), changes));
  pendingUndoState = rebase(pendingUndoState);
  drawStartState = rebase(drawStartState);
  dragStartState = rebase(dragStartState);
  eraseStartState = rebase(eraseStartState);
  if (isResizingElement && resizeStartState) resizeStartState = rebase(resizeStartState);
  elements = applyBoardChanges(elements, changes);
  if (selectedElements.length > 0) {
    selectedElements = selectedElements
      .map(sel => elements.find(el => el.id === sel.id))
      .filter(Boolean);
    selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
  } else if (selectedElement) {
    selectedElement = elements.find(el => el.id === selectedElement.id) || null;
    selectedElements = selectedElement ? [selectedElement] : [];
  }
  rehydrateImages();
  render();
}

function rehydrateImages() {
  elements.forEach(el => {
    if (el.type === 'image') {
      if (el.imgObj && el.imgObj.complete) {
        imageCache.set(el.src, el.imgObj);
        return;
      }
      if (imageCache.has(el.src)) {
        el.imgObj = imageCache.get(el.src);
      } else {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          imageCache.set(el.src, img);
          render();
        };
        img.src = el.src;
        el.imgObj = img;
        if (img.complete) {
          imageCache.set(el.src, img);
        }
      }
    }
  });
}

function drawGrid(context, mode) {
  if (mode === 'none' || mode === 'blank') return;

  context.save();

  if (mode === 'dots') {
    const gridSize = 32;
    const startX = Math.floor((-panX / zoom) / gridSize) * gridSize - gridSize;
    const startY = Math.floor((-panY / zoom) / gridSize) * gridSize - gridSize;
    const endX = startX + Math.ceil(width / zoom) + gridSize * 2;
    const endY = startY + Math.ceil(height / zoom) + gridSize * 2;

    context.fillStyle = 'rgba(148, 163, 184, 0.4)';
    const dotRadius = Math.max(0.8, 1.2 / Math.sqrt(zoom));
    for (let x = startX; x <= endX; x += gridSize) {
      for (let y = startY; y <= endY; y += gridSize) {
        context.beginPath();
        context.arc(x, y, dotRadius, 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (mode === 'graph') {
    // Papel Milimetrado / Quadriculado: 20px linhas secundarias finas, 100px linhas mestras
    const smallGrid = 20;
    const largeGrid = 100;
    const startX = Math.floor((-panX / zoom) / largeGrid) * largeGrid - largeGrid;
    const startY = Math.floor((-panY / zoom) / largeGrid) * largeGrid - largeGrid;
    const endX = startX + Math.ceil(width / zoom) + largeGrid * 2;
    const endY = startY + Math.ceil(height / zoom) + largeGrid * 2;

    // Linhas secundarias finas (renderiza apenas quando a densidade visual for adequada)
    if (smallGrid * zoom >= 8) {
      context.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      context.lineWidth = 0.75 / zoom;
      context.beginPath();
      for (let x = startX; x <= endX; x += smallGrid) {
        if (Math.abs(Math.round(x) % largeGrid) > 2) {
          context.moveTo(x, startY);
          context.lineTo(x, endY);
        }
      }
      for (let y = startY; y <= endY; y += smallGrid) {
        if (Math.abs(Math.round(y) % largeGrid) > 2) {
          context.moveTo(startX, y);
          context.lineTo(endX, y);
        }
      }
      context.stroke();
    }

    // Linhas mestras destacadas
    context.strokeStyle = 'rgba(99, 102, 241, 0.35)';
    context.lineWidth = 1.2 / zoom;
    context.beginPath();
    for (let x = startX; x <= endX; x += largeGrid) {
      context.moveTo(x, startY);
      context.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += largeGrid) {
      context.moveTo(startX, y);
      context.lineTo(endX, y);
    }
    context.stroke();
  } else if (mode === 'ruled') {
    // Caderno Pautado Universitario: linhas horizontais a cada 32px
    const lineSpacing = 32;
    const startY = Math.floor((-panY / zoom) / lineSpacing) * lineSpacing - lineSpacing;
    const endY = startY + Math.ceil(height / zoom) + lineSpacing * 2;
    const startX = -panX / zoom - 100;
    const endX = startX + width / zoom + 200;

    // Linhas pautadas azuis suaves
    context.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    context.lineWidth = 1 / zoom;
    context.beginPath();
    for (let y = startY; y <= endY; y += lineSpacing) {
      context.moveTo(startX, y);
      context.lineTo(endX, y);
    }
    context.stroke();

    // Margem vertical vermelha classica de caderno
    context.strokeStyle = 'rgba(239, 68, 68, 0.35)';
    context.lineWidth = 1.5 / zoom;
    context.beginPath();
    context.moveTo(80, startY);
    context.lineTo(80, endY);
    context.stroke();
  }

  context.restore();
}

// ==================== High-Performance Dual-Canvas & VSYNC Engine ====================
let baseRenderRequested = false;
let overlayRenderRequested = false;
let lastRenderedZoomPercent = -1;

function requestRenderBase() {
  if (baseRenderRequested) return;
  baseRenderRequested = true;
  requestAnimationFrame(renderBaseFrame);
}

function renderBaseFrame() {
  baseRenderRequested = false;
  renderBase();
}

function requestRenderOverlay() {
  if (overlayRenderRequested) return;
  overlayRenderRequested = true;
  requestAnimationFrame(renderOverlayFrame);
}

function renderOverlayFrame() {
  overlayRenderRequested = false;
  renderOverlay();
}

function requestRenderAll() {
  requestRenderBase();
  requestRenderOverlay();
}

// Bounding Box Caching for Viewport Frustum Culling
function getCachedElementBBox(el) {
  if (!el) return null;
  if (el._bbox) return el._bbox;
  const bbox = getElementBoundingBox(el);
  if (bbox) {
    el._bbox = bbox;
  }
  return bbox;
}

function invalidateElementBBox(el) {
  if (el) delete el._bbox;
}

// Render Base Canvas (Grid + Committed Elements with Viewport Culling)
function renderBase() {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Apply Pan & Zoom
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);

  // Render Background Grid
  if (gridMode !== 'none') {
    drawGrid(ctx, gridMode);
  }

  // Frustum Culling: only draw elements visible in viewport + safety margin
  const margin = 80 / zoom;
  const viewMinX = -panX / zoom - margin;
  const viewMinY = -panY / zoom - margin;
  const viewMaxX = -panX / zoom + width / zoom + margin;
  const viewMaxY = -panY / zoom + height / zoom + margin;

  const len = elements.length;
  for (let i = 0; i < len; i++) {
    const el = elements[i];
    const bbox = getCachedElementBBox(el);
    if (bbox) {
      if (bbox.x + bbox.width < viewMinX || bbox.x > viewMaxX ||
          bbox.y + bbox.height < viewMinY || bbox.y > viewMaxY) {
        continue; // Skip offscreen element completely
      }
    }
    drawElement(ctx, el);
  }

  // Fallback if overlay canvas is absent: render overlays on base canvas
  if (!overlayCtx) {
    renderOverlayElements(ctx);
  }

  ctx.restore();

  const curZoomPercent = Math.round(zoom * 100);
  if (curZoomPercent !== lastRenderedZoomPercent) {
    lastRenderedZoomPercent = curZoomPercent;
    updateZoomIndicator();
  }
}

// Render Interactive Overlay Canvas (Active Strokes, Peers, Cursors, Selection)
function renderOverlay() {
  if (!overlayCtx) return;

  overlayCtx.save();
  overlayCtx.scale(dpr, dpr);
  overlayCtx.clearRect(0, 0, width, height);

  // Apply Pan & Zoom
  overlayCtx.translate(panX, panY);
  overlayCtx.scale(zoom, zoom);

  renderOverlayElements(overlayCtx);

  overlayCtx.restore();

  updateSelectionHud();
}

// Helper to render interactive elements onto target context
function renderOverlayElements(targetCtx) {
  // 1. Render active local drawing path/shape preview
  if (isDrawing && currentPath) {
    drawElement(targetCtx, currentPath);
  }

  // 2. Render peer live strokes in progress
  peerLiveStrokes.forEach(stroke => {
    drawElement(targetCtx, stroke);
  });

  // 3. Draw selection outline
  if (selectedElements.length === 1) {
    drawSelectionBox(targetCtx, selectedElements[0]);
  } else if (selectedElements.length > 1) {
    drawGroupSelectionBox(targetCtx, selectedElements);
  } else if (selectedElement) {
    drawSelectionBox(targetCtx, selectedElement);
  }

  // 4. Draw area selection marquee if active
  if (isAreaSelecting && areaSelectStartPt && areaSelectCurrentPt) {
    drawAreaSelectionMarquee(targetCtx, areaSelectStartPt, areaSelectCurrentPt);
  }

  // 5. Draw peer cursors
  const now = Date.now();
  peerCursors.forEach((peer) => {
    if (now - peer.lastSeen < 15000) {
      drawPeerCursor(targetCtx, peer);
    }
  });

  // 6. Draw laser trails
  if (typeof localLaserTrail !== 'undefined' && localLaserTrail.length > 0) {
    drawLaserTrail(targetCtx, localLaserTrail);
  }
  if (typeof peerLaserTrails !== 'undefined') {
    peerLaserTrails.forEach((trail) => {
      drawLaserTrail(targetCtx, trail);
    });
  }
}

// Full Synchronous Render for backward compatibility
function render() {
  renderBase();
  renderOverlay();
}

/**
 * Smooth Catmull-Rom Cardinal Spline
 * Converts sampled points into smooth cubic Bézier segments that pass
 * PRECISELY through every single point, eliminating corner-cutting and
 * maintaining 100% fidelity to what was drawn.
 */
function drawSmoothSpline(context, pts) {
  const n = pts.length;
  if (n < 2) return;
  if (n === 2) {
    context.moveTo(pts[0].x, pts[0].y);
    context.lineTo(pts[1].x, pts[1].y);
    return;
  }

  // Gentle tension (0.15) provides natural curvature without overshooting or clipping
  const k = 0.15;
  context.moveTo(pts[0].x, pts[0].y);

  // First segment
  const cp1x = pts[0].x + (pts[1].x - pts[0].x) * 0.25;
  const cp1y = pts[0].y + (pts[1].y - pts[0].y) * 0.25;
  const cp2x = pts[1].x - (pts[2].x - pts[0].x) * k;
  const cp2y = pts[1].y - (pts[2].y - pts[0].y) * k;
  context.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, pts[1].x, pts[1].y);

  // Middle segments
  for (let i = 1; i < n - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;

    context.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
  }

  // Last segment
  const pPrev2 = pts[n - 3];
  const pPrev = pts[n - 2];
  const pLast = pts[n - 1];

  const lastCp1x = pPrev.x + (pLast.x - pPrev2.x) * k;
  const lastCp1y = pPrev.y + (pLast.y - pPrev2.y) * k;
  const lastCp2x = pLast.x - (pLast.x - pPrev.x) * 0.25;
  const lastCp2y = pLast.y - (pLast.y - pPrev.y) * 0.25;
  context.bezierCurveTo(lastCp1x, lastCp1y, lastCp2x, lastCp2y, pLast.x, pLast.y);
}

function drawElement(context, el) {
  context.save();

  if (el.type === 'path') {
    if (!el.points || el.points.length === 0) {
      context.restore();
      return;
    }
    const pts = el.points;
    context.strokeStyle = el.color;
    context.lineWidth = el.size;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (el.tool === 'highlighter') {
      context.globalAlpha = 0.35;
      context.lineWidth = el.size * 2.8;
    } else {
      context.globalAlpha = 1.0;
    }

    if (pts.length === 1) {
      // Single click / dot
      context.beginPath();
      context.fillStyle = el.color;
      const dotRadius = Math.max(0.75, (el.tool === 'highlighter' ? el.size * 1.4 : el.size / 2));
      context.arc(pts[0].x, pts[0].y, dotRadius, 0, Math.PI * 2);
      context.fill();
    } else if (pts.length === 2) {
      context.beginPath();
      context.moveTo(pts[0].x, pts[0].y);
      context.lineTo(pts[1].x, pts[1].y);
      context.stroke();
    } else {
      // Catmull-Rom spline: smooth curve that touches every point faithfully
      context.beginPath();
      drawSmoothSpline(context, pts);
      context.stroke();
    }
  }
  else if (el.type === 'line') {
    context.beginPath();
    context.strokeStyle = el.color;
    context.lineWidth = el.size;
    context.lineCap = 'round';
    context.moveTo(el.x1, el.y1);
    context.lineTo(el.x2, el.y2);
    context.stroke();
  }
  else if (el.type === 'arrow') {
    context.beginPath();
    context.strokeStyle = el.color;
    context.fillStyle = el.color;
    context.lineWidth = el.size;
    context.lineCap = 'round';

    // Draw main line
    context.moveTo(el.x1, el.y1);
    context.lineTo(el.x2, el.y2);
    context.stroke();

    // Draw arrowhead
    const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
    const headLen = Math.max(10, el.size * 3.5);
    context.beginPath();
    context.moveTo(el.x2, el.y2);
    context.lineTo(
      el.x2 - headLen * Math.cos(angle - Math.PI / 6),
      el.y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    context.lineTo(
      el.x2 - headLen * Math.cos(angle + Math.PI / 6),
      el.y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    context.closePath();
    context.fill();
  }
  else if (el.type === 'rect') {
    context.strokeStyle = el.color;
    context.lineWidth = el.size;
    context.fillStyle = 'rgba(255, 255, 255, 0.7)';
    const rx = Math.min(el.x1, el.x2);
    const ry = Math.min(el.y1, el.y2);
    const rw = Math.abs(el.x2 - el.x1);
    const rh = Math.abs(el.y2 - el.y1);
    context.fillRect(rx, ry, rw, rh);
    context.strokeRect(rx, ry, rw, rh);
  }
  else if (el.type === 'triangle') {
    context.strokeStyle = el.color;
    context.lineWidth = el.size;
    context.fillStyle = el.fillColor || 'rgba(255, 255, 255, 0.7)';
    context.lineJoin = 'round';
    context.beginPath();
    if (el.points && el.points.length >= 3) {
      context.moveTo(el.points[0].x, el.points[0].y);
      context.lineTo(el.points[1].x, el.points[1].y);
      context.lineTo(el.points[2].x, el.points[2].y);
    } else {
      const rx = Math.min(el.x1, el.x2);
      const ry = Math.min(el.y1, el.y2);
      const rw = Math.abs(el.x2 - el.x1);
      const rh = Math.abs(el.y2 - el.y1);
      context.moveTo(rx + rw / 2, ry);
      context.lineTo(rx + rw, ry + rh);
      context.lineTo(rx, ry + rh);
    }
    context.closePath();
    context.fill();
    context.stroke();
  }
  else if (el.type === 'circle') {
    const rx = Math.min(el.x1, el.x2);
    const ry = Math.min(el.y1, el.y2);
    const rw = Math.max(6, Math.abs(el.x2 - el.x1));
    const rh = Math.max(6, Math.abs(el.y2 - el.y1));
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    context.beginPath();
    context.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    context.fillStyle = el.fillColor || 'rgba(255, 255, 255, 0.7)';
    context.fill();
    context.strokeStyle = el.color;
    context.lineWidth = el.size;
    context.stroke();
  }
  else if (el.type === 'diamond') {
    const rx = Math.min(el.x1, el.x2);
    const ry = Math.min(el.y1, el.y2);
    const rw = Math.max(16, Math.abs(el.x2 - el.x1));
    const rh = Math.max(16, Math.abs(el.y2 - el.y1));
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    context.beginPath();
    context.moveTo(cx, ry);
    context.lineTo(rx + rw, cy);
    context.lineTo(cx, ry + rh);
    context.lineTo(rx, cy);
    context.closePath();
    context.fillStyle = el.fillColor || 'rgba(255, 255, 255, 0.85)';
    context.fill();
    context.strokeStyle = el.color;
    context.lineWidth = el.size;
    context.stroke();
    if (el.text) {
      context.fillStyle = el.color;
      context.font = 'bold 12px Inter, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(el.text, cx, cy);
    }
  }
  else if (el.type === 'axes') {
    const rx = Math.min(el.x1, el.x2);
    const ry = Math.min(el.y1, el.y2);
    const rw = Math.max(70, Math.abs(el.x2 - el.x1));
    const rh = Math.max(70, Math.abs(el.y2 - el.y1));
    const originX = rx + 30;
    const originY = ry + rh - 30;
    const topY = ry + 12;
    const rightX = rx + rw - 12;

    context.save();
    context.strokeStyle = el.color;
    context.fillStyle = el.color;
    context.lineWidth = Math.max(1.5, el.size || 2);
    context.lineCap = 'round';

    // Eixo Y
    context.beginPath();
    context.moveTo(originX, originY);
    context.lineTo(originX, topY);
    context.stroke();

    // Seta Eixo Y
    context.beginPath();
    context.moveTo(originX, topY - 7);
    context.lineTo(originX - 5, topY + 1);
    context.lineTo(originX + 5, topY + 1);
    context.closePath();
    context.fill();

    // Eixo X
    context.beginPath();
    context.moveTo(originX, originY);
    context.lineTo(rightX, originY);
    context.stroke();

    // Seta Eixo X
    context.beginPath();
    context.moveTo(rightX + 7, originY);
    context.lineTo(rightX - 1, originY - 5);
    context.lineTo(rightX - 1, originY + 5);
    context.closePath();
    context.fill();

    // Ticks nos eixos
    const stepX = (rightX - originX) / 5;
    for (let i = 1; i <= 4; i++) {
      const tx = originX + i * stepX;
      context.beginPath();
      context.moveTo(tx, originY - 4);
      context.lineTo(tx, originY + 4);
      context.stroke();
    }
    const stepY = (originY - topY) / 5;
    for (let i = 1; i <= 4; i++) {
      const ty = originY - i * stepY;
      context.beginPath();
      context.moveTo(originX - 4, ty);
      context.lineTo(originX + 4, ty);
      context.stroke();
    }

    // Rótulos dos eixos
    context.font = 'bold 12px Inter, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.fillText('y', originX - 10, topY + 4);
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText('x', rightX + 10, originY);
    context.font = '10px Inter, sans-serif';
    context.textAlign = 'right';
    context.textBaseline = 'top';
    context.fillText('0', originX - 5, originY + 4);

    context.restore();
  }
  else if (el.type === 'sticky') {
    context.save();
    const x = el.x;
    const y = el.y;
    const w = el.width || 200;
    const h = el.height || 180;
    const fold = 18;

    // Sombra do papel
    context.shadowColor = 'rgba(0, 0, 0, 0.16)';
    context.shadowBlur = 10;
    context.shadowOffsetX = 3;
    context.shadowOffsetY = 4;

    // Corpo do Post-it com ponta dobrada
    context.fillStyle = el.color || '#fef08a';
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + w, y);
    context.lineTo(x + w, y + h - fold);
    context.lineTo(x + w - fold, y + h);
    context.lineTo(x, y + h);
    context.closePath();
    context.fill();

    // Reset shadow para detalhes internos
    context.shadowColor = 'transparent';

    // Dobra da ponta (orelha de papel dobrada)
    context.fillStyle = 'rgba(0, 0, 0, 0.14)';
    context.beginPath();
    context.moveTo(x + w, y + h - fold);
    context.lineTo(x + w - fold, y + h - fold);
    context.lineTo(x + w - fold, y + h);
    context.closePath();
    context.fill();

    // Faixa adesiva suave no topo (top tape)
    context.fillStyle = 'rgba(0, 0, 0, 0.05)';
    context.fillRect(x, y, w, 22);

    // Borda sutil
    context.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    context.lineWidth = 1;
    context.stroke();

    // Renderização do texto com quebra de linha (word-wrap)
    context.fillStyle = el.textColor || '#713f12';
    context.font = "500 13px 'Inter', system-ui, sans-serif";
    context.textAlign = 'left';
    context.textBaseline = 'top';

    const padding = 12;
    const maxTextWidth = w - padding * 2;
    const lineHeight = 18;
    const startTextY = y + 26;

    const lines = (el.text || '').split('\n');
    let curY = startTextY;

    for (const rawLine of lines) {
      if (curY > y + h - 20) break;
      const words = rawLine.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = context.measureText(testLine).width;
        if (testWidth > maxTextWidth && currentLine) {
          context.fillText(currentLine, x + padding, curY);
          currentLine = word;
          curY += lineHeight;
          if (curY > y + h - 20) break;
        } else {
          currentLine = testLine;
        }
      }
      if (curY <= y + h - 20 && currentLine) {
        context.fillText(currentLine, x + padding, curY);
        curY += lineHeight;
      }
    }

    context.restore();
  }
  else if (el.type === 'mux') {
    const rx = Math.min(el.x1, el.x2);
    const ry = Math.min(el.y1, el.y2);
    const rw = Math.max(30, Math.abs(el.x2 - el.x1));
    const rh = Math.max(50, Math.abs(el.y2 - el.y1));

    context.strokeStyle = el.color;
    context.lineWidth = el.size;
    context.fillStyle = '#ffffff';

    context.beginPath();
    context.moveTo(rx, ry);
    context.lineTo(rx + rw, ry + rh * 0.15);
    context.lineTo(rx + rw, ry + rh * 0.85);
    context.lineTo(rx, ry + rh);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = el.color;
    context.font = 'bold 11px Inter, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('MUX', rx + rw / 2, ry + rh / 2);
  }
  else if (el.type === 'alu') {
    const rx = Math.min(el.x1, el.x2);
    const ry = Math.min(el.y1, el.y2);
    const rw = Math.max(50, Math.abs(el.x2 - el.x1));
    const rh = Math.max(60, Math.abs(el.y2 - el.y1));

    context.strokeStyle = el.color;
    context.lineWidth = el.size;
    context.fillStyle = '#ffffff';

    context.beginPath();
    context.moveTo(rx, ry);
    context.lineTo(rx + rw, ry + rh * 0.35);
    context.lineTo(rx + rw, ry + rh * 0.65);
    context.lineTo(rx, ry + rh);
    context.lineTo(rx, ry + rh * 0.60);
    context.lineTo(rx + rw * 0.25, ry + rh * 0.50);
    context.lineTo(rx, ry + rh * 0.40);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = el.color;
    context.font = 'bold 11px Inter, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('ULA / ALU', rx + rw * 0.45, ry + rh / 2);
  }
  else if (el.type === 'text') {
    const fontSize = Math.round(Math.max(12, Math.min(48, (el.size || 2.5) * 2 + 12)));
    context.fillStyle = el.color;
    context.font = `${fontSize}px 'Fira Code', monospace`;
    context.textBaseline = 'top';
    context.fillText(el.text, el.x, el.y);
  }
  else if (el.type === 'image') {
    if (el.imgObj && el.imgObj.complete) {
      context.drawImage(el.imgObj, el.x, el.y, el.width, el.height);
    } else if (!el.imgObj) {
      const img = new Image();
      img.onload = () => render();
      img.src = el.src;
      el.imgObj = img;
    }
  }

  context.restore();
}

// ==================== Selection & Geometry System ====================

function getElementBoundingBox(el) {
  if (!el) return null;
  if (el.type === 'image' || el.type === 'sticky') {
    return { x: el.x, y: el.y, width: el.width || 200, height: el.height || 180 };
  } else if (el.type === 'rect' || el.type === 'mux' || el.type === 'alu' || el.type === 'circle' || el.type === 'diamond' || el.type === 'axes' || el.type === 'triangle') {
    if (el.points && el.points.length >= 3) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of el.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return {
        x: minX,
        y: minY,
        width: Math.max(12, maxX - minX),
        height: Math.max(12, maxY - minY)
      };
    }
    const x = Math.min(el.x1, el.x2);
    const y = Math.min(el.y1, el.y2);
    return {
      x,
      y,
      width: Math.max(12, Math.abs(el.x2 - el.x1)),
      height: Math.max(12, Math.abs(el.y2 - el.y1))
    };
  } else if (el.type === 'line' || el.type === 'arrow') {
    const x = Math.min(el.x1, el.x2);
    const y = Math.min(el.y1, el.y2);
    return {
      x,
      y,
      width: Math.max(12, Math.abs(el.x2 - el.x1)),
      height: Math.max(12, Math.abs(el.y2 - el.y1))
    };
  } else if (el.type === 'text') {
    const fontSize = Math.round(Math.max(12, Math.min(48, (el.size || 2.5) * 2 + 12)));
    const estWidth = Math.max(24, (el.text || '').length * (fontSize * 0.62));
    return {
      x: el.x,
      y: el.y,
      width: estWidth,
      height: Math.max(16, fontSize * 1.35)
    };
  } else if (el.type === 'path' && el.points && el.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < el.points.length; i++) {
      const p = el.points[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const pad = Math.max(6, ((el.size || 2.5) / 2) + 2);
    return {
      x: minX - pad,
      y: minY - pad,
      width: Math.max(12, (maxX - minX) + pad * 2),
      height: Math.max(12, (maxY - minY) + pad * 2)
    };
  }
  return null;
}

function getImageResizeHandles(bbox) {
  const x = bbox.x;
  const y = bbox.y;
  const w = bbox.width;
  const h = bbox.height;
  const mx = x + w / 2;
  const my = y + h / 2;

  return [
    { id: 'nw', x: x, y: y, cursor: 'nwse-resize' },
    { id: 'ne', x: x + w, y: y, cursor: 'nesw-resize' },
    { id: 'se', x: x + w, y: y + h, cursor: 'nwse-resize' },
    { id: 'sw', x: x, y: y + h, cursor: 'nesw-resize' },
    { id: 'n',  x: mx, y: y, cursor: 'ns-resize' },
    { id: 'e',  x: x + w, y: my, cursor: 'ew-resize' },
    { id: 's',  x: mx, y: y + h, cursor: 'ns-resize' },
    { id: 'w',  x: x, y: my, cursor: 'ew-resize' }
  ];
}

function hitTestResizeHandle(el, px, py) {
  if (!el || el.type !== 'image') return null;
  const bbox = getElementBoundingBox(el);
  if (!bbox) return null;
  const pad = Math.max(4, 4 / zoom);
  const handles = getImageResizeHandles({
    x: bbox.x - pad,
    y: bbox.y - pad,
    width: bbox.width + pad * 2,
    height: bbox.height + pad * 2
  });
  const handleRadius = Math.max(8, 10 / zoom);
  for (const h of handles) {
    if (Math.hypot(px - h.x, py - h.y) <= handleRadius) {
      return h;
    }
  }
  return null;
}

function distToSegmentSquared(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

function hitTestElement(el, px, py) {
  const bbox = getElementBoundingBox(el);
  if (!bbox) return false;

  // Broadphase margin check
  const margin = Math.max(8, 10 / zoom);
  if (px < bbox.x - margin || px > bbox.x + bbox.width + margin ||
      py < bbox.y - margin || py > bbox.y + bbox.height + margin) {
    return false;
  }

  if (el.type === 'triangle') {
    if (px < bbox.x - 4 || px > bbox.x + bbox.width + 4 || py < bbox.y - 4 || py > bbox.y + bbox.height + 4) return false;
    if (el.points && el.points.length >= 3) {
      return pointInTriangle(px, py, el.points[0], el.points[1], el.points[2]);
    }
    return true;
  }

  if (el.type === 'image' || el.type === 'sticky' || el.type === 'rect' || el.type === 'mux' || el.type === 'alu' || el.type === 'text' || el.type === 'circle' || el.type === 'diamond' || el.type === 'axes') {
    return px >= bbox.x - 4 && px <= bbox.x + bbox.width + 4 &&
           py >= bbox.y - 4 && py <= bbox.y + bbox.height + 4;
  }

  if (el.type === 'line' || el.type === 'arrow') {
    const threshold = Math.max(8, (el.size || 2.5) + 6);
    const d2 = distToSegmentSquared(px, py, el.x1, el.y1, el.x2, el.y2);
    return d2 <= threshold * threshold;
  }

  if (el.type === 'path') {
    if (!el.points || el.points.length === 0) return false;
    if (el.points.length === 1) {
      const d = Math.hypot(px - el.points[0].x, py - el.points[0].y);
      return d <= Math.max(10, (el.size || 2.5) + 6);
    }
    const threshold = Math.max(8, (el.size || 2.5) + 6);
    const thresholdSq = threshold * threshold;
    for (let i = 0; i < el.points.length - 1; i++) {
      const p1 = el.points[i];
      const p2 = el.points[i + 1];
      if (distToSegmentSquared(px, py, p1.x, p1.y, p2.x, p2.y) <= thresholdSq) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function drawSelectionBox(context, el) {
  const bbox = getElementBoundingBox(el);
  if (!bbox) return;

  context.save();
  const pad = Math.max(4, 4 / zoom);
  const sx = bbox.x - pad;
  const sy = bbox.y - pad;
  const sw = bbox.width + pad * 2;
  const sh = bbox.height + pad * 2;

  // Translucent highlight & dashed boundary
  context.fillStyle = 'rgba(37, 99, 235, 0.05)';
  context.fillRect(sx, sy, sw, sh);

  context.strokeStyle = '#2563eb';
  context.lineWidth = Math.max(1.2, 1.5 / zoom);
  context.setLineDash([5 / zoom, 3 / zoom]);
  context.strokeRect(sx, sy, sw, sh);

  // If it's an image, draw 8 resize handles and dimension badge
  if (el.type === 'image') {
    const handles = getImageResizeHandles({ x: sx, y: sy, width: sw, height: sh });
    const handleR = Math.max(4, 5.5 / zoom);

    handles.forEach(h => {
      context.save();
      context.setLineDash([]);
      context.fillStyle = '#ffffff';
      context.strokeStyle = '#2563eb';
      context.lineWidth = Math.max(1.5, 2 / zoom);

      context.beginPath();
      context.arc(h.x, h.y, handleR, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    });

    // Dimension badge below image
    context.save();
    context.setLineDash([]);
    const badgeText = `${Math.round(el.width)} × ${Math.round(el.height)}`;
    const fontSize = Math.max(9, 11 / zoom);
    context.font = `600 ${fontSize}px Inter, sans-serif`;
    const textMetrics = context.measureText(badgeText);
    const badgeW = textMetrics.width + 12 / zoom;
    const badgeH = fontSize * 1.6;
    const badgeX = sx + sw / 2 - badgeW / 2;
    const badgeY = sy + sh + 6 / zoom;

    context.fillStyle = 'rgba(15, 23, 42, 0.88)';
    context.beginPath();
    const r = 3 / zoom;
    if (context.roundRect) {
      context.roundRect(badgeX, badgeY, badgeW, badgeH, r);
    } else {
      context.rect(badgeX, badgeY, badgeW, badgeH);
    }
    context.fill();

    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(badgeText, sx + sw / 2, badgeY + badgeH / 2);
    context.restore();
  } else {
    // For drawings and shapes, draw corner anchor dots
    context.setLineDash([]);
    context.fillStyle = '#2563eb';
    const dotR = Math.max(3, 3.5 / zoom);
    [
      { x: sx, y: sy },
      { x: sx + sw, y: sy },
      { x: sx + sw, y: sy + sh },
      { x: sx, y: sy + sh }
    ].forEach(d => {
      context.beginPath();
      context.arc(d.x, d.y, dotR, 0, Math.PI * 2);
      context.fill();
    });
  }

  context.restore();
}

function pointInBox(px, py, box) {
  return px >= box.x && px <= box.x + box.width &&
         py >= box.y && py <= box.y + box.height;
}

function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return false;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

function lineIntersectsBox(x1, y1, x2, y2, box) {
  if (pointInBox(x1, y1, box) || pointInBox(x2, y2, box)) return true;
  const bx2 = box.x + box.width;
  const by2 = box.y + box.height;
  return (
    lineIntersectsLine(x1, y1, x2, y2, box.x, box.y, bx2, box.y) ||
    lineIntersectsLine(x1, y1, x2, y2, bx2, box.y, bx2, by2) ||
    lineIntersectsLine(x1, y1, x2, y2, bx2, by2, box.x, by2) ||
    lineIntersectsLine(x1, y1, x2, y2, box.x, by2, box.x, box.y)
  );
}

function boxIntersectsBox(b1, b2) {
  return !(
    b1.x + b1.width < b2.x ||
    b1.x > b2.x + b2.width ||
    b1.y + b1.height < b2.y ||
    b1.y > b2.y + b2.height
  );
}

function elementIntersectsArea(el, area) {
  if (!el || !area) return false;
  const bbox = getElementBoundingBox(el);
  if (!bbox) return false;
  if (!boxIntersectsBox(bbox, area)) return false;

  if (el.type === 'image' || el.type === 'sticky' || el.type === 'rect' || el.type === 'mux' || el.type === 'alu' || el.type === 'text' || el.type === 'circle' || el.type === 'diamond' || el.type === 'axes' || el.type === 'triangle') {
    return true;
  }

  if (el.type === 'line' || el.type === 'arrow') {
    return lineIntersectsBox(el.x1, el.y1, el.x2, el.y2, area);
  }

  if (el.type === 'path' && el.points) {
    if (el.points.length === 0) return false;
    if (el.points.length === 1) {
      return pointInBox(el.points[0].x, el.points[0].y, area);
    }
    for (let i = 0; i < el.points.length; i++) {
      if (pointInBox(el.points[i].x, el.points[i].y, area)) return true;
    }
    for (let i = 0; i < el.points.length - 1; i++) {
      if (lineIntersectsBox(el.points[i].x, el.points[i].y, el.points[i + 1].x, el.points[i + 1].y, area)) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function getGroupBoundingBox(items) {
  if (!items || items.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of items) {
    const bbox = getElementBoundingBox(el);
    if (!bbox) continue;
    if (bbox.x < minX) minX = bbox.x;
    if (bbox.y < minY) minY = bbox.y;
    if (bbox.x + bbox.width > maxX) maxX = bbox.x + bbox.width;
    if (bbox.y + bbox.height > maxY) maxY = bbox.y + bbox.height;
  }
  if (minX === Infinity) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function drawGroupSelectionBox(context, items) {
  const bbox = getGroupBoundingBox(items);
  if (!bbox) return;

  context.save();
  const pad = Math.max(6, 6 / zoom);
  const sx = bbox.x - pad;
  const sy = bbox.y - pad;
  const sw = bbox.width + pad * 2;
  const sh = bbox.height + pad * 2;

  context.fillStyle = 'rgba(37, 99, 235, 0.05)';
  context.fillRect(sx, sy, sw, sh);

  context.strokeStyle = '#2563eb';
  context.lineWidth = Math.max(1.2, 1.5 / zoom);
  context.setLineDash([6 / zoom, 4 / zoom]);
  context.strokeRect(sx, sy, sw, sh);

  context.setLineDash([]);
  context.fillStyle = '#2563eb';
  const dotR = Math.max(3, 4 / zoom);
  [
    { x: sx, y: sy },
    { x: sx + sw, y: sy },
    { x: sx + sw, y: sy + sh },
    { x: sx, y: sy + sh }
  ].forEach(d => {
    context.beginPath();
    context.arc(d.x, d.y, dotR, 0, Math.PI * 2);
    context.fill();
  });

  const badgeText = `${items.length} itens selecionados`;
  const fontSize = Math.max(9, 11 / zoom);
  context.font = `600 ${fontSize}px Inter, sans-serif`;
  const textMetrics = context.measureText(badgeText);
  const badgeW = textMetrics.width + 14 / zoom;
  const badgeH = fontSize * 1.7;
  const badgeX = sx + sw / 2 - badgeW / 2;
  const badgeY = sy + sh + 6 / zoom;

  context.fillStyle = 'rgba(15, 23, 42, 0.88)';
  context.beginPath();
  const r = 4 / zoom;
  if (context.roundRect) {
    context.roundRect(badgeX, badgeY, badgeW, badgeH, r);
  } else {
    context.rect(badgeX, badgeY, badgeW, badgeH);
  }
  context.fill();

  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(badgeText, sx + sw / 2, badgeY + badgeH / 2);

  context.restore();
}

function drawAreaSelectionMarquee(context, startPt, currentPt) {
  const x = Math.min(startPt.x, currentPt.x);
  const y = Math.min(startPt.y, currentPt.y);
  const w = Math.abs(currentPt.x - startPt.x);
  const h = Math.abs(currentPt.y - startPt.y);

  context.save();
  context.fillStyle = 'rgba(59, 130, 246, 0.12)';
  context.fillRect(x, y, w, h);

  context.strokeStyle = '#3b82f6';
  context.lineWidth = Math.max(1, 1.4 / zoom);
  context.setLineDash([5 / zoom, 3 / zoom]);
  context.strokeRect(x, y, w, h);
  context.restore();
}

function startSelectionDrag(pt) {
  if (!selectedElements.length) return;
  isDraggingElement = true;
  dragStartPt = { x: pt.x, y: pt.y };
  dragStartState = serializeBoardState();
  dragOriginalDataList = selectedElements.map(el => {
    if (el.points && Array.isArray(el.points)) {
      return {
        el,
        type: el.type,
        points: el.points.map(p => ({ x: p.x, y: p.y })),
        x1: el.x1,
        y1: el.y1,
        x2: el.x2,
        y2: el.y2
      };
    } else if (el.type === 'image' || el.type === 'text' || el.type === 'sticky') {
      return {
        el,
        type: el.type,
        x: el.x,
        y: el.y
      };
    } else if (el.x1 !== undefined && el.x2 !== undefined) {
      return {
        el,
        type: el.type,
        x1: el.x1,
        y1: el.y1,
        x2: el.x2,
        y2: el.y2
      };
    }
    return { el, type: el.type };
  });

  if (selectedElements.length === 1) {
    selectedElement = selectedElements[0];
    dragOriginalData = dragOriginalDataList[0];
  } else {
    selectedElement = null;
    dragOriginalData = null;
  }
}

function updateSelectionDrag(pt) {
  if (!isDraggingElement || !dragStartPt || !dragOriginalDataList.length) return;
  const dx = pt.x - dragStartPt.x;
  const dy = pt.y - dragStartPt.y;

  for (const item of dragOriginalDataList) {
    const el = item.el;
    invalidateElementBBox(el);
    if (item.points && Array.isArray(item.points) && el.points) {
      for (let i = 0; i < el.points.length; i++) {
        el.points[i].x = Math.round((item.points[i].x + dx) * 10) / 10;
        el.points[i].y = Math.round((item.points[i].y + dy) * 10) / 10;
      }
    }
    if (item.type === 'image' || item.type === 'text' || item.type === 'sticky') {
      el.x = Math.round((item.x + dx) * 10) / 10;
      el.y = Math.round((item.y + dy) * 10) / 10;
    } else if (item.x1 !== undefined) {
      el.x1 = Math.round((item.x1 + dx) * 10) / 10;
      el.y1 = Math.round((item.y1 + dy) * 10) / 10;
      el.x2 = Math.round((item.x2 + dx) * 10) / 10;
      el.y2 = Math.round((item.y2 + dy) * 10) / 10;
    }
  }
  requestRenderAll();
}

function startElementDrag(el, pt) {
  selectedElements = [el];
  selectedElement = el;
  startSelectionDrag(pt);
}

function updateElementDrag(pt) {
  updateSelectionDrag(pt);
}

function startImageResize(el, handle, pt) {
  selectedElement = el;
  isResizingElement = true;
  resizeHandle = handle.id;
  resizeStartPt = { x: pt.x, y: pt.y };
  resizeOriginalBox = {
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    aspectRatio: (el.width || 1) / (el.height || 1)
  };
  resizeStartState = serializeBoardState();
}

function updateImageResize(pt, shiftKey = false) {
  if (!isResizingElement || !selectedElement || !resizeOriginalBox || !resizeStartPt) return;

  const dx = pt.x - resizeStartPt.x;
  const dy = pt.y - resizeStartPt.y;
  const orig = resizeOriginalBox;
  const minDim = 24;
  let newX = orig.x;
  let newY = orig.y;
  let newW = orig.width;
  let newH = orig.height;

  // Corner handles maintain aspect ratio by default (hold Shift to unlock free resize)
  // Edge handles scale width or height independently
  const isCorner = ['nw', 'ne', 'se', 'sw'].includes(resizeHandle);
  const lockAspect = isCorner ? !shiftKey : shiftKey;

  switch (resizeHandle) {
    case 'se': {
      newW = Math.max(minDim, orig.width + dx);
      newH = lockAspect ? (newW / orig.aspectRatio) : Math.max(minDim, orig.height + dy);
      break;
    }
    case 'sw': {
      newW = Math.max(minDim, orig.width - dx);
      newH = lockAspect ? (newW / orig.aspectRatio) : Math.max(minDim, orig.height + dy);
      newX = orig.x + (orig.width - newW);
      break;
    }
    case 'ne': {
      newW = Math.max(minDim, orig.width + dx);
      newH = lockAspect ? (newW / orig.aspectRatio) : Math.max(minDim, orig.height - dy);
      newY = orig.y + (orig.height - newH);
      break;
    }
    case 'nw': {
      newW = Math.max(minDim, orig.width - dx);
      newH = lockAspect ? (newW / orig.aspectRatio) : Math.max(minDim, orig.height - dy);
      newX = orig.x + (orig.width - newW);
      newY = orig.y + (orig.height - newH);
      break;
    }
    case 'e': {
      newW = Math.max(minDim, orig.width + dx);
      break;
    }
    case 'w': {
      newW = Math.max(minDim, orig.width - dx);
      newX = orig.x + (orig.width - newW);
      break;
    }
    case 's': {
      newH = Math.max(minDim, orig.height + dy);
      break;
    }
    case 'n': {
      newH = Math.max(minDim, orig.height - dy);
      newY = orig.y + (orig.height - newH);
      break;
    }
  }

  selectedElement.x = Math.round(newX * 10) / 10;
  selectedElement.y = Math.round(newY * 10) / 10;
  selectedElement.width = Math.round(newW * 10) / 10;
  selectedElement.height = Math.round(newH * 10) / 10;
  invalidateElementBBox(selectedElement);
  requestRenderAll();
}

// Compute total bounding box of all elements on canvas
function getElementsBounds() {
  if (elements.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  elements.forEach(el => {
    const b = getElementBoundingBox(el);
    if (b) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    } else if (el.type === 'path' && el.points) {
      el.points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    } else if (el.x1 !== undefined && el.x2 !== undefined) {
      minX = Math.min(minX, el.x1, el.x2);
      minY = Math.min(minY, el.y1, el.y2);
      maxX = Math.max(maxX, el.x1, el.x2);
      maxY = Math.max(maxY, el.y1, el.y2);
    }
  });

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// Fit all elements centered onto screen
function fitToScreen() {
  const bounds = getElementsBounds();
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    zoom = 1.0;
    panX = 0;
    panY = 0;
    render();
    return;
  }

  const padding = 50;
  const availW = Math.max(100, width - padding * 2);
  const availH = Math.max(100, height - padding * 2);

  const scaleX = availW / bounds.width;
  const scaleY = availH / bounds.height;
  const newZoom = Math.min(scaleX, scaleY, 1.25);

  const cx = bounds.minX + bounds.width / 2;
  const cy = bounds.minY + bounds.height / 2;

  zoom = Math.max(0.15, Math.min(3.0, newZoom));
  panX = width / 2 - cx * zoom;
  panY = height / 2 - cy * zoom;

  render();
  updateEraserCursorSize();
}

// ==================== Z-Index / Layer Management ====================
function bringToFront() {
  if (!selectedElements.length && !selectedElement) return;
  const targets = selectedElements.length ? selectedElements : [selectedElement];
  recordState();
  const set = new Set(targets);
  const others = elements.filter(el => !set.has(el));
  elements = [...others, ...targets];
  render();
  scheduleAutoSave();
  commitLocalAction();
  showToast('Trazido para a frente');
}

function sendToBack() {
  if (!selectedElements.length && !selectedElement) return;
  const targets = selectedElements.length ? selectedElements : [selectedElement];
  recordState();
  const set = new Set(targets);
  const others = elements.filter(el => !set.has(el));
  elements = [...targets, ...others];
  render();
  scheduleAutoSave();
  commitLocalAction();
  showToast('Enviado para o fundo');
}

function bringForward() {
  if (!selectedElements.length && !selectedElement) return;
  const targets = selectedElements.length ? selectedElements : [selectedElement];
  recordState();
  const set = new Set(targets);
  for (let i = elements.length - 2; i >= 0; i--) {
    if (set.has(elements[i]) && !set.has(elements[i + 1])) {
      const temp = elements[i];
      elements[i] = elements[i + 1];
      elements[i + 1] = temp;
    }
  }
  render();
  scheduleAutoSave();
  commitLocalAction();
  showToast('Avançado uma camada');
}

function sendBackward() {
  if (!selectedElements.length && !selectedElement) return;
  const targets = selectedElements.length ? selectedElements : [selectedElement];
  recordState();
  const set = new Set(targets);
  for (let i = 1; i < elements.length; i++) {
    if (set.has(elements[i]) && !set.has(elements[i - 1])) {
      const temp = elements[i];
      elements[i] = elements[i - 1];
      elements[i - 1] = temp;
    }
  }
  render();
  scheduleAutoSave();
  commitLocalAction();
  showToast('Recuado uma camada');
}

// Quick Clone / Duplication
function duplicateSelection(offset = 25) {
  if (!selectedElements.length && !selectedElement) return;
  const targets = selectedElements.length ? selectedElements : [selectedElement];
  recordState();

  const clones = targets.map(el => {
    const copy = JSON.parse(JSON.stringify(el));
    copy.id = (typeof generateId === 'function' ? generateId() : 'el-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
    delete copy._bbox;

    if (copy.points && Array.isArray(copy.points)) {
      copy.points.forEach(p => { p.x += offset; p.y += offset; });
    }
    if (copy.x !== undefined) {
      copy.x += offset;
      copy.y += offset;
    } else if (copy.x1 !== undefined) {
      copy.x1 += offset;
      copy.y1 += offset;
      copy.x2 += offset;
      copy.y2 += offset;
    }
    return copy;
  });

  clones.forEach(c => {
    invalidateElementBBox(c);
    elements.push(c);
  });
  rehydrateImages();

  selectedElements = clones;
  selectedElement = clones.length === 1 ? clones[0] : null;

  render();
  scheduleAutoSave();
  commitLocalAction();
  showToast(clones.length === 1 ? 'Elemento duplicado' : `${clones.length} elementos duplicados`);
}

// ==================== Floating Selection HUD ====================
function updateSelectionHud() {
  const hud = document.getElementById('selectionHud');
  if (!hud) return;

  if (currentTool !== 'select' || (selectedElements.length === 0 && !selectedElement) || isPanning || isDraggingElement || isResizingElement || isDrawing) {
    hud.style.display = 'none';
    return;
  }

  const targets = selectedElements.length > 0 ? selectedElements : (selectedElement ? [selectedElement] : []);
  const bbox = getGroupBoundingBox(targets) || getElementBoundingBox(targets[0]);
  if (!bbox) {
    hud.style.display = 'none';
    return;
  }

  const screenMinX = bbox.x * zoom + panX;
  const screenMinY = bbox.y * zoom + panY;
  const screenW = bbox.width * zoom;

  const hudX = Math.round(screenMinX + screenW / 2);
  const hudY = Math.round(screenMinY - 14);

  hud.style.left = `${hudX}px`;
  hud.style.top = `${Math.max(60, hudY)}px`;
  hud.style.display = 'flex';
}

function setupSelectionHud() {
  const btnFront = document.getElementById('btnHudBringFront');
  const btnForward = document.getElementById('btnHudBringForward');
  const btnBackward = document.getElementById('btnHudSendBackward');
  const btnBack = document.getElementById('btnHudSendBack');
  const btnDuplicate = document.getElementById('btnHudDuplicate');
  const btnDelete = document.getElementById('btnHudDelete');

  if (btnFront) btnFront.addEventListener('click', (e) => { e.stopPropagation(); bringToFront(); });
  if (btnForward) btnForward.addEventListener('click', (e) => { e.stopPropagation(); bringForward(); });
  if (btnBackward) btnBackward.addEventListener('click', (e) => { e.stopPropagation(); sendBackward(); });
  if (btnBack) btnBack.addEventListener('click', (e) => { e.stopPropagation(); sendToBack(); });
  if (btnDuplicate) btnDuplicate.addEventListener('click', (e) => { e.stopPropagation(); duplicateSelection(25); });
  if (btnDelete) {
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedElements.length > 0) {
        recordState();
        const count = selectedElements.length;
        const set = new Set(selectedElements);
        elements = elements.filter(el => !set.has(el));
        selectedElements = [];
        selectedElement = null;
        render();
        scheduleAutoSave();
        commitLocalAction();
        showToast(count === 1 ? 'Elemento excluído' : `${count} elementos excluídos`);
      } else if (selectedElement) {
        recordState();
        elements = elements.filter(el => el !== selectedElement);
        selectedElement = null;
        render();
        scheduleAutoSave();
        commitLocalAction();
        showToast('Elemento excluído');
      }
    });
  }
}

// ==================== Chromatic Color Wheel & Gradient Picker ====================
let colorWheelHue = 0;
let colorWheelSat = 1.0;
let colorWheelVal = 1.0;

function setupColorWheel() {
  const btnColorWheelMenu = document.getElementById('btnColorWheelMenu');
  const colorWheelPopover = document.getElementById('colorWheelPopover');
  const wheelCanvas = document.getElementById('colorWheelCanvas');
  const hueThumb = document.getElementById('colorWheelHueThumb');
  const reticle = document.getElementById('colorWheelReticle');
  const brightnessSlider = document.getElementById('colorBrightnessSlider');
  const brightnessLabel = document.getElementById('colorBrightnessLabel');
  const hexInput = document.getElementById('colorHexInput');
  const previewDot = document.getElementById('popoverColorPreviewDot');
  const activeIndicator = document.getElementById('activeColorIndicator');
  const btnEyeDropper = document.getElementById('btnEyeDropper');
  const quickSwatches = document.querySelectorAll('.quick-swatch:not(.eyedropper-btn)');

  if (!wheelCanvas) return;

  const wheelCtx = wheelCanvas.getContext('2d');
  const width = wheelCanvas.width;
  const height = wheelCanvas.height;
  const radius = width / 2;
  const cx = radius;
  const cy = radius;

  // Render the Chromatic Ring (pure intense hues) + Inner Saturation Disc
  const imgData = wheelCtx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const idx = (y * width + x) * 4;

      if (dist >= 60 && dist <= 88) {
        // Outer Pure Hue Ring (100% Saturation & 100% Brightness: Vermelhao, Verdao, Azulzao, etc.)
        const angle = Math.atan2(dy, dx);
        const hue = (angle * 180 / Math.PI + 360) % 360;
        const rgb = hsvToRgb(hue, 1.0, 1.0);

        const outerEdge = 88 - dist;
        const innerEdge = dist - 60;
        const alpha = Math.max(0, Math.min(1, Math.min(outerEdge, innerEdge)));

        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = Math.round(alpha * 255);
      } else if (dist <= 54) {
        // Inner Saturation Disc (White at center -> Pure Hue at perimeter)
        const angle = Math.atan2(dy, dx);
        const hue = (angle * 180 / Math.PI + 360) % 360;
        const sat = Math.min(1.0, dist / 54);
        const rgb = hsvToRgb(hue, sat, 1.0);

        const edgeDist = 54 - dist;
        const alpha = edgeDist < 1.0 ? Math.max(0, Math.min(1, edgeDist)) : 1.0;

        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = Math.round(alpha * 255);
      } else {
        // Smooth gap between inner disc and outer ring
        data[idx + 3] = 0;
      }
    }
  }

  wheelCtx.putImageData(imgData, 0, 0);

  function syncFromHex(hex, updateAll = true) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    colorWheelHue = hsv.h;
    colorWheelSat = hsv.s;
    colorWheelVal = hsv.v;
    applyColorState(hex, updateAll);
  }

  function applyColorState(hex, updateInputs = true) {
    currentColor = hex;
    localStorage.setItem('whiteboard_current_color', hex);

    if (activeIndicator) activeIndicator.style.backgroundColor = hex;
    if (previewDot) previewDot.style.backgroundColor = hex;
    if (hexInput && updateInputs) hexInput.value = hex.toUpperCase();

    // Pure hue color for slider track & hue thumb
    const pureRgb = hsvToRgb(colorWheelHue, 1.0, 1.0);
    const pureHex = rgbToHex(pureRgb.r, pureRgb.g, pureRgb.b);

    // Update brightness slider track & label
    if (brightnessSlider) {
      brightnessSlider.style.background = `linear-gradient(to right, #000000, ${pureHex})`;
      if (updateInputs) {
        const valPct = Math.round(colorWheelVal * 100);
        brightnessSlider.value = valPct;
        if (brightnessLabel) brightnessLabel.textContent = `${valPct}%`;
      }
    }

    const angleRad = (colorWheelHue * Math.PI) / 180;

    // Update hue thumb on the outer ring (radius ~ 74)
    if (hueThumb) {
      const ringR = 74;
      const hx = cx + Math.cos(angleRad) * ringR;
      const hy = cy + Math.sin(angleRad) * ringR;
      hueThumb.style.left = `${hx}px`;
      hueThumb.style.top = `${hy}px`;
      hueThumb.style.backgroundColor = pureHex;
    }

    // Update reticle position on the inner saturation disc (radius 0..54)
    if (reticle) {
      const discR = Math.min(54, colorWheelSat * 54);
      const rx = cx + Math.cos(angleRad) * discR;
      const ry = cy + Math.sin(angleRad) * discR;
      reticle.style.left = `${rx}px`;
      reticle.style.top = `${ry}px`;
      reticle.style.backgroundColor = hex;
    }

    // Update active quick swatch
    quickSwatches.forEach(sw => {
      if (sw.dataset.color.toLowerCase() === hex.toLowerCase()) {
        sw.classList.add('active');
      } else {
        sw.classList.remove('active');
      }
    });

    updateStrokePreview();

    // If elements are selected, recolor them instantly!
    if (selectedElements.length > 0) {
      selectedElements.forEach(el => {
        el.color = hex;
      });
      render();
      scheduleAutoSave();
      commitLocalAction();
      broadcastBoardSync();
    }
  }

  // Pointer drag on Wheel Canvas (Outer pure ring vs inner saturation disc)
  let isDraggingWheel = false;
  let activeWheelZone = null;

  function handleWheelPointer(e) {
    const rect = wheelCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    const dx = canvasX - cx;
    const dy = canvasY - cy;
    const dist = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;

    if (!activeWheelZone) {
      activeWheelZone = dist >= 57 ? 'ring' : 'disc';
    }

    colorWheelHue = angle;

    if (activeWheelZone === 'ring') {
      // Outer Pure Hue Ring: intense, 100% saturation!
      colorWheelSat = 1.0;
      if (colorWheelVal < 0.4) {
        colorWheelVal = 1.0;
      }
    } else {
      // Inner Disc: adjustable saturation & nuances
      colorWheelSat = Math.min(1.0, Math.max(0, dist / 54));
      if (colorWheelVal < 0.2) {
        colorWheelVal = 1.0;
      }
    }

    const rgb = hsvToRgb(colorWheelHue, colorWheelSat, colorWheelVal);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    applyColorState(hex, true);
  }

  wheelCanvas.addEventListener('pointerdown', (e) => {
    isDraggingWheel = true;
    activeWheelZone = null;
    if (wheelCanvas.setPointerCapture) {
      try { wheelCanvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
    handleWheelPointer(e);
  });

  wheelCanvas.addEventListener('pointermove', (e) => {
    if (!isDraggingWheel) return;
    handleWheelPointer(e);
  });

  const stopWheelDrag = (e) => {
    if (isDraggingWheel) {
      isDraggingWheel = false;
      activeWheelZone = null;
      if (wheelCanvas.releasePointerCapture) {
        try { wheelCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    }
  };
  wheelCanvas.addEventListener('pointerup', stopWheelDrag);
  wheelCanvas.addEventListener('pointercancel', stopWheelDrag);

  // Brightness slider
  if (brightnessSlider) {
    brightnessSlider.addEventListener('input', () => {
      const pct = parseFloat(brightnessSlider.value);
      colorWheelVal = pct / 100;
      if (brightnessLabel) brightnessLabel.textContent = `${Math.round(pct)}%`;
      const rgb = hsvToRgb(colorWheelHue, colorWheelSat, colorWheelVal);
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      applyColorState(hex, false);
      if (hexInput) hexInput.value = hex.toUpperCase();
    });
  }

  // Hex input
  if (hexInput) {
    hexInput.addEventListener('input', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        syncFromHex(val, false);
      }
    });
  }

  // Quick swatches
  quickSwatches.forEach(sw => {
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      syncFromHex(sw.dataset.color, true);
    });
  });

  // EyeDropper API (Chrome/Edge desktop)
  if (btnEyeDropper) {
    if (window.EyeDropper) {
      btnEyeDropper.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const eyeDropper = new window.EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            syncFromHex(result.sRGBHex, true);
          }
        } catch (err) {}
      });
    } else {
      btnEyeDropper.style.display = 'none';
    }
  }

  // Popover positioning & toggle (Responsive clamping against viewport height)
  function updateColorPopoverPosition() {
    if (!btnColorWheelMenu || !colorWheelPopover) return;
    const btnRect = btnColorWheelMenu.getBoundingClientRect();
    const workspace = document.querySelector('.workspace') || document.body;
    const wsRect = workspace.getBoundingClientRect();

    const popoverH = colorWheelPopover.offsetHeight || 330;
    const idealTop = btnRect.top - wsRect.top - 14;
    const maxTop = window.innerHeight - wsRect.top - popoverH - 12;
    const topPos = Math.max(8, Math.min(idealTop, maxTop));
    const leftPos = btnRect.right - wsRect.left + 8;

    colorWheelPopover.style.top = `${topPos}px`;
    colorWheelPopover.style.left = `${leftPos}px`;

    // Point the arrow directly at the trigger button center
    const btnCenterY = btnRect.top + btnRect.height / 2;
    const popoverTopY = wsRect.top + topPos;
    const arrowTop = Math.max(12, Math.min(popoverH - 18, btnCenterY - popoverTopY));
    colorWheelPopover.style.setProperty('--arrow-top', `${arrowTop}px`);
  }

  window.addEventListener('resize', () => {
    if (colorWheelPopover && colorWheelPopover.style.display === 'flex') {
      updateColorPopoverPosition();
    }
  });

  if (btnColorWheelMenu) {
    btnColorWheelMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = colorWheelPopover.style.display === 'flex';
      if (isOpen) {
        colorWheelPopover.style.display = 'none';
        btnColorWheelMenu.classList.remove('open');
      } else {
        const strokePop = document.getElementById('strokeMiniPopover');
        if (strokePop) strokePop.style.display = 'none';
        const strokeBtn = document.getElementById('btnStrokeMenu');
        if (strokeBtn) strokeBtn.classList.remove('open');

        colorWheelPopover.style.display = 'flex';
        updateColorPopoverPosition();
        btnColorWheelMenu.classList.add('open');
      }
    });
  }

  if (colorWheelPopover) {
    colorWheelPopover.addEventListener('click', (e) => e.stopPropagation());
  }

  document.addEventListener('click', (e) => {
    if (colorWheelPopover && colorWheelPopover.style.display === 'flex') {
      if (!colorWheelPopover.contains(e.target) && !btnColorWheelMenu?.contains(e.target)) {
        colorWheelPopover.style.display = 'none';
        if (btnColorWheelMenu) btnColorWheelMenu.classList.remove('open');
      }
    }
  });

  // Initialize with current color
  syncFromHex(currentColor || '#1e293b', true);
}

// ==================== Laser Tool with Fading Trail ====================
let localLaserTrail = [];
const peerLaserTrails = new Map();
let laserRenderLoopActive = false;
let lastLaserBroadcastTime = 0;

function addLaserPoint(pt, isLocal = true, clientId = null) {
  const now = Date.now();
  const trail = isLocal ? localLaserTrail : (peerLaserTrails.get(clientId) || []);

  // Interpolate intermediate points if moving fast to eliminate gaps between points
  if (trail.length > 0) {
    const last = trail[trail.length - 1];
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
    const maxStep = Math.max(3.0, 5.0 / zoom);
    if (dist > maxStep && dist < 350) {
      const steps = Math.min(8, Math.floor(dist / maxStep));
      for (let s = 1; s < steps; s++) {
        const frac = s / steps;
        trail.push({
          x: last.x + (pt.x - last.x) * frac,
          y: last.y + (pt.y - last.y) * frac,
          time: last.time + (now - last.time) * frac
        });
      }
    }
  }

  if (isLocal) {
    localLaserTrail.push({ x: pt.x, y: pt.y, time: now });
    broadcastLaserPoint(pt.x, pt.y);
  } else if (clientId) {
    if (!peerLaserTrails.has(clientId)) {
      peerLaserTrails.set(clientId, []);
    }
    peerLaserTrails.get(clientId).push({ x: pt.x, y: pt.y, time: now });
  }

  if (!laserRenderLoopActive) {
    laserRenderLoopActive = true;
    requestAnimationFrame(updateLaserFrame);
  }
}

function updateLaserFrame() {
  const now = Date.now();
  const maxAge = 1100;

  localLaserTrail = localLaserTrail.filter(p => now - p.time < maxAge);

  peerLaserTrails.forEach((trail, cid) => {
    const valid = trail.filter(p => now - p.time < maxAge);
    if (valid.length === 0) {
      peerLaserTrails.delete(cid);
    } else {
      peerLaserTrails.set(cid, valid);
    }
  });

  requestRenderOverlay();

  if (localLaserTrail.length > 0 || peerLaserTrails.size > 0) {
    requestAnimationFrame(updateLaserFrame);
  } else {
    laserRenderLoopActive = false;
  }
}

function broadcastLaserPoint(x, y) {
  const now = Date.now();
  if (now - lastLaserBroadcastTime > 25) {
    lastLaserBroadcastTime = now;
    sendWsMessage({
      type: 'laser_point',
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10
    });
  }
}

function drawLaserTrail(context, trail, color = '#ef4444') {
  if (!trail || trail.length < 2) return;
  const now = Date.now();
  const maxAge = 1100;

  const pts = trail.filter(p => now - p.time < maxAge);
  const n = pts.length;
  if (n < 2) return;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // Smooth quadratic curves through midpoints from tail to head
  for (let i = 0; i < n - 1; i++) {
    const pPrev = i > 0 ? pts[i - 1] : pts[0];
    const pCurr = pts[i];
    const pNext = pts[i + 1];

    const age = now - pNext.time;
    if (age >= maxAge) continue;
    const life = Math.max(0, 1 - age / maxAge);
    const alpha = life * life;
    const t = (i + 1) / n;

    const m1 = { x: (pPrev.x + pCurr.x) / 2, y: (pPrev.y + pCurr.y) / 2 };
    const m2 = { x: (pCurr.x + pNext.x) / 2, y: (pCurr.y + pNext.y) / 2 };

    const outerWidth = Math.max(1.2, (2.2 + 8.5 * t) / zoom);
    const innerWidth = Math.max(0.8, (1.2 + 4.2 * t) / zoom);

    // 1. Soft Outer Red Halo
    context.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.38})`;
    context.lineWidth = outerWidth;
    context.beginPath();
    context.moveTo(m1.x, m1.y);
    context.quadraticCurveTo(pCurr.x, pCurr.y, m2.x, m2.y);
    context.stroke();

    // 2. Solid Intense Red Core (Preenchido com vermelho vivo, sem branco)
    context.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.98})`;
    context.lineWidth = innerWidth;
    context.beginPath();
    context.moveTo(m1.x, m1.y);
    context.quadraticCurveTo(pCurr.x, pCurr.y, m2.x, m2.y);
    context.stroke();
  }

  // Laser tip: glowing intense red radial bloom + solid red core
  const tip = pts[n - 1];
  const tipAge = now - tip.time;
  if (tipAge < maxAge) {
    const tipLife = Math.max(0, 1 - tipAge / maxAge);
    const bloomRadius = Math.max(6, 13 / zoom);

    try {
      const grad = context.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, bloomRadius);
      grad.addColorStop(0, `rgba(239, 68, 68, ${tipLife})`);
      grad.addColorStop(0.45, `rgba(239, 68, 68, ${tipLife * 0.75})`);
      grad.addColorStop(1, `rgba(239, 68, 68, 0)`);

      context.fillStyle = grad;
      context.beginPath();
      context.arc(tip.x, tip.y, bloomRadius, 0, Math.PI * 2);
      context.fill();
    } catch (e) {}

    context.fillStyle = '#ef4444';
    context.beginPath();
    context.arc(tip.x, tip.y, Math.max(2.5, 4.0 / zoom), 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

// ==================== Smart Shapes (Draw and Hold) ====================
let smartShapeHoldTimer = null;
let smartShapeAnchor = null;

function clearSmartShapeTimer() {
  if (smartShapeHoldTimer) {
    clearTimeout(smartShapeHoldTimer);
    smartShapeHoldTimer = null;
  }
  smartShapeAnchor = null;
}

function checkSmartShapeHold(pt) {
  if (!isDrawing || !currentPath || currentPath.type !== 'path') {
    clearSmartShapeTimer();
    return;
  }
  const pts = currentPath.points;
  if (!pts || pts.length < 8) {
    clearSmartShapeTimer();
    return;
  }

  if (!smartShapeAnchor) {
    smartShapeAnchor = { x: pt.x, y: pt.y };
    smartShapeHoldTimer = setTimeout(() => {
      tryMorphToSmartShape();
    }, 450);
  } else {
    const dist = Math.hypot(pt.x - smartShapeAnchor.x, pt.y - smartShapeAnchor.y);
    if (dist > 8) {
      // User is actively moving/drawing new strokes: reset anchor and restart hold countdown
      smartShapeAnchor = { x: pt.x, y: pt.y };
      if (smartShapeHoldTimer) clearTimeout(smartShapeHoldTimer);
      smartShapeHoldTimer = setTimeout(() => {
        tryMorphToSmartShape();
      }, 450);
    }
  }
}

function tryMorphToSmartShape() {
  if (!isDrawing || !currentPath || currentPath.type !== 'path') return;
  const pts = currentPath.points;
  if (pts.length < 8) return;

  const shape = detectGeometricShape(pts, currentPath.color, currentPath.size);
  if (shape) {
    shape.isSmartShape = true;
    currentPath = shape;
    requestRenderOverlay();
    showToast(`Forma inteligente: ${shape.shapeLabel || 'Geométrica'}`);
  }
}

function detectGeometricShape(pts, color, size) {
  const n = pts.length;
  const p0 = pts[0];
  const pN = pts[n - 1];

  let totalLen = 0;
  for (let i = 0; i < n - 1; i++) {
    totalLen += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  if (totalLen < 25) return null;

  const chord = Math.hypot(pN.x - p0.x, pN.y - p0.y);
  const linearity = chord / totalLen;

  // 1. Straight Line
  if (linearity >= 0.88 && chord >= 25) {
    let x2 = pN.x;
    let y2 = pN.y;
    const angle = Math.atan2(y2 - p0.y, x2 - p0.x);
    const snapAngles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4, -Math.PI];
    for (const snap of snapAngles) {
      if (Math.abs(angle - snap) < 0.12) {
        x2 = p0.x + chord * Math.cos(snap);
        y2 = p0.y + chord * Math.sin(snap);
        break;
      }
    }
    return {
      type: 'line',
      shapeLabel: 'Reta',
      color,
      size,
      x1: Math.round(p0.x * 10) / 10,
      y1: Math.round(p0.y * 10) / 10,
      x2: Math.round(x2 * 10) / 10,
      y2: Math.round(y2 * 10) / 10
    };
  }

  // 2. Closed Shapes: Circle/Ellipse, Triangle or Rectangle
  if (chord / totalLen < 0.35 || chord < 35) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 20 || h < 20) return null;

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = w / 2;
    const ry = h / 2;

    // A. Shoelace polygon area & bounding box fill ratio
    let polyArea = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      polyArea += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    polyArea = Math.abs(polyArea) / 2;
    const bboxArea = w * h;
    const fillRatio = bboxArea > 0 ? (polyArea / bboxArea) : 0;

    // B. Corner detection via Douglas-Peucker line simplification
    const diag = Math.hypot(w, h);
    const simplified = simplifyPolyline(pts, diag * 0.05);
    const uniqueCorners = simplified.filter((p, idx) => {
      if (idx === 0) return true;
      return Math.hypot(p.x - simplified[0].x, p.y - simplified[0].y) > diag * 0.08;
    });

    // C. Radial distance analysis from center
    const rads = [];
    let radSum = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const dx = (p.x - cx) / rx;
      const dy = (p.y - cy) / ry;
      const r = Math.hypot(dx, dy);
      rads.push(r);
      radSum += r;
    }
    const minR = Math.min(...rads);
    const maxR = Math.max(...rads);
    const radRatio = maxR > 0 ? (minR / maxR) : 1;
    const meanRad = radSum / n;
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      varSum += Math.pow(rads[i] - meanRad, 2);
    }
    const radStdDev = Math.sqrt(varSum / n);

    // 1. Triangle Detection Check
    // Triangles have 3 corners or low fill ratio (theoretical max is 0.50, hand-drawn up to 0.60)
    if (uniqueCorners.length === 3 || (fillRatio >= 0.18 && fillRatio <= 0.60 && radStdDev > 0.14)) {
      let triCorners = [];
      if (uniqueCorners.length === 3) {
        triCorners = [uniqueCorners[0], uniqueCorners[1], uniqueCorners[2]];
      } else if (uniqueCorners.length === 4) {
        // Drop the point that reduces area the least
        let maxA = -1;
        let bestSet = null;
        for (let skip = 0; skip < 4; skip++) {
          const cand = uniqueCorners.filter((_, idx) => idx !== skip);
          const a = 0.5 * Math.abs(cand[0].x * (cand[1].y - cand[2].y) + cand[1].x * (cand[2].y - cand[0].y) + cand[2].x * (cand[0].y - cand[1].y));
          if (a > maxA) {
            maxA = a;
            bestSet = cand;
          }
        }
        triCorners = bestSet || uniqueCorners.slice(0, 3);
      } else {
        // Fallback: 3 extreme corners
        triCorners = [
          { x: cx, y: minY },
          { x: minX, y: maxY },
          { x: maxX, y: maxY }
        ];
      }

      // Snapping: snap nearly horizontal edges to horizontal, nearly vertical to vertical
      for (let i = 0; i < 3; i++) {
        const next = (i + 1) % 3;
        if (Math.abs(triCorners[i].y - triCorners[next].y) < h * 0.12) {
          const midY = (triCorners[i].y + triCorners[next].y) / 2;
          triCorners[i].y = midY;
          triCorners[next].y = midY;
        }
        if (Math.abs(triCorners[i].x - triCorners[next].x) < w * 0.12) {
          const midX = (triCorners[i].x + triCorners[next].x) / 2;
          triCorners[i].x = midX;
          triCorners[next].x = midX;
        }
      }

      return {
        type: 'triangle',
        shapeLabel: 'Triângulo',
        color,
        size,
        x1: minX,
        y1: minY,
        x2: maxX,
        y2: maxY,
        points: triCorners.map(p => ({
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10
        }))
      };
    }

    // 2. Square & Rectangle Detection Check
    // Fundamentally distinct from circles:
    // - Theoretical max area of circle is pi/4 ≈ 0.785. A square fills 0.83 to 0.98.
    // - Squares have 4 corners, whereas circles continuously curve (8-14 DP vertices).
    // - In a square, corners are sqrt(2) ≈ 1.41x further from center than sides (radRatio <= 0.77, radStdDev >= 0.09).
    const isSquareOrRect = (fillRatio >= 0.83) ||
                           (uniqueCorners.length === 4) ||
                           (radRatio <= 0.77 && radStdDev >= 0.09);

    if (isSquareOrRect) {
      const aspect = w / h;
      let rx1 = minX, ry1 = minY, rx2 = maxX, ry2 = maxY;
      const isSquare = aspect >= 0.80 && aspect <= 1.25;
      if (isSquare) {
        const side = (w + h) / 2;
        rx1 = cx - side / 2;
        ry1 = cy - side / 2;
        rx2 = cx + side / 2;
        ry2 = cy + side / 2;
      }
      return {
        type: 'rect',
        shapeLabel: isSquare ? 'Quadrado' : 'Retângulo',
        color,
        size,
        x1: Math.round(rx1 * 10) / 10,
        y1: Math.round(ry1 * 10) / 10,
        x2: Math.round(rx2 * 10) / 10,
        y2: Math.round(ry2 * 10) / 10
      };
    }

    // 3. Circle / Ellipse Check
    // If it is not a triangle and not a square/rect, it is a smooth closed curve (circle or ellipse)
    const aspect = w / h;
    let finalX1 = minX, finalY1 = minY, finalX2 = maxX, finalY2 = maxY;
    const isTrueCircle = aspect >= 0.80 && aspect <= 1.25;
    if (isTrueCircle) {
      const d = (w + h) / 2;
      finalX1 = cx - d / 2;
      finalY1 = cy - d / 2;
      finalX2 = cx + d / 2;
      finalY2 = cy + d / 2;
    }
    return {
      type: 'circle',
      shapeLabel: isTrueCircle ? 'Círculo' : 'Elipse',
      color,
      size,
      x1: Math.round(finalX1 * 10) / 10,
      y1: Math.round(finalY1 * 10) / 10,
      x2: Math.round(finalX2 * 10) / 10,
      y2: Math.round(finalY2 * 10) / 10
    };
  }

  return null;
}

// ==================== Dropdown & Gallery Builder ====================
function populateDropdown(catalog) {
  const optgroupExam = document.getElementById('optgroupExam');
  const optgroupIncomplete = document.getElementById('optgroupIncomplete');
  const optgroupComplete = document.getElementById('optgroupComplete');
  const optgroupSteps = document.getElementById('optgroupSteps');
  const optgroupExercises = document.getElementById('optgroupExercises');

  if (!optgroupIncomplete || !optgroupComplete) return;

  if (optgroupExam) optgroupExam.innerHTML = '';
  optgroupIncomplete.innerHTML = '';
  optgroupComplete.innerHTML = '';
  if (optgroupSteps) optgroupSteps.innerHTML = '';
  if (optgroupExercises) optgroupExercises.innerHTML = '';

  catalog.forEach(t => {
    const opt = document.createElement('option');
    opt.value = `templates/${t.filename}`;
    opt.textContent = t.title;

    if (t.category.includes('Prova Real') && optgroupExam) {
      optgroupExam.appendChild(opt);
    } else if (t.category.includes('Incompletos')) {
      optgroupIncomplete.appendChild(opt);
    } else if (t.category.includes('Completos')) {
      optgroupComplete.appendChild(opt);
    } else if (t.category.includes('Passos') && optgroupSteps) {
      optgroupSteps.appendChild(opt);
    } else if (optgroupExercises) {
      optgroupExercises.appendChild(opt);
    }
  });
}

let currentSubjectMaterials = [];

async function loadMaterialsForSubject(subjectId) {
  if (!subjectId) {
    const subjectSelect = document.getElementById('subjectSelect');
    subjectId = subjectSelect ? subjectSelect.value : 'arq';
  }

  // Update modal header with subject name
  if (gallerySubjectTitle) {
    let subjName = 'Matéria';
    if (boardsMetadata && boardsMetadata.subjects) {
      const s = boardsMetadata.subjects.find(x => x.id === subjectId);
      if (s) subjName = s.name;
    }
    gallerySubjectTitle.textContent = subjName;
  }

  try {
    const res = await fetch(`/api/materials?subjectId=${encodeURIComponent(subjectId)}`);
    if (res.ok) {
      const data = await res.json();
      currentSubjectMaterials = data.materials || [];
    } else {
      currentSubjectMaterials = [];
    }
  } catch (err) {
    console.warn('Erro ao buscar materiais da matéria:', err);
    currentSubjectMaterials = (subjectId === 'arq') ? STATIC_TEMPLATES.map(t => ({
      ...t,
      url: `templates/${t.filename}`,
      id: t.filename
    })) : [];
  }

  buildGalleryFilters(currentSubjectMaterials);
  buildGalleryModal(currentSubjectMaterials);
}

function buildGalleryFilters(materials) {
  if (!galleryFilterButtons) return;
  const categories = new Set();
  materials.forEach(m => {
    if (m.category) categories.add(m.category);
  });

  galleryFilterButtons.innerHTML = '';
  const btnAll = document.createElement('button');
  btnAll.className = 'filter-btn active';
  btnAll.dataset.category = 'all';
  btnAll.textContent = 'Todos';
  btnAll.addEventListener('click', () => filterGallery('all'));
  galleryFilterButtons.appendChild(btnAll);

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => filterGallery(cat));
    galleryFilterButtons.appendChild(btn);
  });
}

function buildGalleryModal(catalog) {
  if (!galleryGrid) return;
  galleryGrid.innerHTML = '';

  if (!catalog || catalog.length === 0) {
    galleryGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-muted);">
        <div style="display:flex; justify-content:center; margin-bottom: 12px;">
          <svg class="ui-icon" style="width:42px; height:42px; stroke:#64748b;" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div style="font-size: 14px; font-weight: 700; color: #f1f5f9; margin-bottom: 6px;">Nenhum material adicionado nesta matéria</div>
        <p style="font-size: 12px; max-width: 400px; margin: 0 auto 16px; line-height: 1.5;">Clique no botão <b>Adicionar Material</b> acima para fazer upload de fotos, exercícios ou resumos.</p>
      </div>
    `;
    return;
  }

  catalog.forEach(t => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.dataset.category = t.category || 'Geral';

    const badgeClass = t.isCustom ? 'badge-custom' : `badge-${t.badge || 'completo'}`;

    card.innerHTML = `
      <div>
        <div class="card-top">
          <span class="card-badge ${badgeClass}">${t.badgeText || t.badge || (t.isCustom ? 'Upload' : 'Diagrama')}</span>
          <span style="font-size:10px; color:#64748b;">${t.category || ''}</span>
        </div>
        ${t.url ? `<img src="${t.url}" style="width:100%; height:110px; object-fit:contain; background:rgba(0,0,0,0.2); border-radius:6px; margin:6px 0;" loading="lazy" />` : ''}
        <div class="card-title">${t.title}</div>
        <div class="card-desc">${t.desc || ''}</div>
      </div>
      <div class="card-actions-row">
        <button class="card-btn" style="flex:1;">
          <svg class="ui-icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>Inserir no Quadro</span>
        </button>
        ${t.isCustom ? `<button class="btn-delete-mat" title="Excluir este material"><svg class="ui-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
      </div>
    `;

    const btnLoad = card.querySelector('.card-btn');
    if (btnLoad) {
      btnLoad.addEventListener('click', (e) => {
        e.stopPropagation();
        const matUrl = t.url || `templates/${t.filename}`;
        loadTemplateToCanvas(matUrl);
        closeGalleryModal();
      });
    }

    const btnDel = card.querySelector('.btn-delete-mat');
    if (btnDel) {
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Excluir o material "${t.title}"?`)) return;
        const subjectSelect = document.getElementById('subjectSelect');
        const subjectId = subjectSelect ? subjectSelect.value : 'arq';
        try {
          const res = await fetch('/api/materials/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subjectId, materialId: t.id })
          });
          if (res.ok) {
            showToast('Material excluído!');
            loadMaterialsForSubject(subjectId);
          }
        } catch (err) {
          console.error('Erro ao excluir material:', err);
        }
      });
    }

    galleryGrid.appendChild(card);
  });
}

function openGalleryModal() {
  if (!galleryModal) return;
  const subjectSelect = document.getElementById('subjectSelect');
  const subjId = subjectSelect ? subjectSelect.value : 'arq';
  loadMaterialsForSubject(subjId);
  galleryModal.classList.add('open');
}

function closeGalleryModal() {
  if (galleryModal) galleryModal.classList.remove('open');
}

function filterGallery(category) {
  if (galleryFilterButtons) {
    galleryFilterButtons.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });
  }

  document.querySelectorAll('.gallery-card').forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

async function uploadMaterialFile(file) {
  if (!file) return;
  const subjectSelect = document.getElementById('subjectSelect');
  const subjectId = subjectSelect ? subjectSelect.value : 'arq';

  const defaultTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const title = prompt('Título do Material:', defaultTitle) || defaultTitle;

  showToast('Enviando material...');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await fetch('/api/materials/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId,
          title,
          image: reader.result,
          category: 'Meus Materiais'
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        showToast('Material adicionado com sucesso!');
        loadMaterialsForSubject(subjectId);
      } else {
        alert(data.detail || 'Erro ao enviar material.');
      }
    } catch (err) {
      console.error('Erro no upload de material:', err);
      showToast('Erro no envio');
    }
  };
  reader.readAsDataURL(file);
}

// Templates Loader from Server API (with automatic fallback)
async function loadTemplateOptions() {
  try {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const list = await res.json();
      if (list && list.length > 0) {
        populateDropdown(list);
      }
    }
  } catch (err) {
    console.log('Usando catálogo estático embutido.');
  }
}

// ALWAYS adds the diagram to the board WITHOUT removing existing items, centered on user's current view
function loadTemplateToCanvas(url) {
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    recordState(); // Save state for undo

    // Calculate center of the current screen view in virtual canvas coordinates
    const center = screenToCanvas(width / 2, height / 2);

    // Determine comfortable size based on current zoom so it fits nicely on screen
    const maxViewW = Math.max(300, (width * 0.75) / zoom);
    const maxViewH = Math.max(220, (height * 0.75) / zoom);
    const imgAspect = (img.width || 1) / (img.height || 1);

    let finalW = Math.min(img.width, maxViewW);
    let finalH = finalW / imgAspect;
    if (finalH > maxViewH) {
      finalH = maxViewH;
      finalW = finalH * imgAspect;
    }
    finalW = Math.round(finalW);
    finalH = Math.round(finalH);

    const posX = Math.round(center.x - finalW / 2);
    const posY = Math.round(center.y - finalH / 2);

    const el = {
      id: (typeof generateId === 'function' ? generateId() : 'img-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
      type: 'image',
      src: url,
      x: posX,
      y: posY,
      width: finalW,
      height: finalH,
      imgObj: img
    };

    invalidateElementBBox(el);
    elements.push(el);
    selectedElements = [el];
    selectedElement = el;

    render();
    scheduleAutoSave();
    broadcastBoardSync();
    showToast('Diagrama adicionado ao centro da tela!');
  };
  img.src = url;
}

window.loadTemplateByName = function(fname) {
  studySidebar.classList.add('closed');
  sidebarBackdrop.classList.remove('active');
  loadTemplateToCanvas(`templates/${fname}`);
};

function setActiveTool(tool) {
  currentTool = tool;
  selectedElements = [];
  selectedElement = null;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.tool-btn[data-tool="${currentTool}"]`);
  if (btn) btn.classList.add('active');

  if (currentTool === 'eraser') {
    wrapper.classList.add('eraser-mode');
    updateEraserCursorSize();
  } else {
    hideEraserCursor();
  }
  render();
}

// ==================== Mouse & Touch Event Listeners ====================
function setupEventListeners() {
  // Canvas pointer events (Suporte total a Mesa Digitalizadora / Stylus, Touch e Mouse)
  canvas.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerUp);

  // Previne menu de contexto ao usar botão da caneta ou toque longo
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  // Wrapper cursor tracking
  wrapper.addEventListener('mouseleave', () => {
    hideEraserCursor();
  });
  wrapper.addEventListener('mouseenter', (e) => {
    if (currentTool === 'eraser' && !spacePressed && !isPanning) {
      const rect = canvas.getBoundingClientRect();
      updateEraserCursorPos(e.clientX - rect.left, e.clientY - rect.top);
    }
  });

  // Zoom with Wheel (attached to container so events don't fire twice on bubble)
  wrapper.addEventListener('wheel', handleWheel, { passive: false });

  // Double-click on canvas to edit Sticky Notes, Conditions, or Text
  canvas.addEventListener('dblclick', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const pt = screenToCanvas(mouseX, mouseY);

    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (hitTestElement(el, pt.x, pt.y)) {
        if (el.type === 'sticky') {
          promptEditSticky(el, mouseX, mouseY);
          return;
        }
        if (el.type === 'diamond') {
          const currentTxt = el.text || '';
          const newTxt = prompt('Texto da condição / decisão (ex: x >= 0 ?):', currentTxt);
          if (newTxt !== null) {
            recordState();
            el.text = newTxt;
            render();
            scheduleAutoSave();
            broadcastBoardSync();
          }
          return;
        }
        if (el.type === 'text') {
          const currentTxt = el.text || '';
          const newTxt = prompt('Editar texto:', currentTxt);
          if (newTxt !== null) {
            recordState();
            el.text = newTxt;
            render();
            scheduleAutoSave();
            broadcastBoardSync();
          }
          return;
        }
      }
    }
  });

  // Tool buttons
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveTool(btn.dataset.tool);
    });
  });

  // Color wheel & full gradient selection
  setupColorWheel();

  // Stroke size slider & quick preset chips
  if (strokeSizeSlider) {
    strokeSizeSlider.addEventListener('input', (e) => {
      setStrokeSize(e.target.value, false);
    });
    strokeSizeSlider.addEventListener('change', (e) => {
      setStrokeSize(e.target.value, true);
    });
  }

  document.querySelectorAll('.size-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const sz = parseFloat(chip.dataset.size);
      if (!isNaN(sz)) {
        setStrokeSize(sz, true);
      }
    });
  });

  // Clear button
  if (btnClearCanvas) {
    btnClearCanvas.addEventListener('click', () => {
      if (confirm('Tem certeza que deseja limpar todo o quadro?')) {
        recordState();
        elements = [];
        selectedElements = [];
        selectedElement = null;
        render();
        scheduleAutoSave();
        broadcastBoardClear();
      }
    });
  }

  // File upload input
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) addImageFromFile(file);
      fileInput.value = '';
    });
  }

  // Undo & Redo buttons
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  if (btnUndo) btnUndo.addEventListener('click', undo);
  if (btnRedo) btnRedo.addEventListener('click', redo);

  // Save for AI buttons
  if (btnSaveAI) {
    btnSaveAI.addEventListener('click', (e) => {
      e.stopPropagation();
      if (exportDropdown) exportDropdown.classList.remove('open');
      saveToAI(true, false);
    });
  }
  if (btnSaveAIFocus) {
    btnSaveAIFocus.addEventListener('click', (e) => {
      e.stopPropagation();
      if (exportDropdown) exportDropdown.classList.remove('open');
      saveToAI(true, true);
    });
  }

  // Export buttons
  if (btnExportPNG) btnExportPNG.addEventListener('click', (e) => {
    e.stopPropagation();
    if (exportDropdown) exportDropdown.classList.remove('open');
    exportLocalPNG();
  });
  if (btnExportFullPNG) btnExportFullPNG.addEventListener('click', (e) => {
    e.stopPropagation();
    if (exportDropdown) exportDropdown.classList.remove('open');
    exportFullPNG();
  });
  if (btnExportJSON) btnExportJSON.addEventListener('click', () => {
    e.stopPropagation();
    if (exportDropdown) exportDropdown.classList.remove('open');
    exportBoardJSON();
  });
  if (importJsonInput) importJsonInput.addEventListener('change', (e) => {
    if (exportDropdown) exportDropdown.classList.remove('open');
    if (e.target.files && e.target.files[0]) importBoardJSON(e.target.files[0]);
    importJsonInput.value = '';
  });
  if (btnExportMenu) btnExportMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const gridDropdown = document.getElementById('gridDropdown');
    if (gridDropdown) gridDropdown.classList.remove('open');
    if (exportDropdown) exportDropdown.classList.toggle('open');
  });

  // Shortcuts modal
  if (btnShortcuts) btnShortcuts.addEventListener('click', openShortcutsModal);
  if (btnCloseShortcuts) btnCloseShortcuts.addEventListener('click', closeShortcutsModal);
  if (shortcutsModal) shortcutsModal.addEventListener('click', (e) => {
    if (e.target === shortcutsModal) closeShortcutsModal();
  });

  // Instant Template Dropdown Selection (if present in DOM)
  if (templateSelect) {
    templateSelect.addEventListener('change', () => {
      const val = templateSelect.value;
      if (val) {
        loadTemplateToCanvas(val);
        templateSelect.value = '';
      }
    });
  }

  // Gallery Modal Buttons
  if (btnOpenGallery) btnOpenGallery.addEventListener('click', openGalleryModal);
  if (btnCloseGallery) btnCloseGallery.addEventListener('click', closeGalleryModal);

  if (galleryModal) {
    galleryModal.addEventListener('click', (e) => {
      if (e.target === galleryModal) closeGalleryModal();
    });
  }

  // Filter Buttons in Modal
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterGallery(btn.dataset.category);
    });
  });

  // Stroke Mini Popover Handling
  const btnStrokeMenu = document.getElementById('btnStrokeMenu');
  const strokeMiniPopover = document.getElementById('strokeMiniPopover');

  function updateStrokePopoverPosition() {
    if (!btnStrokeMenu || !strokeMiniPopover) return;
    const btnRect = btnStrokeMenu.getBoundingClientRect();
    const workspace = document.querySelector('.workspace') || document.body;
    const wsRect = workspace.getBoundingClientRect();
    const topPos = Math.max(8, btnRect.top - wsRect.top - 6);
    const leftPos = btnRect.right - wsRect.left + 8;
    strokeMiniPopover.style.top = `${topPos}px`;
    strokeMiniPopover.style.left = `${leftPos}px`;
  }

  if (btnStrokeMenu) {
    btnStrokeMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!strokeMiniPopover) return;
      const isOpen = strokeMiniPopover.style.display === 'flex';
      if (isOpen) {
        strokeMiniPopover.style.display = 'none';
        btnStrokeMenu.classList.remove('open');
      } else {
        updateStrokePopoverPosition();
        strokeMiniPopover.style.display = 'flex';
        btnStrokeMenu.classList.add('open');
      }
    });

    // Quick size adjustments using mouse wheel over stroke button
    btnStrokeMenu.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = currentSize < 3 ? 0.5 : (currentSize < 10 ? 1 : 2);
      const delta = e.deltaY < 0 ? step : -step;
      setStrokeSize(Math.max(0.5, Math.min(36, currentSize + delta)));
    }, { passive: false });
  }

  // Prevent clicks inside the popover from bubbling to document and closing it
  if (strokeMiniPopover) {
    strokeMiniPopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Close stroke popover on click outside
  document.addEventListener('click', (e) => {
    if (strokeMiniPopover && strokeMiniPopover.style.display === 'flex') {
      if (!strokeMiniPopover.contains(e.target) && !btnStrokeMenu?.contains(e.target)) {
        strokeMiniPopover.style.display = 'none';
        if (btnStrokeMenu) btnStrokeMenu.classList.remove('open');
      }
    }
  });

  // Toggle Palette Expand / Collapse
  function updatePaletteToggleState(isExpanded) {
    if (btnTogglePalette) {
      btnTogglePalette.innerHTML = isExpanded ? 
        '<svg class="ui-icon chevron-icon" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>' : 
        '<svg class="ui-icon chevron-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
      btnTogglePalette.title = isExpanded ? 'Recolher menu de ferramentas' : 'Mais ferramentas e opções (Expandir)';
    }
  }

  function togglePalette() {
    if (!toolPalette) return;
    const isExpanded = toolPalette.classList.toggle('expanded');
    if (strokeMiniPopover) {
      strokeMiniPopover.style.display = 'none';
      if (btnStrokeMenu) btnStrokeMenu.classList.remove('open');
    }
    updatePaletteToggleState(isExpanded);
    setTimeout(resizeCanvas, 230);
  }

  if (btnTogglePalette) {
    btnTogglePalette.addEventListener('click', togglePalette);
  }

  const btnCollapsePalette = document.getElementById('btnCollapsePalette');
  if (btnCollapsePalette) {
    btnCollapsePalette.addEventListener('click', togglePalette);
  }

  // Zoom HUD
  if (btnZoomIn) btnZoomIn.addEventListener('click', () => applyZoom(1.2));
  if (btnZoomOut) btnZoomOut.addEventListener('click', () => applyZoom(1 / 1.2));
  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', () => {
      zoom = 1.0;
      panX = 0;
      panY = 0;
      render();
    });
  }
  if (btnZoomFit) btnZoomFit.addEventListener('click', fitToScreen);

  // Sidebar Controls
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      const isClosed = studySidebar.classList.contains('closed');
      if (isClosed) {
        studySidebar.classList.remove('closed');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
      } else {
        studySidebar.classList.add('closed');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
      }
    });
  }

  if (btnCloseSidebar) {
    btnCloseSidebar.addEventListener('click', () => {
      if (studySidebar) studySidebar.classList.add('closed');
      if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', () => {
      if (studySidebar) studySidebar.classList.add('closed');
      sidebarBackdrop.classList.remove('active');
    });
  }

  // Sidebar Tabs
  document.querySelectorAll('.tab-btn').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // Clipboard Paste (Ctrl+V) anywhere on the window!
  window.addEventListener('paste', handleClipboardPaste);

  // Drag and Drop files onto canvas
  wrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  wrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        const pt = screenToCanvas(e.clientX - wrapper.getBoundingClientRect().left, e.clientY - wrapper.getBoundingClientRect().top);
        addImageFromFile(file, pt.x, pt.y);
      }
    }
  });

  // Refresh AI Feedback
  const btnRefreshFeedback = document.getElementById('btnRefreshFeedback');
  if (btnRefreshFeedback) {
    btnRefreshFeedback.addEventListener('click', fetchAIFeedback);
  }
}

// ==================== Stroke Smoothing & Geometry Algorithms ====================

/**
 * Online Real-Time Stream Stabilizer
 * Uses adaptive Exponential Moving Average (EMA) to eliminate high-frequency mouse jitter
 * while remaining snappy and responsive on fast sweeps.
 */
const strokeSmoother = {
  active: false,
  lastSmoothed: null,
  reset(initialPt) {
    this.active = true;
    this.lastSmoothed = initialPt ? { x: initialPt.x, y: initialPt.y } : null;
  },
  smooth(rawPt) {
    if (!this.active || !this.lastSmoothed) {
      this.reset(rawPt);
      return { x: rawPt.x, y: rawPt.y };
    }
    const dx = rawPt.x - this.lastSmoothed.x;
    const dy = rawPt.y - this.lastSmoothed.y;
    const dist = Math.hypot(dx, dy);

    // High fidelity stroke smoothing:
    // Only dampens microscopic jitter (< 2px) while following the cursor immediately
    // with 0 perceived lag (alpha reaches 1.0 for strokes >= 4px).
    const alpha = Math.min(1.0, Math.max(0.78, dist / 4));
    const sx = this.lastSmoothed.x + dx * alpha;
    const sy = this.lastSmoothed.y + dy * alpha;
    this.lastSmoothed = { x: sx, y: sy };
    return { x: sx, y: sy };
  },
  finish() {
    this.active = false;
    this.lastSmoothed = null;
  }
};

/**
 * Ramer-Douglas-Peucker Polyline Simplification
 * Keeps the file size compact and removes redundant micro-points without losing shape fidelity.
 */
function simplifyPolyline(points, tolerance = 0.6) {
  if (!points || points.length <= 2) return points;
  function getSqSegDist(p, p1, p2) {
    let x = p1.x, y = p1.y, dx = p2.x - x, dy = p2.y - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = p2.x; y = p2.y; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p.x - x; dy = p.y - y;
    return dx * dx + dy * dy;
  }
  function simplifyDPStep(pts, first, last, sqTol, simplified) {
    let maxSqDist = sqTol, index = -1;
    for (let i = first + 1; i < last; i++) {
      const sqDist = getSqSegDist(pts[i], pts[first], pts[last]);
      if (sqDist > maxSqDist) { index = i; maxSqDist = sqDist; }
    }
    if (index !== -1) {
      if (index - first > 1) simplifyDPStep(pts, first, index, sqTol, simplified);
      simplified.push(pts[index]);
      if (last - index > 1) simplifyDPStep(pts, index, last, sqTol, simplified);
    }
  }
  const sqTol = tolerance * tolerance;
  const simplified = [points[0]];
  simplifyDPStep(points, 0, points.length - 1, sqTol, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}


// Active pointers tracking for touch pinch-to-zoom & two-finger pan
const activePointers = new Map();
let initialPinchDist = null;
let initialPinchZoom = 1.0;
let initialPinchCenter = null;
let initialPinchPan = null;

// Pointer event handlers
function handlePointerDown(e) {
  if (e.pointerId !== undefined) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  // Multi-touch pinch/pan detection (2 fingers on screen)
  if (activePointers.size >= 2) {
    if (isDrawing) {
      isDrawing = false;
      currentPath = null;
      render();
    }
    isPanning = false;
    isAreaSelecting = false;
    isDraggingSelection = false;

    const pts = Array.from(activePointers.values());
    initialPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    initialPinchZoom = zoom;
    initialPinchCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    initialPinchPan = { x: panX, y: panY };
    return;
  }

  // Captura o ponteiro e previne comportamentos de arrasto/gestos nativos do Windows Ink / touch
  if (e.pointerId !== undefined && canvas.setPointerCapture) {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
  }
  if (e.cancelable) {
    e.preventDefault();
  }

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Spacebar pan or middle click or pan tool
  if (spacePressed || e.button === 1 || currentTool === 'pan') {
    isPanning = true;
    startPanX = e.clientX - panX;
    startPanY = e.clientY - panY;
    wrapper.classList.add('panning');
    hideEraserCursor();
    return;
  }

  const pt = screenToCanvas(mouseX, mouseY);
  startX = pt.x;
  startY = pt.y;

  if (currentTool === 'select') {
    // 1. Check if clicking on an image resize handle (only for single selected image)
    if (selectedElements.length === 1 && selectedElements[0].type === 'image') {
      const handle = hitTestResizeHandle(selectedElements[0], pt.x, pt.y);
      if (handle) {
        startImageResize(selectedElements[0], handle, pt);
        render();
        return;
      }
    }

    // 2. Check if clicking inside already selected elements or group bounding box to drag
    let clickedInsideSelection = false;
    if (selectedElements.length > 0) {
      for (const el of selectedElements) {
        if (hitTestElement(el, pt.x, pt.y)) {
          clickedInsideSelection = true;
          break;
        }
      }
      if (!clickedInsideSelection && selectedElements.length > 1) {
        const groupBbox = getGroupBoundingBox(selectedElements);
        if (groupBbox && pointInBox(pt.x, pt.y, groupBbox)) {
          clickedInsideSelection = true;
        }
      }
    }

    if (clickedInsideSelection) {
      if (e.altKey) {
        // Alt + Drag: Instant Duplication!
        recordState();
        const clones = selectedElements.map(el => {
          const copy = JSON.parse(JSON.stringify(el));
          copy.id = (typeof generateId === 'function' ? generateId() : 'el-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
          delete copy._bbox;
          invalidateElementBBox(copy);
          return copy;
        });
        clones.forEach(c => elements.push(c));
        rehydrateImages();
        selectedElements = clones;
        selectedElement = clones.length === 1 ? clones[0] : null;
        showToast('Elemento duplicado com Alt+Arrastar');
      }
      startSelectionDrag(pt);
      render();
      return;
    }

    // 3. Hit test all elements from top to bottom (highest z-index first)
    let hitEl = null;
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (hitTestElement(el, pt.x, pt.y)) {
        hitEl = el;
        break;
      }
    }

    if (hitEl) {
      if (e.shiftKey) {
        if (selectedElements.includes(hitEl)) {
          selectedElements = selectedElements.filter(el => el !== hitEl);
        } else {
          selectedElements.push(hitEl);
        }
      } else {
        selectedElements = [hitEl];
      }
      selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

      if (e.altKey) {
        // Alt + Drag: Instant Duplication of clicked element!
        recordState();
        const copy = JSON.parse(JSON.stringify(hitEl));
        copy.id = (typeof generateId === 'function' ? generateId() : 'el-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
        delete copy._bbox;
        invalidateElementBBox(copy);
        elements.push(copy);
        rehydrateImages();
        selectedElements = [copy];
        selectedElement = copy;
        showToast('Elemento duplicado com Alt+Arrastar');
      }

      startSelectionDrag(pt);
      render();
      return;
    }

    // 4. Clicked empty canvas: start Area Selection marquee
    if (!e.shiftKey) {
      selectedElements = [];
      selectedElement = null;
    }
    isAreaSelecting = true;
    areaSelectStartPt = { x: pt.x, y: pt.y };
    areaSelectCurrentPt = { x: pt.x, y: pt.y };
    render();
    return;
  }

  if (currentTool === 'laser') {
    isDrawing = true;
    addLaserPoint(pt, true);
    return;
  }

  if (currentTool === 'text') {
    promptAddText(mouseX, mouseY, pt.x, pt.y);
    return;
  }

  if (currentTool === 'sticky') {
    recordState();
    const newSticky = {
      id: (typeof generateId === 'function' ? generateId() : 'sticky-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
      type: 'sticky',
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      width: 220,
      height: 180,
      color: currentStickyColor.bg,
      textColor: currentStickyColor.text,
      text: ''
    };
    elements.push(newSticky);
    selectedElement = newSticky;
    selectedElements = [newSticky];
    render();
    scheduleAutoSave();
    broadcastElementAdd(newSticky);
    promptEditSticky(newSticky, mouseX, mouseY);
    return;
  }

  if (currentTool === 'eraser') {
    eraseStartState = serializeBoardState();
    eraseModified = false;
    lastErasePoint = { x: pt.x, y: pt.y };
    isDrawing = true;
    const radius = getEraserRadius();
    if (eraseCircleStep(pt.x, pt.y, radius)) {
      eraseModified = true;
      render();
    }
    return;
  }

  // Draw tools: pen, highlighter, line, arrow, rect, mux, alu
  isDrawing = true;
  clearSmartShapeTimer();
  drawStartState = serializeBoardState();

  if (currentTool === 'pen' || currentTool === 'highlighter') {
    strokeSmoother.reset(pt);
    currentPath = {
      type: 'path',
      tool: currentTool,
      color: currentColor,
      size: currentSize,
      points: [{ x: pt.x, y: pt.y }]
    };
  } else {
    currentPath = {
      type: currentTool,
      color: currentColor,
      size: currentSize,
      x1: pt.x,
      y1: pt.y,
      x2: pt.x,
      y2: pt.y
    };
  }

  render();
}

function handlePointerMove(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  // Multi-touch pinch-to-zoom and two-finger pan gesture
  if (activePointers.size >= 2 && initialPinchDist && initialPinchCenter && initialPinchPan) {
    if (e.cancelable) e.preventDefault();
    const pts = Array.from(activePointers.values());
    const currentDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const currentCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

    if (initialPinchDist > 5 && currentDist > 5) {
      const scale = currentDist / initialPinchDist;
      const newZoom = Math.min(Math.max(0.15, initialPinchZoom * scale), 5.0);

      const rect = canvas.getBoundingClientRect();
      const originX = initialPinchCenter.x - rect.left;
      const originY = initialPinchCenter.y - rect.top;

      panX = originX - (originX - initialPinchPan.x) * (newZoom / initialPinchZoom) + (currentCenter.x - initialPinchCenter.x);
      panY = originY - (originY - initialPinchPan.y) * (newZoom / initialPinchZoom) + (currentCenter.y - initialPinchCenter.y);
      zoom = newZoom;

      requestRenderAll();
      updateEraserCursorSize();
    }
    return;
  }

  if (isDrawing || isPanning || isDraggingElement || isResizingElement || isAreaSelecting) {
    if (e.cancelable) e.preventDefault();
  }

  if (isPanning) {
    panX = e.clientX - startPanX;
    panY = e.clientY - startPanY;
    hideEraserCursor();
    requestRenderAll();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const isInside = mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height;

  if (currentTool === 'eraser' && !spacePressed) {
    if (isInside) {
      updateEraserCursorPos(mouseX, mouseY);
    } else {
      hideEraserCursor();
    }
  } else {
    hideEraserCursor();
  }

  const pt = screenToCanvas(mouseX, mouseY);

  if (isInside || isDrawing || isDraggingElement || isResizingElement || isAreaSelecting) {
    broadcastCursor(pt.x, pt.y);
  }

  // Active Area Selection Marquee
  if (isAreaSelecting) {
    areaSelectCurrentPt = { x: pt.x, y: pt.y };
    requestRenderOverlay();
    return;
  }

  // Active Image Resizing
  if (isResizingElement && selectedElement) {
    updateImageResize(pt, e.shiftKey);
    return;
  }

  // Active Element(s) Dragging (Moving)
  if (isDraggingElement && selectedElements.length > 0) {
    updateSelectionDrag(pt);
    return;
  }

  // Hover cursor management for selection tool
  if (currentTool === 'select' && !isDrawing && !isDraggingElement && !isResizingElement && !isAreaSelecting && !spacePressed) {
    if (selectedElements.length === 1 && selectedElements[0].type === 'image') {
      const handle = hitTestResizeHandle(selectedElements[0], pt.x, pt.y);
      if (handle) {
        canvas.style.cursor = handle.cursor;
      } else if (hitTestElement(selectedElements[0], pt.x, pt.y)) {
        canvas.style.cursor = 'move';
      } else {
        const overAny = elements.some(el => hitTestElement(el, pt.x, pt.y));
        canvas.style.cursor = overAny ? 'pointer' : 'crosshair';
      }
    } else if (selectedElements.length > 0) {
      let overSelection = false;
      for (const el of selectedElements) {
        if (hitTestElement(el, pt.x, pt.y)) {
          overSelection = true;
          break;
        }
      }
      if (!overSelection && selectedElements.length > 1) {
        const groupBbox = getGroupBoundingBox(selectedElements);
        if (groupBbox && pointInBox(pt.x, pt.y, groupBbox)) {
          overSelection = true;
        }
      }
      if (overSelection) {
        canvas.style.cursor = 'move';
      } else {
        const overAny = elements.some(el => hitTestElement(el, pt.x, pt.y));
        canvas.style.cursor = overAny ? 'pointer' : 'crosshair';
      }
    } else {
      const overAny = elements.some(el => hitTestElement(el, pt.x, pt.y));
      canvas.style.cursor = overAny ? 'pointer' : 'crosshair';
    }
  } else if (currentTool !== 'eraser' && !spacePressed) {
    canvas.style.cursor = '';
  }

  if (currentTool === 'laser') {
    if (isDrawing) {
      const subEvents = (e.getCoalescedEvents && typeof e.getCoalescedEvents === 'function')
        ? e.getCoalescedEvents()
        : [e];
      for (const ev of subEvents) {
        const subMouseX = ev.clientX - rect.left;
        const subMouseY = ev.clientY - rect.top;
        const rawPt = screenToCanvas(subMouseX, subMouseY);
        addLaserPoint(rawPt, true);
      }
    }
    return;
  }

  if (!isDrawing) return;

  if (currentTool === 'eraser') {
    if (lastErasePoint) {
      eraseAlongSegment(lastErasePoint.x, lastErasePoint.y, pt.x, pt.y);
      lastErasePoint = { x: pt.x, y: pt.y };
    } else {
      lastErasePoint = { x: pt.x, y: pt.y };
      const radius = getEraserRadius();
      if (eraseCircleStep(pt.x, pt.y, radius)) {
        eraseModified = true;
        requestRenderAll();
      }
    }
    return;
  }

  if (currentPath) {
    if (currentPath.isSmartShape) {
      requestRenderOverlay();
      return;
    }
    if (currentPath.type === 'path') {
      const subEvents = (e.getCoalescedEvents && typeof e.getCoalescedEvents === 'function')
        ? e.getCoalescedEvents()
        : [e];
      const minDistance = Math.max(1.0, 1.6 / zoom);
      for (const ev of subEvents) {
        const subMouseX = ev.clientX - rect.left;
        const subMouseY = ev.clientY - rect.top;
        const rawPt = screenToCanvas(subMouseX, subMouseY);
        const smoothedPt = strokeSmoother.smooth(rawPt);
        const lastPt = currentPath.points[currentPath.points.length - 1];
        if (!lastPt || Math.hypot(smoothedPt.x - lastPt.x, smoothedPt.y - lastPt.y) >= minDistance) {
          currentPath.points.push({
            x: Math.round(smoothedPt.x * 10) / 10,
            y: Math.round(smoothedPt.y * 10) / 10
          });
        }
      }
      broadcastLiveStroke(currentPath);
      checkSmartShapeHold(pt);
    } else {
      currentPath.x2 = pt.x;
      currentPath.y2 = pt.y;
    }
    requestRenderOverlay();
  }
}

function handlePointerUp(e) {
  clearSmartShapeTimer();

  if (currentTool === 'laser') {
    isDrawing = false;
    return;
  }

  if (e && e.pointerId !== undefined) {
    activePointers.delete(e.pointerId);
    if (canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  }

  if (activePointers.size < 2) {
    initialPinchDist = null;
    initialPinchCenter = null;
    initialPinchPan = null;
  }

  const rect = canvas.getBoundingClientRect();
  const mouseX = (e ? e.clientX : 0) - rect.left;
  const mouseY = (e ? e.clientY : 0) - rect.top;
  const pt = screenToCanvas(mouseX, mouseY);

  if (isPanning) {
    isPanning = false;
    wrapper.classList.remove('panning');
    if (currentTool === 'eraser') {
      wrapper.classList.add('eraser-mode');
    }
  }

  if (isAreaSelecting) {
    isAreaSelecting = false;
    if (areaSelectStartPt && areaSelectCurrentPt) {
      const x = Math.min(areaSelectStartPt.x, areaSelectCurrentPt.x);
      const y = Math.min(areaSelectStartPt.y, areaSelectCurrentPt.y);
      const w = Math.abs(areaSelectCurrentPt.x - areaSelectStartPt.x);
      const h = Math.abs(areaSelectCurrentPt.y - areaSelectStartPt.y);

      if (w > 3 || h > 3) {
        const areaBox = { x, y, width: w, height: h };
        const matched = elements.filter(el => elementIntersectsArea(el, areaBox));
        if (e && e.shiftKey) {
          const currentSet = new Set(selectedElements);
          for (const m of matched) {
            if (!currentSet.has(m)) {
              selectedElements.push(m);
            }
          }
        } else {
          selectedElements = matched;
        }
        selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
        if (selectedElements.length > 1) {
          showToast(`${selectedElements.length} itens selecionados`);
        }
      }
    }
    areaSelectStartPt = null;
    areaSelectCurrentPt = null;
    render();
  }

  if (isResizingElement) {
    isResizingElement = false;
    resizeHandle = null;
    if (selectedElement && resizeOriginalBox && resizeStartState) {
      if (Math.abs(selectedElement.width - resizeOriginalBox.width) > 1 ||
          Math.abs(selectedElement.height - resizeOriginalBox.height) > 1 ||
          Math.abs(selectedElement.x - resizeOriginalBox.x) > 1 ||
          Math.abs(selectedElement.y - resizeOriginalBox.y) > 1) {
        pushUndoState(resizeStartState);
        scheduleAutoSave();
        commitLocalAction();
      }
    }
    resizeStartState = null;
    resizeOriginalBox = null;
  }

  if (isDraggingElement) {
    isDraggingElement = false;
    if (dragStartPt && dragStartState && selectedElements.length > 0) {
      const dist = Math.hypot(pt.x - dragStartPt.x, pt.y - dragStartPt.y);
      if (dist > 1.5) {
        pushUndoState(dragStartState);
        scheduleAutoSave();
        commitLocalAction();
      }
    }
    dragStartState = null;
    dragStartPt = null;
    dragOriginalData = null;
    dragOriginalDataList = [];
  }

  if (currentTool === 'eraser') {
    if (isDrawing) {
      isDrawing = false;
      lastErasePoint = null;
      if (eraseModified && eraseStartState) {
        pushUndoState(eraseStartState);
        eraseStartState = null;
        scheduleAutoSave();
        broadcastBoardSync();
      }
    }
    return;
  }

  if (isDrawing) {
    isDrawing = false;
    if (currentPath) {
      let isValid = false;
      if (currentPath.type === 'path') {
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e ? e.clientX : 0) - rect.left;
        const mouseY = (e ? e.clientY : 0) - rect.top;
        const finalRawPt = screenToCanvas(mouseX, mouseY);
        strokeSmoother.finish();

        // Ensure final point is accurately represented
        if (currentPath.points.length > 1) {
          const lastPt = currentPath.points[currentPath.points.length - 1];
          if (Math.hypot(finalRawPt.x - lastPt.x, finalRawPt.y - lastPt.y) >= 1.5) {
            currentPath.points.push({
              x: Math.round(finalRawPt.x * 10) / 10,
              y: Math.round(finalRawPt.y * 10) / 10
            });
          }
        }

        // Gentle simplification to remove micro-collinear duplicates without altering curves or corners
        currentPath.points = simplifyPolyline(currentPath.points, 0.25);
        currentPath.points.forEach(p => {
          p.x = Math.round(p.x * 10) / 10;
          p.y = Math.round(p.y * 10) / 10;
        });

        isValid = currentPath.points.length >= 1;
      } else {
        const dist = Math.hypot(currentPath.x2 - currentPath.x1, currentPath.y2 - currentPath.y1);
        isValid = dist >= 3;
      }

      if (isValid) {
        if (drawStartState) {
          pushUndoState(drawStartState);
          drawStartState = null;
        }
        const createdEl = currentPath;
        if (!createdEl.id) {
          createdEl.id = (typeof generateId === 'function' ? generateId() : 'el-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
        }
        delete createdEl.isSmartShape;
        delete createdEl.shapeLabel;
        elements.push(createdEl);
        currentPath = null;
        render();
        scheduleAutoSave();
        broadcastElementAdd(createdEl);
      } else {
        // Discard zero-length element without affecting undo/redo stacks
        currentPath = null;
        drawStartState = null;
        render();
      }
    }
  }
}

// Wheel Zoom (Optimized for Touchpad & Mouse Wheel)
function handleWheel(e) {
  e.preventDefault();
  if (e.stopPropagation) e.stopPropagation();

  const rect = canvas.getBoundingClientRect();
  const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const mouseY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

  // Normalize delta according to deltaMode (0: pixels, 1: lines, 2: pages)
  let delta = e.deltaY;
  if (e.deltaMode === 1) {
    delta *= 24;
  } else if (e.deltaMode === 2) {
    delta *= 200;
  }

  // Clamp per-event delta to avoid jumps on fast touchpad flick
  const clampedDelta = Math.max(-100, Math.min(100, delta));

  // Touchpad pinch gesture (ctrlKey) and trackpad two-finger scroll use smooth, gentle coefficient
  const sensitivity = e.ctrlKey ? 0.0022 : 0.0012;
  const zoomFactor = Math.exp(-clampedDelta * sensitivity);

  // Safety clamp on factor per frame
  const clampedFactor = Math.min(1.15, Math.max(0.87, zoomFactor));
  const newZoom = Math.min(Math.max(0.15, zoom * clampedFactor), 5.0);

  if (Math.abs(newZoom - zoom) > 0.0001) {
    // Zoom toward cursor position
    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    zoom = newZoom;

    requestRenderAll();
    updateEraserCursorSize();
  }
}

function applyZoom(factor) {
  const centerX = width / 2;
  const centerY = height / 2;
  const newZoom = Math.min(Math.max(0.15, zoom * factor), 5.0);

  panX = centerX - (centerX - panX) * (newZoom / zoom);
  panY = centerY - (centerY - panY) * (newZoom / zoom);
  zoom = newZoom;

  requestRenderAll();
  updateEraserCursorSize();
}

function updateZoomIndicator() {
  zoomLevelEl.textContent = `${Math.round(zoom * 100)}%`;
}

// ==================== Precise Circle Eraser System ====================
let lastErasePoint = null;
let eraseStartState = null;
let eraseModified = false;
const eraserCursor = document.getElementById('eraserCursor');

function getEraserRadius() {
  return Math.round(Math.max(10, Math.min(80, currentSize * 2.2 + 8)));
}

function updateEraserCursorPos(screenX, screenY) {
  if (!eraserCursor) return;
  if (currentTool !== 'eraser' || spacePressed || isPanning) {
    eraserCursor.style.display = 'none';
    wrapper.classList.remove('eraser-mode');
    return;
  }
  const radius = getEraserRadius();
  const screenRadius = radius * zoom;
  const d = Math.round(screenRadius * 2);

  eraserCursor.style.width = `${d}px`;
  eraserCursor.style.height = `${d}px`;
  eraserCursor.style.left = `${screenX}px`;
  eraserCursor.style.top = `${screenY}px`;
  eraserCursor.style.display = 'block';
  wrapper.classList.add('eraser-mode');
}

function updateEraserCursorSize() {
  if (!eraserCursor) return;
  if (currentTool !== 'eraser' || spacePressed || isPanning) {
    eraserCursor.style.display = 'none';
    wrapper.classList.remove('eraser-mode');
    return;
  }
  const radius = getEraserRadius();
  const screenRadius = radius * zoom;
  const d = Math.round(screenRadius * 2);
  eraserCursor.style.width = `${d}px`;
  eraserCursor.style.height = `${d}px`;
}

function hideEraserCursor() {
  if (!eraserCursor) return;
  eraserCursor.style.display = 'none';
  wrapper.classList.remove('eraser-mode');
}

// Clip polyline path against circle (erases only what is strictly inside the circle)
function clipPathByCircle(pathEl, cx, cy, radius) {
  if (!pathEl.points || pathEl.points.length === 0) return [];

  if (pathEl.points.length === 1) {
    const d = Math.hypot(pathEl.points[0].x - cx, pathEl.points[0].y - cy);
    return d < radius ? [] : [pathEl];
  }

  // Fast bounding box rejection check (O(1) via cached bbox)
  const bbox = getCachedElementBBox(pathEl);
  if (bbox) {
    if (cx + radius < bbox.x || cx - radius > bbox.x + bbox.width ||
        cy + radius < bbox.y || cy - radius > bbox.y + bbox.height) {
      return [pathEl];
    }
  }

  const resultPaths = [];
  let currentSub = [];

  function pushSub(pts) {
    if (!pts || pts.length === 0) return;
    const clean = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const prev = clean[clean.length - 1];
      const curr = pts[k];
      if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 0.05) {
        clean.push(curr);
      }
    }
    if (clean.length >= 2) {
      resultPaths.push(clean);
    } else if (clean.length === 1) {
      resultPaths.push([clean[0], { x: clean[0].x + 0.1, y: clean[0].y + 0.1 }]);
    }
  }

  const p0 = pathEl.points[0];
  if (Math.hypot(p0.x - cx, p0.y - cy) >= radius) {
    currentSub.push(p0);
  }

  for (let i = 0; i < pathEl.points.length - 1; i++) {
    const A = pathEl.points[i];
    const B = pathEl.points[i + 1];

    const Dx = B.x - A.x;
    const Dy = B.y - A.y;
    const a = Dx * Dx + Dy * Dy;

    if (a < 1e-9) continue;

    const Fx = A.x - cx;
    const Fy = A.y - cy;
    const b = 2 * (Dx * Fx + Dy * Fy);
    const c = Fx * Fx + Fy * Fy - radius * radius;
    const delta = b * b - 4 * a * c;

    if (delta <= 0) {
      if (currentSub.length === 0) currentSub.push(A);
      currentSub.push(B);
      continue;
    }

    const sqrtDelta = Math.sqrt(delta);
    const t1 = (-b - sqrtDelta) / (2 * a);
    const t2 = (-b + sqrtDelta) / (2 * a);

    const tInStart = Math.max(0, t1);
    const tInEnd = Math.min(1, t2);

    if (tInStart >= tInEnd) {
      if (currentSub.length === 0) currentSub.push(A);
      currentSub.push(B);
      continue;
    }

    // Entering or cutting circle
    if (t1 > 1e-6) {
      if (currentSub.length === 0) currentSub.push(A);
      const I1 = { x: A.x + t1 * Dx, y: A.y + t1 * Dy };
      currentSub.push(I1);
      pushSub(currentSub);
      currentSub = [];
    } else {
      if (currentSub.length > 0) {
        pushSub(currentSub);
        currentSub = [];
      }
    }

    // Exiting circle
    if (t2 < 1 - 1e-6) {
      const I2 = { x: A.x + t2 * Dx, y: A.y + t2 * Dy };
      currentSub = [I2, B];
    } else {
      currentSub = [];
    }
  }

  if (currentSub.length > 0) {
    pushSub(currentSub);
  }

  return resultPaths.map(pts => ({ ...pathEl, points: pts }));
}

// Clip straight line or arrow against circle
function clipLineOrArrow(el, cx, cy, radius) {
  const A = { x: el.x1, y: el.y1 };
  const B = { x: el.x2, y: el.y2 };
  const Dx = B.x - A.x;
  const Dy = B.y - A.y;
  const a = Dx * Dx + Dy * Dy;

  if (a < 1e-9) {
    const d = Math.hypot(A.x - cx, A.y - cy);
    return d < radius ? [] : [el];
  }

  const Fx = A.x - cx;
  const Fy = A.y - cy;
  const b = 2 * (Dx * Fx + Dy * Fy);
  const c = Fx * Fx + Fy * Fy - radius * radius;
  const delta = b * b - 4 * a * c;

  if (delta <= 0) return [el];

  const sqrtDelta = Math.sqrt(delta);
  const t1 = (-b - sqrtDelta) / (2 * a);
  const t2 = (-b + sqrtDelta) / (2 * a);

  const tInStart = Math.max(0, t1);
  const tInEnd = Math.min(1, t2);

  if (tInStart >= tInEnd) return [el];

  const hasStart = t1 > 1e-6;
  const hasEnd = t2 < 1 - 1e-6;
  const I1 = { x: A.x + t1 * Dx, y: A.y + t1 * Dy };
  const I2 = { x: A.x + t2 * Dx, y: A.y + t2 * Dy };

  if (hasStart && hasEnd) {
    // Cut in middle: split into two pieces
    if (el.type === 'arrow') {
      return [
        { type: 'line', color: el.color, size: el.size, x1: el.x1, y1: el.y1, x2: I1.x, y2: I1.y },
        { ...el, x1: I2.x, y1: I2.y, x2: el.x2, y2: el.y2 }
      ];
    }
    return [
      { ...el, x1: el.x1, y1: el.y1, x2: I1.x, y2: I1.y },
      { ...el, x1: I2.x, y1: I2.y, x2: el.x2, y2: el.y2 }
    ];
  } else if (hasStart) {
    // End trimmed
    if (el.type === 'arrow') {
      return [{ type: 'line', color: el.color, size: el.size, x1: el.x1, y1: el.y1, x2: I1.x, y2: I1.y }];
    }
    return [{ ...el, x1: el.x1, y1: el.y1, x2: I1.x, y2: I1.y }];
  } else if (hasEnd) {
    // Start trimmed
    return [{ ...el, x1: I2.x, y1: I2.y, x2: el.x2, y2: el.y2 }];
  } else {
    // Entire line inside circle
    return [];
  }
}

// Single step of circle erasing
function eraseCircleStep(cx, cy, radius) {
  let changed = false;
  const newElements = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    // IMPORTANT: Ready images added to the board are NEVER erased by the eraser!
    if (el.type === 'image') {
      newElements.push(el);
      continue;
    }

    if (el.type === 'path') {
      const clipped = clipPathByCircle(el, cx, cy, radius);
      if (clipped.length !== 1 || clipped[0] !== el) {
        changed = true;
      }
      for (let k = 0; k < clipped.length; k++) {
        newElements.push(clipped[k]);
      }
    } else if (el.type === 'line' || el.type === 'arrow') {
      const clipped = clipLineOrArrow(el, cx, cy, radius);
      if (clipped.length !== 1 || clipped[0] !== el) {
        changed = true;
      }
      for (let k = 0; k < clipped.length; k++) {
        newElements.push(clipped[k]);
      }
    } else if (el.type === 'rect' || el.type === 'mux' || el.type === 'alu' || el.type === 'text' || el.type === 'circle' || el.type === 'diamond' || el.type === 'axes' || el.type === 'sticky') {
      const bbox = getElementBoundingBox(el);
      if (bbox && cx >= bbox.x && cx <= bbox.x + bbox.width && cy >= bbox.y && cy <= bbox.y + bbox.height) {
        changed = true;
        // removed
      } else {
        newElements.push(el);
      }
    } else {
      newElements.push(el);
    }
  }

  if (changed) {
    elements = newElements;
    if (selectedElements.length > 0) {
      selectedElements = selectedElements.filter(el => elements.includes(el));
      selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;
    } else if (selectedElement && !elements.includes(selectedElement)) {
      selectedElement = null;
    }
  }
  return changed;
}

// Erase along drag segment with interpolation so fast mouse movement leaves no gaps
function eraseAlongSegment(x1, y1, x2, y2) {
  const radius = getEraserRadius();
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const step = Math.max(4, radius * 0.4);
  const steps = Math.max(1, Math.ceil(dist / step));
  let anyChange = false;

  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const cx = x1 + (x2 - x1) * t;
    const cy = y1 + (y2 - y1) * t;
    if (eraseCircleStep(cx, cy, radius)) {
      anyChange = true;
    }
  }

  if (anyChange) {
    eraseModified = true;
    render();
  }
}

// Text Input on Canvas
function promptAddText(screenX, screenY, canvasX, canvasY) {
  const existingInput = document.getElementById('canvasTextInput');
  if (existingInput) existingInput.remove();

  const rect = wrapper.getBoundingClientRect();
  const input = document.createElement('textarea');
  input.id = 'canvasTextInput';
  input.style.position = 'absolute';
  input.style.left = `${screenX + rect.left}px`;
  input.style.top = `${screenY + rect.top}px`;
  const fontSize = Math.round(Math.max(12, Math.min(48, currentSize * 2 + 12)));
  input.style.fontSize = `${fontSize}px`;
  input.style.color = currentColor;
  input.style.background = 'rgba(255, 255, 255, 0.96)';
  input.style.border = '2px solid #3b82f6';
  input.style.borderRadius = '4px';
  input.style.padding = '4px 8px';
  input.style.fontFamily = "'Fira Code', monospace";
  input.style.zIndex = '35';
  input.style.minWidth = '180px';
  input.style.minHeight = '36px';
  input.placeholder = 'Digite seu cálculo ou sinal...';

  document.body.appendChild(input);
  input.focus();

  let committed = false;

  function commitText() {
    if (committed) return;
    committed = true;
    const text = input.value.trim();
    if (text) {
      recordState();
      const textEl = {
        type: 'text',
        text: text,
        x: canvasX,
        y: canvasY,
        color: currentColor,
        size: currentSize
      };
      elements.push(textEl);
      render();
      scheduleAutoSave();
      broadcastElementAdd(textEl);
    }
    if (input.parentNode) {
      input.remove();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitText();
    } else if (e.key === 'Escape') {
      committed = true;
      if (input.parentNode) input.remove();
    }
  });

  input.addEventListener('blur', commitText);
}

// ==================== Sticky Note Editor Overlay ====================
function promptEditSticky(stickyEl, screenX, screenY) {
  const existingInput = document.getElementById('stickyTextInput');
  if (existingInput) existingInput.remove();

  const rect = wrapper.getBoundingClientRect();
  const screenPos = canvasToScreen(stickyEl.x, stickyEl.y);

  const container = document.createElement('div');
  container.id = 'stickyTextInput';
  container.className = 'sticky-editor-container';
  container.style.position = 'absolute';
  container.style.left = `${Math.max(10, screenPos.x + rect.left)}px`;
  container.style.top = `${Math.max(10, screenPos.y + rect.top)}px`;
  container.style.width = `${Math.max(200, (stickyEl.width || 220) * zoom)}px`;
  container.style.zIndex = '50';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.boxShadow = '0 12px 32px rgba(0,0,0,0.35)';
  container.style.borderRadius = '8px';
  container.style.overflow = 'hidden';
  container.style.border = '2px solid #3b82f6';
  container.style.backgroundColor = stickyEl.color || '#fef08a';

  // Barra de cores e topo do Post-it
  const colorBar = document.createElement('div');
  colorBar.style.display = 'flex';
  colorBar.style.gap = '6px';
  colorBar.style.padding = '6px 10px';
  colorBar.style.backgroundColor = 'rgba(0,0,0,0.08)';
  colorBar.style.borderBottom = '1px solid rgba(0,0,0,0.1)';
  colorBar.style.alignItems = 'center';

  const label = document.createElement('span');
  label.textContent = 'Post-it';
  label.style.fontSize = '11px';
  label.style.fontWeight = '700';
  label.style.color = stickyEl.textColor || '#713f12';
  label.style.marginRight = 'auto';
  colorBar.appendChild(label);

  STICKY_PALETTE.forEach(p => {
    const dot = document.createElement('div');
    dot.style.width = '16px';
    dot.style.height = '16px';
    dot.style.borderRadius = '50%';
    dot.style.backgroundColor = p.bg;
    dot.style.border = p.bg === stickyEl.color ? '2px solid #000' : '1px solid rgba(0,0,0,0.2)';
    dot.style.cursor = 'pointer';
    dot.title = p.name;
    dot.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      stickyEl.color = p.bg;
      stickyEl.textColor = p.text;
      container.style.backgroundColor = p.bg;
      textarea.style.backgroundColor = p.bg;
      textarea.style.color = p.text;
      label.style.color = p.text;
      currentStickyColor = p;
      render();
    });
    colorBar.appendChild(dot);
  });

  const textarea = document.createElement('textarea');
  textarea.className = 'sticky-editor-textarea';
  textarea.style.position = 'static';
  textarea.style.border = 'none';
  textarea.style.boxShadow = 'none';
  textarea.style.width = '100%';
  textarea.style.height = `${Math.max(120, (stickyEl.height || 180) * zoom - 32)}px`;
  textarea.style.backgroundColor = stickyEl.color || '#fef08a';
  textarea.style.color = stickyEl.textColor || '#713f12';
  textarea.style.fontSize = `${Math.max(12, 13 * zoom)}px`;
  textarea.style.padding = '8px 10px';
  textarea.value = stickyEl.text || '';
  textarea.placeholder = 'Digite suas anotações, fórmulas ou lembretes...\n(Ctrl+Enter ou clique fora para salvar)';

  container.appendChild(colorBar);
  container.appendChild(textarea);
  document.body.appendChild(container);

  textarea.focus();
  textarea.select();

  let committed = false;
  function commitSticky() {
    if (committed) return;
    committed = true;
    const newText = textarea.value;
    if (stickyEl.text !== newText) {
      recordState();
      stickyEl.text = newText;
      render();
      scheduleAutoSave();
      broadcastBoardSync();
    }
    if (container.parentNode) container.remove();
  }

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      committed = true;
      if (container.parentNode) container.remove();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitSticky();
    }
  });

  textarea.addEventListener('blur', () => {
    setTimeout(() => {
      if (!container.contains(document.activeElement)) {
        commitSticky();
      }
    }, 150);
  });
}

// Paste Image from Clipboard (Ctrl+V)
function handleClipboardPaste(e) {
  if (e.clipboardData && e.clipboardData.items) {
    for (let i = 0; i < e.clipboardData.items.length; i++) {
      const item = e.clipboardData.items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        const center = screenToCanvas(width / 2, height / 2);
        addImageFromFile(file, center.x, center.y);
        showSyncBadge('Imagem colada com sucesso!', 'synced');
        break;
      }
    }
  }
}

function addImageFromFile(file, posX, posY) {
  const reader = new FileReader();
  reader.onload = async (event) => {
    const rawDataUrl = event.target.result;
    let finalSrc = rawDataUrl;

    // Fast upload to backend to store clean URL instead of huge base64
    try {
      showSyncBadge('Enviando imagem...', 'saving');
      const upRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: rawDataUrl })
      });
      if (upRes.ok) {
        const upData = await upRes.json();
        if (upData.url) {
          finalSrc = upData.url;
        }
      }
    } catch (err) {
      console.warn('Upload offline, usando fallback local:', err);
    }

    const img = new Image();
    img.onload = () => {
      let maxDim = Math.min(850, width * 0.8);
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w *= scale;
        h *= scale;
      }

      const x = posX !== undefined ? posX - w / 2 : (width / 2 - panX) / zoom - w / 2;
      const y = posY !== undefined ? posY - h / 2 : (height / 2 - panY) / zoom - h / 2;

      recordState();
      const el = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        type: 'image',
        src: finalSrc,
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
        imgObj: img
      };
      elements.push(el);
      setActiveTool('select');
      selectedElements = [el];
      selectedElement = el;
      render();
      scheduleAutoSave();
      broadcastElementAdd({
        id: el.id,
        type: 'image',
        src: finalSrc,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height
      });
      showSyncBadge('Imagem pronta!', 'synced');
    };
    img.src = finalSrc;
  };
  reader.readAsDataURL(file);
}

// Local Auto-Save (Saves vector state locally in browser; does NOT generate image prints to disk!)
function scheduleAutoSave() {
  showSyncBadge('● Salvo no navegador', 'synced');
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    try {
      const serializableElements = elements.map(el => {
        const copy = { ...el };
        delete copy.imgObj;
        return copy;
      });
      const stateObj = { elements: serializableElements, zoom, panX, panY };
      localStorage.setItem('whiteboard_state', JSON.stringify(stateObj));

      // Quietly sync JSON elements state to server without any image/print generation
      fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: stateObj })
      }).catch(() => {});
    } catch (e) {}
  }, 600);
}

async function saveToAI(manual = false, focusMode = false) {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  showSyncBadge(focusMode ? 'Salvando foco...' : 'Sincronizando com IA...', 'saving');

  try {
    const exportCanvas = document.createElement('canvas');
    const expCtx = exportCanvas.getContext('2d');

    let expW, expH;

    if (focusMode) {
      // Focus Mode: Captures exactly what the user is seeing on screen right now
      expW = Math.min(2048, Math.round(width));
      expH = Math.min(1536, Math.round(height));
      exportCanvas.width = expW;
      exportCanvas.height = expH;

      expCtx.fillStyle = '#ffffff';
      expCtx.fillRect(0, 0, expW, expH);

      expCtx.translate(panX, panY);
      expCtx.scale(zoom, zoom);
      elements.forEach(el => drawElement(expCtx, el));
    } else {
      // Full Board Mode: bounded, downscaled if large
      const bounds = getElementsBounds() || { minX: 0, minY: 0, maxX: width, maxY: height, width, height };
      const padding = 50;
      const rawW = Math.max(800, bounds.width + padding * 2);
      const rawH = Math.max(600, bounds.height + padding * 2);

      // Clamp max dimensions to 2560x1600 so it NEVER becomes a 106MP decompression bomb
      const MAX_W = 2560;
      const MAX_H = 1600;
      const scale = Math.min(MAX_W / rawW, MAX_H / rawH, 1.0);

      expW = Math.round(rawW * scale);
      expH = Math.round(rawH * scale);

      exportCanvas.width = expW;
      exportCanvas.height = expH;

      expCtx.fillStyle = '#ffffff';
      expCtx.fillRect(0, 0, expW, expH);

      expCtx.scale(scale, scale);
      expCtx.translate(-bounds.minX + padding, -bounds.minY + padding);
      elements.forEach(el => drawElement(expCtx, el));
    }

    const dataUrl = exportCanvas.toDataURL('image/png');

    // Clean elements for JSON serialization
    const serializableElements = elements.map(el => {
      const copy = { ...el };
      delete copy.imgObj;
      return copy;
    });

    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrl,
        state: { elements: serializableElements, zoom, panX, panY }
      })
    });

    if (res.ok) {
      showSyncBadge('● Sincronizado com IA', 'synced');
      if (manual) {
        showToast(focusMode ? 'Foco atual salvo para a IA!' : 'Quadro salvo e visível para a IA! Pode me chamar no chat.');
      }
    } else {
      showSyncBadge('Erro ao salvar', 'idle');
    }
  } catch (err) {
    showSyncBadge('Servidor offline', 'idle');
  }
}

function showSyncBadge(text, className) {
  if (syncText) syncText.textContent = text;
  if (syncBadge) syncBadge.className = `sync-badge ${className}`;
}

function showToast(msg) {
  const existing = document.getElementById('toastNotification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toastNotification';
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.backgroundColor = '#1e293b';
  toast.style.color = '#f8fafc';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '8px';
  toast.style.border = '1px solid #3b82f6';
  toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.4)';
  toast.style.fontSize = '12px';
  toast.style.fontWeight = '500';
  toast.style.zIndex = '200';
  toast.textContent = msg;

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

async function loadSavedBoard() {
  // 1. First restore from localStorage (instant and offline)
  try {
    const local = localStorage.getItem('whiteboard_state');
    if (local) {
      const data = JSON.parse(local);
      if (data && data.elements && data.elements.length > 0) {
        elements = data.elements;
        if (data.zoom) zoom = data.zoom;
        if (data.panX !== undefined) panX = data.panX;
        if (data.panY !== undefined) panY = data.panY;
        rehydrateImages();
        setTimeout(() => {
          render();
          showSyncBadge('● Salvo no navegador', 'synced');
        }, 100);
        return;
      }
    }
  } catch (e) {}

  // 2. Fallback to /current_board.json from server
  try {
    const res = await fetch('/current_board.json');
    if (res.ok) {
      const data = await res.json();
      if (data && data.elements) {
        elements = data.elements;
        rehydrateImages();
        setTimeout(() => {
          fitToScreen();
          showSyncBadge('● Sincronizado', 'synced');
        }, 150);
      }
    }
  } catch (e) {
    // board file doesn't exist yet
  }
}

function exportLocalPNG() {
  const exp = document.createElement('canvas');
  exp.width = canvas.width;
  exp.height = canvas.height;
  const expCtx = exp.getContext('2d');
  expCtx.fillStyle = gridMode === 'ruled' ? '#fdfbf7' : '#ffffff';
  expCtx.fillRect(0, 0, exp.width, exp.height);
  expCtx.drawImage(canvas, 0, 0);
  if (overlayCanvas) {
    expCtx.drawImage(overlayCanvas, 0, 0);
  }

  const link = document.createElement('a');
  link.download = `whiteboard_tela_${Date.now()}.png`;
  link.href = exp.toDataURL('image/png');
  link.click();
  showToast('Imagem da tela baixada com sucesso!');
}

function exportFullPNG() {
  const bounds = getElementsBounds() || { minX: 0, minY: 0, maxX: width, maxY: height, width, height };
  const padding = 50;
  const rawW = Math.max(800, bounds.width + padding * 2);
  const rawH = Math.max(600, bounds.height + padding * 2);
  const scale = Math.min(3200 / rawW, 2400 / rawH, 1.0);

  const expCanvas = document.createElement('canvas');
  expCanvas.width = Math.round(rawW * scale);
  expCanvas.height = Math.round(rawH * scale);
  const expCtx = expCanvas.getContext('2d');

  expCtx.fillStyle = '#ffffff';
  expCtx.fillRect(0, 0, expCanvas.width, expCanvas.height);
  expCtx.scale(scale, scale);
  expCtx.translate(-bounds.minX + padding, -bounds.minY + padding);
  elements.forEach(el => drawElement(expCtx, el));

  const link = document.createElement('a');
  link.download = `quadro_completo_${Date.now()}.png`;
  link.href = expCanvas.toDataURL('image/png');
  link.click();
  showToast('Imagem completa baixada com sucesso!');
}

function exportBoardJSON() {
  const serializableElements = elements.map(el => {
    const copy = { ...el };
    delete copy.imgObj;
    return copy;
  });
  const data = JSON.stringify({
    version: '2.0',
    exportedAt: new Date().toISOString(),
    zoom,
    panX,
    panY,
    elements: serializableElements
  }, null, 2);

  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = `quadro_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup do quadro baixado com sucesso!');
}

function importBoardJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data && data.elements && Array.isArray(data.elements)) {
        recordState();
        elements = data.elements;
        ensureElementIds();
        if (data.zoom) zoom = data.zoom;
        if (data.panX !== undefined) panX = data.panX;
        if (data.panY !== undefined) panY = data.panY;
        rehydrateImages();
        render();
        scheduleAutoSave();
        broadcastBoardSync();
        showToast(`Backup restaurado com sucesso! (${elements.length} elementos)`);
      } else {
        alert('Arquivo JSON inválido.');
      }
    } catch (err) {
      alert('Erro ao carregar arquivo JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ==================== Universal Grid Pattern System ====================
function applyGridPattern(mode, saveToBoard = true) {
  const validModes = ['dots', 'graph', 'ruled', 'blank'];
  if (!validModes.includes(mode)) mode = 'dots';

  gridMode = mode;
  localStorage.setItem('whiteboard_grid', gridMode);

  wrapper.classList.remove('grid-dots', 'grid-graph', 'grid-ruled', 'grid-blank');
  wrapper.classList.add(`grid-${gridMode}`);

  const gridBtnText = document.getElementById('gridBtnText');
  if (gridBtnText) {
    const labels = {
      'dots': 'Grade: Pontos',
      'graph': 'Grade: Milimetrado',
      'ruled': 'Grade: Pautado',
      'blank': 'Grade: Liso'
    };
    gridBtnText.textContent = labels[gridMode] || 'Grade: Pontos';
  }

  document.querySelectorAll('.grid-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.grid === gridMode);
  });

  render();

  if (saveToBoard && activeBoardId) {
    const currentTitle = getActiveBoardTitle();
    fetch('/api/boards/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId: activeBoardId,
        title: currentTitle,
        gridType: gridMode
      })
    }).catch(() => {});
  }
}

function toggleGrid() {
  const modes = ['dots', 'graph', 'ruled', 'blank'];
  let curIndex = modes.indexOf(gridMode);
  if (curIndex === -1) curIndex = 0;
  const nextMode = modes[(curIndex + 1) % modes.length];
  applyGridPattern(nextMode, true);
  const labels = {
    'dots': 'Pontilhado (Moderno)',
    'graph': 'Papel Milimetrado (Cálculo & Física)',
    'ruled': 'Caderno Pautado (Anotações)',
    'blank': 'Branco Liso (Limpo)'
  };
  showToast(`⊞ Folha: ${labels[nextMode]}`);
}

function getActiveBoardTitle() {
  if (!boardsMetadata || !boardsMetadata.subjects) return 'Quadro de Estudos';
  for (const s of boardsMetadata.subjects) {
    for (const b of (s.boards || [])) {
      if (b.id === activeBoardId) return b.title;
    }
  }
  return 'Quadro de Estudos';
}

// ==================== Multi-Boards & Subjects Hub ====================
async function loadBoardsMetadata() {
  try {
    const res = await fetch('/api/boards');
    if (!res.ok) return;
    boardsMetadata = await res.json();
    if (boardsMetadata.activeBoardId) {
      activeBoardId = boardsMetadata.activeBoardId;
    }
    updateHubUI();
  } catch (err) {
    console.warn('Erro ao carregar boards metadata:', err);
  }
}

function updateHubUI() {
  if (!boardsMetadata || !boardsMetadata.subjects) return;

  const subjectSelect = document.getElementById('subjectSelect');
  const boardSelect = document.getElementById('boardSelect');
  const currentSubjectDisplay = document.getElementById('currentSubjectDisplay');

  if (!subjectSelect || !boardSelect) return;

  // 1. Identificar matéria ativa
  let currentSubj = null;
  for (const s of boardsMetadata.subjects) {
    if ((s.boards || []).some(b => b.id === activeBoardId)) {
      currentSubj = s;
      break;
    }
  }
  if (!currentSubj && boardsMetadata.subjects.length > 0) {
    currentSubj = boardsMetadata.subjects[0];
  }

  if (currentSubjectDisplay && currentSubj) {
    currentSubjectDisplay.textContent = currentSubj.name;
  }

  // 2. Preencher subjectSelect
  subjectSelect.innerHTML = '';
  for (const s of boardsMetadata.subjects) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (currentSubj && s.id === currentSubj.id) opt.selected = true;
    subjectSelect.appendChild(opt);
  }

  // 3. Preencher boardSelect com os cadernos da matéria ativa
  boardSelect.innerHTML = '';
  if (currentSubj && currentSubj.boards) {
    for (const b of currentSubj.boards) {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.title;
      if (b.id === activeBoardId) {
        opt.selected = true;
        if (b.gridType) applyGridPattern(b.gridType, false);
      }
      boardSelect.appendChild(opt);
    }
  }
}

async function switchActiveBoard(newBoardId) {
  if (!newBoardId || newBoardId === activeBoardId) return;
  showToast('Carregando caderno...');
  try {
    const res = await fetch('/api/boards/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId: newBoardId })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      activeBoardId = data.boardId;
      elements = data.elements || [];
      undoStack = [];
      redoStack = [];
      selectedElements = [];
      selectedElement = null;
      rehydrateImages();

      if (data.gridType) {
        applyGridPattern(data.gridType, false);
      }
      await loadBoardsMetadata();
      render();
      fitToScreen();
      showToast('Caderno aberto!');
    }
  } catch (err) {
    console.error('Erro ao alternar caderno:', err);
    showToast('Erro ao alternar caderno');
  }
}

async function createNewBoard(title, gridType) {
  if (!boardsMetadata || !boardsMetadata.subjects) return;
  const subjectSelect = document.getElementById('subjectSelect');
  const subjectId = subjectSelect ? subjectSelect.value : (boardsMetadata.subjects[0] ? boardsMetadata.subjects[0].id : 'arq');

  try {
    const res = await fetch('/api/boards/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectId,
        title: title || 'Novo Caderno',
        gridType: gridType || 'dots'
      })
    });
    const data = await res.json();
    if (data.status === 'ok' && data.board) {
      boardsMetadata = data.metadata;
      await switchActiveBoard(data.board.id);
      showToast('Novo caderno criado com sucesso!');
    }
  } catch (err) {
    console.error('Erro ao criar caderno:', err);
    showToast('Erro ao criar caderno');
  }
}

async function renameBoard(boardId, newTitle) {
  try {
    const res = await fetch('/api/boards/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId, title: newTitle })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      boardsMetadata = data.metadata;
      updateHubUI();
      renderManageBoardsList();
      showToast('Caderno renomeado!');
    }
  } catch (err) {
    console.error('Erro ao renomear caderno:', err);
  }
}

async function deleteBoard(boardId) {
  if (!confirm('Tem certeza que deseja excluir este caderno? Esta ação não pode ser desfeita.')) return;
  try {
    const res = await fetch('/api/boards/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      boardsMetadata = data.metadata;
      if (data.activeBoardId && data.activeBoardId !== activeBoardId) {
        await switchActiveBoard(data.activeBoardId);
      } else {
        updateHubUI();
      }
      renderManageBoardsList();
      showToast('Caderno excluído.');
    } else {
      alert(data.detail || 'Não foi possível excluir o caderno.');
    }
  } catch (err) {
    console.error('Erro ao excluir caderno:', err);
  }
}

async function createNewSubject(name, icon) {
  try {
    const res = await fetch('/api/subjects/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, icon })
    });
    const data = await res.json();
    if (data.status === 'ok' && data.subject) {
      boardsMetadata = data.metadata;
      const firstBoard = (data.subject.boards || [])[0];
      if (firstBoard) {
        await switchActiveBoard(firstBoard.id);
      } else {
        updateHubUI();
      }
      showToast(`Matéria "${name}" criada com sucesso!`);
    }
  } catch (err) {
    console.error('Erro ao criar matéria:', err);
  }
}

// ==================== Cloudflare Tunnel Integration ====================
let tunnelActive = false;
let currentTunnelUrl = null;

async function checkTunnelStatus() {
  try {
    const res = await fetch('/api/tunnel/status');
    if (res.ok) {
      const data = await res.json();
      tunnelActive = !!data.active;
      currentTunnelUrl = data.url;
      updateTunnelUI();
    }
  } catch (err) {
    // ignore
  }
}

function updateTunnelUI() {
  const btnShare = document.getElementById('btnShareCloudflare');
  if (!btnShare) return;

  if (tunnelActive && currentTunnelUrl) {
    btnShare.classList.add('active');
    const txt = btnShare.querySelector('.btn-text');
    if (txt) txt.textContent = 'Compartilhado';
    btnShare.title = `Quadro online: ${currentTunnelUrl}`;
  } else {
    btnShare.classList.remove('active');
    const txt = btnShare.querySelector('.btn-text');
    if (txt) txt.textContent = 'Compartilhar';
    btnShare.title = 'Abrir quadro para amigos pela Internet (Cloudflare)';
  }
}

async function openCloudflareModal() {
  const modal = document.getElementById('cloudflareModal');
  const loading = document.getElementById('cfLoadingState');
  const active = document.getElementById('cfActiveState');
  const urlInput = document.getElementById('cfPublicUrlInput');

  if (!modal) return;
  modal.classList.add('open');

  if (tunnelActive && currentTunnelUrl) {
    if (loading) loading.style.display = 'none';
    if (active) active.style.display = 'flex';
    if (urlInput) urlInput.value = currentTunnelUrl;
    return;
  }

  // Not active yet: trigger tunnel creation
  if (loading) loading.style.display = 'block';
  if (active) active.style.display = 'none';

  try {
    const res = await fetch('/api/tunnel/start', { method: 'POST' });
    const data = await res.json();

    if (data.status === 'ok' && data.url) {
      tunnelActive = true;
      currentTunnelUrl = data.url;

      if (urlInput) urlInput.value = data.url;

      if (loading) loading.style.display = 'none';
      if (active) active.style.display = 'flex';
      updateTunnelUI();

      navigator.clipboard.writeText(data.url).catch(() => {});
      showToast('Link do Cloudflare copiado!');
      if (data.warning) {
        showToast(data.warning);
      }
    } else {
      if (loading) loading.style.display = 'none';
      alert(data.detail || 'Não foi possível iniciar o túnel Cloudflare. Verifique se o Cloudflare WARP está ativo.');
      closeCloudflareModal();
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    console.error('Erro ao iniciar Cloudflare Tunnel:', err);
    alert('Erro ao conectar com o serviço Cloudflare. Verifique se o WARP está conectado.');
    closeCloudflareModal();
  }
}

function closeCloudflareModal() {
  const modal = document.getElementById('cloudflareModal');
  if (modal) modal.classList.remove('open');
}

async function stopCloudflareTunnel() {
  try {
    await fetch('/api/tunnel/stop', { method: 'POST' });
    tunnelActive = false;
    currentTunnelUrl = null;
    updateTunnelUI();
    closeCloudflareModal();
    showToast('Compartilhamento encerrado.');
  } catch (err) {
    console.error('Erro ao parar túnel:', err);
  }
}

// ==================== Modal Nova Matéria ====================
function openNewSubjectModal() {
  const modal = document.getElementById('newSubjectModal');
  const nameInput = document.getElementById('newSubjectNameInput');
  const iconInput = document.getElementById('newSubjectIconInput');
  if (nameInput) {
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 80);
  }
  if (iconInput) iconInput.value = 'book';
  if (modal) modal.classList.add('open');
}

function closeNewSubjectModal() {
  const modal = document.getElementById('newSubjectModal');
  if (modal) modal.classList.remove('open');
}

async function deleteSubject(subjectId) {
  if (!boardsMetadata || !boardsMetadata.subjects) return;
  if (boardsMetadata.subjects.length <= 1) {
    alert('Não é permitido excluir a única matéria restante.');
    return;
  }
  const subj = boardsMetadata.subjects.find(s => s.id === subjectId);
  const subjName = subj ? subj.name : 'esta matéria';
  if (!confirm(`Tem certeza que deseja excluir a matéria "${subjName}" e todos os seus cadernos?`)) return;

  try {
    const res = await fetch('/api/subjects/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectId })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      boardsMetadata = data.metadata;
      if (data.activeBoardId) {
        await switchActiveBoard(data.activeBoardId);
      } else {
        updateHubUI();
      }
      renderManageBoardsList();
      showToast('Matéria excluída.');
    } else {
      alert(data.detail || 'Não foi possível excluir a matéria.');
    }
  } catch (err) {
    console.error('Erro ao excluir matéria:', err);
  }
}

async function renameSubject(subjectId, currentName, currentIcon) {
  const cleanName = currentName.replace(/^[^\s]+\s/, '');
  const newName = prompt('Novo nome da matéria:', cleanName);
  if (!newName || !newName.trim()) return;

  try {
    const res = await fetch('/api/subjects/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectId,
        name: newName.trim(),
        icon: currentIcon || 'book'
      })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      boardsMetadata = data.metadata;
      updateHubUI();
      renderManageBoardsList();
      showToast('Matéria renomeada!');
    }
  } catch (err) {
    console.error('Erro ao renomear matéria:', err);
  }
}

function renderManageBoardsList() {
  const list = document.getElementById('manageBoardsList');
  if (!list || !boardsMetadata || !boardsMetadata.subjects) return;

  list.innerHTML = '';

  const subjectSelect = document.getElementById('subjectSelect');
  const currentSubjId = subjectSelect ? subjectSelect.value : null;
  const currentSubj = boardsMetadata.subjects.find(s => s.id === currentSubjId) || boardsMetadata.subjects[0];

  if (!currentSubj) return;

  // Header informativo da matéria atual
  const subjHeader = document.createElement('div');
  subjHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.2); border-radius:8px; padding:10px 14px; margin-bottom:12px;';
  subjHeader.innerHTML = `
    <div>
      <div style="font-size:13.5px; font-weight:700; color:#f1f5f9;">Matéria: ${currentSubj.name}</div>
      <div style="font-size:11px; color:var(--text-muted);">${(currentSubj.boards || []).length} caderno(s) cadastrado(s)</div>
    </div>
  `;
  list.appendChild(subjHeader);

  // Lista de cadernos
  (currentSubj.boards || []).forEach(b => {
    const item = document.createElement('div');
    item.className = 'manage-board-item' + (b.id === activeBoardId ? ' active' : '');

    const info = document.createElement('div');
    info.className = 'board-item-info';

    const title = document.createElement('div');
    title.className = 'board-item-title';
    title.textContent = b.title;

    const meta = document.createElement('div');
    meta.className = 'board-item-meta';
    meta.textContent = `Grade: ${b.gridType || 'dots'} · ID: ${b.id}`;

    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'board-item-actions';

    if (b.id !== activeBoardId) {
      const btnOpen = document.createElement('button');
      btnOpen.className = 'btn btn-secondary btn-small-action';
      btnOpen.textContent = 'Abrir';
      btnOpen.addEventListener('click', () => {
        switchActiveBoard(b.id);
        closeBoardManageModal();
      });
      actions.appendChild(btnOpen);
    }

    const btnRename = document.createElement('button');
    btnRename.className = 'btn btn-secondary btn-small-action';
    btnRename.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg><span>Renomear</span>';
    btnRename.addEventListener('click', () => {
      const newTitle = prompt('Novo título do caderno:', b.title);
      if (newTitle && newTitle.trim()) {
        renameBoard(b.id, newTitle.trim());
      }
    });
    actions.appendChild(btnRename);

    if ((currentSubj.boards || []).length > 1) {
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-secondary btn-small-action';
      btnDel.style.color = 'var(--danger)';
      btnDel.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      btnDel.title = 'Excluir Caderno';
      btnDel.addEventListener('click', () => {
        deleteBoard(b.id);
      });
      actions.appendChild(btnDel);
    }

    item.appendChild(info);
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function openBoardManageModal() {
  const modal = document.getElementById('boardManageModal');
  if (modal) {
    renderManageBoardsList();
    modal.classList.add('open');
  }
}

function closeBoardManageModal() {
  const modal = document.getElementById('boardManageModal');
  if (modal) modal.classList.remove('open');
}

function openNewBoardModal() {
  const modal = document.getElementById('newBoardModal');
  const titleInput = document.getElementById('newBoardTitleInput');
  const subjNameEl = document.getElementById('newBoardSubjectName');
  const subjectSelect = document.getElementById('subjectSelect');

  if (subjNameEl && subjectSelect && subjectSelect.selectedOptions[0]) {
    subjNameEl.textContent = `Para a matéria: ${subjectSelect.selectedOptions[0].textContent}`;
  }
  if (titleInput) {
    titleInput.value = '';
    setTimeout(() => titleInput.focus(), 80);
  }
  if (modal) modal.classList.add('open');
}

function closeNewBoardModal() {
  const modal = document.getElementById('newBoardModal');
  if (modal) modal.classList.remove('open');
}

function setupHubUI() {
  const subjectSelect = document.getElementById('subjectSelect');
  const boardSelect = document.getElementById('boardSelect');
  const btnNewBoard = document.getElementById('btnNewBoard');
  const btnNewSubject = document.getElementById('btnNewSubject');
  const btnManageBoards = document.getElementById('btnManageBoards');
  const btnCloseManageBoards = document.getElementById('btnCloseManageBoards');
  const btnCreateSubject = document.getElementById('btnCreateSubject');
  const btnCloseNewBoardModal = document.getElementById('btnCloseNewBoardModal');
  const btnConfirmCreateBoard = document.getElementById('btnConfirmCreateBoard');

  // Troca de matéria
  if (subjectSelect) {
    subjectSelect.addEventListener('change', () => {
      const subjId = subjectSelect.value;
      if (!boardsMetadata || !boardsMetadata.subjects) return;
      const subj = boardsMetadata.subjects.find(s => s.id === subjId);
      if (subj && subj.boards && subj.boards.length > 0) {
        switchActiveBoard(subj.boards[0].id);
      }
    });
  }

  // Troca de caderno
  if (boardSelect) {
    boardSelect.addEventListener('change', () => {
      const boardId = boardSelect.value;
      if (boardId) {
        switchActiveBoard(boardId);
      }
    });
  }

  // Botões de modal Hub
  if (btnNewSubject) btnNewSubject.addEventListener('click', openNewSubjectModal);
  if (btnNewBoard) btnNewBoard.addEventListener('click', openNewBoardModal);
  if (btnManageBoards) btnManageBoards.addEventListener('click', openBoardManageModal);
  if (btnCloseManageBoards) btnCloseManageBoards.addEventListener('click', closeBoardManageModal);
  if (btnCloseNewBoardModal) btnCloseNewBoardModal.addEventListener('click', closeNewBoardModal);

  // Modal Nova Matéria
  const btnCloseNewSubjectModal = document.getElementById('btnCloseNewSubjectModal');
  if (btnCloseNewSubjectModal) btnCloseNewSubjectModal.addEventListener('click', closeNewSubjectModal);

  const btnConfirmCreateSubject = document.getElementById('btnConfirmCreateSubject');
  if (btnConfirmCreateSubject) {
    btnConfirmCreateSubject.addEventListener('click', () => {
      const nameInput = document.getElementById('newSubjectNameInput');
      const iconInput = document.getElementById('newSubjectIconInput');
      const name = nameInput ? nameInput.value.trim() : '';
      const icon = iconInput ? iconInput.value.trim() || 'book' : 'book';
      if (name) {
        createNewSubject(name, icon);
        closeNewSubjectModal();
      } else {
        alert('Por favor, informe o nome da matéria.');
      }
    });
  }

  // Icon presets no modal de matéria
  document.querySelectorAll('.icon-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.icon-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const iconInput = document.getElementById('newSubjectIconInput');
      if (iconInput) iconInput.value = btn.dataset.icon || 'book';
    });
  });

  // Criar matéria pelo modal de gerenciar (campo legado)
  if (btnCreateSubject) {
    btnCreateSubject.addEventListener('click', () => {
      const nameInput = document.getElementById('newSubjectName');
      const iconInput = document.getElementById('newSubjectIcon');
      const name = nameInput ? nameInput.value.trim() : '';
      const icon = iconInput ? iconInput.value.trim() || 'book' : 'book';
      if (name) {
        createNewSubject(name, icon);
        if (nameInput) nameInput.value = '';
        if (iconInput) iconInput.value = '';
      } else {
        alert('Por favor, informe o nome da matéria.');
      }
    });
  }

  // Criar caderno
  if (btnConfirmCreateBoard) {
    btnConfirmCreateBoard.addEventListener('click', () => {
      const titleInput = document.getElementById('newBoardTitleInput');
      const gridSelect = document.getElementById('newBoardGridSelect');
      const title = titleInput ? titleInput.value.trim() : '';
      const grid = gridSelect ? gridSelect.value : 'dots';
      createNewBoard(title || 'Novo Caderno', grid);
      closeNewBoardModal();
    });
  }

  // Cloudflare Share
  const btnShareCloudflare = document.getElementById('btnShareCloudflare');
  if (btnShareCloudflare) {
    btnShareCloudflare.addEventListener('click', openCloudflareModal);
  }

  const btnCloseCloudflareModal = document.getElementById('btnCloseCloudflareModal');
  if (btnCloseCloudflareModal) {
    btnCloseCloudflareModal.addEventListener('click', closeCloudflareModal);
  }

  const btnCopyCfUrl = document.getElementById('btnCopyCfUrl');
  if (btnCopyCfUrl) {
    btnCopyCfUrl.addEventListener('click', () => {
      const input = document.getElementById('cfPublicUrlInput');
      if (input && input.value) {
        navigator.clipboard.writeText(input.value).then(() => {
          btnCopyCfUrl.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><span>Copiado!</span>';
          setTimeout(() => {
            btnCopyCfUrl.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copiar</span>';
          }, 2500);
        });
      }
    });
  }

  const btnStopCfTunnel = document.getElementById('btnStopCfTunnel');
  if (btnStopCfTunnel) {
    btnStopCfTunnel.addEventListener('click', stopCloudflareTunnel);
  }

  // Upload Material na Galeria
  const btnUploadMaterial = document.getElementById('btnUploadMaterial');
  const materialFileInput = document.getElementById('materialFileInput');
  if (btnUploadMaterial && materialFileInput) {
    btnUploadMaterial.addEventListener('click', () => materialFileInput.click());
    materialFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadMaterialFile(e.target.files[0]);
        e.target.value = '';
      }
    });
  }

  // Grid dropdown options
  document.querySelectorAll('.grid-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const pattern = opt.dataset.grid;
      if (pattern) {
        applyGridPattern(pattern, true);
        const gridDropdown = document.getElementById('gridDropdown');
        if (gridDropdown) gridDropdown.classList.remove('open');
      }
    });
  });

  // Grid dropdown toggle
  const btnGridToggle = document.getElementById('btnGridToggle');
  const gridDropdown = document.getElementById('gridDropdown');
  if (btnGridToggle && gridDropdown) {
    btnGridToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const exportDropdown = document.getElementById('exportDropdown');
      if (exportDropdown) exportDropdown.classList.remove('open');
      gridDropdown.classList.toggle('open');
    });
  }

  // Fechar dropdowns da barra superior ao clicar fora
  window.addEventListener('click', (e) => {
    const gd = document.getElementById('gridDropdown');
    const ed = document.getElementById('exportDropdown');
    if (gd && !gd.contains(e.target)) gd.classList.remove('open');
    if (ed && !ed.contains(e.target)) ed.classList.remove('open');
  });

  // Fechar modais ao clicar no backdrop
  [
    document.getElementById('boardManageModal'),
    document.getElementById('newBoardModal'),
    document.getElementById('newSubjectModal'),
    document.getElementById('cloudflareModal')
  ].forEach(modal => {
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('open');
      });
    }
  });

  // Verificar status inicial do túnel
  checkTunnelStatus();
}

function openShortcutsModal() {
  if (shortcutsModal) shortcutsModal.classList.add('open');
}

function closeShortcutsModal() {
  if (shortcutsModal) shortcutsModal.classList.remove('open');
}

async function fetchAIFeedback() {
  try {
    const res = await fetch('/api/ai-feedback');
    const data = await res.json();
    const box = document.getElementById('aiFeedbackContainer');
    if (data.notes && data.notes.length > 0) {
      box.innerHTML = data.notes.map(n => `
        <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #334155;">
          <b style="color:#60a5fa;">[${n.author || 'Assistente IA'}]:</b>
          <p style="color:#f1f5f9; margin-top:2px;">${n.text}</p>
        </div>
      `).join('');
    } else {
      box.innerHTML = '<i>Nenhuma anotação nova da IA no momento.</i>';
    }
  } catch (e) {
    console.warn('Feedback indisponível:', e);
  }
}

// Hotkeys & Shortcuts
function setupHotkeys() {
  window.addEventListener('keydown', (e) => {
    // Ignore hotkeys when typing in textarea or inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      if (selectedElements.length > 0 || selectedElement) {
        selectedElements = [];
        selectedElement = null;
        render();
      }
      closeGalleryModal();
      closeShortcutsModal();
      studySidebar.classList.add('closed');
      sidebarBackdrop.classList.remove('active');
      if (exportDropdown) exportDropdown.classList.remove('open');
    }

    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      openShortcutsModal();
      return;
    }

    if (e.shiftKey && (e.key === 'G' || e.key === 'g')) {
      toggleGrid();
      return;
    }

    if (e.code === 'Space') {
      spacePressed = true;
      wrapper.classList.add('pan-mode');
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        saveToAI(true);
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        duplicateSelection(25);
      } else if (e.key === ']') {
        e.preventDefault();
        bringToFront();
      } else if (e.key === '[') {
        e.preventDefault();
        sendToBack();
      }
      return;
    }

    if (e.key === ']') {
      bringForward();
      return;
    }
    if (e.key === '[') {
      sendBackward();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedElements.length > 0) {
        recordState();
        const count = selectedElements.length;
        const set = new Set(selectedElements);
        elements = elements.filter(el => !set.has(el));
        selectedElements = [];
        selectedElement = null;
        render();
        scheduleAutoSave();
        commitLocalAction();
        showToast(count === 1 ? 'Elemento excluído (Ctrl+Z para desfazer)' : `${count} elementos excluídos (Ctrl+Z para desfazer)`);
        return;
      } else if (selectedElement) {
        recordState();
        elements = elements.filter(el => el !== selectedElement);
        selectedElement = null;
        render();
        scheduleAutoSave();
        commitLocalAction();
        showToast('Elemento excluído (Ctrl+Z para desfazer)');
        return;
      }
    }

    const key = e.key.toLowerCase();
    if (key === 'f') {
      fitToScreen();
      return;
    }
    if (key === 'g' && !e.shiftKey) {
      openGalleryModal();
      return;
    }

    const toolMap = {
      'p': 'pen',
      'h': 'highlighter',
      'a': 'arrow',
      'l': 'line',
      'r': 'rect',
      'c': 'circle',
      'o': 'circle',
      'd': 'diamond',
      'x': 'axes',
      'n': 'sticky',
      'm': 'mux',
      'u': 'alu',
      't': 'text',
      'e': 'eraser',
      's': 'select',
      'v': 'select',
      'k': 'laser'
    };

    if (toolMap[key]) {
      setActiveTool(toolMap[key]);
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spacePressed = false;
      wrapper.classList.remove('pan-mode');
      wrapper.classList.remove('panning');
      if (currentTool === 'eraser') {
        wrapper.classList.add('eraser-mode');
        updateEraserCursorSize();
      }
    }
  });
}

// ==================== WebSocket Collaboration System ====================

function initWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.warn('Erro ao inicializar WebSocket:', err);
    updateCollabUI(1, false);
    scheduleWsReconnect();
    return;
  }

  ws.onopen = () => {
    wsConnected = true;
    updateCollabUI(1, true);
    // Send user profile on connect
    sendWsMessage({
      type: 'join',
      name: myUserName,
      color: myUserColor
    });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    } catch (err) {
      console.error('Erro ao processar mensagem colaborativa:', err);
    }
  };

  ws.onclose = () => {
    wsConnected = false;
    updateCollabUI(1, false);
    peerCursors.clear();
    peerLiveStrokes.clear();
    render();
    scheduleWsReconnect();
  };

  ws.onerror = () => {
    // onclose handles reconnect
  };
}

function scheduleWsReconnect() {
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  wsReconnectTimer = setTimeout(() => {
    initWebSocket();
  }, 3000);
}

function sendWsMessage(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      console.warn('Falha ao enviar mensagem WS:', e);
    }
  }
}

function handleWsMessage(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'init': {
      wsClientId = msg.clientId;
      undoStack = [];
      redoStack = [];
      pendingUndoState = null;
      updateUndoRedoUI();
      const count = msg.userCount || 1;
      updateCollabUI(count, true);

      if (msg.activeBoardId) activeBoardId = msg.activeBoardId;
      if (msg.boardsMeta) {
        boardsMetadata = msg.boardsMeta;
        updateHubUI();
      }
      if (msg.gridType) {
        applyGridPattern(msg.gridType, false);
      }

      // If server already has elements, adopt them!
      if (msg.elements && msg.elements.length > 0) {
        elements = msg.elements;
        rehydrateImages();
        render();
      } else if (!hasSentInitialSync && elements.length > 0) {
        // If server is blank but we have existing elements from localStorage, share with server!
        hasSentInitialSync = true;
        broadcastBoardSync();
      }
      break;
    }

    case 'presence': {
      const count = msg.userCount || 1;
      updateCollabUI(count, true);
      if (msg.user && msg.user.name && msg.user.clientId !== wsClientId) {
        showToast(`${msg.user.name} entrou no quadro!`);
      }
      if (msg.left) {
        peerCursors.delete(msg.left);
        peerLiveStrokes.delete(msg.left);
        requestRenderOverlay();
      }
      break;
    }

    case 'cursor': {
      if (msg.clientId === wsClientId) return;
      peerCursors.set(msg.clientId, {
        x: msg.x,
        y: msg.y,
        name: msg.name || 'Amigo',
        color: msg.color || '#2563eb',
        tool: msg.tool || 'pen',
        lastSeen: Date.now()
      });
      requestRenderOverlay();
      break;
    }

    case 'cursor_remove': {
      peerCursors.delete(msg.clientId);
      peerLiveStrokes.delete(msg.clientId);
      requestRenderOverlay();
      break;
    }

    case 'stroke_live': {
      if (msg.clientId === wsClientId) return;
      peerLiveStrokes.set(msg.clientId, {
        type: 'path',
        tool: msg.tool || 'pen',
        color: msg.color || '#2563eb',
        size: msg.size || 2,
        points: msg.points || []
      });
      requestRenderOverlay();
      break;
    }

    case 'laser_point': {
      if (msg.clientId === wsClientId) return;
      addLaserPoint({ x: msg.x, y: msg.y }, false, msg.clientId);
      break;
    }

    case 'board_patch': {
      peerLiveStrokes.delete(msg.clientId);
      receiveBoardChanges(msg.changes || []);
      break;
    }

    case 'element_add': {
      if (msg.clientId === wsClientId) return;
      peerLiveStrokes.delete(msg.clientId);
      if (msg.element) {
        invalidateElementBBox(msg.element);
        receiveBoardChanges([{ id: msg.element.id, after: msg.element }]);
        if (msg.element.type === 'image') {
          rehydrateImages();
        }
        render();
      }
      break;
    }

    case 'board_sync': {
      if (msg.clientId === wsClientId) return;
      peerLiveStrokes.delete(msg.clientId);
      if (msg.boardId && msg.boardId !== activeBoardId) {
        activeBoardId = msg.boardId;
        if (msg.gridType) applyGridPattern(msg.gridType, false);
        loadBoardsMetadata();
        showToast('Caderno sincronizado com a sessão!');
      } else if (msg.gridType && msg.gridType !== gridMode) {
        applyGridPattern(msg.gridType, false);
      }

      if (Array.isArray(msg.elements)) {
        elements = msg.elements;
        elements.forEach(invalidateElementBBox);
        rehydrateImages();
        render();
      }
      break;
    }

    case 'board_clear': {
      if (msg.clientId === wsClientId) return;
      peerLiveStrokes.clear();
      elements = [];
      selectedElement = null;
      selectedElements = [];
      render();
      break;
    }
  }
}

// Broadcast throttle helpers
let lastBroadcastCursorX = -99999;
let lastBroadcastCursorY = -99999;

function broadcastCursor(x, y) {
  const now = Date.now();
  if (now - lastCursorBroadcastTime > 35) {
    const dx = x - lastBroadcastCursorX;
    const dy = y - lastBroadcastCursorY;
    if (dx * dx + dy * dy < 2.25) return;

    lastCursorBroadcastTime = now;
    lastBroadcastCursorX = x;
    lastBroadcastCursorY = y;
    sendWsMessage({
      type: 'cursor',
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      name: myUserName,
      color: myUserColor,
      tool: currentTool
    });
  }
}

function broadcastLiveStroke(pathEl) {
  const now = Date.now();
  if (now - lastStrokeBroadcastTime > 35) {
    lastStrokeBroadcastTime = now;
    sendWsMessage({
      type: 'stroke_live',
      tool: pathEl.tool || 'pen',
      color: pathEl.color,
      size: pathEl.size,
      points: pathEl.points
    });
  }
}

function broadcastElementAdd(el) {
  if (commitLocalAction()) return;
  if (!el) return;
  const clean = { ...el };
  delete clean.imgObj;
  sendWsMessage({
    type: 'element_add',
    element: clean
  });
}

function broadcastBoardSync() {
  if (commitLocalAction()) return;
  ensureElementIds();
  const cleanElements = elements.map(el => {
    const copy = { ...el };
    delete copy.imgObj;
    return copy;
  });
  sendWsMessage({
    type: 'board_sync',
    elements: cleanElements
  });
}

function broadcastBoardClear() {
  if (commitLocalAction()) return;
  sendWsMessage({
    type: 'board_clear'
  });
}

// Draw peer cursor on canvas
function drawPeerCursor(context, peer) {
  context.save();
  context.translate(peer.x, peer.y);

  // Scale inversely by zoom so cursor and label size stay constant in screen pixels
  const invZoom = 1 / zoom;
  context.scale(invZoom, invZoom);

  const color = peer.color || '#2563eb';

  // 1. Draw pointer arrow
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(0, 16);
  context.lineTo(4, 12);
  context.lineTo(8, 20);
  context.lineTo(11, 18.5);
  context.lineTo(7, 10.5);
  context.lineTo(12, 10.5);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;
  context.stroke();

  // 2. Draw name badge
  const name = peer.name || 'Amigo';
  context.font = '600 11px Inter, sans-serif';
  const textWidth = context.measureText(name).width;
  const tagX = 14;
  const tagY = 12;
  const tagW = Math.max(28, textWidth + 12);
  const tagH = 20;

  context.fillStyle = color;
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(tagX, tagY, tagW, tagH, 5);
  } else {
    context.rect(tagX, tagY, tagW, tagH);
  }
  context.fill();
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1;
  context.stroke();

  // 3. Draw text label
  context.fillStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(name, tagX + 6, tagY + tagH / 2);

  context.restore();
}

function updateCollabUI(count, isConnected) {
  if (collabBadge) {
    collabBadge.textContent = count;
    if (isConnected) {
      collabBadge.className = 'collab-badge connected';
      collabBadge.title = `${count} pessoa${count > 1 ? 's' : ''} na sessão colaborativa`;
    } else {
      collabBadge.className = 'collab-badge offline';
      collabBadge.title = 'Desconectado do servidor colaborativo';
    }
  }

  if (collabStatusText && collabStatusIndicator) {
    if (isConnected) {
      collabStatusIndicator.className = 'status-indicator online';
      collabStatusIndicator.innerHTML = '<span class="live-pulse-dot"></span>';
      collabStatusText.textContent = `Conectado em tempo real · ${count} participante${count > 1 ? 's' : ''} no quadro`;
    } else {
      collabStatusIndicator.className = 'status-indicator offline';
      collabStatusIndicator.innerHTML = '<span class="live-pulse-dot offline"></span>';
      collabStatusText.textContent = 'Servidor desconectado (tentando reconectar...)';
    }
  }
}

// Setup Collaboration Modal Events & Info
function setupCollabUI() {
  if (!btnCollaborate || !collabModal) return;

  btnCollaborate.addEventListener('click', openCollabModal);
  if (btnCloseCollab) btnCloseCollab.addEventListener('click', closeCollabModal);

  collabModal.addEventListener('click', (e) => {
    if (e.target === collabModal) closeCollabModal();
  });

  // Profile: username input
  if (collabUsernameInput) {
    collabUsernameInput.value = myUserName;
    collabUsernameInput.addEventListener('input', () => {
      const val = collabUsernameInput.value.trim();
      if (val) {
        myUserName = val;
        localStorage.setItem('whiteboard_username', myUserName);
        sendWsMessage({
          type: 'join',
          name: myUserName,
          color: myUserColor
        });
      }
    });
  }

  // Profile: color picker
  if (collabColorPicker) {
    const dots = collabColorPicker.querySelectorAll('.collab-color-dot');
    dots.forEach(d => {
      if (d.dataset.cursorColor === myUserColor) {
        d.classList.add('active');
      } else {
        d.classList.remove('active');
      }

      d.addEventListener('click', () => {
        dots.forEach(dot => dot.classList.remove('active'));
        d.classList.add('active');
        myUserColor = d.dataset.cursorColor;
        localStorage.setItem('whiteboard_usercolor', myUserColor);
        sendWsMessage({
          type: 'join',
          name: myUserName,
          color: myUserColor
        });
      });
    });
  }
}

async function openCollabModal() {
  if (!collabModal) return;
  collabModal.classList.add('open');

  // Fetch local LAN network info from server
  try {
    const res = await fetch('/api/network-info');
    if (res.ok) {
      const info = await res.json();
      if (collabLocalUrl && info.local_url) {
        collabLocalUrl.value = info.local_url;
      }
      if (info.clients_count !== undefined) {
        updateCollabUI(info.clients_count, wsConnected);
      }
    }
  } catch (err) {
    // Fallback to location.host
    if (collabLocalUrl) {
      collabLocalUrl.value = `http://${location.hostname}:${location.port || 8080}`;
    }
  }
}

function closeCollabModal() {
  if (collabModal) collabModal.classList.remove('open');
}

