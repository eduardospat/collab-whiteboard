#!/usr/bin/env python3
"""
Launcher de Compartilhamento Online para o Whiteboard MIPS
Inicia o túnel Cloudflare, copia o link gerado direto para a área de transferência
e exibe as instruções de forma limpa e objetiva.
"""

import os
import sys
import subprocess
import re
import time
import socket

import shutil
import urllib.request
import platform

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

IS_WINDOWS = sys.platform.startswith('win')
IS_DARWIN = sys.platform == 'darwin'
IS_LINUX = sys.platform.startswith('linux')

BINARY_NAME = 'cloudflared.exe' if IS_WINDOWS else 'cloudflared'
CLOUDFLARED = os.path.join(BASE_DIR, BINARY_NAME)

def copy_to_clipboard(text):
    try:
        if IS_WINDOWS:
            p = subprocess.Popen('clip', stdin=subprocess.PIPE, shell=True)
            p.communicate(input=text.encode('utf-8'))
            return True
        elif IS_DARWIN:
            p = subprocess.Popen(['pbcopy'], stdin=subprocess.PIPE)
            p.communicate(input=text.encode('utf-8'))
            return True
        else:
            # Linux: support wl-copy (Wayland), xclip, xsel
            for cmd in [
                ['wl-copy'],
                ['xclip', '-selection', 'clipboard'],
                ['xsel', '--clipboard', '--input']
            ]:
                if shutil.which(cmd[0]):
                    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
                    p.communicate(input=text.encode('utf-8'))
                    return True
    except Exception:
        pass
    return False

def is_port_in_use(port=8080):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def ensure_warp_connected():
    warp_bin = shutil.which('warp-cli') or shutil.which('warp-cli.exe')
    if warp_bin:
        try:
            status_res = subprocess.run([warp_bin, 'status'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=3)
            if 'Disconnected' in status_res.stdout:
                print("[INFO] Conectando Cloudflare WARP para contornar bloqueio de porta 7844 na rede...")
                subprocess.run([warp_bin, 'connect'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=5)
                time.sleep(1.5)
        except Exception:
            pass

def ensure_cloudflared():
    if os.path.exists(CLOUDFLARED):
        if not IS_WINDOWS and not os.access(CLOUDFLARED, os.X_OK):
            try:
                os.chmod(CLOUDFLARED, 0o755)
            except Exception:
                pass
        return CLOUDFLARED

    which_cf = shutil.which('cloudflared')
    if which_cf:
        return which_cf

    print(f"[INFO] {BINARY_NAME} não encontrado. Baixando binário oficial da Cloudflare para sua plataforma...")
    machine = platform.machine().lower()

    if IS_WINDOWS:
        url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
    elif IS_DARWIN:
        if 'arm' in machine or 'aarch64' in machine:
            url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64'
        else:
            url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64'
    else:
        # Linux
        if 'arm' in machine or 'aarch64' in machine:
            url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
        elif 'armv7' in machine:
            url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm'
        elif '386' in machine or '686' in machine:
            url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-386'
        else:
            url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'

    try:
        urllib.request.urlretrieve(url, CLOUDFLARED)
        if not IS_WINDOWS:
            os.chmod(CLOUDFLARED, 0o755)
        print(f"[OK] {BINARY_NAME} baixado com sucesso!")
        return CLOUDFLARED
    except Exception as e:
        print(f"[ERRO] Não foi possível baixar {BINARY_NAME} automaticamente: {e}")
        return None

def main():
    print("=" * 70)
    print(" [TUNEL] INICIANDO TUNEL DE COLABORACAO - COLLAB WHITEBOARD")
    print("=" * 70)

    cf_bin = ensure_cloudflared()
    if not cf_bin:
        print(f"Erro: Não foi possível obter o binário do cloudflared.")
        print("Você também pode rodar alternativamente: npx localtunnel --port 8080")
        sys.exit(1)

    if not is_port_in_use(8080):
        print("[AVISO] O servidor do whiteboard (porta 8080) parece não estar ativo.")
        print("Iniciando o servidor local primeiro...")
        server_py = os.path.join(BASE_DIR, 'whiteboard', 'server.py')
        subprocess.Popen([sys.executable, server_py, '--no-browser'])
        time.sleep(1.5)

    ensure_warp_connected()

    print("\n[INFO] Conectando aos servidores da Cloudflare...")
    cmd = [
        cf_bin,
        'tunnel',
        '--edge-ip-version', '4',
        '--url', 'http://localhost:8080'
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

    url = None
    url_pattern = re.compile(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    connected_to_edge = False
    edge_blocked = False

    start_time = time.time()
    url_found_time = None

    for line in proc.stdout:
        if not url:
            m = url_pattern.search(line)
            if m:
                url = m.group(0)
                url_found_time = time.time()

        if 'Registered tunnel connection' in line or 'Connection registered' in line:
            connected_to_edge = True
            break

        if any(err in line for err in ['TLS handshake with edge error', 'forcibly closed', 'failed to dial to edge']):
            edge_blocked = True
            # Se já pegamos o erro e o tempo passou, podemos parar de esperar
            if url_found_time and (time.time() - url_found_time > 4):
                break

        if url_found_time and (time.time() - url_found_time > 10):
            break

        if time.time() - start_time > 35:
            break

    if not url:
        print("\n[ERRO] Não foi possível obter o link do túnel.")
        print("Verifique sua conexão com a internet.")
        proc.terminate()
        sys.exit(1)

    if edge_blocked or not connected_to_edge:
        print("\n" + "=" * 72)
        print(" [AVISO IMPORTANTE] BLOQUEIO DE REDE / FIREWALL DETECTADO!")
        print("=" * 72)
        print(" A rede atual (ex: eduroam / rede institucional / firewall restrito)")
        print(" está bloqueando ativamente a porta 7844 (saída de túnel da Cloudflare).")
        print()
        print(f" O link gerado pela Cloudflare foi:\n    -> {url}")
        print()
        print(" Para compartilhar com sucesso nesta rede:")
        print(" Conecte o aplicativo Cloudflare WARP no seu computador para contornar")
        print(" as restrições do firewall e execute novamente este script.")
        print("=" * 72 + "\n")
    else:
        time.sleep(1)
        copied = copy_to_clipboard(url)

        print("\n" + "=" * 70)
        print(" [OK] TUNEL CLOUDFLARE ATIVO COM SUCESSO!")
        print("=" * 70)
        print(f"\n [LINK DO QUADRO] (Para enviar aos seus amigos):\n    ->  {url}\n")
        if copied:
            print(" [COPIADO] O link já está na sua área de transferência.")
            print("    Basta dar Ctrl + V no WhatsApp ou Discord do seu amigo!")
        else:
            print(" [LINK] Copie o link acima e envie para seu amigo.")

        print("\n" + "-" * 70)
        print(" [DICAS IMPORTANTES]:")
        print(" 1. NO SEU PC: Continue usando http://localhost:8080 normalmente.")
        print(" 2. SEUS AMIGOS: Podem abrir pelo PC, celular ou tablet sem login.")
        print(" 3. NÃO FECHE ESTA JANELA! Se fechar, o compartilhamento cai na hora.")
        print("=" * 70 + "\n")

    sys.stdout.flush()

    try:
        # Drain stdout continuously so Windows pipe buffer never blocks cloudflared
        for _ in proc.stdout:
            pass
    except KeyboardInterrupt:
        print("\nEncerrando túnel...")
        proc.terminate()

if __name__ == '__main__':
    main()
