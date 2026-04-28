import type { ErrorRequestHandler, RequestHandler } from "express";
import { newRequestId } from "../lib/id.js";

export interface ApiErrorBody {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number | string;
    error_data?: Record<string, unknown>;
    request_id: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number,
    message: string,
    public readonly subcode?: number | string,
    public readonly errorData?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const requestIdMiddleware: RequestHandler = (_req, res, next) => {
  const id = newRequestId();
  res.locals.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const requestId = (res.locals.requestId as string | undefined) ?? newRequestId();
  if (err instanceof ApiError) {
    const body: ApiErrorBody = {
      error: {
        message: err.message,
        type: "ApiError",
        code: err.code,
        ...(err.subcode !== undefined ? { error_subcode: err.subcode } : {}),
        ...(err.errorData ? { error_data: err.errorData } : {}),
        request_id: requestId,
      },
    };
    res.status(err.status).json(body);
    return;
  }
  const body: ApiErrorBody = {
    error: {
      message: process.env.NODE_ENV === "production" ? "Internal server error" : String((err as Error)?.message ?? err),
      type: "ApiError",
      code: 1,
      request_id: requestId,
    },
  };
  res.status(500).json(body);
};
