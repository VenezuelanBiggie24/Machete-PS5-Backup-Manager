#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PS5_PAYLOAD_SDK="${PS5_PAYLOAD_SDK:-/Users/thebigmike/.gemini/antigravity/scratch/MacheteSVG/.deps/native/ps5-payload-sdk}"
export LLVM_CONFIG="${LLVM_CONFIG:-/opt/homebrew/opt/llvm/bin/llvm-config}"
export PATH="/opt/homebrew/opt/llvm/bin:$PATH"

echo "=== Machete PS5 Payload Build ==="
echo "PS5_PAYLOAD_SDK: $PS5_PAYLOAD_SDK"
echo "LLVM_CONFIG:     $LLVM_CONFIG"

make clean
make

if [ -f "machete_daemon.elf" ]; then
    echo "Build SUCCESS: machete_daemon.elf generated."
    ls -lh machete_daemon.elf

    # Copy to src-tauri/payload
    TAURI_PAYLOAD_DIR="/Users/thebigmike/.gemini/antigravity/scratch/machete/src-tauri/payload"
    mkdir -p "$TAURI_PAYLOAD_DIR"
    cp machete_daemon.elf "$TAURI_PAYLOAD_DIR/machete_daemon.elf"
    echo "Copied machete_daemon.elf to $TAURI_PAYLOAD_DIR/machete_daemon.elf"
    ls -lh "$TAURI_PAYLOAD_DIR/machete_daemon.elf"
else
    echo "Build FAILED: machete_daemon.elf was not created."
    exit 1
fi
