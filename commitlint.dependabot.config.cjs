const config = require("./commitlint.config.cjs");

module.exports = {
  ...config,
  rules: {
    ...config.rules,
    "body-max-line-length": [0],
  },
};
