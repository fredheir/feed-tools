import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sharedRef = "292e07694d059d9049744bb6ad0c078b15d3a491";
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

describe("workflow trust boundaries", () => {
  it("pins every shared standards checkout to the repository pin", () => {
    expect(
      readFileSync(path.join(repoRoot, ".repo-standards-ref"), "utf8").trim(),
    ).toBe(sharedRef);

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
