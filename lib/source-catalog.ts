import { listManifestSourceNames } from "../sources/manifest.ts";
export {
  isManifestSourceName as isSupportedSource,
  listManifestSourceNames as listSupportedSources,
} from "../sources/manifest.ts";

export const SUPPORTED_SOURCES = Object.freeze(listManifestSourceNames());
