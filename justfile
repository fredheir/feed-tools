set shell := ["bash", "-euo", "pipefail", "-c"]

fmt:
    scripts/dev/fmt

fix:
    scripts/dev/fmt

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

test-fast:
    scripts/dev/test-fast

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

check-changed:
    just fix
    just doctor-staged
    just lint
    just typecheck
    just test-fast

check: doctor fmt-check lint actions-hygiene typecheck test secrets deps-check

ci: check

deps-update:
    pnpm update --latest

deps-diff:
    git diff -- package.json pnpm-lock.yaml pnpm-workspace.yaml

hooks-install:
    scripts/guards/_repo-standards hooks-install
