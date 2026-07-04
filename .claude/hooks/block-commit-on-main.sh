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
#   - feature + "git checkout main -- && git commit"       -> DENY  (bare `--` = branch checkout)
#   - main + "git switch nope || git commit"               -> DENY  (|| RHS: switch failed, on main)
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
# Classification is anchored: each statement is classified by its ACTUAL leading
# git subcommand (the first non-flag token after `git` and its global flags), so
# literal "switch"/"checkout"/"commit" text inside a statement's own arguments (a
# quoted -m/-F message, a branch name, a file path, a tag message) is never
# mis-read as a subcommand. Residual limitation (errs safe): statement splitting
# is still textual and not quote-aware, so a quoted argument that itself contains
# a shell separator (`&&`, `;`, `|`) is split into pieces; the real leading
# subcommand of each piece is still classified correctly, so this never lets a
# commit reach main -- at worst it evaluates a fragment as its own (usually
# harmless) statement.
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
# Split on shell separators without a real parser: turn && ; | & into newlines.
# `||` is different: reaching the RHS proves the LHS FAILED (see the loop), so
# mark those statements with a sentinel prefix rather than flattening them.
chain="$cmd"
chain="${chain//&&/$'\n'}"
chain="${chain//||/$'\n'__OR__}"
chain="${chain//;/$'\n'}"
chain="${chain//|/$'\n'}"
chain="${chain//&/$'\n'}"

# Track the effective branch by NAME. `eff` is where a commit would currently
# land; `eff_prev` is the branch before the last switch, used to resolve the
# previous-branch shorthand (`-`, `@{-1}`) correctly when it appears mid-chain.
eff="$live_branch"
eff_prev=""

deny=0
while IFS= read -r stmt; do
  # A statement carrying the `__OR__` sentinel followed `||`, so it runs ONLY
  # because the previous statement FAILED. A textual hook can't know whether a
  # failed `git switch <x>` target existed, so treat the branch conservatively:
  # if `main` was reachable either BEFORE (eff_prev, where a failed switch leaves
  # us) or AFTER (eff, an assumed-successful switch) that uncertain step, assume
  # we are on main. This denies `git switch <x> || git commit` when either the
  # pre-switch branch or the attempted target was main. (`&&`, `;`, `|`, `&`
  # have no such asymmetry and are handled as plain sequential statements.)
  sep_or=0
  case "$stmt" in
    __OR__*) sep_or=1; stmt="${stmt#__OR__}" ;;
  esac
  [ -n "$stmt" ] || continue
  # `or_pin_main` records that the conservative `||` reset landed on main (the
  # LHS-succeeded world puts us on main). This statement's OWN switch only ran in
  # the LHS-FAILED world, so it must NOT be allowed to clear that still-possible
  # main; we re-pin eff to main after the switch/checkout logic below.
  or_pin_main=0
  if [ "$sep_or" -eq 1 ]; then
    if [ "$eff" = "main" ] || [ "$eff_prev" = "main" ]; then eff="main"; or_pin_main=1; else eff="$eff_prev"; fi
  fi

  # Classify the statement by its ACTUAL leading git subcommand, found by walking
  # tokens from the start: skip any process-wrapper / env-assignment prefix, then
  # `git`, then git's global flags (some take a separate-token argument), and the
  # FIRST remaining token is the subcommand. Everything after it is arguments
  # (a quoted -m/-F/-F message, a branch name, a file path, a tag message, ...)
  # and can NEVER be re-read as a second git invocation. So a statement is
  # classified as exactly one of switch/checkout, commit, or neither -- never
  # both -- even if the words "switch"/"checkout"/"commit" appear literally
  # inside its own arguments.
  gphase=0            # 0=before git, 1=git global flags, 2=after the subcommand
  want_gflag_arg=0
  subcmd=""
  want_create_arg=0; created=""; operand=""; dashdash=0; path_after=0
  for tok in $stmt; do
    # Normalize each token: strip one layer of matching surrounding quotes, then
    # any leading `(`/`{` and trailing `)`/`}` shell-grouping characters (to any
    # depth), so a grouped command like "( git commit )", "(git commit -m x)",
    # "(( ... ))" or "{ ... ; }" is seen through to the real `git` invocation and
    # its target underneath. Without this, a leading grouping token broke the scan
    # in gphase 0 and the statement was never classified -- an UNDER-deny. A token
    # that was only quotes/grouping becomes empty and is skipped.
    case "$tok" in
      \"*\") tok="${tok#\"}"; tok="${tok%\"}" ;;
      \'*\') tok="${tok#\'}"; tok="${tok%\'}" ;;
    esac
    # `(` and `)` are shell metacharacters and can be glued to a word, so strip
    # any leading `(` and trailing `)` (to any depth). `{`/`}` are brace-group
    # RESERVED WORDS -- grouping only when they are standalone tokens -- so drop a
    # standalone `{`/`}` but leave a glued `}` intact (git ref syntax like
    # `@{-1}` / `HEAD@{2}` must survive).
    while :; do
      case "$tok" in
        \(*) tok="${tok#?}" ;;
        *\)) tok="${tok%?}" ;;
        *) break ;;
      esac
    done
    case "$tok" in \{|\}) tok="" ;; esac
    [ -z "$tok" ] && continue
    if [ "$gphase" -eq 0 ]; then
      # Before the subcommand: SCAN FORWARD to the first literal `git` token,
      # skipping everything else -- shell keywords (`if`, `then`, `do`, ...),
      # wrapper commands and THEIR flags (`sudo`, `env -u FOO`, `time`, ...), env
      # assignments (`VAR=val`), and anything unrecognized. We never break early
      # on an unknown prefix token (that was the recurring under-deny: grouping
      # tokens, then a shell keyword / wrapper flag). If no `git` token exists in
      # the statement, `gphase` stays 0 and `subcmd` stays empty -> neither.
      # Accepted cost (established safe bias): a non-git statement whose arguments
      # contain the literal word `git` (e.g. `echo git commit -m x`) is
      # over-classified and may over-deny -- never under-deny.
      [ "$tok" = "git" ] && gphase=1
      continue
    fi
    if [ "$gphase" -eq 1 ]; then
      # After `git`, before the subcommand: skip global options. `-c`, `-C`,
      # `--git-dir`, `--work-tree`, `--namespace`, etc. take a separate-token arg.
      if [ "$want_gflag_arg" -eq 1 ]; then want_gflag_arg=0; continue; fi
      case "$tok" in
        -c|-C|--git-dir|--work-tree|--namespace|--super-prefix|--config-env) want_gflag_arg=1 ;;
        -*) : ;;
        *)  subcmd="$tok"; gphase=2 ;;
      esac
      continue
    fi
    # gphase 2: arguments after the subcommand. Only switch/checkout needs them,
    # to find the RESULTING branch: a create flag (`-c`/`-C`/`-b`/`-B`) names the
    # new branch as its argument; otherwise the operand is the first non-flag
    # token (a lone `-` is a target; `--` handling below). For `checkout`, a token
    # after `--` is a pathspec/start-point; for `switch`, `--` is only
    # end-of-options and the branch target still follows it.
    case "$subcmd" in
      switch|checkout)
        if [ "$want_create_arg" -eq 1 ]; then
          case "$tok" in --) : ;; *) created="$tok"; want_create_arg=0 ;; esac
          continue
        fi
        if [ "$dashdash" -eq 1 ] && [ "$subcmd" = "checkout" ]; then
          path_after=1
          continue
        fi
        case "$tok" in
          --)          dashdash=1 ;;
          -c|-C|-b|-B) want_create_arg=1 ;;
          -)           [ -z "$operand" ] && operand="-" ;;
          -*)          : ;;
          *)           [ -z "$operand" ] && operand="$tok" ;;
        esac ;;
    esac
  done

  is_switch=0
  [ "$subcmd" = "switch" ] && is_switch=1

  # --- switch/checkout: MAY move the effective branch ---
  if [ "$subcmd" = "switch" ] || [ "$subcmd" = "checkout" ]; then
    # A checkout is a path RESTORE only when a real pathspec follows the `--`
    # (`git checkout [<tree>] -- <path>`). A bare trailing `--` with nothing after
    # it (`git checkout <branch> --`) is a plain branch checkout, NOT a restore.
    if [ "$subcmd" = "checkout" ] && [ -z "$created" ] && [ "$dashdash" -eq 1 ] && [ "$path_after" -eq 1 ]; then
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
        # `switch`, a create flag (-c/-C/-b/-B), a previous-branch ref, or a bare
        # trailing `--` (which disambiguates the operand AS a branch) is a
        # CONFIDENT branch switch. Switching TO main is always honoured (deny
        # direction); otherwise an ambiguous checkout must not CLEAR on-main.
        confident=0
        { [ "$is_switch" -eq 1 ] || [ "$is_create" -eq 1 ] || [ "$prevref" -eq 1 ]; } && confident=1
        { [ "$dashdash" -eq 1 ] && [ "$path_after" -eq 0 ]; } && confident=1
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

  # If the `||` reset put us on main (LHS-succeeded world), re-pin main now: this
  # statement's own switch (which only ran in the LHS-FAILED world) must not clear
  # the still-possible main. This closes `git switch main || git switch feature
  # && git commit`, where the switch to main succeeds so `switch feature` never
  # runs and the commit lands on main. Biases to over-deny, never under-deny.
  [ "$or_pin_main" -eq 1 ] && eff="main"

  # --- commit: lands on the current effective branch; block if that is main ---
  if [ "$subcmd" = "commit" ]; then
    if [ "$eff" = "main" ]; then deny=1; break; fi
  fi
done <<< "$chain"

if [ "$deny" -eq 1 ]; then
  deny_json "Blocked by .claude/hooks/block-commit-on-main.sh: this command would commit on 'main' (directly, or after switching to main in the same command) and agents must never commit to main (CLAUDE.md golden rule #1). Commit on a feature branch instead; Simon merges to main manually."
fi
exit 0
