#!/usr/bin/env bash
set -euo pipefail

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin_dir="${SUPABASE_DISPENSER_BIN_DIR:-$HOME/.local/bin}"

targets=()
custom_target=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      custom_target="${2:-}"
      if [[ -z "$custom_target" ]]; then
        echo "Missing value for --dir" >&2
        exit 1
      fi
      targets+=("$custom_target")
      shift 2
      ;;
    --codex)
      targets+=("${CODEX_HOME:-$HOME/.codex}/skills/supabase-dispenser")
      shift
      ;;
    --claude)
      targets+=("${CLAUDE_HOME:-$HOME/.claude}/skills/supabase-dispenser")
      shift
      ;;
    --clawdbot|--openclaw)
      targets+=("$HOME/.clawdbot/skills/supabase-dispenser")
      shift
      ;;
    --no-bin)
      bin_dir=""
      shift
      ;;
    *)
      echo "Unknown install option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ${#targets[@]} -eq 0 ]]; then
  targets+=("${CODEX_HOME:-$HOME/.codex}/skills/supabase-dispenser")
  targets+=("${CLAUDE_HOME:-$HOME/.claude}/skills/supabase-dispenser")
  targets+=("$HOME/.clawdbot/skills/supabase-dispenser")
fi

copy_skill() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
  rm -rf "$target"
  mkdir -p "$target"
  tar -C "$source_dir" -cf - . | tar -C "$target" -xf -
  chmod +x "$target/scripts/supabase-dispenser.mjs" "$target/scripts/supabase-dispenser-mcp.mjs" "$target/scripts/install.sh"
  echo "Installed skill: $target"
}

for target in "${targets[@]}"; do
  copy_skill "$target"
done

if [[ -n "$bin_dir" ]]; then
  mkdir -p "$bin_dir"
  wrapper="$bin_dir/supabase-dispenser"
  primary="${targets[0]}"
  cat > "$wrapper" <<EOF
#!/usr/bin/env bash
exec node "$primary/scripts/supabase-dispenser.mjs" "\$@"
EOF
  chmod +x "$wrapper"
  echo "Installed CLI: $wrapper"

  mcp_wrapper="$bin_dir/supabase-dispenser-mcp"
  cat > "$mcp_wrapper" <<EOF
#!/usr/bin/env bash
exec node "$primary/scripts/supabase-dispenser-mcp.mjs" "\$@"
EOF
  chmod +x "$mcp_wrapper"
  echo "Installed MCP server: $mcp_wrapper"
fi

echo
echo "Run: supabase-dispenser setup"
echo "The setup command will ask for your endpoint. No endpoint is bundled or assumed."
