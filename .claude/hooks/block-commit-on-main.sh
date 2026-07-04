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
#   - main + "git checkout -- src/foo.ts && git commit"    -> DENY  (path restore)
#   - feature + "git checkout -- src/foo.ts && git commit" -> ALLOW (path restore)
#   - feature + "git switch -- main && git commit"         -> DENY  (switch: -- = end of opts)
#   - main + "git switch -c new -- main && git commit"     -> ALLOW (new branch is `new`)
#   - main + "git switch -- && git commit"                 -> DENY  (no target, fail closed)
# It never blocks `git switch`/`git checkout -b` itself, so the documented sync
# step and branch creation keep working.
#
# Target resolution: a quoted target has one layer of matching quotes stripped,
# and previous-branch shorthand (`-`, `@{-1}`, `@{-N}`) is resolved to a real
# branch name (from in-chain history, else the reflog); if it can't be resolved
# it fails closed as main.
#
# Path restore vs branch switch: `--` means a path restore ONLY for `checkout`
# (`git checkout -- <path>` / `<tree> -- <path>` restore files and never change
# the branch), so a `--` in a checkout statement leaves the effective branch
# unchanged. `git switch` never takes a pathspec: there `--` is just "end of
# options" and the branch target still follows it, so switch is always processed
# as a branch change (the `--` token is simply skipped during extraction). A bare
# `git checkout <token>` (no `--`, no `-b`) is ambiguous (branch or path, which
# this hook can't fully tell apart): switching TO main is always honoured, but
# such an ambiguous checkout is NOT allowed to clear the on-main state — if we
# are on main and can't be sure a real switch happened, main stays main (fail
# closed). `git switch`, `git checkout -b/-B`, and previous-branch refs are
# treated as confident branch switches.
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
switch_re='(^|[^[:alnum:]_-])git([[:space:]]+[^[:space:]]+)*[[:space:]]+switch([[:space:]]|$)'
ci_re='(^|[^[:alnum:]_-])git([[:space:]]+[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)'

# Track the effective branch by NAME. `eff` is where a commit would currently
# land; `eff_prev` is the branch before the last switch, used to resolve the
# previous-branch shorthand (`-`, `@{-1}`) correctly when it appears mid-chain.
eff="$live_branch"
eff_prev=""

deny=0
while IFS= read -r stmt; do
  [ -n "$stmt" ] || continue

  # A switch/checkout MAY move the effective branch. Parse the tokens after the
  # subcommand to find the RESULTING branch:
  #  - a create flag (`-c`/`-C` for switch, `-b`/`-B` for checkout) names the new
  #    branch as its argument; a following start-point (even after `--`) is NOT
  #    the resulting branch.
  #  - otherwise the operand is the first non-flag token after the subcommand
  #    (a lone `-` is a target; `--` is skipped).
  # `--` means a path restore ONLY for `checkout` with no create flag
  # (`git checkout -- <path>` / `<tree> -- <path>`), leaving eff unchanged.
  # `git switch` never takes a pathspec, so there `--` is just "end of options".
  if printf '%s' "$stmt" | grep -Eq "$sw_re"; then
    is_switch=0
    printf '%s' "$stmt" | grep -Eq "$switch_re" && is_switch=1

    phase=0; want_create_arg=0; created=""; operand=""; dashdash=0
    for tok in $stmt; do
      # Normalize one layer of matching surrounding quotes on EACH token, so a
      # quoted operator/flag/branch ("--", "-c", "main", '-') is still recognised
      # (the shell would strip these quotes before git ever sees them).
      case "$tok" in
        \"*\") tok="${tok#\"}"; tok="${tok%\"}" ;;
        \'*\') tok="${tok#\'}"; tok="${tok%\'}" ;;
      esac
      if [ "$phase" -eq 0 ]; then
        case "$tok" in switch|checkout) phase=1 ;; esac
        continue
      fi
      if [ "$want_create_arg" -eq 1 ]; then
        # The token after a create flag is the NEW branch name (skip a `--`).
        case "$tok" in
          --) : ;;
          *)  created="$tok"; want_create_arg=0 ;;
        esac
        continue
      fi
      case "$tok" in
        --)          dashdash=1 ;;
        -c|-C|-b|-B) want_create_arg=1 ;;
        -)           [ -z "$operand" ] && operand="-" ;;
        -*)          : ;;
        *)           [ -z "$operand" ] && operand="$tok" ;;
      esac
    done

    if [ "$is_switch" -eq 0 ] && [ "$dashdash" -eq 1 ] && [ -z "$created" ]; then
      : # `checkout [<tree>] -- <path>`: path restore, leave eff unchanged.
    else
      # Resulting branch: the created branch, else the first operand.
      is_create=0
      if [ -n "$created" ]; then target="$created"; is_create=1
      else target="$operand"; fi

      if [ -z "$target" ]; then
        # No resolvable target (e.g. `git switch --`): unknown. Fail closed by
        # leaving eff untouched, so an on-main state is never cleared here.
        :
      else
        # Strip one layer of matching surrounding quotes ("main" / 'main').
        case "$target" in
          \"*\") target="${target#\"}"; target="${target%\"}" ;;
          \'*\') target="${target#\'}"; target="${target%\'}" ;;
        esac
        # Resolve previous-branch shorthand (-, @{-1}, @{-N}) to a real branch
        # name (in-chain history first, else the reflog); fail closed to main.
        prevref=0
        case "$target" in
          - | @\{-1\})
            prevref=1
            if [ -n "$eff_prev" ]; then
              resolved="$eff_prev"
            else
              resolved="$(git rev-parse --abbrev-ref '@{-1}' 2>/dev/null || true)"
              [ -n "$resolved" ] || resolved="main"
            fi ;;
          @\{-*\})
            prevref=1
            resolved="$(git rev-parse --abbrev-ref "$target" 2>/dev/null || true)"
            [ -n "$resolved" ] || resolved="main" ;;
          *)
            resolved="$target" ;;
        esac
        # A bare `git checkout <token>` is ambiguous (branch vs path). Only a
        # `switch`, a create flag (-c/-C/-b/-B), or a previous-branch ref is a
        # CONFIDENT branch switch. Switching TO main is always honoured (deny
        # direction); otherwise an ambiguous checkout must not CLEAR on-main.
        confident=0
        { [ "$is_switch" -eq 1 ] || [ "$is_create" -eq 1 ] || [ "$prevref" -eq 1 ]; } && confident=1
        if [ "$resolved" = "main" ]; then
          eff_prev="$eff"; eff="main"
        elif [ "$confident" -eq 1 ] || [ "$eff" != "main" ]; then
          eff_prev="$eff"; eff="$resolved"
        fi
        # else: ambiguous bare checkout to a non-main token while on main ->
        # keep eff=main (fail closed); do not clear.
      fi
    fi
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
