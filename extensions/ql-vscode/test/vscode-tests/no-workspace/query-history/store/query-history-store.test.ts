import {
  readQueryHistoryFromFile,
  writeQueryHistoryToFile,
} from "../../../../../src/query-history/store/query-history-store";
import { join } from "path";
import { writeFileSync, mkdirpSync, writeFile } from "fs-extra";
import type { InitialQueryInfo } from "../../../../../src/query-results";
import { LocalQueryInfo } from "../../../../../src/query-results";
import type { QueryWithResults } from "../../../../../src/run-queries-shared";
import { QueryEvaluationInfo } from "../../../../../src/run-queries-shared";
import { QueryOutputDir } from "../../../../../src/local-queries/query-output-dir";
import type { DatabaseInfo } from "../../../../../src/common/interface-types";
import type { CancellationTokenSource } from "vscode";
import { Uri } from "vscode";
import { tmpDir } from "../../../../../src/tmp-dir";
import type { VariantAnalysisHistoryItem } from "../../../../../src/query-history/variant-analysis-history-item";
import type { QueryHistoryInfo } from "../../../../../src/query-history/query-history-info";
import { createMockVariantAnalysisHistoryItem } from "../../../../factories/query-history/variant-analysis-history-item";
import { nanoid } from "nanoid";

describe("write and read", () => {
  let infoSuccessRaw: LocalQueryInfo;
  let infoSuccessInterpreted: LocalQueryInfo;
  let infoEarlyFailure: LocalQueryInfo;
  let infoLateFailure: LocalQueryInfo;
  let infoInProgress: LocalQueryInfo;

  let variantAnalysis1: VariantAnalysisHistoryItem;
  let variantAnalysis2: VariantAnalysisHistoryItem;

  let allHistory: QueryHistoryInfo[];
  let expectedHistory: QueryHistoryInfo[];
  let queryPath: string;
  let cnt = 0;

  beforeEach(() => {
    queryPath = join(Uri.file(tmpDir.name).fsPath, `query-${cnt++}`);

    infoSuccessRaw = createMockFullQueryInfo(
      "a",
      createMockQueryWithResults(`${queryPath}-a`, false, "/a/b/c/a"),
    );
    infoSuccessInterpreted = createMockFullQueryInfo(
      "b",
      createMockQueryWithResults(`${queryPath}-b`, true, "/a/b/c/b"),
    );
    infoEarlyFailure = createMockFullQueryInfo("c", undefined, true);
    infoLateFailure = createMockFullQueryInfo(
      "d",
      createMockQueryWithResults(`${queryPath}-c`, false, "/a/b/c/d"),
    );
    infoInProgress = createMockFullQueryInfo("e");

    variantAnalysis1 = createMockVariantAnalysisHistoryItem({});
    variantAnalysis2 = createMockVariantAnalysisHistoryItem({});

    allHistory = [
      infoSuccessRaw,
      infoSuccessInterpreted,
      infoEarlyFailure,
      infoLateFailure,
      infoInProgress,
      variantAnalysis1,
      variantAnalysis2,
    ];

    // the expected results only contains the history with completed queries
    expectedHistory = [
      infoSuccessRaw,
      infoSuccessInterpreted,
      infoLateFailure,
      variantAnalysis1,
      variantAnalysis2,
    ];
  });

  it("should write and read query history", async () => {
    const allHistoryPath = join(tmpDir.name, "workspace-query-history.json");

    // write and read
    await writeQueryHistoryToFile(allHistory, allHistoryPath);
    const allHistoryActual = await readQueryHistoryFromFile(allHistoryPath);

    // the dispose methods will be different. Ignore them.
    allHistoryActual.forEach((info) => {
      if (info.t === "local" && info.completedQuery) {
        const completedQuery = info.completedQuery;
        (completedQuery as any).dispose = undefined;

        // these fields should be missing on the read value
        // but they are undefined on the original value
        if (!("logFileLocation" in completedQuery)) {
          (completedQuery as any).logFileLocation = undefined;
        }
        const query = completedQuery.query;
        if (!("quickEvalPosition" in query)) {
          (query as any).quickEvalPosition = undefined;
        }
      }
    });
    expectedHistory.forEach((info) => {
      if (info.t === "local" && info.completedQuery) {
        (info.completedQuery as any).dispose = undefined;
      }
    });

    // make the diffs somewhat sane by comparing each element directly
    for (let i = 0; i < allHistoryActual.length; i++) {
      expect(allHistoryActual[i]).toEqual(expectedHistory[i]);
    }
    expect(allHistoryActual.length).toEqual(expectedHistory.length);
  });

  it("should read query output dir from completed query if not present", async () => {
    const historyPath = join(tmpDir.name, "workspace-query-history.json");

    const queryItem = createMockFullQueryInfo(
      "a",
      createMockQueryWithResults(`${queryPath}-a`, false, "/a/b/c/a"),
      false,
      null,
    );

    // write and read
    await writeQueryHistoryToFile([queryItem], historyPath);
    const actual = await readQueryHistoryFromFile(historyPath);

    expect(actual).toHaveLength(1);

    expect(actual[0].t).toEqual("local");

    if (actual[0].t === "local") {
      expect(actual[0].initialInfo.outputDir?.querySaveDir).not.toBeUndefined();
      expect(actual[0].initialInfo.outputDir?.querySaveDir).toEqual(
        queryItem.completedQuery?.query?.querySaveDir,
      );
    }
  });

  it("should remove remote queries from the history", async () => {
    const path = join(tmpDir.name, "query-history-with-remote.json");
    await writeFile(
      path,
      JSON.stringify({
        version: 2,
        queries: [
          ...allHistory,
          {
            t: "remote",
            status: "InProgress",
            completed: false,
            queryId: nanoid(),
            remoteQuery: {
              queryName: "query-name",
              queryFilePath: "query-file.ql",
              queryText: "select 1",
              language: "javascript",
              controllerRepository: {
                owner: "github",
                name: "vscode-codeql-integration-tests",
              },
              executionStartTime: Date.now(),
              actionsWorkflowRunId: 1,
              repositoryCount: 0,
            },
          },
          {
            t: "remote",
            status: "Completed",
            completed: true,
            queryId: nanoid(),
            remoteQuery: {
              queryName: "query-name",
              queryFilePath: "query-file.ql",
              queryText: "select 1",
              language: "javascript",
              controllerRepository: {
                owner: "github",
                name: "vscode-codeql-integration-tests",
              },
              executionStartTime: Date.now(),
              actionsWorkflowRunId: 1,
              repositoryCount: 0,
            },
          },
        ],
      }),
      "utf8",
    );

    const actual = await readQueryHistoryFromFile(path);
    expect(actual.length).toEqual(expectedHistory.length);
  });

  it("should handle an invalid query history version", async () => {
    const badPath = join(tmpDir.name, "bad-query-history.json");
    writeFileSync(
      badPath,
      JSON.stringify({
        version: 3,
        queries: allHistory,
      }),
      "utf8",
    );

    const allHistoryActual = await readQueryHistoryFromFile(badPath);
    // version number is invalid. Should return an empty array.
    expect(allHistoryActual).toEqual([]);
  });

  function createMockFullQueryInfo(
    dbName = "a",
    queryWithResults?: QueryWithResults,
    isFail = false,
    outputDir: QueryOutputDir | null = new QueryOutputDir(
      "/path/to/output/dir",
    ),
  ): LocalQueryInfo {
    const fqi = new LocalQueryInfo(
      {
        databaseInfo: {
          name: dbName,
          databaseUri: Uri.parse(`/a/b/c/${dbName}`).fsPath,
        } as unknown as DatabaseInfo,
        start: new Date(),
        queryPath: "path/to/hucairz",
        queryText: "some query",
        isQuickQuery: false,
        isQuickEval: false,
        id: `some-id-${dbName}`,
        outputDir: outputDir ? outputDir : undefined,
      } as InitialQueryInfo,
      {
        dispose: () => {
          /**/
        },
      } as CancellationTokenSource,
    );

    if (queryWithResults) {
      fqi.completeThisQuery(queryWithResults);
    }
    if (isFail) {
      fqi.failureReason = "failure reason";
    }
    return fqi;
  }

  function createMockQueryWithResults(
    queryPath: string,
    didRunSuccessfully = true,
    dbPath = "/a/b/c",
  ): QueryWithResults {
    // pretend that the results path exists
    const resultsPath = join(queryPath, "results.bqrs");
    mkdirpSync(queryPath);
    writeFileSync(resultsPath, "", "utf8");

    const queryEvalInfo = new QueryEvaluationInfo(
      queryPath,
      Uri.file(dbPath).fsPath,
      true,
      undefined,
      {
        name: "vwx",
      },
    );

    const result: QueryWithResults = {
      query: queryEvalInfo,
      successful: didRunSuccessfully,
      message: "foo",
    };

    return result;
  }
});
