#!/usr/bin/env bash
# Envoltorio para quienes ya usaban ./abrir.sh. Toda la lógica vive en
# scripts/abrir.js, que también funciona en Windows y macOS.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
exec node scripts/abrir.js
