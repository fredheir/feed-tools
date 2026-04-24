set shell := ["bash", "-euo", "pipefail", "-c"]

fmt:
    scripts/dev/fmt

fix:
    scripts/dev/fmt

fmt-check:
    scripts/dev/fmt-check

lint:
    scripts/dev/lint

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

sync-if-needed:
    scripts/dev/sync-if-needed

gen:
    @echo "No tracked generated artefact generator configured for feed_tools."

gen-check:
    @echo "No tracked generated artefact check configured for feed_tools."

check-changed:
    just fix
    just doctor-staged
    just lint
    just typecheck
    just test-fast

check: doctor fmt-check lint typecheck test secrets deps-check gen-check

ci: check

hooks-install:
    git hook run --ignore-missing --allow-unknown-hook-name __codex_probe__ >/dev/null 2>&1 || { echo "Git config-based hooks require git hook support; upgrade Git before installing repo hooks." >&2; exit 1; }
    config_tmp="$(mktemp)"; trap 'rm -f "$config_tmp"' EXIT; if git config --local --get-all core.hooksPath > "$config_tmp"; then git config --local --unset-all core.hooksPath; fi
    rm -f "$(git rev-parse --git-path hooks/pre-commit)" "$(git rev-parse --git-path hooks/commit-msg)" "$(git rev-parse --git-path hooks/prepare-commit-msg)" "$(git rev-parse --git-path hooks/pre-push)" "$(git rev-parse --git-path hooks/post-merge)" "$(git rev-parse --git-path hooks/post-checkout)"
    git config --local --replace-all hook.lefthook-pre-commit.event pre-commit
    git config --local --replace-all hook.lefthook-pre-commit.command "pnpm exec lefthook run pre-commit --no-auto-install"
    git config --local --replace-all hook.lefthook-commit-msg.event commit-msg
    git config --local --replace-all hook.lefthook-commit-msg.command "pnpm exec lefthook run commit-msg --no-auto-install"
    git config --local --replace-all hook.lefthook-pre-push.event pre-push
    git config --local --replace-all hook.lefthook-pre-push.command "pnpm exec lefthook run pre-push --no-auto-install"
    git config --local --replace-all hook.lefthook-post-merge.event post-merge
    git config --local --replace-all hook.lefthook-post-merge.command "pnpm exec lefthook run post-merge --no-auto-install"
    git config --local --replace-all hook.lefthook-post-checkout.event post-checkout
    git config --local --replace-all hook.lefthook-post-checkout.command "pnpm exec lefthook run post-checkout --no-auto-install"
