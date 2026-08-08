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

function normalizeExpression(expression: string) {
  let quote: "'" | '"' | undefined;

  return [...expression]
    .filter((character) => {
      if (quote !== undefined) {
        if (character === quote) quote = undefined;
        return true;
      }

      if (character === "'" || character === '"') {
        quote = character;
        return true;
      }

      return !/\s/.test(character);
    })
    .join("");
}

function extractSingleWorkflowValue(
  workflow: string,
  field: string,
  pattern: RegExp,
) {
  const matches = [...workflow.matchAll(pattern)];
  expect(matches, `${field} must occur exactly once`).toHaveLength(1);
  return matches[0]?.[1] ?? "";
}

describe("commitlint Dependabot policy", () => {
  it("preserves quoted branch prefixes and config paths while ignoring layout whitespace", () => {
    const branchGuard = "startsWith(github.head_ref, 'dependabot/')";
    const configSelection =
      "env.VERIFIED_DEPENDABOT_PR == 'true' && 'commitlint.dependabot.config.cjs'";

    expect(normalizeExpression(`  ${branchGuard}\n`)).toBe(
      normalizeExpression(branchGuard),
    );
    expect(
      normalizeExpression(branchGuard.replace("dependabot/", "dependabot /")),
    ).not.toBe(normalizeExpression(branchGuard));
    expect(
      normalizeExpression(
        configSelection.replace(
          "commitlint.dependabot.config.cjs",
          "commitlint.dependabot.config .cjs",
        ),
      ),
    ).not.toBe(normalizeExpression(configSelection));
  });

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
    const guard = extractSingleWorkflowValue(
      workflow,
      "VERIFIED_DEPENDABOT_PR",
      /^\s{6}VERIFIED_DEPENDABOT_PR:\s*(.+)$/gm,
    );
    const configSelection = extractSingleWorkflowValue(
      workflow,
      "configFile",
      /^\s{10}configFile:\s*(.+)$/gm,
    );
    const expectedGuard =
      "${{ github.event_name == 'pull_request' && github.event.pull_request.user.login == 'dependabot[bot]' && github.event.pull_request.user.type == 'Bot' && github.event.pull_request.head.repo.full_name == github.repository && startsWith(github.head_ref, 'dependabot/') }}";
    const expectedConfigSelection =
      "${{ env.VERIFIED_DEPENDABOT_PR == 'true' && 'commitlint.dependabot.config.cjs' || 'commitlint.config.cjs' }}";

    expect(normalizeExpression(guard)).toBe(normalizeExpression(expectedGuard));
    expect(normalizeExpression(configSelection)).toBe(
      normalizeExpression(expectedConfigSelection),
    );
  });
});
