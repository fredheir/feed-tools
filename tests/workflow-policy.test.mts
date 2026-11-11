import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sharedRef = readFileSync(
  path.join(repoRoot, ".repo-standards-ref"),
  "utf8",
).trim();
const trustedCondition =
  "github.event_name != 'pull_request' || (github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.user.login != 'dependabot[bot]')";
const publicCondition =
  "github.event_name == 'pull_request' && (github.event.pull_request.head.repo.full_name != github.repository || github.event.pull_request.user.login == 'dependabot[bot]')";

const publicValidationWorkflows = [
  ["dead-code.yml", "dead-code"],
  ["dependency.yml", "dependency"],
  ["format.yml", "format"],
  ["lint.yml", "lint"],
  ["tests.yml", "test"],
  ["typecheck.yml", "typecheck"],
  ["slop-scan.yml", "ratchet"],
] as const;

function readWorkflow(name: string): string {
  return readFileSync(
    path.join(repoRoot, ".github", "workflows", name),
    "utf8",
  );
}

function jobBody(workflow: string, jobName: string): string {
  const match = workflow.match(
    new RegExp(`^  ${jobName}:\\n([\\s\\S]*?)(?=^  \\S[^:]*:|$)`, "m"),
  );
  expect(match, `${jobName} job must exist`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("workflow Bun provisioning", () => {
  it("pins Bun and installs replacements without a writable global npm prefix", () => {
    for (const name of readdirSync(
      path.join(repoRoot, ".github", "workflows"),
    )) {
      const workflow = readWorkflow(name);
      for (const step of workflow.split(/^      - /m)) {
        if (step.includes("uses: oven-sh/setup-bun@")) {
          expect(step, name).toContain('bun-version: "1.4.4"');
        }
        if (!step.includes("bun_target=")) continue;

        expect(step, name).toContain("bun_target=1.4.4");
        expect(step, name).toContain('bun_prefix="$RUNNER_TEMP/bun"');
        expect(step, name).toContain(
          'npm install --global --prefix "$bun_prefix" --allow-scripts=bun "bun@$bun_target"',
        );
        expect(step, name).toContain('export PATH="$bun_prefix/bin:$PATH"');
        expect(step, name).toContain(
          'echo "$bun_prefix/bin" >> "$GITHUB_PATH"',
        );
        expect(step, name).toContain('test "$(bun --version)" = "$bun_target"');
      }
    }
  });
});

describe("workflow trust boundaries", () => {
  it("pins every shared standards checkout to the repository pin", () => {
    expect(sharedRef).toMatch(/^[a-f0-9]{40}$/);

    for (const [name] of publicValidationWorkflows) {
      expect(readWorkflow(name)).toContain(
        `MARKOLO_SHARED_STANDARDS_REF: ${sharedRef}`,
      );
    }
    for (const name of ["actions-hygiene.yml", "contract.yml", "secrets.yml"]) {
      expect(readWorkflow(name)).toContain(
        `MARKOLO_SHARED_STANDARDS_REF: ${sharedRef}`,
      );
    }
  });

  it("keeps public validation jobs enabled while gating private standards steps", () => {
    for (const [name, jobName] of publicValidationWorkflows) {
      const workflow = readWorkflow(name);
      const body = jobBody(workflow, jobName);

      expect(
        body,
        `${name} must not skip the public job for fork PRs`,
      ).not.toMatch(/^    if:/m);
      expect(workflow).toContain(`if: ${trustedCondition}`);
      expect(workflow).toContain(`if: ${publicCondition}`);
      expect(workflow).toContain("pnpm install --frozen-lockfile");
    }
  });

  it("installs the pinned Bash runtime before checking the contract", () => {
    const workflow = readWorkflow("contract.yml");
    const install = workflow.indexOf(
      "run: .repo-standards/markolo-shared/scripts/ci/install-bash",
    );
    expect(install).toBeGreaterThan(-1);
    expect(install).toBeLessThan(
      workflow.indexOf("run: scripts/ci/just doctor"),
    );
  });

  it("keeps standards-only jobs private", () => {
    for (const [name, jobName] of [
      ["actions-hygiene.yml", "actions-hygiene"],
      ["contract.yml", "contract"],
      ["secrets.yml", "secrets"],
    ] as const) {
      expect(jobBody(readWorkflow(name), jobName)).toContain(
        `if: ${trustedCondition}`,
      );
    }
  });
});
