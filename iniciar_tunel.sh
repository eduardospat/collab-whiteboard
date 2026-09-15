#!/usr/bin/env bash
# ==============================================================================
# Compartilhar Whiteboard MIPS (Linux / macOS)
# Inicializa o túnel Cloudflare e gera o link público de colaboração
# Uso: ./iniciar_tunel.sh
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if command -v python3 >/dev/null 2>&1; then
    PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python"
else
    echo "[ERRO] Python 3 não foi encontrado no sistema!"
    exit 1
fi

if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
    PYTHON_CMD="python"
fi

exec $PYTHON_CMD "$SCRIPT_DIR/compartilhar.py" "$@"
