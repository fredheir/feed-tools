import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOADER_ENV = "FEED_TOOLS_TSX_LOADER";

/**
 * @param {string} relativePath
 * @param {string=} exportName
 */
export async function runTsEntry(relativePath, exportName) {
  const currentEntry = path.resolve(process.argv[1]);
  if (process.env[LOADER_ENV] !== currentEntry) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", process.argv[1], ...process.argv.slice(2)],
      {
        stdio: "inherit",
        env: { ...process.env, [LOADER_ENV]: currentEntry },
      },
    );
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }

  const entryPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    relativePath,
  );
  const module = await import(pathToFileURL(entryPath).href);
  if (exportName) {
    await module[exportName]();
  }
}
