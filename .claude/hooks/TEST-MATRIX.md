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

## Scope & accepted limits (permanent — read before opening a "bypass" finding)

This hook is a **best-effort textual guard against ordinary agent command
shapes, not a hardened sandbox.** It does not run a real shell; it textually
splits and token-scans the command. It reliably covers the shapes an agent
actually emits — plain and compound commands, `&&`/`||`/`;`, `if`/`elif`
conditions, a leading `!` negation, `while`/`until` loops (via the
weak-separator handling), shell grouping, quoted arguments and branch names,
remote-tracking DWIM targets, wrapper commands, and quoted commands handed to
another interpreter (`bash -c '…'`, `sh -c`, `ssh`, `su -c`). Beyond those,
**more exotic wrapping mechanisms may still evade it and are accepted as OUT OF
SCOPE** rather than chased indefinitely, e.g.: `eval "$var"`, command
substitution feeding an interpreter (`bash -c "$(printf …)"`), other-language
runners (`python -c`, `perl -e`, `node -e`), remote/deferred execution, aliases,
custom shell functions, and **variable-expanded branch targets**
(`git switch "$BRANCH" && git commit` — a textual hook cannot know the
variable's value, so an under-deny is possible when `$BRANCH` is `main`; agents
emit literal branch names, so this is accepted, not chased).

The one guarantee that matters is unchanged: on `main`, an ordinary agent commit
is denied. A future finding in one of the exotic categories above should be
triaged as **"known category, already accepted"**, not a new emergency round.
The real backstop is human review before merge (CLAUDE.md §3), not this hook.

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

A checkout is a path restore only when a **real pathspec follows `--`**. A bare
trailing `--` with nothing after it is a plain branch checkout (see category 11).

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

## 11) `--` as a bare terminator on checkout (branch checkout, not restore)

Per `git checkout -h` the form is `checkout [<branch>] [--]`, distinct from
`checkout [<tree>] -- <path>`. A bare trailing `--` with **no pathspec after it**
disambiguates the operand as a branch, so it is a genuine branch checkout, not a
restore.

| Command | From | Result | Rationale |
|---|---|---|---|
| `git checkout main -- && git commit -m x` | main | DENY | bare `--` = branch checkout to main, not a restore; stays on main |
| `git checkout main -- && git commit -m x` | feature | DENY | switches onto main (bare `--` is not a pathspec) |
| `git checkout main -- afile && git commit -m x` | feature | ALLOW | a real pathspec follows `--`, so it is a genuine file restore (unchanged) |
| `git checkout feat -- && git commit -m x` | main | ALLOW | bare `--` disambiguates `feat` as a branch -> confident switch off main |
| `git checkout feat -- && git commit -m x` | feature | ALLOW | branch checkout to feat, never main |

## 12) `||` separator (right side runs only if the left side failed)

The splitter marks statements that follow `||`. Reaching the RHS of `||` proves
the LHS FAILED, so a `git switch <x> || git commit` must not be treated as
"we left main". A textual hook can't know whether `<x>` exists, so the
**conservative choice** is: at a `||` boundary, treat the branch as `main` if
`main` was reachable **either** before the LHS (`eff_prev`, where a failed switch
leaves us) **or** after it (`eff`, an assumed-successful switch). This denies a
following commit whenever main is reachable on either side, and never
under-denies. (`&&`, `;`, `|`, `&` are plain sequential — no such asymmetry.)

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch does-not-exist \|\| git commit -m x` | main | DENY | switch failed (that is why the RHS runs), so still on main |
| `git switch main \|\| git commit -m x` | feature | DENY | conservative: if the switch "succeeded" we are on main, and if it failed the RHS commits on feature; main is reachable, so deny (over-safe) |
| `git switch feat \|\| git commit -m x` | main | DENY | if the switch to feat fails, the RHS commits on main |
| `git switch feat \|\| git commit -m x` | feature | ALLOW | neither the pre-switch branch nor the target is main |
| `git switch main && git commit -m x \|\| echo done` | feature | DENY | the commit is on the `&&` side (onto main); the `\|\| echo` is irrelevant |

## 13) `||` re-derivation — the RHS's own switch must not clear a pinned main

A statement following `||` runs only in the LHS-FAILED world, so its own
switch/checkout must not clear a `main` that was still reachable via the
LHS-succeeded world. After the conservative `||` reset lands on main
(`or_pin_main`), eff is re-pinned to main once the statement's switch logic has
run. Crucially this still **distinguishes** the legitimate case: the reset only
pins main when the *left* side's target was main (or the pre-LHS branch was),
so a non-main left target lets the right-hand switch move off main normally.

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch main \|\| git switch feature && git commit -m x` | feature | DENY | left `switch main` succeeds -> `switch feature` never runs -> commit on main; the RHS switch must not clear the pinned main |
| `git switch nonexistent \|\| git switch feature && git commit -m x` | feature | ALLOW | left target is not main, so the reset does not pin main; the RHS `switch feature` (which really runs when the left fails) is honoured -> off main. Not an over-deny: distinguished by the left target |
| `git switch nonexistent \|\| git switch main && git commit -m x` | feature | DENY | if the left fails, the RHS switches to main -> commit on main |
| `git switch feature \|\| git switch main && git commit -m x` | main | DENY | if the left `switch feature` fails, the RHS switches to main; pre-LHS branch was main so main is reachable |
| `git switch main \|\| git switch other && git commit -m x` | feature | DENY | left `switch main` succeeds -> on main; RHS never runs; main stays pinned |

## 14) Anchored classification — embedded text in a statement's own arguments

Each statement is classified by its ACTUAL leading git subcommand (the first
non-flag token after `git` and its global flags), so literal
"switch"/"checkout"/"commit" text inside a quoted `-m`/`-F` message, a branch
name, a file path, or a tag message is an argument and can never be mis-read as a
subcommand. A statement is exactly one of switch/checkout, commit, or neither.

| Command | From | Result | Rationale |
|---|---|---|---|
| `git commit -m "git switch feature"` | main | DENY | leading subcommand is `commit`; the embedded `git switch feature` is message text -> a real commit on main |
| `git commit -m "git switch feature"` | feature | ALLOW | off main; still a legitimate commit |
| `git commit -m "unrelated message"` | main | DENY | regression: an ordinary commit on main is still blocked |
| `git switch other -- afile && git commit -m "just committing"` | main | ALLOW | leading `switch` really moves eff to `other`; then a real commit on `other` -> off main. Both subcommands classified correctly |
| `git commit -m "checkout main"` | main | DENY | embedded `checkout main` is message text; leading subcommand is `commit` |
| `git commit -m "commit and switch main"` | main | DENY | message text ignored; commit on main |
| `git tag -m "git switch main" v1` | main | ALLOW | leading subcommand is `tag`, not commit or switch -> neither; eff untouched, no commit |
| `git commit -m "fix: switch to main layout"` | feature | ALLOW | commit on a feature branch; message text is irrelevant |
| `git commit -m "git checkout main && git commit"` | feature | ALLOW | the message is split textually on `&&`, but each fragment's leading subcommand is `commit`, evaluated on feature -> allowed (the previous over-deny is gone) |
| `git commit -m "git checkout main && git commit"` | main | DENY | same, but on main the leading `commit` is denied |

## 15) Leading shell grouping — `( ... )` and `{ ...; }`

The anchored classifier's gphase 0 used to break on the first token that was not
`git`, a wrapper, or a `VAR=val` assignment — so a leading grouping token broke
the scan and the statement was never classified (an UNDER-deny that let a real
commit through). Now each token has leading `(` and trailing `)` (shell
metacharacters, any depth) stripped, and a standalone `{`/`}` (brace-group
reserved words) dropped, so the scan reaches the real `git` underneath. A glued
`}` (git ref syntax like `@{-1}`, `HEAD@{2}`) is deliberately left intact.
Nesting depth is unbounded (each grouping token is stripped/skipped
independently), so no depth cap is imposed.

| Command | From | Result | Rationale |
|---|---|---|---|
| `( git commit -m x )` | main | DENY | subshell parens stripped; real commit on main found |
| `( git commit -m x )` | feature | ALLOW | grouped commit, off main |
| `git switch main && ( git commit -m x )` | feature | DENY | switch onto main, then a grouped commit on main |
| `{ git commit -m x ; }` | feature | ALLOW | brace group supported (standalone `{`/`}` dropped); commit on feature |
| `(git commit -m x)` | main | DENY | glued `(git` / `x)` stripped; commit on main |
| `(( git commit -m x ))` | main | DENY | double nesting stripped |
| `{ ( git commit -m x ) ; }` | feature | ALLOW | mixed brace+subshell nesting |
| `(git switch main) && git commit -m x` | feature | DENY | glued `(git` and trailing `)` on the target stripped -> `main`; subshell switch changes on-disk HEAD, so the later commit is on main |
| `( git switch feature ) && git commit -m x` | main | ALLOW | grouped switch really moves off main to feature |
| `( git switch @{-1} ) && git commit -m x` | feature, prev=main | DENY | grouping stripped but `@{-1}` preserved -> resolves to main |

## 16) Prefix scan-forward — keywords, wrappers + their flags, env before `git`

gphase 0 no longer uses an allowlist-then-break scan (which under-denied three
times: grouping tokens, then a shell keyword and a wrapper flag). It now **scans
forward to the first literal `git` token**, skipping everything before it —
shell keywords (`if`/`then`/`do`/…), wrapper commands AND their flags
(`sudo`, `env -u FOO`, `time`, `nice -n 10`), env assignments, already-stripped
grouping, and anything unrecognized. Once `git` is found, phase 1/2 classify the
subcommand exactly as before.

This does NOT reopen the anchored-subcommand fix (5b132f8): scan-forward looks
for the first `git` in the PREFIX, *before* any subcommand; the anchored fix is
about not re-reading tokens *after* the subcommand's own arguments. Different
position in the token stream, so `git commit -m "git switch feature"` still finds
the leading `git` at position 0, classifies `commit`, and the embedded `git` in
the message stays an ignored argument (verified below).

Accepted cost (established safe bias, never under-deny): a non-git statement
whose arguments contain the literal word `git` is over-classified and may
over-deny (`echo git commit -m x` -> DENY on main).

| Command | From | Result | Rationale |
|---|---|---|---|
| `if git switch main; then git commit -m x; fi` | feature | DENY | `if …` segment: `if` skipped, real `git switch main` found -> eff=main; the `then git commit` segment commits on main |
| `if git switch feature; then git commit -m x; fi` | feature | ALLOW | the real switch moves to feature, off main |
| `env -u FOO git commit -m x` | main | DENY | `env` and its flag `-u FOO` skipped, `git commit` found -> commit on main |
| `sudo git commit -m x` | main | DENY | wrapper skipped |
| `nice -n 10 git commit -m x` | main | DENY | wrapper and its flag skipped |
| `FOO=bar git commit -m x` | main | DENY | env-assignment prefix skipped |
| `env -u X env -u Y git commit -m x` | main | DENY | multiple wrappers skipped |
| `echo git commit -m x` | main | DENY | accepted over-deny: scan finds the literal `git` argument; safe bias |
| `git commit -m "git switch feature"` | main | DENY | anchored fix intact: leading `git` at pos 0 -> `commit`; embedded `git` is an argument |
| `git tag -m "git switch main" v1` | main | ALLOW | leading subcommand is `tag`; embedded text ignored |
| `npm run build` | main | ALLOW | no `git` token anywhere -> neither |

## 17) Conditionally-gated switch in an `if`/`elif` condition

A switch that is the CONDITION of an `if`/`elif` only conditionally succeeds:
if it fails the branch never changed (the `else` branch runs on the pre-switch
branch); if it succeeds the `then` branch runs on the target. So its resolution
is not trusted -- if main is reachable either way (the post-switch target OR the
pre-switch branch), eff is re-pinned to main (persisting to then/else). This is
the same conservative treatment `||` already gets (the third conditional-execution
carve-out). It distinguishes the legit case by the targets, and biases to
over-deny, never under-deny. A switch in a `then`/`else` BRANCH is not gated
(if reached, it ran) and is trusted as normal.

| Command | From | Result | Rationale |
|---|---|---|---|
| `if git switch does-not-exist; then :; else git commit -m x; fi` | main | DENY | the condition switch fails, the `else` commit runs on the still-current main |
| `if git switch feature; then git commit -m x; fi` | feature | ALLOW | neither the target (feature) nor the pre-switch branch (feature) is main |
| `if git switch main; then git commit -m x; fi` | feature | DENY | if the condition switch to main succeeds, the `then` commit is on main |
| `if git switch feature; then git commit -m x; fi` | main | DENY | accepted over-deny: the `else`-on-main path (switch fails) is possible, so main is pinned even though the `then` commit would be on feature |
| `if git status; then git commit -m x; fi` | main | DENY | non-switch condition changes nothing; commit on main |
| `if git status; then git commit -m x; fi` | feature | ALLOW | non-switch condition; commit on feature |
| `if git switch feature; then : ; elif git switch main; then git commit -m x; fi` | main | DENY | `elif` condition switch to main is also gated -> main reachable |
| `if git switch other; then git switch feat2; git commit -m x; fi` | feature | ALLOW | the `then`-branch switch (not gated) moves to feat2; commit off main |

## 18) Interpreter-wrapped quoted command (`bash -c '…'`, `sh -c`, `ssh`, `su -c`)

A multi-word command handed to another interpreter as a quoted string
word-splits (the splitter and token scan are quote-unaware) into `'git … x'`
with a stray LONE quote glued to the first (`'git`) and last (`x'`) tokens. Token
normalization now peels a lone leading OR trailing quote (not just a matched
pair), so the real `git` token and any switch target are recognized on both ends.

| Command | From | Result | Rationale |
|---|---|---|---|
| `bash -c 'git commit -m x'` | main | DENY | `'git` -> `git`, `x'` -> `x`; scan finds the real commit on main |
| `sh -c 'git commit -m x'` | main | DENY | same for `sh` |
| `bash -c 'git commit -m x'` | feature | ALLOW | commit off main |
| `bash -c "git commit -m x"` | main | DENY | double-quoted variant peeled the same way |
| `su -c 'git commit -m x'` | main | DENY | any interpreter wrapper, no wrapper-list needed (scan-forward) |
| `ssh host 'git commit -m x'` | main | DENY | remote-shell wrapper, same shape |
| `bash -c 'git switch feature'` | main | ALLOW | the real switch is recognized as leaving main; no commit -> not over-denied |
| `bash -c 'git switch main && git commit -m x'` | feature | DENY | splits on the inner `&&`: switch to main then commit -> on main |
| `bash -c 'git switch feature && git commit -m x'` | main | ALLOW | switch to feature then commit -> off main |

## 19) Only `&&` trusts the prior switch — `;` `|` `&` `||` do not

`A && B` runs B only if A succeeded, so reaching B proves A's switch took effect
(trust it). Every OTHER separator — `;`, `|`, `&`, `||` — runs the next statement
regardless of whether the prior switch actually succeeded, so a switch before any
of them is NOT trusted: if main was reachable before it (the pre-switch branch)
or after it (the attempted target), main is re-pinned. Generalizes the earlier
`||`-only treatment. Biases to over-deny (a `;`-chained switch that really
succeeds is treated as if it might have failed), never under-deny; use `&&` for
an ordinary "switch then commit" so it stays trusted.

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch no-such-branch ; git commit -m x` | main | DENY | the `;` runs the commit even though the switch failed -> still on main |
| `git switch no-such-branch \| git commit -m x` | main | DENY | pipe runs the RHS regardless of the switch's success |
| `git switch no-such-branch & git commit -m x` | main | DENY | background `&` runs the commit regardless |
| `git switch main ; git commit -m x` | feature | DENY | a real switch to main; the commit lands on main |
| `git switch feature && git commit -m x` | main | ALLOW | regression: `&&` proves the switch succeeded -> off main, ordinary case still works |
| `git switch feature ; git commit -m x` | main | DENY | accepted over-deny: `;` doesn't prove the switch succeeded, so the on-main path is possible |
| `git switch feature ; git commit -m x` | feature | ALLOW | neither the target nor the pre-switch branch is main |
| `git switch main ; git fetch ; git pull` | main | ALLOW | no commit anywhere |

## 20) Options taking a separate value token (`--conflict <style>` etc.)

Some switch/checkout options take a SEPARATE following value token (confirmed
via `git switch -h` / `git checkout -h`). The generic `-*` skip ignored the flag
but let its value fall through to operand capture, so the value (e.g. `merge`)
was recorded as the branch target instead of the real branch that follows it.
Covered set: `--conflict <style>` (both commands); checkout-only `-U`/`--unified
<n>`, `--inter-hunk-context <n>`, `--pathspec-from-file <file>`. Long-form
create flags `--create`/`--force-create`/`--orphan <branch>` are treated as
create-type (their argument IS the resulting branch), same as `-c`/`-C`/`-b`/`-B`.
Deliberately NOT consuming a following token: `--track[=…]` and
`--recurse-submodules[=…]` (glued-only optional args) and all `--no-` negations
(they take no value) — treating those as value-consuming would swallow a real
branch target and could under-deny.

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch --conflict merge main && git commit -m x` | feature | DENY | `merge` is the `--conflict` value, consumed; the real target is `main` |
| `git checkout --conflict merge main && git commit -m x` | feature | DENY | checkout supports the same flag (per `-h`); same handling |
| `git switch --conflict merge feature && git commit -m x` | main | ALLOW | regression: real switch off main still recognized |
| `git switch --conflict=merge main && git commit -m x` | feature | DENY | glued form stays in the generic `-*` skip; target `main` |
| `git switch --no-conflict main && git commit -m x` | feature | DENY | `--no-` negation consumes nothing; `main` is the target |
| `git switch --create feat2 && git commit -m x` | main | ALLOW | long-form create; resulting branch is `feat2` |
| `git switch --create main-copy main && git commit -m x` | feature | ALLOW | created branch `main-copy` wins over the `main` start-point |
| `git switch --orphan newbie && git commit -m x` | main | ALLOW | `--orphan` is create-type; resulting branch `newbie` |
| `git switch --orphan main && git commit -m x` | feature | DENY | the orphan branch is literally named `main`; name-based deny |
| `git checkout --pathspec-from-file specs.txt && git commit -m x` | main | DENY | the file value is consumed, no target -> fail closed, still main |

## 21) `-t` / `--track` remote-tracking DWIM (local name = remote prefix stripped)

`git switch -t origin/main` / `git checkout --track origin/main` create and
switch to a LOCAL branch named after the remote-tracking ref with the remote
prefix stripped (verified against real git in a clone, not guessed):
`origin/main` -> `main`, `remotes/origin/main` -> `main`,
`refs/remotes/origin/feature-x` -> `feature-x`, and multi-slash
`origin/team/main` -> `team/main` (ONLY the first/remote segment is stripped).
The hook mirrors this: when an operand (not an explicit `-c`/`-b`/`--orphan`
name, not a previous-branch ref) contains `/`, it strips optional `refs/`,
optional `remotes/`, then the first segment, and collapses to `main` if that
DWIM name is `main`. Deny-monotonic: stripping can only ADD a main match, so a
local branch literally named e.g. `team/main` over-denies (accepted), never the
reverse.

| Command | From | Result | Rationale |
|---|---|---|---|
| `git switch -t origin/main && git commit -m x` | feature | DENY | DWIM creates and switches to LOCAL `main`; the raw string `origin/main` never matching `main` was the under-deny |
| `git checkout --track origin/main && git commit -m x` | feature | DENY | same via checkout's `--track` |
| `git checkout --track origin/feature-x && git commit -m x` | feature | ALLOW | regression: a real non-main tracking branch still works |
| `git switch -t origin/team/main && git commit -m x` | feature | ALLOW | multi-slash: real git creates `team/main` (only the remote segment is stripped), not `main` |
| `git checkout --track remotes/origin/main && git commit -m x` | feature | DENY | `remotes/` spelling DWIMs to local `main` (verified) |
| `git switch -t refs/remotes/origin/main && git commit -m x` | feature | DENY | full-ref spelling DWIMs to local `main` |
| `git switch -t origin/feature-x && git commit -m x` | main | ALLOW | DWIM off main to `feature-x` |
| `git switch team/main && git commit -m x` | feature | DENY | accepted over-deny: a local branch literally named `team/main` collapses to `main` textually; the hook cannot know whether it is a local slashed branch or a remote DWIM |
| `git switch -c origin/main-x start && git commit -m x` | feature | ALLOW | an explicitly created name is literal; no stripping |

## 22) Leading `!` negation (and the audited exit-status constructs)

`! git switch X && git commit` runs the commit ONLY when the switch FAILED (`!`
inverts the exit status), i.e. still on the pre-switch branch. So on a negated
switch statement, eff STAYS at the pre-switch branch (the `&&`-follower world),
and the attempted target is recorded in `eff_prev` so weak-separator followers
(`;` `|` `&` `||`), which run regardless of (or on inverted) success, still see
main reachability through the target. Switching TO main is deliberately NOT
honoured on a negated statement: in the world where the `&&` follower runs,
that switch did not happen.

| Command | From | Result | Rationale |
|---|---|---|---|
| `! git switch no-such-branch && git commit -m x` | main | DENY | commit runs in the switch-FAILED world = still main |
| `! git switch main && git commit -m x` | feature | ALLOW | inverse case: if the switch to main SUCCEEDS, `!` exits 1 and `&&` skips the commit; the commit only runs when the switch failed -> feature. Either way no commit on main |
| `! git switch main \|\| git commit -m x` | feature | DENY | the `\|\|` world is "negation failed" = switch SUCCEEDED = on main (caught via eff_prev=target + weak-sep pin) |
| `! git switch main ; git commit -m x` | feature | DENY | `;` runs regardless; the on-main world is reachable |
| `! git switch feature && git commit -m x` | main | DENY | failed world = still main |
| `if ! git switch main; then git commit -m x; fi` | feature | DENY | `if` sets in_cond, which pins both worlds; over-deny of the then-world-on-feature case, accepted |
| `until git switch main; do :; done; git commit -m x` | feature | DENY | audit: loop exits when the switch to main SUCCEEDS -> commit on main; weak-sep handling already covers it |
| `while git switch feature; do git commit -m x; done` | main | DENY | audit: body world is `feature`, but the pre-switch main stays reachable via weak-sep pin; over-deny, safe |
| `git switch x ; case $? in 1) git commit -m x;; esac` | main | DENY | audit: `case $?` fragments arrive via `;` -> weak-sep reset covers them |
| `! true && git commit -m x` | main | DENY | negated non-git statement; the commit still classifies on main |

## A) settings.json — `git commit --amend` requires approval

`Bash(git commit:*)` in the allow list also matched `git commit --amend`, which
rewrites the current tip (a history rewrite, forbidden by CLAUDE.md §3). Added
`Bash(git commit --amend:*)` to the deny list so amend requires approval like
`push`/`merge`/`reset --hard` already do. (The hook independently classifies an
amend as a `commit`, so an amend on `main` is also blocked by the hook; the
settings deny is what stops an amend on a feature branch.)

| Command | Guarded by | Result | Rationale |
|---|---|---|---|
| `git commit --amend -m x` | settings deny + hook | blocked | deny `Bash(git commit --amend:*)`; also a commit-on-main via the hook when on main |
| `git commit --amend -m x` (feature) | settings deny | blocked | hook allows an amend on a feature branch, but the settings deny requires approval |

Best-effort caveat (same as the other prefix denies, per CLAUDE.md §3): a
reordered spelling like `git commit -a --amend` puts `--amend` after another
flag, so the prefix pattern does not match it -- an accepted limitation, not a
hard block.

## B) `.env` reachable via `git diff` / `git add` (Bash) — ACCEPTED limitation

The `.env` Read/Edit/Write **tool** denies (§S) do not cover Bash: `git diff .env`
can print `.env` content and `git add .env` can stage it, both broadly allowed
via `Bash(git diff:*)` / `Bash(git add:*)`, without going through the denied
file tools. This is the SAME class as the `git -C`/`-c` push/merge best-effort
gap (CLAUDE.md §3): a Bash allow-list is best-effort, not a hard boundary. It is
documented and accepted, **not** code-fixed, because:
- the Read/Edit/Write denies remain the real protection against Claude's own
  file tools (the common path);
- the actual tracked `.env` in this repo is the intentionally **public** Supabase
  browser config (`VITE_`-prefixed publishable/anon key, safe to commit per its
  own header comment), so nothing sensitive is exposed today.

REVISIT trigger (stated explicitly): if a genuinely secret `.env.local` (or any
non-public env file) is ever introduced, this limitation must be reconsidered --
narrow the Bash git allow rules or add Bash denies for env paths at that point.

## S) settings.json `.env` deny anchoring — CORRECTED to `/.env` (authoritative)

Not a hook case; recorded here so the correct form is not flip-flopped again.
The `.env` Read/Edit/Write denies use the **single-leading-slash** form
(`Read(/.env)`, `Read(/.env.*)`, and Edit/Write equivalents). This is the
authoritative, documented behaviour and must not be changed to `./.env`.

Per the official Claude Code docs
(https://code.claude.com/docs/en/permissions, "Read and Edit", the `/path`
resolution table): for a **project-level** settings file (`.claude/settings.json`)
a single-leading-slash pattern `/path` resolves to **`<project root>/path`** —
NOT the `.claude/` folder and NOT the filesystem root. By contrast `./path` (or a
bare `path`) resolves relative to the **current working directory**, which is
unsafe here: a session `cd`'d into a subdirectory would have `./.env` resolve to
`<subdir>/.env`, leaving the real `<project root>/.env` reachable via `../.env` —
reopening the exact bypass the first review pass (077d591) found and 81e95ae
closed. So `/.env` is correct and `./.env` is a regression.

| Form | Anchors to (project settings) | Verdict |
|---|---|---|
| `Read(/.env)` / `Read(/.env.*)` | `<project root>/.env[.*]` | CORRECT — protects the real root `.env` regardless of session cwd |
| `Read(./.env)` / bare `Read(.env)` | `<cwd>/.env` | UNSAFE — from a subdir the root `.env` is reachable via `../.env` |

History note: an earlier commit this round changed `/.env` → `./.env` based on an
inconclusive in-session empirical test (the probe Read was DENIED under *both*
forms, and it was never established whether the running session hot-reloads
`settings.json` mid-session, so the test could not distinguish the two). That
test is unreliable for this question; **the docs table above is the authoritative
source**, and the change has been reverted. No re-run of the unreliable test.

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
- **Echoed non-main switch inside a non-git statement** — ACCEPTED EXCEPTION, NOT
  fixed (the one case that UNDER-denies, so called out separately from the
  over-deny limitations above). The gphase-0 scan finds the first literal `git`
  token anywhere in a statement, so `echo git switch feature && git commit -m x`
  on main is read as two statements: the first "switches" eff to `feature`
  (clearing main), and the second commits, allowed. This contradicts the
  "over-classification only ever over-denies" claim. It requires a shell-echoed
  switch-to-a-non-main-branch immediately before a real commit — no realistic
  agent command takes this shape, so it is deliberately OUT OF SCOPE rather than
  chased with more parsing (found by @claude; accepted, not fixed). The hook
  header comment is softened to note this exception.
- **`@{-2}` and higher resolve against the PRE-COMMAND reflog** — KNOWN
  LIMITATION, no fix (found by Codex). Only `@{-1}` has in-chain tracking (via
  `eff_prev`); `@{-2}`, `@{-3}`, … are resolved with `git rev-parse` against the
  real reflog as it stood BEFORE the command ran, ignoring any switches earlier
  in the same compound Bash command that would shift the reflog positions. A
  full fix needs a switch-history stack instead of the single `eff_prev`, for a
  pattern (multi-step `@{-N}` chaining within one shell command) that is
  extremely unlikely in practice. Note the resolution still fails CLOSED (an
  unresolvable `@{-N}` is treated as main), so the plain single-statement
  `@{-N}` cases stay correct; only the in-chain-shifted variant can misresolve.
  Accepted; revisit only if agents ever actually emit chained `@{-N}` commands.
- **Exit-status-conditional constructs — deliberate class audit** (done after
  `!` became the fourth variant of the same root issue, following `||`,
  `if`/`elif`, and `;`/`|`/`&`). Each bash construct that gates execution on a
  prior command's exit status was checked against the current logic:
  - `until git switch X; do …; done` — SAFE via weak-separator handling: the
    body/followers arrive via `;` splits, and the poll-until-main shape
    (`until git switch main; …; git commit`) correctly DENIES because the loop
    exits when the switch SUCCEEDS. Matrix row in category 22.
  - `while git switch X; do …; done` — SAFE (over-denies the from-main,
    non-main-target body; accepted bias). Matrix row in category 22.
  - `case $? in …` — SAFE: the fragments arrive via `;` splits -> weak-separator
    reset. Matrix row in category 22.
  - subshell condition `( git switch X ) && …` — already correct (category 15):
    the exit status passes through the subshell unchanged.
  - `elif` beyond the first branch — already covered: each `elif` is the first
    token of its own `;`-split statement (category 17).
  - `if ! git switch X; then …` — covered by in_cond, which pins both worlds
    (over-denies the then-world-on-feature case; accepted). Matrix row in
    category 22.
  - `[[ $(git switch …) ]]` / `test` wrapping — command substitution, already
    out of scope.
  - **Variable-expanded targets** (`git switch "$BRANCH" && git commit`) — the
    one structurally different gap found: a textual hook cannot know the
    variable's value, so `$BRANCH`=main under-denies. Cannot be closed cheaply
    (needs environment knowledge); agents emit literal branch names. ACCEPTED
    and added to the Scope & accepted limits list, not fixed.
  Conclusion: with `!` fixed and `while`/`until`/`case $?` verified safe, the
  known exit-status-conditional constructs are all either handled, verified
  safe, or explicitly documented — a fifth variant of THIS class should be
  triaged against this list first.
