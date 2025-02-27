import { join } from "path";
import { realpathSync } from "fs-extra";
import { extensions, Uri } from "vscode";
import type {
  DatabaseItem,
  DatabaseManager,
} from "../../src/databases/local-databases";
import type { CodeQLCliServer } from "../../src/codeql-cli/cli";
import type { CodeQLExtensionInterface } from "../../src/extension";
import { importArchiveDatabase } from "../../src/databases/database-fetcher";
import { createMockCommandManager } from "../__mocks__/commandsMock";

// This file contains helpers shared between tests that work with an activated extension.

export const DB_URL =
  "https://github.com/github/vscode-codeql/files/5586722/simple-db.zip";

// We need to resolve the path, but the final three segments won't exist until later, so we only resolve the
// first portion of the path.
export const dbLoc = join(
  realpathSync(join(__dirname, "../../../")),
  "build/tests/db.zip",
);
// eslint-disable-next-line import/no-mutable-exports
export let storagePath: string;

/**
 * Removes any existing databases from the database panel, and loads the test database.
 */
export async function ensureTestDatabase(
  databaseManager: DatabaseManager,
  cli: CodeQLCliServer,
): Promise<DatabaseItem> {
  // Add a database, but make sure the database manager is empty first
  await cleanDatabases(databaseManager);
  const uri = Uri.file(dbLoc);
  const maybeDbItem = await importArchiveDatabase(
    createMockCommandManager(),
    uri.toString(true),
    databaseManager,
    storagePath,
    (_p) => {
      /**/
    },
    cli,
  );

  if (!maybeDbItem) {
    throw new Error("Could not import database");
  }

  return maybeDbItem;
}

export function setStoragePath(path: string) {
  storagePath = path;
}

export async function getActivatedExtension(): Promise<CodeQLExtensionInterface> {
  const extension = await extensions
    .getExtension<CodeQLExtensionInterface | undefined>("GitHub.vscode-codeql")
    ?.activate();
  if (extension === undefined) {
    throw new Error(
      "Unable to active CodeQL extension. Make sure cli is downloaded and installed properly.",
    );
  }
  return extension;
}

export async function cleanDatabases(databaseManager: DatabaseManager) {
  await databaseManager.removeAllDatabases();
}
