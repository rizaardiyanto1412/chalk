#!/bin/bash
# Ask the local Claude Code to build an Easel frame in a framework, using only the Easel MCP for the design.
# Usage: scripts/build-with-claude.sh <framework label> <frame name> <mcp port> <empty project dir> <log file>
set -u
FRAMEWORK="$1"; FRAME="$2"; PORT="$3"; DIR="$4"; LOG="$5"
mkdir -p "$DIR" && cd "$DIR" || exit 1
unset ELECTRON_RUN_AS_NODE
claude -p "Build the Easel frame \"$FRAME\" as a $FRAMEWORK app in this empty folder. Get the design from the easel MCP. It must look the same as the design. Make \`npm run build\` produce a static site in dist/ with the page at /." \
  --mcp-config "{\"mcpServers\":{\"easel\":{\"type\":\"http\",\"url\":\"http://127.0.0.1:$PORT/mcp\"}}}" --strict-mcp-config \
  --permission-mode acceptEdits \
  --allowedTools "mcp__easel__get_canvas" "mcp__easel__get_frame" "mcp__easel__screenshot_frame" "mcp__easel__get_design_guidelines" "Read" "Write" "Edit" "Glob" "Grep" "Bash(npm:*)" "Bash(npx:*)" "Bash(node:*)" "Bash(ls:*)" "Bash(mkdir:*)" "Bash(cat:*)" \
  > "$LOG" 2>&1
echo "claude exit $?" >> "$LOG"
npm run build >> "$LOG" 2>&1
echo "build exit $?" >> "$LOG"
