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

  it("gates the exemption on every Dependabot authenticity signal", () => {
    const workflow = readFileSync(".github/workflows/commitlint.yml", "utf8");
    const guard = workflow.match(/VERIFIED_DEPENDABOT_PR:(.*)/)?.[1] ?? "";
    const configSelection = workflow.match(/configFile:(.*)/)?.[1] ?? "";

    // A spoofed PR must fail at least one of these, so each is load-bearing.
    expect(guard).toContain("github.event_name == 'pull_request'");
    expect(guard).toContain(
      "github.event.pull_request.user.login == 'dependabot[bot]'",
    );
    expect(guard).toContain("github.event.pull_request.user.type == 'Bot'");
    expect(guard).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
    expect(guard).toContain("startsWith(github.head_ref, 'dependabot/')");

    expect(configSelection).toContain("env.VERIFIED_DEPENDABOT_PR == 'true'");
    expect(configSelection).toContain("commitlint.dependabot.config.cjs");
    expect(configSelection).toContain("commitlint.config.cjs");
  });
});
