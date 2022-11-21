import * as fs from "fs-extra";
import * as path from "path";
import * as vscode from "vscode";
import {
  decodeSourceArchiveUri,
  encodeArchiveBasePath,
  zipArchiveScheme,
} from "../../archive-filesystem-provider";
import { showAndLogInformationMessage } from "../../helpers";

import { logger } from "../../logging";

// exported for testing
export async function findSourceArchive(
  databasePath: string,
): Promise<vscode.Uri | undefined> {
  const relativePaths = ["src", "output/src_archive"];

  for (const relativePath of relativePaths) {
    const basePath = path.join(databasePath, relativePath);
    const zipPath = basePath + ".zip";

    // Prefer using a zip archive over a directory.
    if (await fs.pathExists(zipPath)) {
      return encodeArchiveBasePath(zipPath);
    } else if (await fs.pathExists(basePath)) {
      return vscode.Uri.file(basePath);
    }
  }

  void showAndLogInformationMessage(
    `Could not find source archive for database '${databasePath}'. Assuming paths are absolute.`,
  );
  return undefined;
}

function uriBelongsToSourceArchiveExplorer(
  sourceArchive: vscode.Uri | undefined,
  uri: vscode.Uri,
): boolean {
  if (sourceArchive === undefined) return false;
  return (
    uri.scheme === zipArchiveScheme &&
    decodeSourceArchiveUri(uri).sourceArchiveZipPath === sourceArchive.fsPath
  );
}

/**
 * Returns the index of the workspace folder that corresponds to the source archive of `item`
 * if there is one, and -1 otherwise.
 */
function getDatabaseWorkspaceFolderIndex(
  sourceArchive: vscode.Uri | undefined,
): number {
  return (vscode.workspace.workspaceFolders || []).findIndex((folder) =>
    uriBelongsToSourceArchiveExplorer(sourceArchive, folder.uri),
  );
}

/**
 * Verifies that this database item has a zipped source folder. Returns an error message if it does not.
 */
export function verifyZippedSources(
  dbName: string,
  sourceArchive: vscode.Uri | undefined,
): string | undefined {
  if (sourceArchive === undefined) {
    return `${dbName} has no source archive.`;
  }

  if (!sourceArchive.fsPath.endsWith(".zip")) {
    return `${dbName} has a source folder that is unzipped.`;
  }

  return;
}

/**
 * Returns the root uri of the virtual filesystem for this database's source archive,
 * as displayed in the filesystem explorer.
 */
function getSourceArchiveExplorerUri(
  dbName: string,
  sourceArchive: vscode.Uri | undefined,
): vscode.Uri {
  if (sourceArchive === undefined || !sourceArchive.fsPath.endsWith(".zip")) {
    throw new Error(verifyZippedSources(dbName, sourceArchive));
  }

  return encodeArchiveBasePath(sourceArchive.fsPath);
}

export async function addDatabaseSourceArchiveFolder(
  dbName: string,
  sourceArchive: vscode.Uri | undefined,
) {
  // The folder may already be in workspace state from a previous
  // session. If not, add it.
  const index = getDatabaseWorkspaceFolderIndex(sourceArchive);
  if (index === -1) {
    // Add that filesystem as a folder to the current workspace.
    //
    // It's important that we add workspace folders to the end,
    // rather than beginning of the list, because the first
    // workspace folder is special; if it gets updated, the entire
    // extension host is restarted. (cf.
    // https://github.com/microsoft/vscode/blob/e0d2ed907d1b22808c56127678fb436d604586a7/src/vs/workbench/contrib/relauncher/browser/relauncher.contribution.ts#L209-L214)
    //
    // This is undesirable, as we might be adding and removing many
    // workspace folders as the user adds and removes databases.
    const end = (vscode.workspace.workspaceFolders || []).length;

    const msg = verifyZippedSources(dbName, sourceArchive);
    if (msg) {
      void logger.log(`Could not add source folder because ${msg}`);
      return;
    }

    const uri = getSourceArchiveExplorerUri(dbName, sourceArchive);
    void logger.log(
      `Adding workspace folder for ${dbName} source archive at index ${end}`,
    );
    if ((vscode.workspace.workspaceFolders || []).length < 2) {
      // Adding this workspace folder makes the workspace
      // multi-root, which may surprise the user. Let them know
      // we're doing this.
      void vscode.window.showInformationMessage(
        `Adding workspace folder for source archive of database ${dbName}.`,
      );
    }
    vscode.workspace.updateWorkspaceFolders(end, 0, {
      name: `[${dbName} source archive]`,
      uri,
    });
    // vscode api documentation says we must to wait for this event
    // between multiple `updateWorkspaceFolders` calls.
    await eventFired(vscode.workspace.onDidChangeWorkspaceFolders);
  }
}

/**
 * A promise that resolves to an event's result value when the event
 * `event` fires. If waiting for the event takes too long (by default
 * >1000ms) log a warning, and resolve to undefined.
 */
function eventFired<T>(
  event: vscode.Event<T>,
  timeoutMs = 1000,
): Promise<T | undefined> {
  return new Promise((res, _rej) => {
    const timeout = setTimeout(() => {
      void logger.log(
        `Waiting for event ${event} timed out after ${timeoutMs}ms`,
      );
      res(undefined);
      dispose();
    }, timeoutMs);
    const disposable = event((e) => {
      res(e);
      dispose();
    });
    function dispose() {
      clearTimeout(timeout);
      disposable.dispose();
    }
  });
}

export function deleteFolderFromWorkspace(
  sourceArchive: vscode.Uri | undefined,
): void {
  // Delete folder from workspace, if it is still there
  const folderIndex = (vscode.workspace.workspaceFolders || []).findIndex(
    (folder) => uriBelongsToSourceArchiveExplorer(sourceArchive, folder.uri),
  );
  if (folderIndex >= 0) {
    void logger.log(`Removing workspace folder at index ${folderIndex}`);
    vscode.workspace.updateWorkspaceFolders(folderIndex, 1);
  }
}