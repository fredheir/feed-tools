"use strict";

function requireArgValue(args, index, flag) {
  const value = args[index + 1];
  if (value === undefined || String(value).startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

module.exports = {
  requireArgValue,
};
