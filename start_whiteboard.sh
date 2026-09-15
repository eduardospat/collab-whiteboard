#!/usr/bin/env bash
# ==============================================================================
# Whiteboard - Arquitetura de Computadores (Linux / macOS)
# Inicializador automático compatível com Ubuntu, Debian, Fedora, Arch, etc.
# Uso: ./start_whiteboard.sh [--no-browser]
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Detectar o interpretador Python 3
if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "[ERRO] Python 3 não foi encontrado no sistema!"
    echo "Instale no Ubuntu/Debian com:"
    echo "   sudo apt update && sudo apt install -y python3 python3-pip python3-venv"
    exit 1
fi

# 2. Em distribuições modernas com PEP 668 (Ubuntu 23+, Debian 12+, Fedora),
# usar um venv local isolado evita conflito com o gerenciador do sistema.
if [ ! -d ".venv" ]; then
    if ! $PYTHON_CMD -c "import fastapi, uvicorn, websockets" >/dev/null 2>&1; then
        echo "[INFO] Criando ambiente virtual Python (.venv)..."
        $PYTHON_CMD -m venv .venv 2>/dev/null || true
    fi
fi

if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
    PYTHON_CMD="python"
fi

echo "[INICIANDO] Whiteboard..."
exec $PYTHON_CMD "$SCRIPT_DIR/start_whiteboard.py" "$@"
