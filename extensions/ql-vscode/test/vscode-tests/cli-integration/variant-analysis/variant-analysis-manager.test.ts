import { CancellationTokenSource, commands, Uri, window } from "vscode";
import { extLogger } from "../../../../src/common/logging/vscode";
import { setRemoteControllerRepo } from "../../../../src/config";
import * as ghApiClient from "../../../../src/variant-analysis/gh-api/gh-api-client";
import { isAbsolute, join } from "path";

import { VariantAnalysisManager } from "../../../../src/variant-analysis/variant-analysis-manager";
import type { CodeQLCliServer } from "../../../../src/codeql-cli/cli";
import { CliVersionConstraint } from "../../../../src/codeql-cli/cli";
import { getActivatedExtension, storagePath } from "../../global.helper";
import { VariantAnalysisResultsManager } from "../../../../src/variant-analysis/variant-analysis-results-manager";
import type { VariantAnalysisSubmission } from "../../../../src/variant-analysis/shared/variant-analysis";
import { VariantAnalysisStatus } from "../../../../src/variant-analysis/shared/variant-analysis";
import type { VariantAnalysis as VariantAnalysisApiResponse } from "../../../../src/variant-analysis/gh-api/variant-analysis";
import { createMockApiResponse } from "../../../factories/variant-analysis/gh-api/variant-analysis-api-response";
import { UserCancellationException } from "../../../../src/common/vscode/progress";
import type { Repository } from "../../../../src/variant-analysis/gh-api/repository";
import { DbManager } from "../../../../src/databases/db-manager";
import { ExtensionApp } from "../../../../src/common/vscode/vscode-app";
import { DbConfigStore } from "../../../../src/databases/config/db-config-store";
import { mockedQuickPickItem } from "../../utils/mocking.helpers";
import { QueryLanguage } from "../../../../src/common/query-language";
import { readBundledPack } from "../../utils/bundled-pack-helpers";
import { load } from "js-yaml";
import type { ExtensionPackMetadata } from "../../../../src/model-editor/extension-pack-metadata";
import type { QlPackLockFile } from "../../../../src/packaging/qlpack-lock-file";

describe("Variant Analysis Manager", () => {
  let cli: CodeQLCliServer;
  let cancellationTokenSource: CancellationTokenSource;
  let variantAnalysisManager: VariantAnalysisManager;

  beforeEach(async () => {
    jest.spyOn(extLogger, "log").mockResolvedValue(undefined);

    cancellationTokenSource = new CancellationTokenSource();

    const extension = await getActivatedExtension();
    cli = extension.cliServer;
    const app = new ExtensionApp(extension.ctx);
    const dbManager = new DbManager(app, new DbConfigStore(app));
    const variantAnalysisResultsManager = new VariantAnalysisResultsManager(
      cli,
      extLogger,
    );
    variantAnalysisManager = new VariantAnalysisManager(
      app,
      cli,
      storagePath,
      variantAnalysisResultsManager,
      dbManager,
    );
  });

  describe("runVariantAnalysis", () => {
    const progress = jest.fn();
    let mockGetRepositoryFromNwo: jest.SpiedFunction<
      typeof ghApiClient.getRepositoryFromNwo
    >;
    let mockSubmitVariantAnalysis: jest.SpiedFunction<
      typeof ghApiClient.submitVariantAnalysis
    >;
    let mockApiResponse: VariantAnalysisApiResponse;
    let executeCommandSpy: jest.SpiedFunction<typeof commands.executeCommand>;

    const baseDir = join(__dirname, "..");

    beforeEach(async () => {
      jest.spyOn(window, "showQuickPick").mockResolvedValueOnce(
        mockedQuickPickItem({
          label: "JavaScript",
          language: "javascript",
        }),
      );

      cancellationTokenSource = new CancellationTokenSource();

      const dummyRepository: Repository = {
        id: 123,
        name: "vscode-codeql",
        full_name: "github/vscode-codeql",
        private: false,
      };
      mockGetRepositoryFromNwo = jest
        .spyOn(ghApiClient, "getRepositoryFromNwo")
        .mockResolvedValue(dummyRepository);

      mockApiResponse = createMockApiResponse("in_progress");
      mockSubmitVariantAnalysis = jest
        .spyOn(ghApiClient, "submitVariantAnalysis")
        .mockResolvedValue(mockApiResponse);

      executeCommandSpy = jest.spyOn(commands, "executeCommand");

      // always run in the vscode-codeql repo
      await setRemoteControllerRepo("github/vscode-codeql");
    });

    it("should run a variant analysis that is part of a qlpack", async () => {
      const fileUri = getFile("data-remote-qlpack/in-pack.ql");

      await variantAnalysisManager.runVariantAnalysis(
        fileUri,
        progress,
        cancellationTokenSource.token,
      );

      expect(executeCommandSpy).toBeCalledWith(
        "codeQL.monitorNewVariantAnalysis",
        expect.objectContaining({
          id: mockApiResponse.id,
          status: VariantAnalysisStatus.InProgress,
        }),
      );

      expect(mockGetRepositoryFromNwo).toBeCalledTimes(1);
      expect(mockSubmitVariantAnalysis).toBeCalledTimes(1);
    });

    it("should run a remote query that is not part of a qlpack", async () => {
      const fileUri = getFile("data-remote-no-qlpack/in-pack.ql");

      await variantAnalysisManager.runVariantAnalysis(
        fileUri,
        progress,
        cancellationTokenSource.token,
      );

      expect(executeCommandSpy).toBeCalledWith(
        "codeQL.monitorNewVariantAnalysis",
        expect.objectContaining({
          id: mockApiResponse.id,
          status: VariantAnalysisStatus.InProgress,
        }),
      );

      expect(mockGetRepositoryFromNwo).toBeCalledTimes(1);
      expect(mockSubmitVariantAnalysis).toBeCalledTimes(1);
    });

    it("should run a remote query that is nested inside a qlpack", async () => {
      const fileUri = getFile("data-remote-qlpack-nested/subfolder/in-pack.ql");

      await variantAnalysisManager.runVariantAnalysis(
        fileUri,
        progress,
        cancellationTokenSource.token,
      );

      expect(executeCommandSpy).toBeCalledWith(
        "codeQL.monitorNewVariantAnalysis",
        expect.objectContaining({
          id: mockApiResponse.id,
          status: VariantAnalysisStatus.InProgress,
        }),
      );

      expect(mockGetRepositoryFromNwo).toBeCalledTimes(1);
      expect(mockSubmitVariantAnalysis).toBeCalledTimes(1);
    });

    it("should cancel a run before uploading", async () => {
      const fileUri = getFile("data-remote-no-qlpack/in-pack.ql");

      const promise = variantAnalysisManager.runVariantAnalysis(
        fileUri,
        progress,
        cancellationTokenSource.token,
      );

      cancellationTokenSource.cancel();

      await expect(promise).rejects.toThrow(UserCancellationException);
    });

    describe("check variant analysis generated packs", () => {
      beforeEach(() => {
        mockSubmitVariantAnalysis = jest
          .spyOn(ghApiClient, "submitVariantAnalysis")
          .mockResolvedValue({
            id: 1,
            query_language: QueryLanguage.Javascript,
            query_pack_url: "http://example.com",
            created_at: "2021-01-01T00:00:00Z",
            updated_at: "2021-01-01T00:00:00Z",
            status: "in_progress",
            controller_repo: {
              id: 1,
              name: "vscode-codeql",
              full_name: "github/vscode-codeql",
              private: false,
            },
            actions_workflow_run_id: 20,
            scanned_repositories: [] as any[],
          });

        executeCommandSpy = jest.spyOn(commands, "executeCommand");
      });

      it("should run a remote query that is part of a qlpack", async () => {
        await doVariantAnalysisTest({
          queryPath: "data-remote-qlpack/in-pack.ql",
          expectedPackName: "github/remote-query-pack",
          filesThatExist: ["in-pack.ql", "lib.qll"],
          filesThatDoNotExist: [],
          qlxFilesThatExist: ["in-pack.qlx"],
        });
      });

      it("should run a remote query that is not part of a qlpack", async () => {
        await doVariantAnalysisTest({
          queryPath: "data-remote-no-qlpack/in-pack.ql",
          expectedPackName: "codeql-remote/query",
          filesThatExist: ["in-pack.ql"],
          filesThatDoNotExist: ["lib.qll", "not-in-pack.ql"],
          qlxFilesThatExist: ["in-pack.qlx"],
        });
      });

      it("should run a remote query that is nested inside a qlpack", async () => {
        await doVariantAnalysisTest({
          queryPath: "data-remote-qlpack-nested/subfolder/in-pack.ql",
          expectedPackName: "github/remote-query-pack",
          filesThatExist: ["subfolder/in-pack.ql", "otherfolder/lib.qll"],
          filesThatDoNotExist: ["subfolder/not-in-pack.ql"],
          qlxFilesThatExist: ["subfolder/in-pack.qlx"],
        });
      });

      it("should run a remote query with extension packs inside a qlpack", async () => {
        if (!(await cli.cliConstraints.supportsQlpacksKind())) {
          console.log(
            `Skipping test because qlpacks kind is only suppported in CLI version ${CliVersionConstraint.CLI_VERSION_WITH_QLPACKS_KIND} or later.`,
          );
          return;
        }
        await cli.setUseExtensionPacks(true);
        await doVariantAnalysisTest({
          queryPath: "data-remote-qlpack-nested/subfolder/in-pack.ql",
          expectedPackName: "github/remote-query-pack",
          filesThatExist: [
            "subfolder/in-pack.ql",
            "otherfolder/lib.qll",
            ".codeql/libraries/semmle/targets-extension/0.0.0/ext/extension.yml",
          ],
          filesThatDoNotExist: ["subfolder/not-in-pack.ql"],
          qlxFilesThatExist: ["subfolder/in-pack.qlx"],
          dependenciesToCheck: [
            "codeql/javascript-all",
            "semmle/targets-extension",
          ],
        });
      });
    });

    // Test running core java queries to ensure that we can compile queries in packs
    // that contain queries with extensible predicates
    it("should run a remote query that is part of the java pack", async () => {
      if (
        !(await cli.cliConstraints.supportsGenerateExtensiblePredicateMetadata())
      ) {
        console.log(
          `Skipping test because generating extensible predicate metadata was only introduced in CLI version ${CliVersionConstraint.CLI_VERSION_WITH_EXTENSIBLE_PREDICATE_METADATA}.`,
        );
        return;
      }

      if (!process.env.TEST_CODEQL_PATH) {
        fail(
          "TEST_CODEQL_PATH environment variable not set. It should point to the absolute path to a checkout of the codeql repository.",
        );
      }

      const queryToRun =
        "Security/CWE/CWE-020/ExternalAPIsUsedWithUntrustedData.ql";
      const extraQuery = "Telemetry/ExtractorInformation.ql";

      await doVariantAnalysisTest({
        queryPath: join(
          process.env.TEST_CODEQL_PATH,
          "java/ql/src",
          queryToRun,
        ),
        expectedPackName: "codeql/java-queries",
        filesThatExist: [queryToRun, extraQuery],
        filesThatDoNotExist: [],
        qlxFilesThatExist: [],
        dependenciesToCheck: ["codeql/java-all"],
        // Don't check the version since it will be the same version
        checkVersion: false,
      });
    });

    async function doVariantAnalysisTest({
      queryPath,
      expectedPackName,
      filesThatExist,
      qlxFilesThatExist,
      filesThatDoNotExist,

      // A subset of dependencies that we expect should be in the qlpack file.
      // The first dependency is assumed to be the core library.
      dependenciesToCheck = ["codeql/javascript-all"],
      checkVersion = true,
    }: {
      queryPath: string;
      expectedPackName: string;
      filesThatExist: string[];
      qlxFilesThatExist: string[];
      filesThatDoNotExist: string[];
      dependenciesToCheck?: string[];
      checkVersion?: boolean;
    }) {
      const fileUri = getFile(queryPath);
      await variantAnalysisManager.runVariantAnalysis(
        fileUri,
        progress,
        cancellationTokenSource.token,
      );

      expect(mockSubmitVariantAnalysis).toBeCalledTimes(1);
      expect(executeCommandSpy).toBeCalledWith(
        "codeQL.monitorNewVariantAnalysis",
        expect.objectContaining({
          query: expect.objectContaining({ filePath: fileUri.fsPath }),
        }),
      );

      const request: VariantAnalysisSubmission =
        mockSubmitVariantAnalysis.mock.calls[0][1];

      const packFS = await readBundledPack(request.query.pack);
      filesThatExist.forEach((file) => {
        expect(packFS.fileExists(file)).toBe(true);
      });

      qlxFilesThatExist.forEach((file) => {
        expect(packFS.fileExists(file)).toBe(true);
      });
      filesThatDoNotExist.forEach((file) => {
        expect(packFS.fileExists(file)).toBe(false);
      });

      expect(
        packFS.fileExists("qlpack.yml") || packFS.fileExists("codeql-pack.yml"),
      ).toBe(true);

      // depending on the cli version, we should have one of these files
      expect(
        packFS.fileExists("qlpack.lock.yml") ||
          packFS.fileExists("codeql-pack.lock.yml"),
      ).toBe(true);

      const packFileName = packFS.fileExists("qlpack.yml")
        ? "qlpack.yml"
        : "codeql-pack.yml";
      const qlpackContents = load(
        packFS.fileContents(packFileName).toString("utf-8"),
      ) as ExtensionPackMetadata;
      expect(qlpackContents.name).toEqual(expectedPackName);
      if (checkVersion) {
        expect(qlpackContents.version).toEqual("0.0.0");
      }

      // Assume the first dependency to check is the core library.
      if (dependenciesToCheck.length > 0) {
        expect(qlpackContents.dependencies?.[dependenciesToCheck[0]]).toEqual(
          "*",
        );
      }
      const qlpackLockContents = load(
        packFS.fileContents("codeql-pack.lock.yml").toString("utf-8"),
      ) as QlPackLockFile;

      const actualLockKeys = Object.keys(qlpackLockContents.dependencies ?? {});

      // The lock file should contain at least the specified dependencies.
      dependenciesToCheck.forEach((dep) =>
        expect(actualLockKeys).toContain(dep),
      );
    }

    function getFile(file: string): Uri {
      if (isAbsolute(file)) {
        return Uri.file(file);
      } else {
        return Uri.file(join(baseDir, file));
      }
    }
  });
});
