#!/usr/bin/env bash
# vc-regression-check-conformance.sh -- thin wrapper for
# vc-regression-check-conformance.py (T-043 / ISS-076), placed next to vc-testlock.sh so
# both instruments live at the same, single, committed path (T-040's own lesson: an
# uncommitted-scratchpad copy of a shared instrument is worse than missing).
#
# The parsing/merge logic lives in the .py sibling (JSON/CSV handling is what Python is
# for; a hand-rolled bash JSON parser is exactly the kind of fragile reimplementation this
# project already learned to avoid). This wrapper exists so the instrument is invoked the
# same way as vc-testlock.sh -- `bash scripts/<name>.sh [args]` -- and so a future narrowed
# regression_check can legitimately name THIS path.
#
# Usage: bash scripts/vc-regression-check-conformance.sh [--repo-root PATH] [--issues PATH] [--adapter PATH]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHON_BIN="python3"
command -v python3 >/dev/null 2>&1 || PYTHON_BIN="python"

exec "$PYTHON_BIN" "$SCRIPT_DIR/vc-regression-check-conformance.py" "$@"
