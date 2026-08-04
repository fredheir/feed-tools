import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const longGeneratedBodyLine = `Generated dependency metadata: ${"x".repeat(220)}`;
const dependabotLikeMessage = `chore(deps): bump example from 1.0.0 to 1.0.1

${longGeneratedBodyLine}

Signed-off-by: dependabot[bot] <support@github.com>`;

function lint(configFile: string, message: string) {
  return spawnSync("pnpm", ["exec", "commitlint", "--config", configFile], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: message,
  });
}

describe("commitlint Dependabot policy", () => {
  it("rejects a human-spoofable Dependabot message under the normal policy", () => {
    const result = lint("commitlint.config.cjs", dependabotLikeMessage);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("body-max-line-length");
  });

  it("exempts only generated body line length for a verified Dependabot PR", () => {
    const generatedBodyResult = lint(
      "commitlint.dependabot.config.cjs",
      dependabotLikeMessage,
    );
    const invalidHeaderResult = lint(
      "commitlint.dependabot.config.cjs",
      `not a conventional commit\n\n${longGeneratedBodyLine}`,
    );

    expect(generatedBodyResult.status).toBe(0);
    expect(invalidHeaderResult.status).not.toBe(0);
    expect(invalidHeaderResult.stdout).toContain("type-empty");
  });

  it("selects the narrow policy from authenticated GitHub PR metadata", () => {
    const workflow = readFileSync(".github/workflows/commitlint.yml", "utf8");
    const verifiedDependabotExpression =
      "${{ github.event_name == 'pull_request' && github.event.pull_request.user.login == 'dependabot[bot]' && github.event.pull_request.user.type == 'Bot' && github.event.pull_request.head.repo.full_name == github.repository && startsWith(github.head_ref, 'dependabot/') }}";
    const configSelectionExpression =
      "${{ env.VERIFIED_DEPENDABOT_PR == 'true' && 'commitlint.dependabot.config.cjs' || 'commitlint.config.cjs' }}";

    expect(workflow).toContain(
      `VERIFIED_DEPENDABOT_PR: ${verifiedDependabotExpression}`,
    );
    expect(workflow).toContain(`configFile: ${configSelectionExpression}`);
  });
});
