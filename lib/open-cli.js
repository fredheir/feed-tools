#!/usr/bin/env node
"use strict";

const { openPathOrUrl } = require("./browser");

if (
  process.argv[2] === "-h" ||
  process.argv[2] === "--help" ||
  process.argv.length !== 3
) {
  console.log("Usage: feed-open <path-or-url>");
  process.exit(0);
}

openPathOrUrl(process.argv[2]);
