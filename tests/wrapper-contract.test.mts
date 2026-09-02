import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const standardsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "repo-standards.config.json"), "utf8"),
) as { managedScripts?: string[] };
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function writeExecutable(filePath: string, contents: string): void {
  fs.writeFileSync(filePath, contents);
  fs.chmodSync(filePath, 0o755);
}

function readArgumentLog(filePath: string): string[][] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs
    .readFileSync(filePath, "utf8")
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

type CheckPathsRun = {
  status: number | null;
  stdout: string;
  stderr: string;
  pnpmArgv: string[][];
};

function runCheckPaths(
  paths: string[],
  options: { pnpmExitStatus?: number; requireBiomeCi?: boolean } = {},
): CheckPathsRun {
  const temporaryRoot = makeTemporaryDirectory("feed-tools-check-paths-");
  const scriptsDirectory = path.join(temporaryRoot, "scripts", "dev");
  const binDirectory = path.join(temporaryRoot, "bin");
  const logPath = path.join(temporaryRoot, "pnpm-argv.log");
  fs.mkdirSync(scriptsDirectory, { recursive: true });
  fs.mkdirSync(binDirectory, { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, "scripts", "dev", "check-paths"),
    path.join(scriptsDirectory, "check-paths"),
  );
  fs.chmodSync(path.join(scriptsDirectory, "check-paths"), 0o755);
  fs.mkdirSync(path.join(temporaryRoot, "lib"), { recursive: true });
  const sourcePath = path.join(temporaryRoot, "lib", "example.ts");
  fs.writeFileSync(sourcePath, "const value = 1;\n");

  writeExecutable(
    path.join(binDirectory, "pnpm"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s' "$1" >> "$FAKE_PNPM_LOG"
for arg in "\${@:2}"; do printf '\\t%s' "$arg" >> "$FAKE_PNPM_LOG"; done
printf '\\n' >> "$FAKE_PNPM_LOG"
if [[ "\${FAKE_REQUIRE_BIOME_CI:-0}" == 1 && "$1" == exec && "$2" == biome && "$3" == ci ]]; then
  has_ci=0
  for arg in "$@"; do
    if [[ "$arg" == ci ]]; then
      has_ci=1
    fi
  done
  if ((has_ci == 0)); then
    echo 'fake Biome requires ci' >&2
    exit 41
  fi
fi
if [[ "\${FAKE_PNPM_EXIT_STATUS:-0}" -ne 0 ]]; then
  echo 'fake pnpm failed' >&2
  exit "\${FAKE_PNPM_EXIT_STATUS}"
fi
`,
  );

  const environment = { ...process.env };
  delete environment.REPO_STANDARDS_LOCAL;
  delete environment.REPO_STANDARDS_OFFLINE;
  const result = spawnSync(path.join(scriptsDirectory, "check-paths"), paths, {
    cwd: temporaryRoot,
    encoding: "utf8",
    env: {
      ...environment,
      FAKE_PNPM_EXIT_STATUS: String(options.pnpmExitStatus ?? 0),
      FAKE_PNPM_LOG: logPath,
      FAKE_REQUIRE_BIOME_CI: options.requireBiomeCi ? "1" : "0",
      PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
    },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    pnpmArgv: readArgumentLog(logPath),
  };
}

type StandardsRun = {
  status: number | null;
  stdout: string;
  stderr: string;
  gitArgv: string[][];
  gitEnvironment: string;
  nodeArgv: string[][];
};

function runStandardsBootstrap(
  options: { gitExitStatus?: number; nodeExitStatus?: number } = {},
): StandardsRun {
  const temporaryRoot = makeTemporaryDirectory("feed-tools-standards-");
  const scriptsDirectory = path.join(temporaryRoot, "scripts", "guards");
  const binDirectory = path.join(temporaryRoot, "bin");
  const cacheDirectory = path.join(temporaryRoot, "cache");
  const gitLogPath = path.join(temporaryRoot, "git-argv.log");
  const gitEnvironmentPath = path.join(temporaryRoot, "git-environment.log");
  const nodeLogPath = path.join(temporaryRoot, "node-argv.log");
  const globalConfigPath = path.join(temporaryRoot, "global.gitconfig");
  const systemConfigPath = path.join(temporaryRoot, "system.gitconfig");
  const expectedRef = fs
    .readFileSync(path.join(repoRoot, ".repo-standards-ref"), "utf8")
    .trim();
  fs.mkdirSync(scriptsDirectory, { recursive: true });
  fs.mkdirSync(binDirectory, { recursive: true });
  fs.writeFileSync(globalConfigPath, "[credential]\n\thelper = test\n");
  fs.writeFileSync(systemConfigPath, "");
  fs.writeFileSync(
    path.join(temporaryRoot, ".repo-standards-ref"),
    expectedRef,
  );
  fs.writeFileSync(
    path.join(temporaryRoot, "repo-standards.config.json"),
    "{}\n",
  );
  const wrapperPath = path.join(scriptsDirectory, "_repo-standards");
  fs.copyFileSync(
    path.join(repoRoot, "scripts", "guards", "_repo-standards"),
    wrapperPath,
  );
  fs.chmodSync(wrapperPath, 0o755);

  const fakeGitPath = path.join(binDirectory, "git");
  writeExecutable(
    fakeGitPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s' "$1" >> "$FAKE_GIT_LOG"
for arg in "\${@:2}"; do printf '\\t%s' "$arg" >> "$FAKE_GIT_LOG"; done
printf '\\n' >> "$FAKE_GIT_LOG"
printf 'GIT_CONFIG_GLOBAL=%s\\n' "\${GIT_CONFIG_GLOBAL-}" >> "$FAKE_GIT_ENV_LOG"
printf 'GIT_CONFIG_SYSTEM=%s\\n' "\${GIT_CONFIG_SYSTEM-}" >> "$FAKE_GIT_ENV_LOG"

args=("$@")
worktree=""
for ((index = 0; index < \${#args[@]}; index += 1)); do
  if [[ "\${args[index]}" == -C && \$((index + 1)) -lt \${#args[@]} ]]; then
    worktree="\${args[index + 1]}"
  fi
done

has_arg() {
  local wanted="$1"
  local arg
  for arg in "\${args[@]}"; do
    if [[ "$arg" == "$wanted" ]]; then
      return 0
    fi
  done
  return 1
}

if has_arg fetch && [[ "\${FAKE_GIT_FAIL_ACTION:-}" == fetch ]]; then
  echo 'fake git failed' >&2
  exit "\${FAKE_GIT_EXIT_STATUS:-42}"
fi
if has_arg init; then
  mkdir -p "$worktree/.git"
  exit 0
fi
if has_arg checkout && has_arg --detach; then
  mkdir -p "$worktree/packages/repo-standards/dist"
  printf '%s\\n' 'fake cli' > "$worktree/packages/repo-standards/dist/cli.js"
  exit 0
fi
if has_arg rev-parse && has_arg HEAD; then
  [[ -d "$worktree/.git" ]] || exit 128
  printf '%s\\n' "$FAKE_GIT_EXPECTED_REF"
  exit 0
fi
if has_arg symbolic-ref; then
  exit 1
fi
if has_arg config && has_arg --local; then
  exit 1
fi
if has_arg status; then
  exit 0
fi
if has_arg cat-file; then
  printf '%s\\n' 'fake cli'
  exit 0
fi
if has_arg hash-object; then
  printf '%s\\n' "$FAKE_GIT_BLOB"
  exit 0
fi
if has_arg rev-parse; then
  for arg in "\${args[@]}"; do
    if [[ "$arg" == "\${FAKE_GIT_EXPECTED_REF}:packages/repo-standards/dist/cli.js" ]]; then
      printf '%s\\n' "$FAKE_GIT_BLOB"
      exit 0
    fi
  done
fi
`,
  );
  writeExecutable(
    path.join(binDirectory, "node"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s' "$1" >> "$FAKE_NODE_LOG"
for arg in "\${@:2}"; do printf '\\t%s' "$arg" >> "$FAKE_NODE_LOG"; done
printf '\\n' >> "$FAKE_NODE_LOG"
if [[ "\${FAKE_NODE_EXIT_STATUS:-0}" -ne 0 ]]; then
  echo 'fake node failed' >&2
  exit "\${FAKE_NODE_EXIT_STATUS}"
fi
`,
  );

  const environment = { ...process.env };
  delete environment.REPO_STANDARDS_LOCAL;
  delete environment.REPO_STANDARDS_OFFLINE;
  delete environment.MARKOLO_SHARED_STANDARDS_REF;
  delete environment.MARKOLO_SHARED_STANDARDS_REPOSITORY;
  const result = spawnSync(wrapperPath, [], {
    cwd: temporaryRoot,
    encoding: "utf8",
    env: {
      ...environment,
      FAKE_GIT_BLOB: "fake-blob",
      FAKE_GIT_ENV_LOG: gitEnvironmentPath,
      FAKE_GIT_EXPECTED_REF: expectedRef,
      FAKE_GIT_EXIT_STATUS: String(options.gitExitStatus ?? 42),
      FAKE_GIT_LOG: gitLogPath,
      FAKE_GIT_FAIL_ACTION: options.gitExitStatus === undefined ? "" : "fetch",
      FAKE_NODE_EXIT_STATUS: String(options.nodeExitStatus ?? 0),
      FAKE_NODE_LOG: nodeLogPath,
      GIT_CONFIG_GLOBAL: globalConfigPath,
      GIT_CONFIG_SYSTEM: systemConfigPath,
      PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
      REPO_STANDARDS_CACHE_DIR: cacheDirectory,
      REPO_STANDARDS_GIT_BIN: fakeGitPath,
      TMPDIR: temporaryRoot,
    },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    gitArgv: readArgumentLog(gitLogPath),
    gitEnvironment: fs.existsSync(gitEnvironmentPath)
      ? fs.readFileSync(gitEnvironmentPath, "utf8")
      : "",
    nodeArgv: readArgumentLog(nodeLogPath),
  };
}

describe("consumer-owned standards bootstrap", () => {
  it("de-manages only the auth-aware wrapper from shared script syncing", () => {
    expect(standardsConfig.managedScripts).toEqual(["scripts/ci/just"]);
    expect(
      fs.statSync(path.join(repoRoot, "scripts", "guards", "_repo-standards"))
        .mode & 0o111,
    ).not.toBe(0);
  });
});

describe("check-paths wrapper contract", () => {
  it("uses Biome's non-mutating CI check and forwards tool failures", () => {
    const passingRun = runCheckPaths(["lib/example.ts"], {
      requireBiomeCi: true,
    });

    expect(passingRun).toMatchObject({
      status: 0,
      stderr: "",
      pnpmArgv: [
        ["exec", "biome", "ci", "--", "lib/example.ts"],
        ["exec", "eslint", "--no-warn-ignored", "--", "lib/example.ts"],
      ],
    });
    expect(passingRun.stdout).toContain("Checked 1 path(s).");

    const failingRun = runCheckPaths(["lib/example.ts"], {
      pnpmExitStatus: 37,
      requireBiomeCi: true,
    });

    expect(failingRun.status).toBe(37);
    expect(failingRun.stdout).toBe("");
    expect(failingRun.stderr).toBe("fake pnpm failed\n");
    expect(failingRun.pnpmArgv).toEqual([
      ["exec", "biome", "ci", "--", "lib/example.ts"],
    ]);
  });
});

describe("_repo-standards bootstrap contract", () => {
  it("uses token-free HTTPS and preserves configured Git authentication", () => {
    const run = runStandardsBootstrap();

    expect(run).toMatchObject({ status: 0, stdout: "", stderr: "" });
    expect(
      run.gitArgv.some((argv) =>
        argv
          .join("\t")
          .includes(
            "remote\tadd\torigin\thttps://github.com/Markolo-Research/markolo-shared.git",
          ),
      ),
    ).toBe(true);
    expect(run.gitEnvironment).toMatch(
      /GIT_CONFIG_GLOBAL=.*\/global\.gitconfig/,
    );
    expect(run.gitEnvironment).toContain("GIT_CONFIG_SYSTEM=/dev/null");
    expect(run.nodeArgv).toHaveLength(1);
  });

  it("reports bootstrap Git failures with the command status and stderr", () => {
    const run = runStandardsBootstrap({ gitExitStatus: 43 });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("failed to fetch pinned standards commit");
    expect(run.stderr).toContain("(git exit 43): fake git failed");
    expect(run.nodeArgv).toEqual([]);
  });
});
