# block-commit-on-main.sh — dry-run test matrix

Living catalogue of every dry-run case exercised against
`.claude/hooks/block-commit-on-main.sh` across all fixes so far
(`077d591` → current). The point is that any new git-syntax variant can be
checked against a **fixed list of categories** instead of us discovering holes
one at a time. When a new variant is found, add a row to the right category (and
a category if it is genuinely new), then keep the hook and this file in sync.

## What the hook guarantees

A `git commit` is DENIED when it would land on `main` — directly, or after the
command moves onto `main` earlier in the same compound statement. It reasons
about the **effective branch** by walking the command's statements (split on
`&& || ; | &` and newlines) and tracking where a commit would land. It never
blocks `git switch` / branch creation / the documented sync step. It is
best-effort accident defence; the hard guarantee is the hook denying the commit,
not the settings.json string patterns.

## How to re-run

Pipe a simulated PreToolUse payload
(`{"tool_name":"Bash","tool_input":{"command":"<cmd>"}}`) into the hook from a
throwaway git repo whose branch (and, for previous-branch cases, reflog) is set
up to match the "From" column, and check stdout for
`permissionDecision":"deny"`. No real commit/switch/push is ever run. The
maintained harness builds unborn repos (`git init` + `symbolic-ref HEAD`) for
direct cases and committed repos with real `switch` history for previous-branch
cases, and uses a restricted `PATH` to simulate missing parsers.

Legend: **From** = live branch when the command runs. Result is for the whole
compound ending in a commit unless noted.

---

## 1) Basic switch/checkout to main

| Command | From | Result | Rationale |
|---|---|---|---|
| `git commit -m x` | main | DENY | commit directly on main |
| `git commit -m x` | feature | ALLOW | commit on a feature branch |
| `git add -A && git commit -m x` | main | DENY | commit on main after a non-switch step |
| `git -c user.email=a@b commit -m z` | main | DENY | global `-c` before subcommand, still a commit on main |
| `git commit -F -` | main | DENY | heredoc/stdin message form on main |
| `git status` | main | ALLOW | no commit token |
| `git log --grep=commit` | main | ALLOW | "commit" only inside a flag value, not a `git commit` |
| `npm test` | main | ALLOW | not git |
| `git switch main && git commit -m x` | feature | DENY | switches onto main, then commits |
| `git checkout main && git commit -m x` | feature | DENY | checkout to a branch (no `--`) moves onto main |
| `git -C . checkout main && git commit -m x` | feature | DENY | leading `-C <dir>` global option tolerated |
| `git switch feat && git commit -m x` | main | ALLOW | left main before committing |
| `git switch -c feat && git commit -m x` | main | ALLOW | branch creation off main |
| `git switch -c other && git commit -m x` | feature | ALLOW | branch creation on a feature branch |

## 2) Previous-branch shorthand (`-`, `@{-1}`, `@{-N}`)

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch - && git commit -m x` | feature, prev=main | DENY | `-` resolves to the previous branch (main) via reflog |
| `git checkout - && git commit -m x` | feature, prev=main | DENY | `checkout -` is a branch op, same resolution |
| `git switch @{-1} && git commit -m x` | feature, prev=main | DENY | explicit previous-branch ref resolves to main |
| `git switch - && git commit -m x` | feat2, prev=feat1 | ALLOW | previous branch is not main |
| `git switch other && git switch - && git commit -m x` | main | DENY | mid-chain `-` resolves via in-chain history back to main |

## 3) Quoting (`"main"`, `'main'`)

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch "main" && git commit -m x` | feature | DENY | one layer of surrounding quotes stripped -> main |
| `git switch 'main' && git commit -m x` | feature | DENY | single quotes stripped -> main |

## 4) `--` as path restore (checkout)

| Command | From | Result | Rationale |
|---|---|---|---|
| `git checkout -- src/foo.ts && git commit -m x` | main | DENY | `checkout -- <path>` restores a file, branch stays main |
| `git checkout HEAD -- src/foo.ts && git commit -m x` | main | DENY | `checkout <tree> -- <path>` still a restore, stays main |
| `git checkout -- src/foo.ts && git commit -m x` | feature | ALLOW | restore on a feature branch never touches main |
| `git checkout feat -- afile && git commit -m x` | main | DENY | restore a file from `feat`, branch stays main |

## 5) `--` as flag terminator (switch)

`git switch` never takes a pathspec, so `--` is only "end of options"; the branch
target still follows it.

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch -- main && git commit -m x` | feature | DENY | `--` is end-of-opts; target after it is main |
| `git switch -- feat && git commit -m x` | main | ALLOW | switched off main to feat |
| `git switch -- main && git commit -m x` | main | DENY | redundant switch to main, still main |
| `git switch -- - && git commit -m x` | feature, prev=main | DENY | `-` after `--` still resolves as previous branch (main) |
| `git switch -- @{-1} && git commit -m x` | feature, prev=main | DENY | explicit previous ref after `--` resolves to main |

## 6) `--` in branch creation (`-c` / `-b`)

The new branch is the **argument to the create flag**, not a following
start-point (even after `--`).

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch -c newfeat -- main && git commit -m x` | main | ALLOW | creates `newfeat` from start-point `main`; result branch is `newfeat` |
| `git switch -c -- newfeat && git commit -m x` | feature | ALLOW | `--` before the new-branch name; created branch is `newfeat` |
| `git checkout -b new-branch && git commit -m x` | main | ALLOW | branch creation off main |
| `git checkout -b main-copy && git commit -m x` | main | ALLOW | new branch name is `main-copy`, not `main` |

## 7) Chained / compound statements

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch main && git fetch && git pull` | feature | ALLOW | documented sync step, no commit |
| `git switch main && git fetch && git pull` | main | ALLOW | sync while already on main, no commit |
| `git switch main && git fetch && git pull && git switch -c feat/new && git commit -m x` | feature | ALLOW | onto main then off to a fresh branch before committing |
| `git switch main ; git commit -m x` | feature | DENY | `;` separator also splits statements |
| `git switch -- main && git switch -- feat && git commit -m x` | feature | ALLOW | eff tracks through multiple switches; last real branch is feat |

## 8) Malformed / ambiguous input (fail closed)

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch -- && git commit -m x` | main | DENY | no resolvable target -> leave eff untouched -> stays main |
| `git switch -- -- main && git commit -m x` | main | DENY | double `--`; first operand `main`, and stays main anyway |
| `git checkout other-branch && git commit -m x` | main | DENY | bare `checkout <token>` is ambiguous (branch vs path); does not clear main |
| `git checkout other-branch && git commit -m x` | feature | ALLOW | ambiguity only protects main; from a feature branch eff updates normally |
| `git switch "--" main && git commit -m x` | feature | DENY | quotes stripped per token -> `--` recognised as end-of-opts -> target main |

## 9) Parser isolation & no-parser

| Command | From | PATH | Result | Rationale |
|---|---|---|---|---|
| `git switch main && git commit -m x` | feature | jq only | DENY | jq extracts the command |
| `git commit -m x` | main | jq only | DENY | — |
| `git switch main && git commit -m x` | feature | python3 only | DENY | python3 fallback |
| `git commit -m x` | main | python3 only | DENY | — |
| `git switch main && git commit -m x` | feature | node only | DENY | node fallback (repo already needs node) |
| `git commit -m x` | main | node only | DENY | — |
| `git commit -m x` | main | none (no jq/py/node) | DENY | can't parse a commit on main -> fail closed |
| `git status` | main | none | ALLOW | payload has no "commit" token, fast-path allow |
| `git commit -m x` | feature | none | ALLOW | off main, no parser: preserve feature work (impossible env) |

## 10) Quoting: project path with spaces (settings wiring)

| Case | From | Result | Rationale |
|---|---|---|---|
| Hook invoked as `"$CLAUDE_PROJECT_DIR"/.claude/hooks/...` with a project path containing spaces, `git switch main && git commit -m x` | feature | DENY | quoted `$CLAUDE_PROJECT_DIR` in settings.json survives spaces so the guard runs |

---

## Part-3 review log — variants considered

Checked each category for an obvious untested variant. Fix only real bugs.

- **Create flag + start-point (`switch -c <new> -- <start>`)** — REAL BUG, fixed:
  the previous "last non-flag token" extraction picked the start-point (`main`)
  as the branch. Now the created branch is the create-flag's argument. Covered
  by category 6.
- **Bare `switch --` / double `--`** — REAL BUG, fixed: bare `switch --` had no
  target and previously kept a garbage token (`switch`), failing OPEN. Now an
  empty target leaves eff untouched (fail closed). Category 8.
- **Quoted operator (`"--"`, `'-c'`, quoted `-`)** — REAL BUG (quote-evasion, in
  the same class as the earlier quoted-`"main"` fix), fixed: quotes are now
  stripped per token, so a quoted `--` is recognised as a flag terminator.
  Category 8 (`switch "--" main`).
- **`checkout -b <new> -- <path>`** — not a real bug: create flag present, so the
  result is the created branch (non-main), which is the honest outcome; committing
  on a freshly created branch is fine. No dedicated row needed beyond category 6.
- **Glued create flag (`switch -cnewfeat`)** — KNOWN LIMITATION, no fix: the glued
  short-option form is not parsed, so the created branch isn't extracted; it fails
  SAFE (target unresolved -> on main, fail closed -> DENY). Agents use the spaced
  form. Logged here so a future round doesn't mistake the over-deny for a new bug.
- **`git -C <dir>` where `<dir>` is literally `switch`/`checkout`** — KNOWN
  LIMITATION, no fix: the naive token scan would treat that dir name as the
  subcommand. Absurd/unrealistic; not worth special-casing. Logged for awareness.
- **Commit MESSAGE containing a `switch main ... commit` chain** — KNOWN
  LIMITATION (errs safe): statement splitting is textual, not quote/heredoc-aware,
  so such a message is over-denied. Never lets a commit reach main; reword or
  commit from a feature branch.
