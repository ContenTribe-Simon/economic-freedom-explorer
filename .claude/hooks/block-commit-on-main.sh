#!/usr/bin/env bash
#
# PreToolUse (Bash) hook: block `git commit` when HEAD is on `main`.
#
# Why a hook and not another deny pattern: static allow/deny strings in
# settings.json cannot see runtime state. `Bash(git commit *)` is allowed on
# every branch, so a session that starts on or reaches `main` could commit
# there without a prompt, defeating CLAUDE.md golden rule #1 (agents never
# commit to main). This hook inspects the *current branch* at call time.
#
# Contract (Claude Code PreToolUse): reads the tool payload as JSON on stdin,
# uses `.tool_input.command`; to block, prints a JSON object with
# hookSpecificOutput.permissionDecision = "deny" on stdout and exits 0.
#
# Design: the hook is a no-op unless the current branch is exactly `main`.
# That keeps it invisible on feature branches and, crucially, never blocks
# `git switch`/`git checkout -b` off main (the escape hatch stays open).

set -uo pipefail

payload="$(cat)"

# Resolve the current branch. `git branch --show-current` returns the branch
# name (even on an unborn branch with no commits yet) and prints nothing on a
# detached HEAD or outside a repo. In any of those non-"main" cases we allow
# (exit 0) and stay out of the way.
branch="$(git branch --show-current 2>/dev/null || true)"
if [ "$branch" != "main" ]; then
  exit 0
fi

# On main: pull the shell command out of the payload. Prefer jq, fall back to
# python3. If neither parses it, `cmd` stays empty and the match below fails,
# so we allow, never blanket-blocking bash on main (you must still be able to
# run `git switch` to leave main).
cmd=""
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
elif command -v python3 >/dev/null 2>&1; then
  cmd="$(printf '%s' "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"
fi

# Is this a `git commit`? Match `git` (word-boundaried) followed by any global
# flags/tokens and then the `commit` subcommand. Tolerates `git -c x=y commit`
# and `... && git commit ...` chains; does not match `git log --grep=commit`.
if ! printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]+[^;|&[:space:]]+)*[[:space:]]+commit([[:space:]]|$)'; then
  exit 0
fi

# git commit on main -> deny. Static JSON, emitted without jq so blocking never
# depends on a parser being present.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by .claude/hooks/block-commit-on-main.sh: agents must never commit to 'main' (CLAUDE.md golden rule #1). Switch to a feature branch (git switch -c <name>) and commit there; Simon merges to main manually."}}
JSON
exit 0
