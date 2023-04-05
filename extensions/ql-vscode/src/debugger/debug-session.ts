import {
  ContinuedEvent,
  Event,
  ExitedEvent,
  InitializedEvent,
  LoggingDebugSession,
  OutputEvent,
  ProgressEndEvent,
  StoppedEvent,
  TerminatedEvent,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { Disposable } from "vscode";
import { CancellationTokenSource } from "vscode-jsonrpc";
import { BaseLogger, LogOptions, queryServerLogger } from "../common";
import { QueryResultType } from "../pure/new-messages";
import {
  CoreCompletedQuery,
  CoreQueryResults,
  CoreQueryRun,
  QueryRunner,
} from "../queryRunner";
import * as CodeQLDebugProtocol from "./debug-protocol";

// More complete implementations of `Event` for certain events, because the classes from
// `@vscode/debugadapter` make it more difficult to provide some of the message values.

class ProgressStartEvent
  extends Event
  implements DebugProtocol.ProgressStartEvent
{
  public readonly event = "progressStart";
  public readonly body: {
    progressId: string;
    title: string;
    requestId?: number;
    cancellable?: boolean;
    message?: string;
    percentage?: number;
  };

  constructor(
    progressId: string,
    title: string,
    message?: string,
    percentage?: number,
  ) {
    super("progressStart");
    this.body = {
      progressId,
      title,
      message,
      percentage,
    };
  }
}

class ProgressUpdateEvent
  extends Event
  implements DebugProtocol.ProgressUpdateEvent
{
  public readonly event = "progressUpdate";
  public readonly body: {
    progressId: string;
    message?: string;
    percentage?: number;
  };

  constructor(progressId: string, message?: string, percentage?: number) {
    super("progressUpdate");
    this.body = {
      progressId,
      message,
      percentage,
    };
  }
}

class EvaluationStartedEvent
  extends Event
  implements CodeQLDebugProtocol.EvaluationStartedEvent
{
  public readonly event = "codeql-evaluation-started";
  public readonly body: CodeQLDebugProtocol.EvaluationStartedEventBody;

  constructor(
    id: string,
    outputDir: string,
    quickEvalPosition: CodeQLDebugProtocol.Position | undefined,
  ) {
    super("codeql-evaluation-started");
    this.body = {
      id,
      outputDir,
      quickEvalPosition,
    };
  }
}

class EvaluationCompletedEvent
  extends Event
  implements CodeQLDebugProtocol.EvaluationCompletedEvent
{
  public readonly event = "codeql-evaluation-completed";
  public readonly body: CodeQLDebugProtocol.EvaluationCompletedEventBody;

  constructor(results: CoreQueryResults) {
    super("codeql-evaluation-completed");
    this.body = results;
  }
}

/**
 * Possible states of the debug session. Used primarily to guard against unexpected requests.
 */
type State =
  | "uninitialized"
  | "initialized"
  | "running"
  | "stopped"
  | "terminated";

// IDs for error messages generated by the debug adapter itself.

/** Received a DAP message while in an unexpected state. */
const ERROR_UNEXPECTED_STATE = 1;

/** ID of the "thread" that represents the query evaluation. */
const QUERY_THREAD_ID = 1;

/** The user-visible name of the query evaluation thread. */
const QUERY_THREAD_NAME = "Evaluation thread";

/**
 * An in-process implementation of the debug adapter for CodeQL queries.
 *
 * For now, this is pretty much just a wrapper around the query server.
 */
export class QLDebugSession extends LoggingDebugSession implements Disposable {
  private state: State = "uninitialized";
  private terminateOnComplete = false;
  private args: CodeQLDebugProtocol.LaunchRequestArguments | undefined =
    undefined;
  private tokenSource: CancellationTokenSource | undefined = undefined;
  private queryRun: CoreQueryRun | undefined = undefined;
  private lastResult:
    | CodeQLDebugProtocol.EvaluationCompletedEventBody
    | undefined = undefined;

  constructor(
    private readonly queryStorageDir: string,
    private readonly queryRunner: QueryRunner,
  ) {
    super();
  }

  public dispose(): void {
    this.cancelEvaluation();
  }

  protected dispatchRequest(request: DebugProtocol.Request): void {
    // We just defer to the base class implementation, but having this override makes it easy to set
    // a breakpoint that will be hit for any message received by the debug adapter.
    void queryServerLogger.log(`DAP request: ${request.command}`);
    super.dispatchRequest(request);
  }

  private unexpectedState(response: DebugProtocol.Response): void {
    this.sendErrorResponse(
      response,
      ERROR_UNEXPECTED_STATE,
      "CodeQL debug adapter received request '{_request}' while in unexpected state '{_actualState}'.",
      {
        _request: response.command,
        _actualState: this.state,
      },
    );
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments,
  ): void {
    switch (this.state) {
      case "uninitialized":
        response.body = response.body ?? {};
        response.body.supportsStepBack = false;
        response.body.supportsStepInTargetsRequest = false;
        response.body.supportsRestartFrame = false;
        response.body.supportsGotoTargetsRequest = false;
        response.body.supportsCancelRequest = true;
        response.body.supportsTerminateRequest = true;
        response.body.supportsModulesRequest = false;
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsRestartRequest = false;
        this.state = "initialized";
        this.sendResponse(response);

        this.sendEvent(new InitializedEvent());
        break;

      default:
        this.unexpectedState(response);
        break;
    }
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments,
    request?: DebugProtocol.Request,
  ): void {
    super.configurationDoneRequest(response, args, request);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments,
    _request?: DebugProtocol.Request,
  ): void {
    this.terminateOrDisconnect(response);
  }

  protected terminateRequest(
    response: DebugProtocol.TerminateResponse,
    _args: DebugProtocol.TerminateArguments,
    _request?: DebugProtocol.Request,
  ): void {
    this.terminateOrDisconnect(response);
  }

  private terminateOrDisconnect(response: DebugProtocol.Response): void {
    switch (this.state) {
      case "running":
        this.terminateOnComplete = true;
        this.cancelEvaluation();
        break;

      case "stopped":
        this.terminateAndExit();
        break;

      default:
        // Ignore
        break;
    }

    this.sendResponse(response);
  }

  protected launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: CodeQLDebugProtocol.LaunchRequestArguments,
    _request?: DebugProtocol.Request,
  ): void {
    switch (this.state) {
      case "initialized":
        this.args = args;

        // If `noDebug` is set, then terminate after evaluation instead of stopping.
        this.terminateOnComplete = this.args.noDebug === true;

        response.body = response.body ?? {};

        // Send the response immediately. We'll send a "stopped" message when the evaluation is complete.
        this.sendResponse(response);

        void this.evaluate(this.args.quickEvalPosition);
        break;

      default:
        this.unexpectedState(response);
        break;
    }
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments,
    _request?: DebugProtocol.Request,
  ): void {
    this.stepRequest(response);
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments,
    _request?: DebugProtocol.Request,
  ): void {
    this.stepRequest(response);
  }

  protected stepOutRequest(
    response: DebugProtocol.Response,
    _args: DebugProtocol.StepOutArguments,
    _request?: DebugProtocol.Request,
  ): void {
    this.stepRequest(response);
  }

  protected stepBackRequest(
    response: DebugProtocol.StepBackResponse,
    _args: DebugProtocol.StepBackArguments,
    _request?: DebugProtocol.Request,
  ): void {
    this.stepRequest(response);
  }

  private stepRequest(response: DebugProtocol.Response): void {
    switch (this.state) {
      case "stopped":
        this.sendResponse(response);
        // We don't do anything with stepping yet, so just announce that we've stopped without
        // actually doing anything.
        // We don't even send the `EvaluationCompletedEvent`.
        this.reportStopped();
        break;

      default:
        this.unexpectedState(response);
        break;
    }
  }

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments,
    _request?: DebugProtocol.Request,
  ): void {
    switch (this.state) {
      case "stopped":
        response.body = response.body ?? {};
        response.body.allThreadsContinued = true;

        // Send the response immediately. We'll send a "stopped" message when the evaluation is complete.
        this.sendResponse(response);

        void this.evaluate(undefined);
        break;

      default:
        this.unexpectedState(response);
        break;
    }
  }

  protected cancelRequest(
    response: DebugProtocol.CancelResponse,
    args: DebugProtocol.CancelArguments,
    _request?: DebugProtocol.Request,
  ): void {
    switch (this.state) {
      case "running":
        if (args.progressId !== undefined) {
          if (this.queryRun!.id === args.progressId) {
            this.cancelEvaluation();
          }
        }
        break;

      default:
        // Ignore;
        break;
    }

    this.sendResponse(response);
  }

  protected threadsRequest(
    response: DebugProtocol.ThreadsResponse,
    _request?: DebugProtocol.Request,
  ): void {
    response.body = response.body ?? {};
    response.body.threads = [
      {
        id: QUERY_THREAD_ID,
        name: QUERY_THREAD_NAME,
      },
    ];

    this.sendResponse(response);
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments,
    _request?: DebugProtocol.Request,
  ): void {
    response.body = response.body ?? {};
    response.body.stackFrames = []; // No frames for now.

    super.stackTraceRequest(response, _args, _request);
  }

  protected customRequest(
    command: string,
    response: CodeQLDebugProtocol.Response,
    args: any,
    request?: DebugProtocol.Request,
  ): void {
    switch (command) {
      case "codeql-quickeval": {
        this.quickEvalRequest(
          response,
          <CodeQLDebugProtocol.QuickEvalRequest["arguments"]>args,
        );
        break;
      }

      default:
        super.customRequest(command, response, args, request);
        break;
    }
  }

  protected quickEvalRequest(
    response: CodeQLDebugProtocol.QuickEvalResponse,
    args: CodeQLDebugProtocol.QuickEvalRequest["arguments"],
  ): void {
    switch (this.state) {
      case "stopped":
        // Send the response immediately. We'll send a "stopped" message when the evaluation is complete.
        this.sendResponse(response);

        // For built-in requests that are expected to cause execution (`launch`, `continue`, `step`, etc.),
        // the adapter does not send a `continued` event because the client already knows that's what
        // is supposed to happen. For a custom request, though, we have to notify the client.
        this.sendEvent(new ContinuedEvent(QUERY_THREAD_ID, true));

        void this.evaluate(args.quickEvalPosition);
        break;

      default:
        this.unexpectedState(response);
        break;
    }
  }

  /** Creates a `BaseLogger` that sends output to the debug console. */
  private createLogger(): BaseLogger {
    return {
      log: async (message: string, _options: LogOptions): Promise<void> => {
        this.sendEvent(new OutputEvent(message, "console"));
      },
    };
  }

  /**
   * Runs the query or quickeval, and notifies the debugger client when the evaluation completes.
   *
   * This function is invoked from the `launch` and `continue` handlers, without awaiting its
   * result.
   */
  private async evaluate(
    quickEvalPosition: CodeQLDebugProtocol.Position | undefined,
  ): Promise<void> {
    const args = this.args!;

    this.tokenSource = new CancellationTokenSource();
    try {
      // Create the query run, which will give us some information about the query even before the
      // evaluation has completed.
      this.queryRun = this.queryRunner.createQueryRun(
        args.database,
        {
          queryPath: args.query,
          quickEvalPosition,
        },
        true,
        args.additionalPacks,
        args.extensionPacks,
        this.queryStorageDir,
        undefined,
        undefined,
      );

      this.state = "running";

      // Send the `EvaluationStarted` event first, to let the client known where the outputs are
      // going to show up.
      this.sendEvent(
        new EvaluationStartedEvent(
          this.queryRun.id,
          this.queryRun.outputDir.querySaveDir,
          quickEvalPosition,
        ),
      );

      try {
        // Report progress via the debugger protocol.
        const progressStart = new ProgressStartEvent(
          this.queryRun.id,
          "Running query",
          undefined,
          0,
        );
        progressStart.body.cancellable = true;
        this.sendEvent(progressStart);
        let result: CoreCompletedQuery;
        try {
          result = await this.queryRun.evaluate(
            (p) => {
              const progressUpdate = new ProgressUpdateEvent(
                this.queryRun!.id,
                p.message,
                (p.step * 100) / p.maxStep,
              );
              this.sendEvent(progressUpdate);
            },
            this.tokenSource!.token,
            this.createLogger(),
          );
        } finally {
          // Report the end of the progress
          this.sendEvent(new ProgressEndEvent(this.queryRun!.id));
        }
        this.completeEvaluation(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        this.completeEvaluation({
          resultType: QueryResultType.OTHER_ERROR,
          message,
          evaluationTime: 0,
        });
      }
    } finally {
      this.disposeTokenSource();
    }
  }

  /**
   * Mark the evaluation as completed, and notify the client of the result.
   */
  private completeEvaluation(
    result: CodeQLDebugProtocol.EvaluationCompletedEventBody,
  ): void {
    this.lastResult = result;

    // Report the evaluation result
    this.sendEvent(new EvaluationCompletedEvent(result));
    if (result.resultType !== QueryResultType.SUCCESS) {
      // Report the result message as "important" output
      const message = result.message ?? "Unknown error";
      const outputEvent = new OutputEvent(message, "console");
      this.sendEvent(outputEvent);
    }

    this.reportStopped();

    this.queryRun = undefined;
  }

  private reportStopped(): void {
    if (this.terminateOnComplete) {
      this.terminateAndExit();
    } else {
      // Report the session as "stopped", but keep the session open.
      this.sendEvent(new StoppedEvent("entry", QUERY_THREAD_ID));

      this.state = "stopped";
    }
  }

  private terminateAndExit(): void {
    // Report the debugging session as terminated.
    this.sendEvent(new TerminatedEvent());

    // Report the debuggee as exited.
    this.sendEvent(new ExitedEvent(this.lastResult!.resultType));

    this.state = "terminated";
  }

  private disposeTokenSource(): void {
    if (this.tokenSource !== undefined) {
      this.tokenSource!.dispose();
      this.tokenSource = undefined;
    }
  }

  private cancelEvaluation(): void {
    if (this.tokenSource !== undefined) {
      this.tokenSource.cancel();
      this.disposeTokenSource();
    }
  }
}