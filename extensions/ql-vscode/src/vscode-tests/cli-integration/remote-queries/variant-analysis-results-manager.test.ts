import { extensions } from "vscode";
import { CodeQLExtensionInterface } from "../../../extension";
import { logger } from "../../../logging";
import { Credentials } from "../../../authentication";
import * as fs from "fs-extra";
import * as path from "path";

import { VariantAnalysisResultsManager } from "../../../remote-queries/variant-analysis-results-manager";
import { CodeQLCliServer } from "../../../cli";
import { storagePath } from "../global.helper";
import { faker } from "@faker-js/faker";
import * as ghApiClient from "../../../remote-queries/gh-api/gh-api-client";
import { createMockVariantAnalysisRepositoryTask } from "../../factories/remote-queries/shared/variant-analysis-repo-tasks";
import { VariantAnalysisRepositoryTask } from "../../../remote-queries/shared/variant-analysis";

jest.setTimeout(10_000);

describe(VariantAnalysisResultsManager.name, () => {
  let cli: CodeQLCliServer;
  let variantAnalysisId: number;
  let variantAnalysisResultsManager: VariantAnalysisResultsManager;

  beforeEach(async () => {
    jest.spyOn(logger, "log").mockResolvedValue(undefined);
    jest.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
    jest.spyOn(fs, "writeFile").mockReturnValue(undefined);

    variantAnalysisId = faker.datatype.number();

    try {
      const extension = await extensions
        .getExtension<CodeQLExtensionInterface | Record<string, never>>(
          "GitHub.vscode-codeql",
        )!
        .activate();
      cli = extension.cliServer;
      variantAnalysisResultsManager = new VariantAnalysisResultsManager(
        cli,
        logger,
      );
    } catch (e) {
      fail(e as Error);
    }
  });

  describe("download", () => {
    const mockCredentials = {
      getOctokit: () =>
        Promise.resolve({
          request: jest.fn(),
        }),
    } as unknown as Credentials;
    let dummyRepoTask: VariantAnalysisRepositoryTask;
    let variantAnalysisStoragePath: string;
    let repoTaskStorageDirectory: string;

    beforeEach(async () => {
      dummyRepoTask = createMockVariantAnalysisRepositoryTask();

      variantAnalysisStoragePath = path.join(
        storagePath,
        variantAnalysisId.toString(),
      );
      repoTaskStorageDirectory =
        variantAnalysisResultsManager.getRepoStorageDirectory(
          variantAnalysisStoragePath,
          dummyRepoTask.repository.fullName,
        );
    });

    afterEach(async () => {
      if (fs.existsSync(variantAnalysisStoragePath)) {
        fs.rmSync(variantAnalysisStoragePath, { recursive: true });
      }
    });

    describe("isVariantAnalysisRepoDownloaded", () => {
      it("should return false when no results are downloaded", async () => {
        expect(
          await variantAnalysisResultsManager.isVariantAnalysisRepoDownloaded(
            variantAnalysisStoragePath,
            dummyRepoTask.repository.fullName,
          ),
        ).toBe(false);
      });
    });

    describe("when the artifact_url is missing", () => {
      it("should not try to download the result", async () => {
        const dummyRepoTask = createMockVariantAnalysisRepositoryTask();
        delete dummyRepoTask.artifactUrl;

        try {
          await variantAnalysisResultsManager.download(
            mockCredentials,
            variantAnalysisId,
            dummyRepoTask,
            variantAnalysisStoragePath,
          );

          fail("Expected an error to be thrown");
        } catch (e: any) {
          expect(e.message).toBe("Missing artifact URL");
        }
      });
    });

    describe("when the artifact_url is present", () => {
      let arrayBuffer: ArrayBuffer;

      const getVariantAnalysisRepoResultStub = jest.spyOn(
        ghApiClient,
        "getVariantAnalysisRepoResult",
      );

      beforeEach(async () => {
        const sourceFilePath = path.join(
          __dirname,
          "../../../../src/vscode-tests/cli-integration/data/variant-analysis-results.zip",
        );
        arrayBuffer = fs.readFileSync(sourceFilePath).buffer;

        getVariantAnalysisRepoResultStub
          .mockReset()
          .mockImplementation(
            (_credentials: Credentials, downloadUrl: string) => {
              if (downloadUrl === dummyRepoTask.artifactUrl) {
                return Promise.resolve(arrayBuffer);
              }
              return Promise.reject(new Error("Unexpected artifact URL"));
            },
          );
      });

      it("should call the API to download the results", async () => {
        await variantAnalysisResultsManager.download(
          mockCredentials,
          variantAnalysisId,
          dummyRepoTask,
          variantAnalysisStoragePath,
        );

        expect(getVariantAnalysisRepoResultStub).toHaveBeenCalledTimes(1);
      });

      it("should save the results zip file to disk", async () => {
        await variantAnalysisResultsManager.download(
          mockCredentials,
          variantAnalysisId,
          dummyRepoTask,
          variantAnalysisStoragePath,
        );

        expect(fs.existsSync(`${repoTaskStorageDirectory}/results.zip`)).toBe(
          true,
        );
      });

      it("should unzip the results in a `results/` folder", async () => {
        await variantAnalysisResultsManager.download(
          mockCredentials,
          variantAnalysisId,
          dummyRepoTask,
          variantAnalysisStoragePath,
        );

        expect(
          fs.existsSync(`${repoTaskStorageDirectory}/results/results.sarif`),
        ).toBe(true);
      });

      describe("isVariantAnalysisRepoDownloaded", () => {
        it("should return true once results are downloaded", async () => {
          await variantAnalysisResultsManager.download(
            mockCredentials,
            variantAnalysisId,
            dummyRepoTask,
            variantAnalysisStoragePath,
          );

          expect(
            await variantAnalysisResultsManager.isVariantAnalysisRepoDownloaded(
              variantAnalysisStoragePath,
              dummyRepoTask.repository.fullName,
            ),
          ).toBe(true);
        });
      });
    });
  });
});
