import { Logger } from "../../domain/ports/logger";

export class ConsoleLogger implements Logger {
  constructor(private readonly source: string) {}

  info(message: string, data?: Record<string, unknown>): void {
    console.info(
      JSON.stringify({ severity: "INFO", source: this.source, message, ...data }),
    );
  }

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(
      JSON.stringify({ severity: "WARNING", source: this.source, message, ...data }),
    );
  }

  error(message: string, err: unknown, data?: Record<string, unknown>): void {
    const errFields =
      err instanceof Error
        ? { errorName: err.name, errorMessage: err.message }
        : { errorMessage: String(err) };

    console.error(
      JSON.stringify({ severity: "ERROR", source: this.source, message, ...errFields, ...data }),
    );
  }
}
