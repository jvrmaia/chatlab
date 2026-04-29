import pino, { type Logger, type LoggerOptions, type DestinationStream } from "pino";

export type ChatlabLogger = Logger;

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export interface CreateLoggerOptions {
  level?: LogLevel;
  /** Force pretty output even when stdout is not a TTY (useful for `npm start`). */
  pretty?: boolean;
  /** Destination stream override (used by tests). */
  stream?: DestinationStream;
}

/**
 * Build the chatlab root logger. Defaults:
 *
 * - `level` from arg, otherwise `info`. `silent` disables output.
 * - JSON output when stdout is not a TTY (CI, Docker), pretty when interactive.
 *
 * Always carries `{ name: "chatlab" }` as the base binding so log lines from
 * different chatlab processes are easy to distinguish in aggregated tails.
 */
export function createLogger(opts: CreateLoggerOptions = {}): ChatlabLogger {
  const level = opts.level ?? "info";
  const isTty = typeof process !== "undefined" && process.stdout?.isTTY === true;
  const pretty = opts.pretty ?? isTty;

  const base: LoggerOptions = {
    level,
    name: "chatlab",
  };

  if (opts.stream) {
    return pino(base, opts.stream);
  }

  if (pretty) {
    return pino({
      ...base,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
      },
    });
  }

  return pino(base);
}

/** A logger that drops everything. Used by tests that don't want output. */
export function silentLogger(): ChatlabLogger {
  return pino({ level: "silent", name: "chatlab" });
}
