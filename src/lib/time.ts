let frozenAt: number | null = null;

export function now(): number {
  return frozenAt ?? Date.now();
}

export function nowIso(): string {
  return new Date(now()).toISOString();
}

export function nowEpochSeconds(): string {
  return Math.floor(now() / 1000).toString();
}

export function freezeClock(epochMs: number): void {
  frozenAt = epochMs;
}

export function advanceClock(deltaMs: number): void {
  if (frozenAt === null) frozenAt = Date.now();
  frozenAt += deltaMs;
}

export function unfreezeClock(): void {
  frozenAt = null;
}
