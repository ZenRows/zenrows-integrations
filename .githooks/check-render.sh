# Sourced by pre-commit and pre-push. check_render runs `render --check` with
# a spinner on the terminal, and leaves its output in $render_output.
# Returns render --check's exit code.
check_render() {
  out=$(mktemp)
  node scripts/render.mjs --check >"$out" 2>&1 &
  pid=$!
  if [ -t 2 ]; then
    i=0
    while kill -0 "$pid" 2>/dev/null; do
      case $((i % 10)) in
        0) f='⠋' ;; 1) f='⠙' ;; 2) f='⠹' ;; 3) f='⠸' ;; 4) f='⠼' ;;
        5) f='⠴' ;; 6) f='⠦' ;; 7) f='⠧' ;; 8) f='⠇' ;; *) f='⠏' ;;
      esac
      printf '\r%s %s' "$f" "$1" >&2
      i=$((i + 1))
      sleep 0.1
    done
  fi
  wait "$pid"
  status=$?
  if [ -t 2 ]; then
    if [ "$status" -eq 0 ]; then printf '\r✔ %s\n' "$1" >&2; else printf '\r✖ %s\n' "$1" >&2; fi
  fi
  render_output=$(cat "$out")
  rm -f "$out"
  return "$status"
}

# The files render --check reported, indented.
render_problems() {
  printf '%s\n' "$render_output" | grep -E '^(missing|out of date|not rendered)' | sed 's/^/  /'
}
