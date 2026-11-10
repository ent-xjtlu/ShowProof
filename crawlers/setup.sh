#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "未找到 python3，请先安装 Python 3.10+" >&2
  exit 1
fi

if [ ! -d .venv ]; then
  "$PYTHON" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
python -m pip install -r requirements-core.txt

if [ "${1:-}" = "--optional" ]; then
  python -m pip install -r requirements-optional.txt
fi

echo "已准备完成：$(pwd)/.venv"
echo "激活：source $(pwd)/.venv/bin/activate"
