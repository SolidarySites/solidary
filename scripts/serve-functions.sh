#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
FUNCTIONS_PORT="${FUNCTIONS_PORT:-8888}"
FUNCTIONS_FILTER="${FUNCTIONS_FILTER:-@solidary/functions}"
FUNCTIONS_SRC="${FUNCTIONS_SRC:-$ROOT_DIR/apps/_shared_functions/src}"

load_env_file() {
  env_file="$1"
  [ -f "$env_file" ] || return 0

  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    line="$raw_line"
    line=${line%"${line##*[![:space:]]}"} # trim trailing whitespace
    line=${line%$'\r'}                    # strip CR from CRLF files

    case "$line" in
      "" | \#*)
        continue
        ;;
    esac

    # Support optional `export KEY=value` prefix.
    case "$line" in
      export\ *)
        line=${line#export }
        ;;
    esac

    case "$line" in
      *=*)
        key=${line%%=*}
        value=${line#*=}
        ;;
      *)
        continue
        ;;
    esac

    # Trim key whitespace.
    key=$(printf "%s" "$key" | tr -d '[:space:]')
    [ -n "$key" ] || continue

    # Trim leading value whitespace only.
    value=${value#"${value%%[![:space:]]*}"}

    # Remove matching surrounding quotes.
    case "$value" in
      \"*\")
        value=${value#\"}
        value=${value%\"}
        ;;
      \'*\')
        value=${value#\'}
        value=${value%\'}
        ;;
    esac

    export "$key=$value"
  done < "$env_file"
}

# Load local secrets for functions. Root .env is the primary location.
load_env_file "$ROOT_DIR/.env"
# Backward-compatible fallbacks if users still have old env locations.
load_env_file "$ROOT_DIR/apps/site/.env"
load_env_file "$ROOT_DIR/apps/_shared_functions/.env"

if [ -z "${TOKEN_ENCRYPTION_KEY:-}" ]; then
  echo "Warning: TOKEN_ENCRYPTION_KEY is missing. GitHub token-related functions will return 500." >&2
fi

NETLIFY_CLI_DISABLE_AUTO_UPDATE=1 netlify functions:serve \
  --filter "$FUNCTIONS_FILTER" \
  --functions "$FUNCTIONS_SRC" \
  --port "$FUNCTIONS_PORT" \
  "$@"
