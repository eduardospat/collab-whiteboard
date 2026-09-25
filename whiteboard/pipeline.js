/**
 * Simulador Interativo de Pipeline MIPS (5 Estagios)
 * Whiteboard Colaborativo - Arquitetura de Computadores
 * 
 * Funcionalidades:
 * - 5 Estagios classicos: IF, ID, EX, MEM, WB
 * - Suporte a instrucoes: ADD, SUB, AND, OR, SLT, LW, SW, BEQ, BNE, NOP/BOLHA
 * - Deteccao automatica de Hazards de Dados (RAW) e Hazards de Controle (Branch)
 * - Modo com e sem Forwarding (Adiantamento)
 * - Insercao manual e dinamica de Bolhas (Stalls) para resolucao didatica de conflitos
 * - Execucao passo a passo por ciclos (botoes de setinha <- e ->) e auto-play
 * - Tabela Espaco-Tempo (Ciclos x Instrucoes) interativa
 * - Visualizacao fisica do Datapath dos 5 estagios com fios de forwarding ativos
 * - Banco de registradores virtuais atualizado em tempo real
 * - Sincronizacao em tempo real entre todos os usuarios conectados via WebSocket
 * - Exportacao da tabela e do diagrama diretamente para o canvas do whiteboard
 */

(function (global) {
  'use strict';

  // Cenarios predefinidos baseados nas aulas e slides do Prof. Mateus Beck
  const PIPELINE_SCENARIOS = {
    raw_classic: {
      id: 'raw_classic',
      name: 'Slide 41 - Hazard RAW Classico (sub / and / or)',
      desc: 'Conflito de dados RAW no registrador $2. O sub escreve em $2 no estagio WB. Sem Forwarding, sao necessarias 2 bolhas. Com Forwarding, o dado e adiantado sem bolhas.',
      forwardingEnabled: false,
      instructions: [
        { id: 'inst-1', op: 'SUB', rd: '$2', rs: '$1', rt: '$3', offset: 0, isBubble: false },
        { id: 'inst-2', op: 'AND', rd: '$12', rs: '$2', rt: '$5', offset: 0, isBubble: false },
        { id: 'inst-3', op: 'OR', rd: '$13', rs: '$6', rt: '$2', offset: 0, isBubble: false },
        { id: 'inst-4', op: 'ADD', rd: '$14', rs: '$2', rt: '$2', offset: 0, isBubble: false },
        { id: 'inst-5', op: 'SW', rd: '$15', rs: '$2', rt: '$15', offset: 100, isBubble: false }
      ]
    },
    load_use: {
      id: 'load_use',
      name: 'Slide 71 - Hazard Load-Use (lw seguido de and)',
      desc: 'O dado lido pelo LW so sai da memoria no estagio MEM (fim do ciclo 4). Mesmo com Forwarding, 1 bolha e obrigatoria antes do AND poder usar o dado na ULA.',
      forwardingEnabled: true,
      instructions: [
        { id: 'inst-1', op: 'LW', rd: '$2', rs: '$1', rt: '$2', offset: 20, isBubble: false },
        { id: 'inst-2', op: 'AND', rd: '$4', rs: '$2', rt: '$5', offset: 0, isBubble: false },
        { id: 'inst-3', op: 'OR', rd: '$8', rs: '$2', rt: '$6', offset: 0, isBubble: false }
      ]
    },
    loop_exam: {
      id: 'loop_exam',
      name: 'Slide 180 - Exercicio de Prova (Cadeia de Loads e Stores)',
      desc: 'Exemplo tipico de avaliacao da UFSM. Multiplos acessos de memoria e operacoes aritmeticas encadeadas gerando conflitos de Load-Use.',
      forwardingEnabled: true,
      instructions: [
        { id: 'inst-1', op: 'LW', rd: '$t1', rs: '$t0', rt: '$t1', offset: 0, isBubble: false },
        { id: 'inst-2', op: 'LW', rd: '$t2', rs: '$t0', rt: '$t2', offset: 4, isBubble: false },
        { id: 'inst-3', op: 'ADD', rd: '$t3', rs: '$t1', rt: '$t2', offset: 0, isBubble: false },
        { id: 'inst-4', op: 'SW', rd: '$t3', rs: '$t0', rt: '$t3', offset: 12, isBubble: false },
        { id: 'inst-5', op: 'LW', rd: '$t4', rs: '$t0', rt: '$t4', offset: 8, isBubble: false },
        { id: 'inst-6', op: 'ADD', rd: '$t5', rs: '$t1', rt: '$t4', offset: 0, isBubble: false },
        { id: 'inst-7', op: 'SW', rd: '$t5', rs: '$t0', rt: '$t5', offset: 16, isBubble: false }
      ]
    },
    branch_hazard: {
      id: 'branch_hazard',
      name: 'Slide 98 - Hazard de Controle (Desvio BEQ)',
      desc: 'Desvio condicional tomado. Demonstra o custo em ciclos perdidos (flush) para esvaziar instrucoes buscadas especulativamente.',
      forwardingEnabled: true,
      instructions: [
        { id: 'inst-1', op: 'BEQ', rd: '', rs: '$1', rt: '$2', offset: 3, isBubble: false },
        { id: 'inst-2', op: 'ADD', rd: '$3', rs: '$4', rt: '$5', offset: 0, isBubble: false },
        { id: 'inst-3', op: 'SUB', rd: '$6', rs: '$7', rt: '$8', offset: 0, isBubble: false },
        { id: 'inst-4', op: 'OR', rd: '$9', rs: '$10', rt: '$11', offset: 0, isBubble: false }
      ]
    },
    ideal_clean: {
      id: 'ideal_clean',
      name: 'Execucao Ideal sem Conflitos (CPI = 1.0)',
      desc: 'Todas as instrucoes utilizam registradores independentes. O pipeline alcanca a taxa maxima ideal de 1 instrucao concluida por ciclo.',
      forwardingEnabled: true,
      instructions: [
        { id: 'inst-1', op: 'ADD', rd: '$1', rs: '$2', rt: '$3', offset: 0, isBubble: false },
        { id: 'inst-2', op: 'SUB', rd: '$4', rs: '$5', rt: '$6', offset: 0, isBubble: false },
        { id: 'inst-3', op: 'AND', rd: '$7', rs: '$8', rt: '$9', offset: 0, isBubble: false },
        { id: 'inst-4', op: 'OR', rd: '$10', rs: '$11', rt: '$12', offset: 0, isBubble: false }
      ]
    },
    custom: {
      id: 'custom',
      name: 'Personalizado (Montar programa livremente)',
      desc: 'Monte seu proprio codigo, insira bolhas e analise os estagios e hazards na pratica.',
      forwardingEnabled: false,
      instructions: [
        { id: 'inst-1', op: 'ADD', rd: '$1', rs: '$2', rt: '$3', offset: 0, isBubble: false },
        { id: 'inst-2', op: 'SUB', rd: '$4', rs: '$1', rt: '$5', offset: 0, isBubble: false }
      ]
    }
  };

  // Cores padrao dos estagios (elegantes e sem emojis)
  const STAGE_CONFIG = {
    IF: { label: 'IF', name: 'Busca (Instruction Fetch)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.16)', text: '#93c5fd' },
    ID: { label: 'ID', name: 'Decodificacao & Leitura Regs', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.16)', text: '#c4b5fd' },
    EX: { label: 'EX', name: 'Execucao / ULA / Endereco', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)', text: '#fde68a' },
    MEM: { label: 'MEM', name: 'Acesso a Memoria', color: '#10b981', bg: 'rgba(16, 185, 129, 0.16)', text: '#a7f3d0' },
    WB: { label: 'WB', name: 'Escrita no Registrador', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)', text: '#a5f3fc' },
    BOLHA: { label: 'STALL', name: 'Bolha / Espera de Pipeline', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.14)', text: '#fca5a5' }
  };

  // Estado Local do Simulador
  const state = {
    scenarioId: 'raw_classic',
    instructions: [],
    currentCycle: 0,
    maxCycles: 1,
    forwardingEnabled: false,
    autoStall: false,
    isPlaying: false,
    playSpeedMs: 1200,
    timerId: null,
    activeTab: 'datapath', // 'datapath', 'matrix', 'editor', 'theory'
    schedule: [], // Array de cronogramas por instrucao
    hazards: [],
    registers: {},
    isModalOpen: false
  };

  // ==================== Motor de Simulacao do Pipeline ====================

  function formatInstructionText(inst) {
    if (!inst) return '--';
    if (inst.isBubble) return 'BOLHA (STALL)';
    const op = (inst.op || 'ADD').toUpperCase();
    if (op === 'LW' || op === 'SW') {
      return `${op} ${inst.rd || inst.rt || '$0'}, ${inst.offset || 0}(${inst.rs || '$0'})`;
    }
    if (op === 'BEQ' || op === 'BNE') {
      return `${op} ${inst.rs || '$0'}, ${inst.rt || '$0'}, +${inst.offset || 1}`;
    }
    return `${op} ${inst.rd || '$0'}, ${inst.rs || '$0'}, ${inst.rt || '$0'}`;
  }

  function getRegistersRead(inst) {
    if (!inst || inst.isBubble) return [];
    const op = (inst.op || 'ADD').toUpperCase();
    if (op === 'LW') return [inst.rs];
    if (op === 'SW') return [inst.rs, inst.rt || inst.rd];
    if (op === 'BEQ' || op === 'BNE') return [inst.rs, inst.rt];
    return [inst.rs, inst.rt];
  }

  function getRegisterWritten(inst) {
    if (!inst || inst.isBubble) return null;
    const op = (inst.op || 'ADD').toUpperCase();
    if (op === 'SW' || op === 'BEQ' || op === 'BNE') return null;
    if (op === 'LW') return inst.rd || inst.rt;
    return inst.rd;
  }

  /**
   * Calcula o cronograma completo (espaco-tempo) de execucao de cada instrucao,
   * detectando hazards de dados (RAW) e inserindo stalls/bolhas conforme o modo.
   */
  function computeSchedule() {
    const list = state.instructions;
    const n = list.length;
    state.hazards = [];

    if (n === 0) {
      state.schedule = [];
      state.maxCycles = 1;
      return;
    }

    const schedule = [];
    let nextAvailableIfCycle = 1;

    for (let i = 0; i < n; i++) {
      const inst = list[i];
      let startCycle = nextAvailableIfCycle;

      if (inst.isBubble) {
        // Bolha manual inserida pelo usuario no programa
        schedule.push({
          instIndex: i,
          instruction: inst,
          isBubble: true,
          startCycle: startCycle,
          stages: {
            [startCycle]: 'BOLHA'
          },
          endCycle: startCycle
        });
        nextAvailableIfCycle = startCycle + 1;
        continue;
      }

      // Analise de Hazards com instrucoes anteriores
      let stallsNeeded = 0;
      const regsRead = getRegistersRead(inst);

      for (const reg of regsRead) {
        if (!reg || reg === '$0' || reg === '$zero') continue;

        // Procura para tras a instrucao mais recente que gravou neste registrador
        for (let j = i - 1; j >= 0; j--) {
          const prevInst = list[j];
          if (prevInst.isBubble) continue;

          const prevDest = getRegisterWritten(prevInst);
          if (prevDest === reg) {
            const prevSched = schedule[j];
            if (!prevSched) continue;

            const isLoad = (prevInst.op || '').toUpperCase() === 'LW';
            const prevWbCycle = prevSched.startCycle + 4; // IF=0, ID=1, EX=2, MEM=3, WB=4
            const prevExCycle = prevSched.startCycle + 2;
            const prevMemCycle = prevSched.startCycle + 3;

            if (!state.forwardingEnabled) {
              // Sem Forwarding: o dado so esta disponivel apos o WB do produtor
              // Como a escrita em WB ocorre na 1a metade do ciclo e a leitura em ID na 2a metade,
              // o estagio ID do consumidor pode coincidir com o WB do produtor:
              // startCycle + 1 >= prevWbCycle  =>  startCycle >= prevSched.startCycle + 3
              const minStartCycle = prevSched.startCycle + 3;
              if (startCycle < minStartCycle) {
                const diff = minStartCycle - startCycle;
                state.hazards.push({
                  type: 'RAW',
                  consumerIdx: i,
                  producerIdx: j,
                  consumerText: formatInstructionText(inst),
                  producerText: formatInstructionText(prevInst),
                  reg: reg,
                  diff: diff,
                  resolved: state.autoStall,
                  explanation: `Hazard de Dados (RAW): '${formatInstructionText(inst)}' le ${reg} antes que '${formatInstructionText(prevInst)}' escreva em WB. Sem Forwarding, sao necessarias ${diff} bolha(s).`
                });
                if (state.autoStall) {
                  stallsNeeded = Math.max(stallsNeeded, diff);
                }
              }
            } else {
              // Com Forwarding (Adiantamento)
              if (isLoad) {
                // Load-Use Hazard: dado do LW so sai no fim do estagio MEM (prevMemCycle).
                // O consumidor precisa dele no inicio do seu estagio EX (startCycle + 2).
                // Se startCycle + 2 <= prevMemCycle, precisamos de 1 stall!
                const minStartCycle = prevSched.startCycle + 2;
                if (startCycle < minStartCycle) {
                  state.hazards.push({
                    type: 'LOAD_USE',
                    consumerIdx: i,
                    producerIdx: j,
                    consumerText: formatInstructionText(inst),
                    producerText: formatInstructionText(prevInst),
                    reg: reg,
                    diff: 1,
                    resolved: state.autoStall,
                    explanation: `Hazard Load-Use: '${formatInstructionText(inst)}' precisa do dado de '${formatInstructionText(prevInst)}' na ULA, mas o dado so sai da memoria no fim de MEM. E obrigatoria 1 bolha de hardware.`
                  });
                  if (state.autoStall) {
                    stallsNeeded = Math.max(stallsNeeded, 1);
                  }
                }
              } else {
                // R-Type / ULA para ULA:
                // O dado sai de EX do produtor e pode ser adiantado para EX do consumidor sem bolhas!
              }
            }
            break; // Apenas o produtor mais recente dita a dependencia
          }
        }
      }

      startCycle += stallsNeeded;

      const instStages = {
        [startCycle]: 'IF',
        [startCycle + 1]: 'ID',
        [startCycle + 2]: 'EX',
        [startCycle + 3]: 'MEM',
        [startCycle + 4]: 'WB'
      };

      schedule.push({
        instIndex: i,
        instruction: inst,
        isBubble: false,
        startCycle: startCycle,
        stages: instStages,
        endCycle: startCycle + 4
      });

      nextAvailableIfCycle = startCycle + 1;
    }

    state.schedule = schedule;

    // Calcula maxCycles
    let maxC = 1;
    schedule.forEach(s => {
      if (s.endCycle > maxC) maxC = s.endCycle;
    });
    state.maxCycles = Math.max(5, maxC);

    if (state.currentCycle > state.maxCycles) {
      state.currentCycle = state.maxCycles;
    }
  }

  /**
   * Obtem o valor calculado por uma instrucao no pipeline
   */
  function getInstructionExecutionValue(instIndex) {
    if (instIndex < 0 || !state.instructions || instIndex >= state.instructions.length) return 0;
    const target = state.instructions[instIndex];
    if (!target || target.isBubble) return 0;

    const simRegs = {
      '$0': 0, '$zero': 0, '$1': 10, '$2': 20, '$3': 5, '$4': 15, '$5': 30, '$6': 40,
      '$t0': 100, '$t1': 1, '$t2': 2, '$t3': 3, '$t4': 4, '$t5': 5
    };

    for (let i = 0; i <= instIndex; i++) {
      const inst = state.instructions[i];
      if (!inst || inst.isBubble) continue;
      const op = (inst.op || 'ADD').toUpperCase();
      const rd = getRegisterWritten(inst);
      const rs = inst.rs;
      const rt = inst.rt;
      const valRs = simRegs[rs] !== undefined ? simRegs[rs] : 10;
      const valRt = simRegs[rt] !== undefined ? simRegs[rt] : 5;
      let res = 0;

      if (op === 'ADD') res = valRs + valRt;
      else if (op === 'SUB') res = valRs - valRt;
      else if (op === 'AND') res = valRs & valRt;
      else if (op === 'OR') res = valRs | valRt;
      else if (op === 'SLT') res = valRs < valRt ? 1 : 0;
      else if (op === 'LW') res = (valRs + (inst.offset || 0)) * 2;
      else if (op === 'SW') res = valRt;

      if (i === instIndex) return res;
      if (rd && rd !== '$0' && rd !== '$zero') simRegs[rd] = res;
    }

    return 0;
  }

  /**
   * Obtem o estado dos 5 estagios fisicos e detalhes didaticos dos fios de adiantamento no ciclo atual
   */
  function getCurrentStageState(cycle) {
    const res = {
      IF: null,
      ID: null,
      EX: null,
      MEM: null,
      WB: null,
      forwardA: {
        active: false,
        signal: '00',
        from: 'ID/EX',
        reg: '',
        freshVal: null,
        staleVal: null,
        producerInst: null,
        producerStage: null,
        consumerInst: null,
        desc: 'Operando A: Lido do Banco de Registradores (via ID/EX)',
        cCondition: 'Padrao: ForwardA = 0b00 (Banco de Registradores)',
        why: 'Sem necessidade de adiantamento para a Entrada A neste ciclo.',
        unresolvedHazard: false,
        hazardExplanation: ''
      },
      forwardB: {
        active: false,
        signal: '00',
        from: 'ID/EX',
        reg: '',
        freshVal: null,
        staleVal: null,
        producerInst: null,
        producerStage: null,
        consumerInst: null,
        desc: 'Operando B: Lido do Banco de Registradores (via ID/EX)',
        cCondition: 'Padrao: ForwardB = 0b00 (Banco de Registradores)',
        why: 'Sem necessidade de adiantamento para a Entrada B neste ciclo.',
        unresolvedHazard: false,
        hazardExplanation: ''
      }
    };

    if (cycle < 1 || !state.schedule) return res;

    state.schedule.forEach(s => {
      const stage = s.stages[cycle];
      if (stage && res[stage] === null) {
        res[stage] = {
          instruction: s.instruction,
          instIndex: s.instIndex,
          isBubble: s.isBubble,
          label: formatInstructionText(s.instruction)
        };
      }
    });

    // Se o estagio estiver vazio, preenche como inativo
    ['IF', 'ID', 'EX', 'MEM', 'WB'].forEach(st => {
      if (!res[st]) {
        res[st] = { label: '--', isBubble: false, empty: true };
      }
    });

    const regsAtCycle = computeRegisterValues(cycle);

    if (res.EX && !res.EX.empty && !res.EX.isBubble) {
      const exInst = res.EX.instruction;
      const exRead = getRegistersRead(exInst);
      const regA = exRead[0] || null;
      const regB = exRead[1] || null;

      if (regA) {
        res.forwardA.reg = regA;
        res.forwardA.staleVal = regsAtCycle[regA] !== undefined ? regsAtCycle[regA] : 0;
        res.forwardA.freshVal = res.forwardA.staleVal;
        res.forwardA.desc = `Entrada A: Lida do Banco de Registradores (via ID/EX: ${regA} = ${res.forwardA.staleVal})`;
        res.forwardA.cCondition = 'Padrao: ForwardA = 0b00 (Banco de Registradores)';
        res.forwardA.why = `A instrucao em EX le o registrador ${regA}. No ciclo atual, ele e suprido diretamente da leitura realizada no estagio ID.`;
      }

      if (regB) {
        res.forwardB.reg = regB;
        res.forwardB.staleVal = regsAtCycle[regB] !== undefined ? regsAtCycle[regB] : 0;
        res.forwardB.freshVal = res.forwardB.staleVal;
        res.forwardB.desc = `Entrada B: Lida do Banco de Registradores (via ID/EX: ${regB} = ${res.forwardB.staleVal})`;
        res.forwardB.cCondition = 'Padrao: ForwardB = 0b00 (Banco de Registradores)';
        res.forwardB.why = `A instrucao em EX le o registrador ${regB}. No ciclo atual, ele e suprido diretamente da leitura realizada no estagio ID.`;
      }

      if (state.forwardingEnabled) {
        // 1. Checa estagio MEM (Hazard de 1 ciclo - Prioridade EX/MEM)
        if (res.MEM && !res.MEM.empty && !res.MEM.isBubble) {
          const memInst = res.MEM.instruction;
          const memDest = getRegisterWritten(memInst);
          if (memDest && memDest !== '$0' && memDest !== '$zero') {
            const memVal = getInstructionExecutionValue(res.MEM.instIndex);
            if (regA === memDest) {
              res.forwardA.active = true;
              res.forwardA.signal = '10';
              res.forwardA.from = 'EX/MEM';
              res.forwardA.reg = memDest;
              res.forwardA.producerInst = memInst;
              res.forwardA.producerStage = 'MEM';
              res.forwardA.consumerInst = exInst;
              res.forwardA.freshVal = memVal;
              res.forwardA.desc = `Adiantamento de EX/MEM (${memDest} = ${memVal}) para Entrada A da ULA`;
              res.forwardA.cCondition = `if (EX_MEM.RegWrite && (EX_MEM.RegisterRd != 0) && (EX_MEM.RegisterRd == ID_EX.RegisterRs)) {\n    ForwardA = 0b10; // Adiantamento direto da saida EX/MEM\n}`;
              res.forwardA.why = `A instrucao em EX ('${formatInstructionText(exInst)}') necessita do registrador ${memDest}. A instrucao anterior ('${formatInstructionText(memInst)}') calculou esse valor no ciclo anterior e ele esta retido no registrador de pipeline EX/MEM. O sinal ForwardA = 10 comuta o Mux A da ULA para receber ${memVal} imediatamente sem esperar a escrita no banco!`;
            }
            if (regB === memDest) {
              res.forwardB.active = true;
              res.forwardB.signal = '10';
              res.forwardB.from = 'EX/MEM';
              res.forwardB.reg = memDest;
              res.forwardB.producerInst = memInst;
              res.forwardB.producerStage = 'MEM';
              res.forwardB.consumerInst = exInst;
              res.forwardB.freshVal = memVal;
              res.forwardB.desc = `Adiantamento de EX/MEM (${memDest} = ${memVal}) para Entrada B da ULA`;
              res.forwardB.cCondition = `if (EX_MEM.RegWrite && (EX_MEM.RegisterRd != 0) && (EX_MEM.RegisterRd == ID_EX.RegisterRt)) {\n    ForwardB = 0b10; // Adiantamento direto da saida EX/MEM\n}`;
              res.forwardB.why = `A instrucao em EX ('${formatInstructionText(exInst)}') necessita do registrador ${memDest}. A instrucao anterior ('${formatInstructionText(memInst)}') calculou esse valor no ciclo anterior e ele esta retido no registrador de pipeline EX/MEM. O sinal ForwardB = 10 comuta o Mux B da ULA para receber ${memVal} imediatamente sem esperar a escrita no banco!`;
            }
          }
        }

        // 2. Checa estagio WB (Hazard de 2 ciclos - Prioridade MEM/WB, somente se nao suprido por MEM)
        if (res.WB && !res.WB.empty && !res.WB.isBubble) {
          const wbInst = res.WB.instruction;
          const wbDest = getRegisterWritten(wbInst);
          if (wbDest && wbDest !== '$0' && wbDest !== '$zero') {
            const wbVal = getInstructionExecutionValue(res.WB.instIndex);
            if (regA === wbDest && !res.forwardA.active) {
              res.forwardA.active = true;
              res.forwardA.signal = '01';
              res.forwardA.from = 'MEM/WB';
              res.forwardA.reg = wbDest;
              res.forwardA.producerInst = wbInst;
              res.forwardA.producerStage = 'WB';
              res.forwardA.consumerInst = exInst;
              res.forwardA.freshVal = wbVal;
              res.forwardA.desc = `Adiantamento de MEM/WB (${wbDest} = ${wbVal}) para Entrada A da ULA`;
              res.forwardA.cCondition = `if (MEM_WB.RegWrite && (MEM_WB.RegisterRd != 0) && !(EX_MEM.RegWrite && ...) && (MEM_WB.RegisterRd == ID_EX.RegisterRs)) {\n    ForwardA = 0b01; // Adiantamento da saida MEM/WB\n}`;
              res.forwardA.why = `A instrucao em EX ('${formatInstructionText(exInst)}') necessita de ${wbDest}. A instrucao produtora ('${formatInstructionText(wbInst)}') esta em WB (executada ha 2 ciclos). O sinal ForwardA = 01 seleciona o registrador de pipeline MEM/WB, entregando o valor ${wbVal} antes da gravacao final no banco de registradores.`;
            }
            if (regB === wbDest && !res.forwardB.active) {
              res.forwardB.active = true;
              res.forwardB.signal = '01';
              res.forwardB.from = 'MEM/WB';
              res.forwardB.reg = wbDest;
              res.forwardB.producerInst = wbInst;
              res.forwardB.producerStage = 'WB';
              res.forwardB.consumerInst = exInst;
              res.forwardB.freshVal = wbVal;
              res.forwardB.desc = `Adiantamento de MEM/WB (${wbDest} = ${wbVal}) para Entrada B da ULA`;
              res.forwardB.cCondition = `if (MEM_WB.RegWrite && (MEM_WB.RegisterRd != 0) && !(EX_MEM.RegWrite && ...) && (MEM_WB.RegisterRd == ID_EX.RegisterRt)) {\n    ForwardB = 0b01; // Adiantamento da saida MEM/WB\n}`;
              res.forwardB.why = `A instrucao em EX ('${formatInstructionText(exInst)}') necessita de ${wbDest}. A instrucao produtora ('${formatInstructionText(wbInst)}') esta em WB (executada ha 2 ciclos). O sinal ForwardB = 01 seleciona o registrador de pipeline MEM/WB, entregando o valor ${wbVal} antes da gravacao final no banco de registradores.`;
            }
          }
        }
      } else {
        // Forwarding Desativado: verifica se haveria hazard RAW nao resolvido
        if (res.MEM && !res.MEM.empty && !res.MEM.isBubble) {
          const memDest = getRegisterWritten(res.MEM.instruction);
          if (memDest && (memDest === regA || memDest === regB)) {
            const fresh = getInstructionExecutionValue(res.MEM.instIndex);
            if (memDest === regA) {
              res.forwardA.unresolvedHazard = true;
              res.forwardA.freshVal = fresh;
              res.forwardA.hazardExplanation = `Hazard RAW ativo! Como o Forwarding esta DESLIGADO, ForwardA permanece em 00 e a ULA recebe o valor defasado (${res.forwardA.staleVal}) em vez de ${fresh}. Sao necessarias bolhas para evitar calculo incorreto!`;
            }
            if (memDest === regB) {
              res.forwardB.unresolvedHazard = true;
              res.forwardB.freshVal = fresh;
              res.forwardB.hazardExplanation = `Hazard RAW ativo! Como o Forwarding esta DESLIGADO, ForwardB permanece em 00 e a ULA recebe o valor defasado (${res.forwardB.staleVal}) em vez de ${fresh}. Sao necessarias bolhas para evitar calculo incorreto!`;
            }
          }
        }
        if (res.WB && !res.WB.empty && !res.WB.isBubble) {
          const wbDest = getRegisterWritten(res.WB.instruction);
          if (wbDest && (wbDest === regA || wbDest === regB)) {
            const fresh = getInstructionExecutionValue(res.WB.instIndex);
            if (wbDest === regA && !res.forwardA.unresolvedHazard) {
              res.forwardA.unresolvedHazard = true;
              res.forwardA.freshVal = fresh;
              res.forwardA.hazardExplanation = `Hazard RAW ativo de 2 ciclos! ForwardA permanece em 00 e a ULA recebe o valor defasado (${res.forwardA.staleVal}) em vez de ${fresh}.`;
            }
            if (wbDest === regB && !res.forwardB.unresolvedHazard) {
              res.forwardB.unresolvedHazard = true;
              res.forwardB.freshVal = fresh;
              res.forwardB.hazardExplanation = `Hazard RAW ativo de 2 ciclos! ForwardB permanece em 00 e a ULA recebe o valor defasado (${res.forwardB.staleVal}) em vez de ${fresh}.`;
            }
          }
        }
      }
    }

    return res;
  }

  /**
   * Simula valores nos registradores ate o ciclo atual
   */
  function computeRegisterValues(cycle) {
    const regs = {
      '$0': 0, '$1': 10, '$2': 20, '$3': 5, '$4': 15, '$5': 30, '$6': 40,
      '$t0': 100, '$t1': 1, '$t2': 2, '$t3': 3, '$t4': 4, '$t5': 5
    };

    if (cycle < 1 || !state.schedule) return regs;

    state.schedule.forEach(s => {
      // O registrador so e gravado quando a instrucao atinge o ciclo de WB
      const wbCycle = s.startCycle + 4;
      if (cycle >= wbCycle && !s.isBubble) {
        const inst = s.instruction;
        const op = (inst.op || 'ADD').toUpperCase();
        const rd = getRegisterWritten(inst);
        if (!rd || rd === '$0') return;

        const valRs = regs[inst.rs] !== undefined ? regs[inst.rs] : 10;
        const valRt = regs[inst.rt] !== undefined ? regs[inst.rt] : 5;

        if (op === 'ADD') regs[rd] = valRs + valRt;
        else if (op === 'SUB') regs[rd] = valRs - valRt;
        else if (op === 'AND') regs[rd] = valRs & valRt;
        else if (op === 'OR') regs[rd] = valRs | valRt;
        else if (op === 'SLT') regs[rd] = valRs < valRt ? 1 : 0;
        else if (op === 'LW') regs[rd] = (valRs + (inst.offset || 0)) * 2; // Valor simulado
      }
    });

    return regs;
  }

  // ==================== Acoes de Controle e Sincronizacao ====================

  function setCycle(cycle, notifyRemote = true) {
    state.currentCycle = Math.max(0, Math.min(state.maxCycles, cycle));
    renderSimulatorUI();

    if (notifyRemote) {
      broadcastPipelineAction('set_cycle', { cycle: state.currentCycle });
    }
  }

  function stepForward() {
    if (state.currentCycle < state.maxCycles) {
      setCycle(state.currentCycle + 1, true);
    } else {
      pauseAutoPlay();
    }
  }

  function stepBackward() {
    if (state.currentCycle > 0) {
      setCycle(state.currentCycle - 1, true);
    }
  }

  function resetSimulation() {
    pauseAutoPlay();
    setCycle(0, true);
  }

  function toggleAutoPlay() {
    if (state.isPlaying) {
      pauseAutoPlay();
    } else {
      startAutoPlay();
    }
  }

  function startAutoPlay() {
    state.isPlaying = true;
    updatePlayButtonUI();
    if (state.currentCycle >= state.maxCycles) {
      state.currentCycle = 0;
    }
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      if (state.currentCycle < state.maxCycles) {
        setCycle(state.currentCycle + 1, true);
      } else {
        pauseAutoPlay();
      }
    }, state.playSpeedMs);
  }

  function pauseAutoPlay() {
    state.isPlaying = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
    updatePlayButtonUI();
  }

  function toggleForwarding() {
    state.forwardingEnabled = !state.forwardingEnabled;
    computeSchedule();
    renderSimulatorUI();
    broadcastPipelineAction('toggle_forwarding', {
      forwardingEnabled: state.forwardingEnabled,
      instructions: state.instructions
    });
  }

  function toggleAutoStall() {
    state.autoStall = !state.autoStall;
    computeSchedule();
    renderSimulatorUI();
    broadcastPipelineAction('toggle_auto_stall', {
      autoStall: state.autoStall
    });
  }

  function loadScenario(scenarioId, notifyRemote = true) {
    pauseAutoPlay();
    const sc = PIPELINE_SCENARIOS[scenarioId] || PIPELINE_SCENARIOS.raw_classic;
    state.scenarioId = sc.id;
    state.forwardingEnabled = sc.forwardingEnabled !== undefined ? sc.forwardingEnabled : false;
    state.instructions = JSON.parse(JSON.stringify(sc.instructions));
    state.currentCycle = 0;
    computeSchedule();
    renderSimulatorUI();

    if (notifyRemote) {
      broadcastPipelineAction('load_scenario', {
        scenarioId: state.scenarioId,
        forwardingEnabled: state.forwardingEnabled,
        instructions: state.instructions
      });
    }
  }

  function insertBubbleAt(index, notifyRemote = true) {
    const bubble = {
      id: 'bubble-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      op: 'BOLHA',
      rd: '',
      rs: '',
      rt: '',
      offset: 0,
      isBubble: true
    };
    state.instructions.splice(index, 0, bubble);
    computeSchedule();
    renderSimulatorUI();

    if (notifyRemote) {
      broadcastPipelineAction('update_program', {
        instructions: state.instructions,
        forwardingEnabled: state.forwardingEnabled
      });
    }
  }

  function removeInstructionAt(index, notifyRemote = true) {
    if (index < 0 || index >= state.instructions.length) return;
    const target = state.instructions[index];
    if (state.instructions.length <= 1 && !target.isBubble) {
      alert('O programa deve conter ao menos uma instrucao.');
      return;
    }
    state.instructions.splice(index, 1);
    if (state.instructions.length === 0) {
      loadScenario(state.scenarioId || 'raw_classic', notifyRemote);
      return;
    }
    computeSchedule();
    renderSimulatorUI();

    if (notifyRemote) {
      broadcastPipelineAction('update_program', {
        instructions: state.instructions,
        forwardingEnabled: state.forwardingEnabled
      });
    }
  }

  function reorderInstruction(fromIndex, toIndex, notifyRemote = true) {
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= state.instructions.length) return;
    if (toIndex < 0) toIndex = 0;
    if (toIndex >= state.instructions.length) toIndex = state.instructions.length - 1;

    const [moved] = state.instructions.splice(fromIndex, 1);
    state.instructions.splice(toIndex, 0, moved);
    state.scenarioId = 'custom';
    computeSchedule();
    renderSimulatorUI();

    const label = moved.isBubble ? 'Bolha (Stall)' : formatInstructionText(moved);
    if (typeof global.showToast === 'function') {
      global.showToast(`'${label}' movida para a linha ${toIndex + 1}`);
    }

    if (notifyRemote) {
      broadcastPipelineAction('update_program', {
        instructions: state.instructions,
        forwardingEnabled: state.forwardingEnabled
      });
    }
  }

  function removeLastBubble(notifyRemote = true) {
    for (let i = state.instructions.length - 1; i >= 0; i--) {
      if (state.instructions[i].isBubble) {
        removeInstructionAt(i, notifyRemote);
        return true;
      }
    }
    return false;
  }

  function removeAllBubbles(notifyRemote = true) {
    const originalCount = state.instructions.length;
    const filtered = state.instructions.filter(i => !i.isBubble);
    if (filtered.length === originalCount) return;
    if (filtered.length === 0) {
      loadScenario(state.scenarioId || 'raw_classic', notifyRemote);
      return;
    }
    state.instructions = filtered;
    computeSchedule();
    renderSimulatorUI();

    if (notifyRemote) {
      broadcastPipelineAction('update_program', {
        instructions: state.instructions,
        forwardingEnabled: state.forwardingEnabled
      });
    }
  }

  function addCustomInstruction(op, rd, rs, rt, offset, notifyRemote = true) {
    const newInst = {
      id: 'inst-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      op: op.toUpperCase(),
      rd: rd.trim(),
      rs: rs.trim(),
      rt: rt.trim(),
      offset: parseInt(offset, 10) || 0,
      isBubble: false
    };
    state.instructions.push(newInst);
    state.scenarioId = 'custom';
    computeSchedule();
    renderSimulatorUI();

    if (notifyRemote) {
      broadcastPipelineAction('update_program', {
        scenarioId: 'custom',
        instructions: state.instructions,
        forwardingEnabled: state.forwardingEnabled
      });
    }
  }

  function autoResolveBubbles(notifyRemote = true) {
    // Insere automaticamente as bolhas necessarias para sanar todos os hazards
    if (state.hazards.length === 0) {
      alert('Nao ha hazards pendentes no programa atual!');
      return;
    }

    const cleaned = state.instructions.filter(i => !i.isBubble);
    let modified = [...cleaned];
    let added = true;

    // Itera ate resolver
    let loops = 0;
    while (added && loops < 10) {
      loops++;
      state.instructions = modified;
      computeSchedule();
      if (state.hazards.length === 0) break;

      const h = state.hazards[0];
      const targetIdx = h.consumerIdx;
      const bubble = {
        id: 'bubble-auto-' + Date.now() + '-' + loops,
        op: 'BOLHA',
        rd: '',
        rs: '',
        rt: '',
        offset: 0,
        isBubble: true
      };
      modified.splice(targetIdx, 0, bubble);
    }

    state.instructions = modified;
    computeSchedule();
    renderSimulatorUI();

    if (notifyRemote) {
      broadcastPipelineAction('update_program', {
        instructions: state.instructions,
        forwardingEnabled: state.forwardingEnabled
      });
    }
  }

  // ==================== Sincronizacao WebSocket ====================

  function broadcastPipelineAction(action, data) {
    if (typeof global.sendWsMessage === 'function') {
      global.sendWsMessage({
        type: 'pipeline_action',
        action: action,
        state: {
          scenarioId: state.scenarioId,
          instructions: state.instructions,
          currentCycle: state.currentCycle,
          forwardingEnabled: state.forwardingEnabled,
          autoStall: state.autoStall,
          isPlaying: state.isPlaying
        },
        data: data
      });
    }
  }

  function handleRemotePipelineSync(msg) {
    if (!msg || !msg.state) return;
    const remote = msg.state;

    if (remote.scenarioId) state.scenarioId = remote.scenarioId;
    if (Array.isArray(remote.instructions)) state.instructions = remote.instructions;
    if (remote.forwardingEnabled !== undefined) state.forwardingEnabled = remote.forwardingEnabled;
    if (remote.autoStall !== undefined) state.autoStall = remote.autoStall;

    computeSchedule();

    if (remote.currentCycle !== undefined) {
      state.currentCycle = Math.min(state.maxCycles, remote.currentCycle);
    }

    renderSimulatorUI();

    const author = msg.authorName || 'Colega';
    if (typeof global.showToast === 'function') {
      if (msg.action === 'set_cycle') {
        global.showToast(`${author} avancou o pipeline para o Ciclo ${state.currentCycle}`);
      } else if (msg.action === 'toggle_forwarding') {
        global.showToast(`${author} alterou o Forwarding para: ${state.forwardingEnabled ? 'Ativado' : 'Desativado'}`);
      } else if (msg.action === 'update_program' || msg.action === 'load_scenario') {
        global.showToast(`${author} atualizou o programa do pipeline`);
      }
    }
  }

  // ==================== Exportacao para o Whiteboard Canvas ====================

  function exportPipelineToCanvas() {
    let origin;
    if (typeof global.getViewCenter === 'function') {
      origin = global.getViewCenter();
    } else if (typeof global.screenToCanvas === 'function') {
      const wrap = document.getElementById('canvasWrapper') || document.getElementById('canvas-container') || document.body;
      const w = wrap.clientWidth || window.innerWidth;
      const h = wrap.clientHeight || window.innerHeight;
      origin = global.screenToCanvas(w / 2, h / 2);
    } else {
      origin = { x: 400, y: 300 };
    }

    if (!origin || isNaN(origin.x) || isNaN(origin.y)) {
      origin = { x: 400, y: 300 };
    }

    const rowHeight = 36;
    const colWidth = 58;
    const numInsts = (state.schedule && state.schedule.length > 0) ? state.schedule.length : state.instructions.length;
    const totalCols = Math.min(14, Math.max(state.maxCycles || 5, 5));

    const totalWidth = 190 + totalCols * colWidth;
    const startX = Math.round(origin.x - totalWidth / 2);
    const startY = Math.round(origin.y - (50 + numInsts * rowHeight + 35) / 2);

    const newElements = [];
    const now = Date.now();

    // 1. Cabecalho / Cartao de Titulo do Pipeline
    newElements.push({
      id: `pipe-title-${now}`,
      type: 'rect',
      x1: startX - 10,
      y1: startY - 48,
      x2: startX + totalWidth + 10,
      y2: startY - 8,
      fill: '#1e293b',
      color: '#3b82f6',
      size: 2
    });

    const scenarioName = (PIPELINE_SCENARIOS[state.scenarioId]?.name || 'Programa Personalizado').split('(')[0].trim();
    newElements.push({
      id: `pipe-title-text-${now}`,
      type: 'text',
      x: startX + 10,
      y: startY - 38,
      text: `Pipeline MIPS (5 Estagios) · ${scenarioName} · ${state.forwardingEnabled ? 'Com Forwarding' : 'Sem Forwarding'}`,
      color: '#ffffff',
      fontSize: 13
    });

    // 2. Cabecalho de Colunas (Ciclos)
    for (let c = 1; c <= totalCols; c++) {
      const colX = startX + 180 + (c - 1) * colWidth;
      const isCur = c === state.currentCycle;
      newElements.push({
        id: `pipe-head-${c}-${now}`,
        type: 'rect',
        x1: colX,
        y1: startY,
        x2: colX + colWidth - 4,
        y2: startY + 26,
        fill: isCur ? '#2563eb' : '#334155',
        color: isCur ? '#60a5fa' : '#475569',
        size: 1.5
      });
      newElements.push({
        id: `pipe-head-txt-${c}-${now}`,
        type: 'text',
        x: colX + (c >= 10 ? 14 : 18),
        y: startY + 6,
        text: `C${c}`,
        color: '#ffffff',
        fontSize: 12
      });
    }

    // 3. Linhas de Instrucoes
    for (let r = 0; r < numInsts; r++) {
      const s = state.schedule[r] || { instruction: state.instructions[r], isBubble: state.instructions[r]?.isBubble, stages: {} };
      const rowY = startY + 32 + r * rowHeight;
      const isBubble = !!s.isBubble;

      // Caixa da Instrucao
      newElements.push({
        id: `pipe-inst-box-${r}-${now}`,
        type: 'rect',
        x1: startX,
        y1: rowY,
        x2: startX + 172,
        y2: rowY + rowHeight - 6,
        fill: isBubble ? '#7f1d1d' : '#1e293b',
        color: isBubble ? '#ef4444' : '#475569',
        size: 1.5
      });

      newElements.push({
        id: `pipe-inst-txt-${r}-${now}`,
        type: 'text',
        x: startX + 10,
        y: rowY + 6,
        text: isBubble ? 'STALL / BOLHA' : formatInstructionText(s.instruction),
        color: isBubble ? '#fca5a5' : '#ffffff',
        fontSize: 11
      });

      // Celulas de estagios
      for (let c = 1; c <= totalCols; c++) {
        const stage = s.stages ? s.stages[c] : null;
        const colX = startX + 180 + (c - 1) * colWidth;

        if (stage) {
          const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG.BOLHA;
          newElements.push({
            id: `pipe-stage-${r}-${c}-${now}`,
            type: 'rect',
            x1: colX,
            y1: rowY,
            x2: colX + colWidth - 4,
            y2: rowY + rowHeight - 6,
            fill: cfg.color,
            color: cfg.color,
            size: 1
          });
          newElements.push({
            id: `pipe-stage-txt-${r}-${c}-${now}`,
            type: 'text',
            x: colX + (stage.length === 2 ? 18 : 12),
            y: rowY + 6,
            text: stage,
            color: '#ffffff',
            fontSize: 11
          });
        }
      }
    }

    // 4. Cartao de Rodape / Legenda
    const footerY = startY + 32 + numInsts * rowHeight;
    newElements.push({
      id: `pipe-footer-${now}`,
      type: 'rect',
      x1: startX,
      y1: footerY,
      x2: startX + totalWidth,
      y2: footerY + 24,
      fill: '#0f172a',
      color: '#334155',
      size: 1
    });

    newElements.push({
      id: `pipe-footer-txt-${now}`,
      type: 'text',
      x: startX + 10,
      y: footerY + 5,
      text: `Ciclo Atual: C${state.currentCycle} · Total: ${state.maxCycles} Ciclos · Adiantamento: ${state.forwardingEnabled ? 'Ativo' : 'Desativado'}`,
      color: '#94a3b8',
      fontSize: 10
    });

    // 5. Adiciona elementos ao canvas do whiteboard
    if (typeof global.addElementsToBoard === 'function') {
      global.addElementsToBoard(newElements, true);
    } else if (global.elements && Array.isArray(global.elements)) {
      newElements.forEach(el => {
        global.elements.push(el);
        if (typeof global.broadcastElementAdd === 'function') global.broadcastElementAdd(el);
      });
      if (typeof global.setSelectedElements === 'function') global.setSelectedElements(newElements);
      if (typeof global.render === 'function') global.render();
      if (typeof global.scheduleAutoSave === 'function') global.scheduleAutoSave();
      if (typeof global.broadcastBoardSync === 'function') global.broadcastBoardSync();
    } else {
      alert('Whiteboard canvas nao acessivel para exportacao.');
      return;
    }

    if (typeof global.showToast === 'function') {
      global.showToast('Diagrama do pipeline copiado para o quadro branco!');
    }

    closeModal();
  }


  // ==================== Interface Grafica (HTML & Renderizacao) ====================

  function buildModalHTML() {
    const existing = document.getElementById('pipelineModal');
    if (existing) return;

    const modal = document.createElement('div');
    modal.id = 'pipelineModal';
    modal.className = 'pipeline-modal-overlay';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="pipeline-modal-card" id="pipelineModalCard">
        <!-- Top Header -->
        <div class="pipeline-header">
          <div class="pipeline-title-group">
            <div class="pipeline-badge-title">
              <svg class="ui-icon" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="6" y1="8" x2="6" y2="12"/><line x1="10" y1="8" x2="10" y2="12"/><line x1="14" y1="8" x2="14" y2="12"/><line x1="18" y1="8" x2="18" y2="12"/></svg>
              <h2>Simulador de Pipeline MIPS · 5 Estagios</h2>
            </div>
            <span class="pipeline-sync-badge">Sincronizado na Sessao</span>
          </div>
          <div class="pipeline-window-controls">
            <button id="btnPipelineExportCanvas" class="pipeline-action-btn secondary" title="Desenhar diagrama diretamente no quadro branco">
              <svg class="ui-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
              <span>Copiar para o Quadro</span>
            </button>
            <button id="btnPipelineClose" class="pipeline-close-btn" title="Fechar simulador">&times;</button>
          </div>
        </div>

        <!-- Toolbar Superior de Controle -->
        <div class="pipeline-toolbar">
          <div class="pipeline-toolbar-left">
            <div class="pipeline-control-item">
              <label for="pipelineScenarioSelect">Cenario / Exercicio:</label>
              <select id="pipelineScenarioSelect" class="pipeline-select">
                <option value="raw_classic">Slide 41: Hazard RAW Classico (sub / and / or)</option>
                <option value="load_use">Slide 71: Hazard Load-Use (lw seguido de and)</option>
                <option value="loop_exam">Slide 180: Exercicio de Prova (Loads & Stores)</option>
                <option value="branch_hazard">Slide 98: Hazard de Controle (Desvio BEQ)</option>
                <option value="ideal_clean">Execucao Ideal sem Hazards</option>
                <option value="custom">Personalizado (Editor Livre)</option>
              </select>
            </div>

            <div class="pipeline-control-item">
              <button id="btnPipelineForwardingToggle" class="pipeline-toggle-btn" title="Alternar Adiantamento de Hardware">
                <span class="toggle-indicator" id="forwardingIndicator"></span>
                <span id="forwardingBtnText">Adiantamento: Desligado</span>
              </button>
            </div>
          </div>

          <!-- Botoes de Passo de Ciclo -->
          <div class="pipeline-toolbar-center">
            <button id="btnPipelinePrev" class="pipeline-step-btn" title="Ciclo Anterior (Seta Esquerda)">
              <svg class="ui-icon" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="pipeline-cycle-counter">
              <span class="cycle-label">Ciclo</span>
              <span class="cycle-val" id="pipelineCurrentCycleText">0</span>
              <span class="cycle-total" id="pipelineTotalCyclesText">/ 5</span>
            </div>
            <button id="btnPipelineNext" class="pipeline-step-btn primary" title="Proximo Ciclo (Seta Direita / Espaco)">
              <svg class="ui-icon" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            <button id="btnPipelinePlay" class="pipeline-step-btn" title="Execucao Automatica">
              <svg id="pipelinePlayIcon" class="ui-icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <button id="btnPipelineReset" class="pipeline-step-btn" title="Reiniciar para o Ciclo 0">
              <svg class="ui-icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
          </div>

          <div class="pipeline-toolbar-right">
            <button id="btnPipelineQuickBubble" class="pipeline-action-btn warning" title="Inserir uma bolha imediatamente no programa">
              <svg class="ui-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>+ Inserir Bolha</span>
            </button>
            <button id="btnPipelineRemoveBubble" class="pipeline-action-btn danger" title="Remover a ultima bolha inserida">
              <svg class="ui-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>- Remover Bolha</span>
            </button>
          </div>
        </div>

        <!-- Banner de Diagnostico de Hazards / Alertas Educativos -->
        <div id="pipelineHazardBanner" class="pipeline-hazard-banner">
          <!-- Atualizado via JS -->
        </div>

        <!-- Abas de Navegacao -->
        <div class="pipeline-tabs">
          <button class="pipeline-tab-btn active" data-tab="datapath">Datapath dos 5 Estagios</button>
          <button class="pipeline-tab-btn" data-tab="matrix">Tabela Espaco-Tempo (Ciclos x Instrucoes)</button>
          <button class="pipeline-tab-btn" data-tab="editor">Editor de Instrucoes & Bolhas</button>
          <button class="pipeline-tab-btn" data-tab="theory">Teoria & Resumo da Aula</button>
        </div>

        <!-- Conteudo das Abas -->
        <div class="pipeline-body">
          <!-- Aba 1: Datapath dos 5 Estagios Físicos -->
          <div id="tabDatapath" class="pipeline-tab-pane active">
            <div class="pipeline-datapath-container">
              <div class="datapath-flow" id="datapathFlow">
                <!-- 5 Caixas dos Estagios construidas dinamicamente -->
              </div>
              <div id="forwardingWires" class="forwarding-wires-box">
                <!-- Fios de Adiantamento ativos -->
              </div>
            </div>

            <!-- Painel de Registradores Virtuais -->
            <div class="pipeline-regs-panel">
              <div class="regs-panel-header">
                <h3>Banco de Registradores Virtuais (Valores no Ciclo Atual)</h3>
                <span class="regs-tip">Atualizado no fim do estagio WB</span>
              </div>
              <div class="regs-grid" id="pipelineRegsGrid">
                <!-- Valores preenchidos dinamicamente -->
              </div>
            </div>
          </div>

          <!-- Aba 2: Tabela Espaco-Tempo -->
          <div id="tabMatrix" class="pipeline-tab-pane">
            <div class="matrix-controls-bar">
              <span>Legenda: 
                <span class="legend-badge if">IF: Busca</span>
                <span class="legend-badge id">ID: Decodificacao</span>
                <span class="legend-badge ex">EX: Execucao</span>
                <span class="legend-badge mem">MEM: Memoria</span>
                <span class="legend-badge wb">WB: Gravacao</span>
                <span class="legend-badge stall">BOLHA / STALL</span>
              </span>
              <div class="matrix-controls-buttons">
                <button id="btnPipelineAutoResolve" class="pipeline-action-btn secondary small" title="Adiciona bolhas automaticamente nas posicoes necessarias">
                  Resolver Conflitos com Bolhas
                </button>
                <button id="btnPipelineClearAllBubbles" class="pipeline-action-btn secondary small" title="Remove todas as bolhas do programa">
                  Limpar Todas as Bolhas
                </button>
              </div>
            </div>
            <div class="pipeline-matrix-scroller" id="pipelineMatrixContainer">
              <!-- Matriz dinamica -->
            </div>
          </div>

          <!-- Aba 3: Editor de Instrucoes -->
          <div id="tabEditor" class="pipeline-tab-pane">
            <div class="editor-layout">
              <div class="editor-form-card">
                <h3>Adicionar Nova Instrucao</h3>
                <form id="pipelineAddInstForm" class="pipeline-form">
                  <div class="form-row">
                    <label>Operacao (Opcode):</label>
                    <select id="formInstOp" class="pipeline-select">
                      <option value="ADD">ADD (R-Type: Rd = Rs + Rt)</option>
                      <option value="SUB">SUB (R-Type: Rd = Rs - Rt)</option>
                      <option value="AND">AND (R-Type: Rd = Rs & Rt)</option>
                      <option value="OR">OR (R-Type: Rd = Rs | Rt)</option>
                      <option value="SLT">SLT (R-Type: Rd = Rs < Rt)</option>
                      <option value="LW">LW (Load: Rt = Mem[Rs + Offset])</option>
                      <option value="SW">SW (Store: Mem[Rs + Offset] = Rt)</option>
                      <option value="BEQ">BEQ (Branch: Se Rs == Rt desvia)</option>
                    </select>
                  </div>
                  <div class="form-row three-cols">
                    <div>
                      <label id="lblRd">Rd / Rt (Destino):</label>
                      <input type="text" id="formInstRd" class="pipeline-input" value="$1" placeholder="$1 ou $t0">
                    </div>
                    <div>
                      <label id="lblRs">Rs (Fonte 1):</label>
                      <input type="text" id="formInstRs" class="pipeline-input" value="$2" placeholder="$2 ou $t1">
                    </div>
                    <div>
                      <label id="lblRt">Rt / Offset:</label>
                      <input type="text" id="formInstRt" class="pipeline-input" value="$3" placeholder="$3 ou 100">
                    </div>
                  </div>
                  <button type="submit" class="pipeline-action-btn primary full">Adicionar Instrucao ao Programa</button>
                </form>
              </div>

              <div class="editor-list-card">
                <h3>Programa Atual (<span id="programInstCount">0</span> instrucoes)</h3>
                <div class="program-list" id="pipelineProgramList">
                  <!-- Lista dinamica com botoes de bolha e remover -->
                </div>
              </div>
            </div>
          </div>

          <!-- Aba 4: Teoria & Resumo da Aula -->
          <div id="tabTheory" class="pipeline-tab-pane">
            <div class="theory-content">
              <h3>Resumo do Pipeline MIPS de 5 Estagios (Prof. Mateus Beck)</h3>
              <p>O pipelining e uma tecnica de implementacao em que multiplas instrucoes sao sobrepostas em execucao simultanea, divididas em estagios independentes desacoplados por registradores de pipeline:</p>
              
              <div class="theory-stages-cards">
                <div class="theory-card">
                  <div class="theory-card-head if">1. IF - Busca (Instruction Fetch)</div>
                  <p>O PC aponta para a instrucao na Memoria de Instrucoes. O PC e incrementado (PC + 4) e armazenado no registrador IF/ID.</p>
                </div>
                <div class="theory-card">
                  <div class="theory-card-head id">2. ID - Decodificacao & Leitura</div>
                  <p>Decodifica opcode/funct, le registradores fontes Rs e Rt do Banco de Registradores e realiza extensao de sinal do imediato.</p>
                </div>
                <div class="theory-card">
                  <div class="theory-card-head ex">3. EX - Execucao / ULA</div>
                  <p>A ULA realiza a operacao aritmetica/logica, calcula o endereco efetivo da memoria (base + offset) ou o endereco de desvio.</p>
                </div>
                <div class="theory-card">
                  <div class="theory-card-head mem">4. MEM - Acesso a Memoria</div>
                  <p>Realiza leitura (LW) ou escrita (SW) na Memoria de Dados. Instrucoes aritmeticas apenas passam adiante o resultado.</p>
                </div>
                <div class="theory-card">
                  <div class="theory-card-head wb">5. WB - Gravacao (Write Back)</div>
                  <p>Escreve o resultado no Banco de Registradores (Rd ou Rt). A escrita ocorre na primeira metade do ciclo de clock.</p>
                </div>
              </div>

              <h3>Tipos de Hazards (Conflitos de Paralelismo)</h3>
              <ul>
                <li><strong>Hazard de Dados (RAW - Read After Write):</strong> Uma instrucao depende do resultado de uma instrucao anterior que ainda nao foi gravada no banco. <em>Solucao:</em> Inserir bolhas (stalls) ou usar Adiantamento (Forwarding).</li>
                <li><strong>Hazard Load-Use:</strong> Caso especial em que uma instrucao depende imediatamente do resultado de um <code>LW</code>. Como o dado so sai da memoria no estagio MEM, mesmo com Forwarding e <strong>obrigatorio 1 ciclo de bolha (stall)</strong>.</li>
                <li><strong>Hazard de Controle (Branch):</strong> A decisao de desvio (BEQ/BNE) so e conhecida apos avaliar a condicao, enquanto o pipeline ja buscou as proximas instrucoes sequenciais. Se o branch for tomado, essas instrucoes devem ser descartadas (flush / bolhas).</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Barra Inferior de Metricas de Desempenho -->
        <div class="pipeline-footer-metrics">
          <div class="metric-item">
            <span class="metric-label">Instrucoes Uteis:</span>
            <span class="metric-val" id="metricInstCount">0</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Ciclos Totais:</span>
            <span class="metric-val" id="metricCycleCount">0</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Bolhas / Stalls:</span>
            <span class="metric-val" id="metricBubbleCount">0</span>
          </div>
          <div class="metric-item highlight">
            <span class="metric-label">CPI (Ciclos Por Instrucao):</span>
            <span class="metric-val" id="metricCpi">1.00</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Speedup vs Monociclo:</span>
            <span class="metric-val" id="metricSpeedup">~4.2x</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    attachModalEvents();
  }

  function attachModalEvents() {
    // Fechar Modal
    const btnClose = document.getElementById('btnPipelineClose');
    if (btnClose) btnClose.addEventListener('click', closeModal);

    // Fechar ao clicar fora do card
    const modal = document.getElementById('pipelineModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // Seletor de Cenario
    const select = document.getElementById('pipelineScenarioSelect');
    if (select) {
      select.addEventListener('change', (e) => {
        loadScenario(e.target.value, true);
      });
    }

    // Toggle de Forwarding
    const btnFwd = document.getElementById('btnPipelineForwardingToggle');
    if (btnFwd) btnFwd.addEventListener('click', toggleForwarding);

    // Controles de Passo
    const btnNext = document.getElementById('btnPipelineNext');
    if (btnNext) btnNext.addEventListener('click', stepForward);

    const btnPrev = document.getElementById('btnPipelinePrev');
    if (btnPrev) btnPrev.addEventListener('click', stepBackward);

    const btnPlay = document.getElementById('btnPipelinePlay');
    if (btnPlay) btnPlay.addEventListener('click', toggleAutoPlay);

    const btnReset = document.getElementById('btnPipelineReset');
    if (btnReset) btnReset.addEventListener('click', resetSimulation);

    // Bolha rapida (clique ou arraste para soltar diretamente na tabela)
    const btnQuickBubble = document.getElementById('btnPipelineQuickBubble');
    if (btnQuickBubble) {
      btnQuickBubble.setAttribute('draggable', 'true');
      btnQuickBubble.setAttribute('title', 'Inserir uma bolha ou arraste e solte diretamente na posicao desejada da tabela/editor');
      btnQuickBubble.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/pipeline-inst-idx', 'quick-bubble');
        e.dataTransfer.effectAllowed = 'copy';
      });
      btnQuickBubble.addEventListener('click', () => {
        insertBubbleAt(state.instructions.length > 0 ? 1 : 0, true);
      });
    }

    // Remover ultima bolha rapida
    const btnRemoveBubble = document.getElementById('btnPipelineRemoveBubble');
    if (btnRemoveBubble) {
      btnRemoveBubble.addEventListener('click', () => {
        const removed = removeLastBubble(true);
        if (!removed) {
          alert('Nao ha bolhas para remover no programa atual.');
        }
      });
    }

    // Auto Resolver Bolhas
    const btnAutoResolve = document.getElementById('btnPipelineAutoResolve');
    if (btnAutoResolve) {
      btnAutoResolve.addEventListener('click', () => {
        autoResolveBubbles(true);
      });
    }

    // Limpar Todas as Bolhas
    const btnClearBubbles = document.getElementById('btnPipelineClearAllBubbles');
    if (btnClearBubbles) {
      btnClearBubbles.addEventListener('click', () => {
        removeAllBubbles(true);
      });
    }

    // Exportar para o canvas
    const btnExport = document.getElementById('btnPipelineExportCanvas');
    if (btnExport) btnExport.addEventListener('click', exportPipelineToCanvas);

    // Navegacao por Abas
    const tabBtns = document.querySelectorAll('.pipeline-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        state.activeTab = tab;
        document.querySelectorAll('.pipeline-tab-pane').forEach(p => p.classList.remove('active'));
        const pane = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
        if (pane) pane.classList.add('active');
      });
    });

    // Formulario de Adicionar Instrucao
    const form = document.getElementById('pipelineAddInstForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const op = document.getElementById('formInstOp').value;
        const rd = document.getElementById('formInstRd').value;
        const rs = document.getElementById('formInstRs').value;
        const rt = document.getElementById('formInstRt').value;
        addCustomInstruction(op, rd, rs, rt, 0, true);
      });
    }

    // Atalhos de teclado quando o modal esta aberto
    window.addEventListener('keydown', (e) => {
      if (!state.isModalOpen) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        stepForward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetSimulation();
      } else if (e.key === 'Escape') {
        closeModal();
      }
    });
  }

  function openModal() {
    buildModalHTML();
    const modal = document.getElementById('pipelineModal');
    if (modal) {
      modal.style.display = 'flex';
      state.isModalOpen = true;
      if (state.instructions.length === 0) {
        loadScenario('raw_classic', false);
      } else {
        computeSchedule();
        renderSimulatorUI();
      }
    }
  }

  function closeModal() {
    pauseAutoPlay();
    const modal = document.getElementById('pipelineModal');
    if (modal) {
      modal.style.display = 'none';
      state.isModalOpen = false;
    }
  }

  function updatePlayButtonUI() {
    const icon = document.getElementById('pipelinePlayIcon');
    if (!icon) return;
    if (state.isPlaying) {
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    } else {
      icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    }
  }

  // ==================== Renderizacao Dinamica da Interface ====================

  function renderSimulatorUI() {
    const modal = document.getElementById('pipelineModal');
    if (!modal || modal.style.display === 'none') return;

    // 1. Atualiza Seletor de Cenario
    const select = document.getElementById('pipelineScenarioSelect');
    if (select && select.value !== state.scenarioId) {
      select.value = state.scenarioId;
    }

    // 2. Atualiza Botao de Forwarding
    const fwdBtn = document.getElementById('btnPipelineForwardingToggle');
    const fwdText = document.getElementById('forwardingBtnText');
    const fwdIndicator = document.getElementById('forwardingIndicator');
    if (fwdBtn && fwdText && fwdIndicator) {
      if (state.forwardingEnabled) {
        fwdBtn.classList.add('active');
        fwdText.textContent = 'Adiantamento (Forwarding): Ativado';
      } else {
        fwdBtn.classList.remove('active');
        fwdText.textContent = 'Adiantamento (Forwarding): Desligado';
      }
    }

    // 3. Atualiza Contador de Ciclo
    const curTxt = document.getElementById('pipelineCurrentCycleText');
    const totTxt = document.getElementById('pipelineTotalCyclesText');
    if (curTxt) curTxt.textContent = state.currentCycle;
    if (totTxt) totTxt.textContent = `/ ${state.maxCycles}`;

    // Atualiza estado dos botoes de remocao de bolha
    const hasBubbles = state.instructions.some(i => i.isBubble);
    const btnRemoveBubble = document.getElementById('btnPipelineRemoveBubble');
    if (btnRemoveBubble) {
      btnRemoveBubble.disabled = !hasBubbles;
      btnRemoveBubble.style.opacity = hasBubbles ? '1' : '0.4';
      btnRemoveBubble.style.cursor = hasBubbles ? 'pointer' : 'not-allowed';
    }
    const btnClearBubbles = document.getElementById('btnPipelineClearAllBubbles');
    if (btnClearBubbles) {
      btnClearBubbles.disabled = !hasBubbles;
      btnClearBubbles.style.opacity = hasBubbles ? '1' : '0.4';
      btnClearBubbles.style.cursor = hasBubbles ? 'pointer' : 'not-allowed';
    }

    // 4. Banner de Diagnostico de Hazards
    renderHazardBanner();

    // 5. Datapath dos 5 Estagios
    renderDatapathFlow();

    // 6. Banco de Registradores
    renderRegistersGrid();

    // 7. Tabela Espaco-Tempo
    renderSpaceTimeMatrix();

    // 8. Lista do Programa no Editor
    renderProgramList();

    // 9. Metricas de Desempenho
    renderMetrics();
  }

  function renderHazardBanner() {
    const banner = document.getElementById('pipelineHazardBanner');
    if (!banner) return;

    if (state.hazards.length === 0) {
      const hasBubbles = state.instructions.some(i => i.isBubble);
      banner.className = 'pipeline-hazard-banner success';
      banner.innerHTML = `
        <div class="hazard-icon">
          <svg class="ui-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="hazard-info">
          <strong>Nenhum Hazard Detectado!</strong>
          <span>O programa executa com integridade de dados ${state.forwardingEnabled ? 'utilizando Adiantamento (Forwarding)' : (hasBubbles ? 'atraves das bolhas inseridas' : 'sem necessidade de bolhas')}.</span>
        </div>
        ${hasBubbles ? `
        <div class="hazard-action">
          <button id="btnBannerClearBubbles" class="pipeline-action-btn secondary small" title="Remover todas as bolhas para testar novamente">Remover Bolhas</button>
        </div>
        ` : ''}
      `;
      const btnClear = document.getElementById('btnBannerClearBubbles');
      if (btnClear) {
        btnClear.addEventListener('click', () => {
          removeAllBubbles(true);
        });
      }
    } else {
      const h = state.hazards[0];
      banner.className = 'pipeline-hazard-banner warning';
      banner.innerHTML = `
        <div class="hazard-icon">
          <svg class="ui-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="hazard-info">
          <strong>Conflito Detectado (${h.type}):</strong>
          <span>${h.explanation}</span>
        </div>
        <div class="hazard-action">
          <button id="btnBannerFix" class="pipeline-action-btn primary small">Inserir ${h.diff} Bolha(s)</button>
        </div>
      `;
      const btnFix = document.getElementById('btnBannerFix');
      if (btnFix) {
        btnFix.addEventListener('click', () => {
          for (let b = 0; b < h.diff; b++) {
            insertBubbleAt(h.consumerIdx, false);
          }
          computeSchedule();
          renderSimulatorUI();
          broadcastPipelineAction('update_program', {
            instructions: state.instructions,
            forwardingEnabled: state.forwardingEnabled
          });
        });
      }
    }
  }

  function renderDatapathFlow() {
    const flow = document.getElementById('datapathFlow');
    const wires = document.getElementById('forwardingWires');
    if (!flow) return;

    const cur = getCurrentStageState(state.currentCycle);
    const stages = ['IF', 'ID', 'EX', 'MEM', 'WB'];

    let html = '';
    stages.forEach((st, idx) => {
      const info = cur[st];
      const cfg = STAGE_CONFIG[st];
      const isBubble = info && info.isBubble;
      const isEmpty = !info || info.empty;

      let cardClass = 'datapath-stage-card';
      if (isBubble) cardClass += ' bubble';
      if (isEmpty) cardClass += ' empty';

      html += `
        <div class="${cardClass}" style="border-top-color: ${cfg.color}">
          <div class="stage-tag" style="background:${cfg.bg}; color:${cfg.text}">${cfg.label}</div>
          <div class="stage-name">${cfg.name.split('(')[0]}</div>
          <div class="stage-instruction-box">
            <span class="inst-label">${isBubble ? 'STALL / BOLHA' : (info ? info.label : '--')}</span>
          </div>
          <div class="stage-subtext">${isEmpty ? 'Inativo no ciclo' : (isBubble ? 'Sinais zerados' : 'Processando')}</div>
        </div>
      `;

      if (idx < stages.length - 1) {
        const regName = `${st}/${stages[idx + 1]}`;
        html += `
          <div class="datapath-reg-divider">
            <div class="pipe-reg-box">${regName}</div>
            <div class="pipe-arrow">
              <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </div>
          </div>
        `;
      }
    });

    flow.innerHTML = html;

    // Inspetor Didatico de Forwarding (Design Limpo e Intuitivo)
    if (wires) {
      const fwdA = cur.forwardA || { active: false, signal: '00', from: 'ID/EX', reg: '', freshVal: null, staleVal: null };
      const fwdB = cur.forwardB || { active: false, signal: '00', from: 'ID/EX', reg: '', freshVal: null, staleVal: null };
      const hasActive = fwdA.active || fwdB.active;
      const isEnabled = state.forwardingEnabled;
      const cycle = state.currentCycle;

      let statusClass = 'disabled';
      let statusText = 'Forwarding Desativado';
      if (isEnabled) {
        if (hasActive) {
          statusClass = 'active';
          statusText = `Adiantamento Ativo no Ciclo C${cycle}`;
        } else {
          statusClass = 'idle';
          statusText = `Sem Conflito no Ciclo C${cycle} (00, 00)`;
        }
      } else if (fwdA.unresolvedHazard || fwdB.unresolvedHazard) {
        statusClass = 'disabled';
        statusText = `Hazard RAW Ativo (Sem Forwarding!)`;
      }

      let wireHtml = `
        <div class="forwarding-clean-container">
          <!-- Barra Superior: Titulo e Estados dos Sinais -->
          <div class="fwd-summary-bar">
            <div class="fwd-title-area">
              <span class="fwd-chip-label">Forwarding Unit</span>
              <span class="fwd-cycle-text">Ciclo <strong>C${cycle}</strong> &middot; Instrucao EX: <code>${cur.EX && !cur.EX.empty ? cur.EX.label : 'Nenhuma'}</code></span>
            </div>
            <div class="fwd-signals-group">
              <span class="fwd-signal-badge ${fwdA.active ? 'active' : ''}">ForwardA: <strong>${fwdA.signal}</strong> (${fwdA.from})</span>
              <span class="fwd-signal-badge ${fwdB.active ? 'active' : ''}">ForwardB: <strong>${fwdB.signal}</strong> (${fwdB.from})</span>
              <span class="fwd-status-pill ${statusClass}">${statusText}</span>
            </div>
          </div>

          <!-- Esquemático dos Multiplexadores da ULA -->
          <div class="fwd-hardware-grid">
            <!-- Mux A (Operando Rs) -->
            <div class="fwd-mux-block ${fwdA.active ? 'active' : ''}">
              <div class="mux-block-header">
                <span class="mux-tag">MUX A</span>
                <span class="mux-reg-target">Entrada Rs: <code>${fwdA.reg || '--'}</code></span>
                <span class="mux-sig-value">Sinal: <strong>ForwardA = ${fwdA.signal}</strong></span>
              </div>
              <div class="mux-sources-row">
                <div class="mux-source-pill ${fwdA.signal === '00' ? 'selected' : 'dimmed'}">
                  <span class="sig-num">00</span>
                  <span class="sig-name">Banco ID/EX</span>
                  <span class="sig-val">${fwdA.staleVal !== null ? fwdA.staleVal : '--'}</span>
                </div>
                <div class="mux-source-pill ${fwdA.signal === '10' ? 'selected active-fwd' : 'dimmed'}">
                  <span class="sig-num">10</span>
                  <span class="sig-name">Fio EX/MEM (1 ciclo)</span>
                  <span class="sig-val">${fwdA.signal === '10' ? fwdA.freshVal : (cur.MEM && !cur.MEM.empty ? getInstructionExecutionValue(cur.MEM.instIndex) : '--')}</span>
                </div>
                <div class="mux-source-pill ${fwdA.signal === '01' ? 'selected active-fwd' : 'dimmed'}">
                  <span class="sig-num">01</span>
                  <span class="sig-name">Fio MEM/WB (2 ciclos)</span>
                  <span class="sig-val">${fwdA.signal === '01' ? fwdA.freshVal : (cur.WB && !cur.WB.empty ? getInstructionExecutionValue(cur.WB.instIndex) : '--')}</span>
                </div>
              </div>
              <div class="mux-output-wire ${fwdA.active ? 'wire-active' : ''}">
                <span>Saida Mux A &rarr; Entrada Superior da ULA:</span>
                <strong class="wire-val">${fwdA.active ? fwdA.freshVal : (fwdA.staleVal !== null ? fwdA.staleVal : '--')}</strong>
                ${fwdA.active ? '<span class="wire-gain">Adiantado sem bolha</span>' : ''}
                ${fwdA.unresolvedHazard ? '<span class="wire-hazard">Dado Defasado (RAW)!</span>' : ''}
              </div>
            </div>

            <!-- Mux B (Operando Rt) -->
            <div class="fwd-mux-block ${fwdB.active ? 'active' : ''}">
              <div class="mux-block-header">
                <span class="mux-tag">MUX B</span>
                <span class="mux-reg-target">Entrada Rt: <code>${fwdB.reg || '--'}</code></span>
                <span class="mux-sig-value">Sinal: <strong>ForwardB = ${fwdB.signal}</strong></span>
              </div>
              <div class="mux-sources-row">
                <div class="mux-source-pill ${fwdB.signal === '00' ? 'selected' : 'dimmed'}">
                  <span class="sig-num">00</span>
                  <span class="sig-name">Banco ID/EX</span>
                  <span class="sig-val">${fwdB.staleVal !== null ? fwdB.staleVal : '--'}</span>
                </div>
                <div class="mux-source-pill ${fwdB.signal === '10' ? 'selected active-fwd' : 'dimmed'}">
                  <span class="sig-num">10</span>
                  <span class="sig-name">Fio EX/MEM (1 ciclo)</span>
                  <span class="sig-val">${fwdB.signal === '10' ? fwdB.freshVal : (cur.MEM && !cur.MEM.empty ? getInstructionExecutionValue(cur.MEM.instIndex) : '--')}</span>
                </div>
                <div class="mux-source-pill ${fwdB.signal === '01' ? 'selected active-fwd' : 'dimmed'}">
                  <span class="sig-num">01</span>
                  <span class="sig-name">Fio MEM/WB (2 ciclos)</span>
                  <span class="sig-val">${fwdB.signal === '01' ? fwdB.freshVal : (cur.WB && !cur.WB.empty ? getInstructionExecutionValue(cur.WB.instIndex) : '--')}</span>
                </div>
              </div>
              <div class="mux-output-wire ${fwdB.active ? 'wire-active' : ''}">
                <span>Saida Mux B &rarr; Entrada Inferior da ULA:</span>
                <strong class="wire-val">${fwdB.active ? fwdB.freshVal : (fwdB.staleVal !== null ? fwdB.staleVal : '--')}</strong>
                ${fwdB.active ? '<span class="wire-gain">Adiantado sem bolha</span>' : ''}
                ${fwdB.unresolvedHazard ? '<span class="wire-hazard">Dado Defasado (RAW)!</span>' : ''}
              </div>
            </div>
          </div>

          <!-- Didática Direta: Explicação Clara e Sucinta -->
          <div class="fwd-clean-insight ${hasActive ? 'active' : (fwdA.unresolvedHazard || fwdB.unresolvedHazard ? 'hazard' : 'normal')}">
            <div class="insight-text">
              ${hasActive ? `
                <strong>Adiantamento em Acao:</strong> ${fwdA.active ? `O registrador <code>${fwdA.reg}</code> foi adiantado de <code>${fwdA.from}</code> para a Entrada A da ULA.` : ''} ${fwdB.active ? `O registrador <code>${fwdB.reg}</code> foi adiantado de <code>${fwdB.from}</code> para a Entrada B da ULA.` : ''} A instrucao executa no ciclo correto sem necessitar de bolhas.
              ` : (isEnabled ? `
                <strong>Operacao Padrao:</strong> Sem dependencias pendentes neste ciclo. Os multiplexadores enviam a leitura comum do Banco de Registradores diretamente para a ULA.
              ` : `
                <strong>Forwarding Desativado:</strong> Multiplexadores fixos em 00. ${fwdA.unresolvedHazard || fwdB.unresolvedHazard ? 'Conflito RAW detectado! Sem bolhas inseridas, o calculo usara valores antigos.' : 'Nenhum conflito imediato neste ciclo.'}
              `)}
            </div>
            <button id="btnToggleFwdCode" class="fwd-clean-toggle" title="Ver equacoes e codigo em C da prova">
              <span>Ver Codigo em C da Prova</span>
              <svg class="ui-icon chevron-icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>

          <!-- Codigo em C da Prova 2 UFSM (Opcional Expansivel) -->
          <div id="fwdCodeBox" class="fwd-c-logic-box" style="display:none;">
            <div class="fwd-c-code">/* Unidade de Forwarding (UFSM / Patterson & Hennessy) */
// 1. Hazard EX (1 ciclo de distancia):
if (EX_MEM.RegWrite && (EX_MEM.RegisterRd != 0) && (EX_MEM.RegisterRd == ID_EX.RegisterRs)) {
    ForwardA = 0b10; // Adiantamento de EX/MEM -> Entrada A da ULA
}
if (EX_MEM.RegWrite && (EX_MEM.RegisterRd != 0) && (EX_MEM.RegisterRd == ID_EX.RegisterRt)) {
    ForwardB = 0b10; // Adiantamento de EX/MEM -> Entrada B da ULA
}

// 2. Hazard MEM (2 ciclos de distancia):
if (MEM_WB.RegWrite && (MEM_WB.RegisterRd != 0) &&
    !(EX_MEM.RegWrite && (EX_MEM.RegisterRd != 0) && (EX_MEM.RegisterRd == ID_EX.RegisterRs)) &&
    (MEM_WB.RegisterRd == ID_EX.RegisterRs)) {
    ForwardA = 0b01; // Adiantamento de MEM/WB -> Entrada A da ULA
}
if (MEM_WB.RegWrite && (MEM_WB.RegisterRd != 0) &&
    !(EX_MEM.RegWrite && (EX_MEM.RegisterRd != 0) && (EX_MEM.RegisterRd == ID_EX.RegisterRt)) &&
    (MEM_WB.RegisterRd == ID_EX.RegisterRt)) {
    ForwardB = 0b01; // Adiantamento de MEM/WB -> Entrada B da ULA
}</div>
          </div>
        </div>
      `;

      wires.innerHTML = wireHtml;

      const btnToggle = document.getElementById('btnToggleFwdCode');
      const codeBox = document.getElementById('fwdCodeBox');
      if (btnToggle && codeBox) {
        btnToggle.addEventListener('click', () => {
          const isHidden = codeBox.style.display === 'none';
          codeBox.style.display = isHidden ? 'block' : 'none';
          btnToggle.querySelector('span').textContent = isHidden ? 'Ocultar Codigo em C' : 'Ver Codigo em C da Prova';
        });
      }
    }
  }

  function renderRegistersGrid() {
    const grid = document.getElementById('pipelineRegsGrid');
    if (!grid) return;

    const regs = computeRegisterValues(state.currentCycle);
    const displayRegs = ['$1', '$2', '$3', '$4', '$5', '$6', '$t0', '$t1', '$t2', '$t3'];

    let html = '';
    displayRegs.forEach(r => {
      const val = regs[r] !== undefined ? regs[r] : 0;
      html += `
        <div class="reg-chip">
          <span class="reg-name">${r}</span>
          <span class="reg-val">${val}</span>
        </div>
      `;
    });
    grid.innerHTML = html;
  }

  function renderSpaceTimeMatrix() {
    const container = document.getElementById('pipelineMatrixContainer');
    if (!container) return;

    const numInsts = state.schedule.length;
    const totalCols = Math.max(state.maxCycles, 8);

    let html = '<table class="pipeline-matrix-table"><thead><tr>';
    html += '<th class="drag-col-header" title="Arraste para reordenar instrucoes e bolhas">Mover</th>';
    html += '<th class="inst-col-header">Instrucao</th>';
    html += '<th class="action-col-header">Acao</th>';

    for (let c = 1; c <= totalCols; c++) {
      const isCur = c === state.currentCycle;
      html += `<th class="cycle-col-header ${isCur ? 'current' : ''}" data-cycle="${c}" style="cursor:pointer;" title="Clique para inspecionar o Ciclo ${c}">C${c}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let r = 0; r < numInsts; r++) {
      const s = state.schedule[r];
      const isBubble = s.isBubble;
      const prevIsBubble = r > 0 && state.instructions[r - 1] && state.instructions[r - 1].isBubble;

      html += `<tr class="matrix-row ${isBubble ? 'bubble' : ''}" draggable="true" data-inst-idx="${s.instIndex}">`;
      html += `<td class="matrix-drag-cell" title="Arraste para reposicionar no cronograma">
        <span class="matrix-drag-grip">
          <svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        </span>
      </td>`;
      html += `<td class="inst-name-cell ${isBubble ? 'bubble' : ''}">${formatInstructionText(s.instruction)}</td>`;
      html += `<td class="inst-action-cell">
        <div class="matrix-actions-group">`;
      if (isBubble) {
        html += `<button class="matrix-btn-remove-bubble" data-idx="${s.instIndex}" title="Remover esta bolha">&times; Remover Bolha</button>`;
      } else {
        html += `<button class="matrix-btn-bubble" data-row="${r}" title="Inserir bolha antes desta instrucao">+ Bolha</button>`;
        if (prevIsBubble) {
          html += `<button class="matrix-btn-remove-bubble small" data-idx="${r - 1}" title="Remover a bolha que precede esta instrucao">- Bolha</button>`;
        }
      }
      html += `</div>
      </td>`;

      for (let c = 1; c <= totalCols; c++) {
        const isCur = c === state.currentCycle;
        const stage = s.stages[c];

        if (stage) {
          const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG.BOLHA;
          let fwdBadgeHtml = '';

          // Badges de Forwarding na celula EX
          if (stage === 'EX' && state.forwardingEnabled) {
            const cycleState = getCurrentStageState(c);
            const fwdList = [];
            if (cycleState.forwardA && cycleState.forwardA.active && cycleState.forwardA.consumerInst === s.instruction) {
              fwdList.push(`A:${cycleState.forwardA.reg}(${cycleState.forwardA.from})`);
            }
            if (cycleState.forwardB && cycleState.forwardB.active && cycleState.forwardB.consumerInst === s.instruction) {
              fwdList.push(`B:${cycleState.forwardB.reg}(${cycleState.forwardB.from})`);
            }
            if (fwdList.length > 0) {
              fwdBadgeHtml = `<span class="matrix-fwd-badge" data-cycle="${c}" title="Adiantamento no Ciclo ${c}: ${fwdList.join(' | ')}">FWD ${fwdList.join(', ')}</span>`;
            }
          }

          html += `<td class="matrix-stage-cell ${isCur ? 'current' : ''}" data-cycle="${c}" style="cursor:pointer;" title="Ciclo ${c}: ${stage} - Clique para inspecionar">
            <span class="matrix-stage-badge" style="background:${cfg.bg}; color:${cfg.text}; border:1px solid ${cfg.color}">${stage}</span>
            ${fwdBadgeHtml}
          </td>`;
        } else {
          html += `<td class="matrix-empty-cell ${isCur ? 'current' : ''}" data-cycle="${c}" style="cursor:pointer;" title="Ciclo ${c}: Inativo">·</td>`;
        }
      }
      html += `</tr>`;
    }

    html += '</tbody></table>';
    container.innerHTML = html;

    // Botoes de clique rapido de Ciclo na Matriz
    container.querySelectorAll('[data-cycle]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        // Nao intercepta cliques nos botoes de acao
        if (e.target.closest('button')) return;
        const cyc = parseInt(cell.getAttribute('data-cycle'), 10);
        if (!isNaN(cyc)) {
          setCycle(cyc, true);
        }
      });
    });

    // Conecta botoes de inserir bolha na tabela
    container.querySelectorAll('.matrix-btn-bubble').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = parseInt(btn.getAttribute('data-row'), 10);
        insertBubbleAt(row, true);
      });
    });

    // Conecta botoes de remover bolha na tabela
    container.querySelectorAll('.matrix-btn-remove-bubble').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        removeInstructionAt(idx, true);
      });
    });

    // Drag-and-Drop nas linhas da Matriz Espaco-Tempo
    const rows = container.querySelectorAll('.matrix-row');
    rows.forEach(row => {
      row.addEventListener('dragstart', (e) => {
        const idx = row.getAttribute('data-inst-idx');
        e.dataTransfer.setData('text/pipeline-inst-idx', idx);
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('is-dragging');
      });

      row.addEventListener('dragend', () => {
        rows.forEach(r => r.classList.remove('is-dragging', 'drag-target-above', 'drag-target-below'));
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          row.classList.add('drag-target-above');
          row.classList.remove('drag-target-below');
        } else {
          row.classList.add('drag-target-below');
          row.classList.remove('drag-target-above');
        }
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-target-above', 'drag-target-below');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-target-above', 'drag-target-below');
        const dragData = e.dataTransfer.getData('text/pipeline-inst-idx');
        const targetIdx = parseInt(row.getAttribute('data-inst-idx'), 10);
        const rect = row.getBoundingClientRect();
        const isBelow = e.clientY >= rect.top + rect.height / 2;
        let insertPos = isBelow ? targetIdx + 1 : targetIdx;

        if (dragData === 'quick-bubble') {
          insertBubbleAt(insertPos, true);
          return;
        }

        const fromIdx = parseInt(dragData, 10);
        if (isNaN(fromIdx)) return;

        if (fromIdx < insertPos) {
          insertPos--;
        }
        reorderInstruction(fromIdx, insertPos, true);
      });
    });
  }

  function renderProgramList() {
    const listEl = document.getElementById('pipelineProgramList');
    const countEl = document.getElementById('programInstCount');
    if (!listEl) return;

    countEl.textContent = state.instructions.length;

    let html = '';
    state.instructions.forEach((inst, idx) => {
      const isBubble = inst.isBubble;
      html += `
        <div class="program-item ${isBubble ? 'bubble' : ''}" draggable="true" data-prog-idx="${idx}">
          <span class="prog-drag-handle" title="Arraste para mover no programa">
            <svg class="ui-icon drag-icon" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
          </span>
          <span class="inst-idx">${idx + 1}.</span>
          <span class="inst-code">${formatInstructionText(inst)}</span>
          <div class="item-actions">
            ${isBubble ? `
              <button class="prog-btn-del bubble" data-idx="${idx}" title="Remover esta bolha">&times; Remover Bolha</button>
            ` : `
              <button class="prog-btn-bubble" data-idx="${idx}" title="Inserir bolha antes desta">+ Bolha</button>
              <button class="prog-btn-del" data-idx="${idx}" title="Remover">&times;</button>
            `}
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll('.prog-btn-bubble').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        insertBubbleAt(idx, true);
      });
    });

    listEl.querySelectorAll('.prog-btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        removeInstructionAt(idx, true);
      });
    });

    // Drag-and-Drop nos itens do Editor de Programa
    const items = listEl.querySelectorAll('.program-item');
    items.forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const idx = item.getAttribute('data-prog-idx');
        e.dataTransfer.setData('text/pipeline-inst-idx', idx);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('is-dragging');
      });

      item.addEventListener('dragend', () => {
        items.forEach(it => it.classList.remove('is-dragging', 'drag-target-above', 'drag-target-below'));
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          item.classList.add('drag-target-above');
          item.classList.remove('drag-target-below');
        } else {
          item.classList.add('drag-target-below');
          item.classList.remove('drag-target-above');
        }
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-target-above', 'drag-target-below');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-target-above', 'drag-target-below');
        const dragData = e.dataTransfer.getData('text/pipeline-inst-idx');
        const targetIdx = parseInt(item.getAttribute('data-prog-idx'), 10);
        const rect = item.getBoundingClientRect();
        const isBelow = e.clientY >= rect.top + rect.height / 2;
        let insertPos = isBelow ? targetIdx + 1 : targetIdx;

        if (dragData === 'quick-bubble') {
          insertBubbleAt(insertPos, true);
          return;
        }

        const fromIdx = parseInt(dragData, 10);
        if (isNaN(fromIdx)) return;

        if (fromIdx < insertPos) {
          insertPos--;
        }
        reorderInstruction(fromIdx, insertPos, true);
      });
    });
  }

  function renderMetrics() {
    const nonBubbles = state.instructions.filter(i => !i.isBubble).length;
    const bubbles = state.instructions.filter(i => i.isBubble).length;
    const totalCycles = state.maxCycles;
    const cpi = nonBubbles > 0 ? (totalCycles / nonBubbles).toFixed(2) : '1.00';
    const speedup = nonBubbles > 0 ? (5 / parseFloat(cpi)).toFixed(1) : '1.0';

    const elInst = document.getElementById('metricInstCount');
    const elCyc = document.getElementById('metricCycleCount');
    const elBub = document.getElementById('metricBubbleCount');
    const elCpi = document.getElementById('metricCpi');
    const elSpd = document.getElementById('metricSpeedup');

    if (elInst) elInst.textContent = nonBubbles;
    if (elCyc) elCyc.textContent = totalCycles;
    if (elBub) elBub.textContent = bubbles;
    if (elCpi) elCpi.textContent = cpi;
    if (elSpd) elSpd.textContent = `~${speedup}x`;
  }

  // ==================== Inicializacao Global ====================

  function init() {
    // Escuta evento global de websocket se existir
    if (typeof global.registerPipelineHandler === 'function') {
      global.registerPipelineHandler(handleRemotePipelineSync);
    }

    // Inicializa cenario padrao
    loadScenario('raw_classic', false);
  }

  // Exporta funcoes publicas
  global.PipelineSimulator = {
    init: init,
    open: openModal,
    close: closeModal,
    stepForward: stepForward,
    stepBackward: stepBackward,
    reset: resetSimulation,
    toggleForwarding: toggleForwarding,
    loadScenario: loadScenario,
    insertBubbleAt: insertBubbleAt,
    removeInstructionAt: removeInstructionAt,
    removeLastBubble: removeLastBubble,
    removeAllBubbles: removeAllBubbles,
    reorderInstruction: reorderInstruction,
    getCurrentStageState: getCurrentStageState,
    handleRemoteSync: handleRemotePipelineSync,
    getState: () => state
  };

  // Auto-init ao carregar o script
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
