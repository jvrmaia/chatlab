import { randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

export function newRequestId(): string {
  return randomBytes(12).toString("hex");
}
