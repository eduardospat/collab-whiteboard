#!/usr/bin/env python3
"""
Launcher for the Arquitetura de Computadores Whiteboard.
Usage: python start_whiteboard.py
"""
import os
import sys
import subprocess

def ensure_dependencies():
    for pkg in ['fastapi', 'uvicorn', 'websockets']:
        try:
            __import__(pkg)
        except ImportError:
            print(f"[INFO] Instalando dependência para o quadro colaborativo: {pkg}...")
            installed = False
            for cmd in [
                [sys.executable, "-m", "pip", "install", pkg, "--quiet"],
                [sys.executable, "-m", "pip", "install", pkg, "--user", "--quiet"],
                [sys.executable, "-m", "pip", "install", pkg, "--break-system-packages", "--quiet"]
            ]:
                try:
                    subprocess.check_call(cmd)
                    installed = True
                    print(f"[OK] {pkg} instalado com sucesso!")
                    break
                except Exception:
                    continue
            if not installed:
                print(f"[AVISO] Não foi possível instalar '{pkg}' automaticamente.")
                print("   No Linux, instale com: pip install -r requirements.txt")
                print("   Ou crie um ambiente virtual: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt")

base_dir = os.path.dirname(os.path.abspath(__file__))
whiteboard_server = os.path.join(base_dir, 'whiteboard', 'server.py')

if __name__ == '__main__':
    ensure_dependencies()
    sys.exit(subprocess.call([sys.executable, whiteboard_server] + sys.argv[1:]))
