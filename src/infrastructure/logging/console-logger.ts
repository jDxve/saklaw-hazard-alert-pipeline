import { Logger } from "../../domain/ports/logger";

type LogSeverity = "INFO" | "WARNING" | "ERROR";

/**
 * Serialises a structured log line for Cloud Logging.
 *
 * Logging must never be able to take the pipeline down, so a value that
 * JSON.stringify refuses (a circular reference, a BigInt) degrades to a note
 * on the line rather than throwing out of the caller.
 */
function serializeLogLine(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      severity: payload.severity,
      source: payload.source,
      message: payload.message,
      dataSerializationError: "log payload was not JSON-serialisable",
    });
  }
}

function describeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message, stack: err.stack };
  }
  return { errorMessage: String(err) };
}

export class ConsoleLogger implements Logger {
  constructor(private readonly source: string) {}

  info(message: string, data?: Record<string, unknown>): void {
    console.info(this.line("INFO", message, data));
  }

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(this.line("WARNING", message, data));
  }

  error(message: string, err: unknown, data?: Record<string, unknown>): void {
    console.error(this.line("ERROR", message, { ...data, ...describeError(err) }));
  }

  // Caller data is spread first so it can never overwrite the fields Cloud
  // Logging keys off — a stray `severity` in a payload would reclassify the line.
  private line(severity: LogSeverity, message: string, data?: Record<string, unknown>): string {
    return serializeLogLine({ ...data, severity, source: this.source, message });
  }
}
