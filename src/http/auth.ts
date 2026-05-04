import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { ApiError } from "./error-handler.js";

export interface AuthConfig {
  requireToken?: string;
}

export function authMiddleware(cfg: AuthConfig): RequestHandler {
  return (req, _res, next) => {
    const header = req.header("authorization") ?? req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) {
      throw new ApiError(
        401,
        190,
        "Error validating access token: no Bearer token provided",
      );
    }
    if (cfg.requireToken) {
      const expected = Buffer.from(cfg.requireToken);
      const provided = Buffer.from(token);
      const maxLen = Math.max(expected.length, provided.length);
      const a = Buffer.concat([expected, Buffer.alloc(maxLen - expected.length)]);
      const b = Buffer.concat([provided, Buffer.alloc(maxLen - provided.length)]);
      if (provided.length !== expected.length || !timingSafeEqual(a, b)) {
        throw new ApiError(401, 190, "Error validating access token: token mismatch");
      }
    }
    next();
  };
}
