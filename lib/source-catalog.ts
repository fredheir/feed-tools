import { SOURCE_NAMES } from "./source-metadata.ts";

export const SUPPORTED_SOURCES = Object.freeze([...SOURCE_NAMES]);
export const SUPPORTED_SOURCE_SET = new Set<string>(SOURCE_NAMES);
