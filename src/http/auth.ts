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
    if (cfg.requireToken && token !== cfg.requireToken) {
      throw new ApiError(401, 190, "Error validating access token: token mismatch");
    }
    next();
  };
}
