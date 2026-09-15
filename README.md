# Collab Whiteboard — Lousa Digital & Hub de Estudos Colaborativo

O **Collab Whiteboard** é uma lousa interativa vetorial e ambiente de estudos universal, projetado para anotações, resolução de exercícios, diagramação técnica, fórmulas matemáticas e colaboração em tempo real via rede local ou Internet (Cloudflare Tunnel).

---

## Principais Recursos

### 1. Sistema de Cadernos por Matéria (Hub Universal)
* **Estrutura Flexível**: Crie matérias personalizadas (Cálculo, Física, Algoritmos, Arquitetura, etc.) com categorização própria.
* **Cadernos Múltiplos**: Cada disciplina pode conter múltiplos cadernos/quadros independentes.
* **Estilos de Grade por Caderno**:
  - **Grade Pontilhada** (`dots`): Padrão moderno ideal para diagramas de blocos e esquemáticos.
  - **Papel Milimetrado** (`graph`): Malha de 20px com linhas de apoio a cada 100px para gráficos de funções, geometria e circuitos.
  - **Caderno Pautado** (`ruled`): Linhas azuis horizontais com margem vermelha estilo caderno universitário para resumos textuais.
  - **Branco Liso** (`blank`): Tela limpa para apresentações e slides.

### 2. Colaboração Instantânea em 1 Clique (Cloudflare Tunnel)
* **Compartilhar Board**: Clique no botão **Compartilhar** na barra superior para expor a lousa para qualquer amigo pela Internet sem configurar portas no roteador e sem instalar nada.
* **Cópia Automática**: A URL segura (`https://xxxx.trycloudflare.com`) é copiada para a sua área de transferência.
* **Sincronização P2P**: Múltiplos alunos podem desenhar, mover elementos e visualizar ponteiros ao vivo simultaneamente.

### 3. Galeria de Materiais por Matéria
* **Segregação por Disciplina**: Cada matéria possui sua própria galeria de imagens, diagramas e enunciados.
* **Upload Fácil (Adicionar Material)**: Suba fotos de provas, PDFs, enunciados ou prints da aula.
* **Inserção Inteligente**: Clique em **Inserir no Quadro** para posicionar o material no centro do canvas ou ao lado dos desenhos existentes.
* **Drag & Drop**: Arraste imagens direto do seu computador para o quadro para carregar instantaneamente.

### 4. Ferramentas Universais de Canvas
* **Post-its / Notas Adesivas (Atalho `N`)**: Notas com cores pastéis (amarelo, azul, verde, rosa, roxo, laranja), dobra de papel e editor inline de texto por duplo clique.
* **Círculos / Elipses (Atalho `C`)**: Para nós de grafos, conjuntos de Venn e estados de autômatos (FSM).
* **Losangos / Decisões (Atalho `D`)**: Para testes lógicos (`if/else`) e fluxogramas.
* **Eixos Cartesianos X/Y (Atalho `X`)**: Desenho instantâneo de planos coordenados com marcações e setas para gráficos de funções.
* **Marca-Texto & Caneta Livre (`H` / `P`)**: Com estabilização anti-tremor (EMA).
* **Linhas e Setas (`L` / `A`)**: Para vetores, conexões e barramentos.
* **Borracha Vetorial Circular (`E`)**.

---

## Como Rodar o Projeto

### No Windows:
1. Dê duplo-clique no arquivo `start_whiteboard.bat`
2. Ou via terminal / PowerShell:
   ```powershell
   python start_whiteboard.py
   ```

### No Linux / macOS:
```bash
chmod +x start_whiteboard.sh
./start_whiteboard.sh
```

Acesse no navegador: **`http://localhost:8080`**

---

## Estrutura do Repositório

```
collab-whiteboard/
│
├── start_whiteboard.py             # Launcher do servidor
├── start_whiteboard.bat            # Atalho de execução Windows
├── start_whiteboard.sh             # Atalho de execução Linux/macOS
├── compartilhar.py                 # Utilitário de túnel Cloudflare
├── cloudflared.exe                 # Binário oficial portátil Cloudflare
│
├── whiteboard/                     # Core da Aplicação Web
│   ├── index.html                  # Interface do Whiteboard (responsiva)
│   ├── app.js                      # Motor do canvas, ferramentas e WebSockets
│   ├── style.css                   # Design system, grids e animações
│   ├── server.py                   # API FastAPI + WebSocket real-time
│   ├── boards/                     # Armazenamento de cadernos e metadata.json
│   ├── materials/                  # Galeria de materiais separada por matéria
│   ├── templates/                  # Diagramas base e esquemáticos
│   └── current_board.json          # Espelhamento do quadro ativo
│
├── materiais/                      # Materiais complementares de apoio
├── resumos/                        # Apostilas teóricas e resumos
└── ferramentas/                    # Scripts auxiliares de cálculo
```

---

## Tabela de Atalhos Rápidos

| Tecla | Ferramenta | Descrição |
| :---: | :---: | :--- |
| <kbd>V</kbd> / <kbd>S</kbd> | Seleção | Mover, redimensionar e selecionar em área |
| <kbd>P</kbd> | Caneta | Traço livre à mão com suavização |
| <kbd>H</kbd> | Marca-texto | Destaque translúcido |
| <kbd>R</kbd> | Retângulo | Blocos e caixas |
| <kbd>C</kbd> | Círculo | Círculos e elipses |
| <kbd>D</kbd> | Losango | Condições e fluxogramas |
| <kbd>X</kbd> | Eixos X/Y | Plano cartesiano |
| <kbd>N</kbd> | Post-it | Nota adesiva colorida |
| <kbd>T</kbd> | Texto | Rótulos e anotações |
| <kbd>A</kbd> | Seta | Vetores e barramentos direcionais |
| <kbd>L</kbd> | Linha | Fios e segmentos |
| <kbd>E</kbd> | Borracha | Apagar elementos |
| <kbd>Espaço</kbd> | Pan | Navegar pelo quadro infinito |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Desfazer | Desfaz a última ação |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> | Refazer | Refaz a ação desfeita |
| <kbd>Ctrl</kbd> + <kbd>V</kbd> | Colar | Cola imagens da área de transferência |


