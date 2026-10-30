#!/bin/bash
# Like a user would: Claude Code with the user's registered easel MCP, asked to build "the selected frame".
# Usage: scripts/build-selected.sh "<stack description>" <empty dir> <log file>
set -u
STACK="$1"; DIR="$2"; LOG="$3"
mkdir -p "$DIR" && cd "$DIR" || exit 1
unset ELECTRON_RUN_AS_NODE
claude -p "Build the selected Easel frame as a $STACK in this empty folder. It must look the same as the design. Make \`npm run build\` produce a static site in dist/ with the page at /." \
  --permission-mode acceptEdits \
  --allowedTools "mcp__easel__get_canvas" "mcp__easel__get_frame" "mcp__easel__screenshot_frame" "mcp__easel__get_design_guidelines" "Read" "Write" "Edit" "Glob" "Grep" "Bash(npm:*)" "Bash(npx:*)" "Bash(node:*)" "Bash(ls:*)" "Bash(mkdir:*)" "Bash(cat:*)" "Bash(mv:*)" "Bash(cp:*)" \
  > "$LOG" 2>&1
echo "claude exit $?" >> "$LOG"
npm run build >> "$LOG" 2>&1
echo "build exit $?" >> "$LOG"
