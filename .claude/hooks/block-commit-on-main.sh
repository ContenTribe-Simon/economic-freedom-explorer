#!/usr/bin/env bash
#
# PreToolUse (Bash) hook: block a `git commit` that would land on `main`.
#
# Why a hook and not a static deny pattern: settings.json allow/deny strings
# cannot see runtime state. `Bash(git commit *)` is allowed on every branch, so
# a session on `main` could commit there without a prompt, defeating CLAUDE.md
# golden rule #1 (agents never commit to main). This hook is now the
# authoritative guard for that rule.
#
# Effective-branch reasoning (the important part): it is NOT enough to check the
# live branch at call time. A single compound call such as
#   git switch main && git commit -m x
# is issued while the live branch is still the feature branch, yet the commit
# lands on main. So the hook parses the command, splits it into sequential
# statements on shell separators (&& || ; | & newline), and walks them in order
# tracking the *effective* branch: a `git switch|checkout <target>` updates it,
# and a `git commit` is denied if the effective branch is `main` at that point.
# This means:
#   - live-main + commit                                   -> DENY
#   - feature + "git switch main && git commit"            -> DENY  (the bypass)
#   - feature + "git checkout main && git commit"          -> DENY
#   - "... && git switch -c feat/x && git commit"          -> ALLOW (off main first)
#   - "git switch main && git fetch && git pull"           -> ALLOW (no commit)
#   - live-main + "git switch -c feat && git commit"       -> ALLOW (left main)
#   - feature (prev=main) + "git switch - && git commit"   -> DENY  (resolved)
#   - 'git switch "main" && git commit'                    -> DENY  (dequoted)
# It never blocks `git switch`/`git checkout -b` itself, so the documented sync
# step and branch creation keep working.
#
# Target resolution: a quoted target has one layer of matching quotes stripped,
# and previous-branch shorthand (`-`, `@{-1}`, `@{-N}`) is resolved to a real
# branch name (from in-chain history, else the reflog); if it can't be resolved
# it fails closed as main.
#
# Known limitation (errs safe): statement splitting is textual and not quote- or
# heredoc-aware, so a commit MESSAGE (or other quoted argument) that itself
# contains a switch-to-main and a commit separated by a shell operator can trip
# this and be over-denied. That only ever over-blocks (deny), never lets a commit
# reach main; reword the message or commit from a feature branch if it fires.
#
# Contract (Claude Code PreToolUse): reads the tool payload as JSON on stdin,
# uses `.tool_input.command`; to block, prints a JSON object with
# hookSpecificOutput.permissionDecision = "deny" on stdout and exits 0.

set -uf -o pipefail   # -f: no pathname expansion — command text is tokenized as data, never run

payload="$(cat)"

# Fast path: if the payload can't possibly contain a `git commit`, there is
# nothing to guard on any branch. This keeps the hook cheap on the vast majority
# of Bash calls (and avoids spawning a JSON parser for them).
if ! printf '%s' "$payload" | grep -q 'commit'; then
  exit 0
fi

# The payload mentions "commit". Extract the actual command string. Try jq, then
# python3, then node (this repo already requires Node/npm to run at all, so at
# least one parser is essentially always present). Track whether any was found.
cmd=""
have_parser=0
if command -v jq >/dev/null 2>&1; then
  have_parser=1
  cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"
elif command -v python3 >/dev/null 2>&1; then
  have_parser=1
  cmd="$(printf '%s' "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"
elif command -v node >/dev/null 2>&1; then
  have_parser=1
  cmd="$(printf '%s' "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(((JSON.parse(s).tool_input)||{}).command||"")}catch(e){}})' 2>/dev/null || true)"
fi

live_branch="$(git branch --show-current 2>/dev/null || true)"

deny_json() {
  cat <<JSON
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"$1"}}
JSON
}

# Fail CLOSED: the payload references a commit but we could not parse it to see
# what it actually does. If the live branch is main, deny as a precaution. Off
# main we allow (this only triggers with no jq/python3/node in PATH, which can't
# run this Node repo anyway, and blanket-blocking feature-branch work is worse).
if [ "$have_parser" -eq 0 ]; then
  if [ "$live_branch" = "main" ]; then
    deny_json "Blocked by .claude/hooks/block-commit-on-main.sh: a commit was requested on 'main' but the command payload could not be parsed (no jq, python3 or node). Denying on main as a precaution. Switch to a feature branch (git switch -c <name>) and work there."
  fi
  exit 0
fi

# Walk the command as sequential statements, tracking the effective branch.
# Split on shell separators without a real parser: turn && || ; | & into newlines.
chain="$cmd"
chain="${chain//&&/$'\n'}"
chain="${chain//||/$'\n'}"
chain="${chain//;/$'\n'}"
chain="${chain//|/$'\n'}"
chain="${chain//&/$'\n'}"

# git followed by global flags/tokens, then the given subcommand as a word.
sw_re='(^|[^[:alnum:]_-])git([[:space:]]+[^[:space:]]+)*[[:space:]]+(switch|checkout)([[:space:]]|$)'
ci_re='(^|[^[:alnum:]_-])git([[:space:]]+[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)'

# Track the effective branch by NAME. `eff` is where a commit would currently
# land; `eff_prev` is the branch before the last switch, used to resolve the
# previous-branch shorthand (`-`, `@{-1}`) correctly when it appears mid-chain.
eff="$live_branch"
eff_prev=""

deny=0
while IFS= read -r stmt; do
  [ -n "$stmt" ] || continue

  # A switch/checkout moves the effective branch to its resolved target.
  if printf '%s' "$stmt" | grep -Eq "$sw_re"; then
    # Target = a lone "-" (previous branch) or the last non-flag token. Handles
    # `git switch main`, `git switch -c feat/x`, `git checkout -b feat`,
    # `git -C path checkout main`, and `git switch -`.
    target=""
    for tok in $stmt; do
      case "$tok" in
        -)  target="$tok" ;;
        -*) : ;;
        *)  target="$tok" ;;
      esac
    done
    # Strip one layer of matching surrounding quotes so a quoted "main"/'main'
    # is recognised (the raw token keeps the quote characters otherwise).
    case "$target" in
      \"*\") target="${target#\"}"; target="${target%\"}" ;;
      \'*\') target="${target#\'}"; target="${target%\'}" ;;
    esac
    # Resolve the ACTUAL target branch. Previous-branch shorthand (`-`, `@{-1}`,
    # `@{-N}`) is resolved to a real branch name: from the in-chain history when
    # a switch already happened this command, else from the reflog. If it cannot
    # be resolved, fail CLOSED by treating it as main (deny), consistent with the
    # no-parser case, rather than assuming it is safe.
    case "$target" in
      - | @\{-1\})
        if [ -n "$eff_prev" ]; then
          resolved="$eff_prev"
        else
          resolved="$(git rev-parse --abbrev-ref '@{-1}' 2>/dev/null || true)"
          [ -n "$resolved" ] || resolved="main"
        fi ;;
      @\{-*\})
        resolved="$(git rev-parse --abbrev-ref "$target" 2>/dev/null || true)"
        [ -n "$resolved" ] || resolved="main" ;;
      *)
        resolved="$target" ;;
    esac
    eff_prev="$eff"
    eff="$resolved"
  fi

  # A commit lands on the current effective branch; if that is main, block.
  if printf '%s' "$stmt" | grep -Eq "$ci_re"; then
    if [ "$eff" = "main" ]; then deny=1; break; fi
  fi
done <<< "$chain"

if [ "$deny" -eq 1 ]; then
  deny_json "Blocked by .claude/hooks/block-commit-on-main.sh: this command would commit on 'main' (directly, or after switching to main in the same command) and agents must never commit to main (CLAUDE.md golden rule #1). Commit on a feature branch instead; Simon merges to main manually."
fi
exit 0
