set shell := ["env", "BASH_ENV=/dev/null", "ENV=/dev/null", "bash", "--noprofile", "--norc", "-euo", "pipefail", "-c"]
set minimum-version := "1.58.0"
set default-list := true
set positional-arguments := true

# Format the whole repository.
[group('mutating')]
fmt:
    scripts/dev/fmt

# Apply whole-repository formatting and safe lint fixes.
[group('mutating')]
fix-all:
    scripts/dev/fix-all

# Apply supported fixes only to changed worktree paths.
[group('mutating')]
fix-worktree:
    scripts/dev/fix-worktree

# Check formatting without writing files.
fmt-check:
    scripts/dev/fmt-check

lint:
    scripts/dev/lint

actions-hygiene:
    scripts/guards/_repo-standards actions-hygiene

typecheck:
    scripts/dev/typecheck

test:
    scripts/dev/test

# Run the bounded deterministic Vitest lane (currently the complete local suite).
test-fast:
    scripts/dev/test-fast

# Run a targeted Vitest file, selector, or optional Vitest flags.
[group('agent-safe')]
test-one +targets:
    scripts/dev/test-one "$@"

secrets:
    scripts/guards/secrets

secrets-staged:
    scripts/guards/secrets-staged

deps-check:
    scripts/guards/deps-check

deps-check-fast:
    scripts/guards/deps-check-fast

doctor:
    scripts/guards/repo-contract

doctor-staged:
    scripts/guards/repo-contract --staged

sync:
    scripts/dev/sync

sync-if-needed base_ref="HEAD@{1}":
    scripts/guards/_repo-standards sync-if-needed --base-ref {{quote(base_ref)}}

# Run dead-code analysis without changing the worktree.
deadcode:
    pnpm run deadcode

# Run the slop scan without changing the worktree.
slop-scan:
    pnpm run slop:lint

# Run read-only checks for explicit repository paths.
[group('agent-safe')]
check-paths +paths:
    scripts/dev/check-paths "$@"

# Verify every staged, unstaged, renamed, and untracked path without repair.
[group('agent-safe')]
check-worktree:
    just doctor
    scripts/dev/check-worktree

# Run the complete read-only local proof.
[group('checks')]
check: doctor fmt-check lint actions-hygiene typecheck test secrets deps-check deadcode

deps-update:
    pnpm update --latest

deps-diff:
    git diff -- package.json pnpm-lock.yaml pnpm-workspace.yaml

hooks-install:
    scripts/guards/_repo-standards hooks-install
