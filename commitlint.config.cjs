const isDependabotCommit = (message) =>
  message.startsWith("chore(deps): bump ") &&
  message.includes("Signed-off-by: dependabot[bot]");

module.exports = {
  extends: ["@commitlint/config-conventional"],
  ignores: [isDependabotCommit],
  rules: {
    "body-max-line-length": [2, "always", 200],
  },
};
