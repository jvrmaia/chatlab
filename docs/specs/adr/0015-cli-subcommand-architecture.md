# 0015 — CLI subcommand architecture

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** @jvrmaia

## Context

Capability [`0007-eval-harness`](../capabilities/0007-eval-harness.md) introduced `chatlab eval` as the first CLI subcommand alongside the default server-start behavior. Before shipping it, the project needed to decide how subcommands are structured so that:

- The `custom` provider's server-start path (`chatlab` with no subcommand) remains zero-overhead — no CLI framework initialization slows down the happy path.
- Adding future subcommands does not require changing shared infrastructure — only the dispatch table in `src/cli.ts` and a new `run[Name]Command` function.
- Tests can exercise the subcommand logic in isolation without spawning a real OS process.

Forces:

- **Minimal dependencies.** The project has been deliberate about not pulling in large libraries for problems that can be solved simply (see ADRs 0004, 0005). A CLI framework (commander, yargs, meow) would add 50–200 KB to the published package for a feature set we don't need.
- **Dynamic import.** Eval imports (`eval/loader`, `eval/runner`, `eval/reporter`) should not be loaded when the user just runs the server. Node.js dynamic `import()` achieves this with no framework.
- **Testability.** The eval command boots chatlab internally on an ephemeral port and calls the HTTP API — it must be callable as a plain async function, not only via `process.argv`.
- **TypeScript strict mode.** All flag values are `string | undefined`; the pattern must be type-safe without casting.

## Decision

We implement CLI subcommands as **plain exported async functions**, dispatched by a hand-written router in `src/cli.ts`. No CLI framework is used.

### Conventions

**1. Dispatcher in `src/cli.ts`**

```
argv[0] === "subcommand"
  → run[Subcommand]Command(argv.slice(1))
  → process.exit(...)

argv[0] === undefined (or a flag)
  → startChatlab({ argv })
```

The entire dispatcher is a `switch`-style chain of `if` clauses on `argv[0]`. Adding a new subcommand is: (a) add one `if` branch, (b) add the entry to the help string, (c) add the `run[Name]Command` function.

**2. Subcommand functions**

Each subcommand is `export async function run[Name]Command(argv: string[]): Promise<void>`. Conventions:

- Receives raw `argv` (already sliced past the subcommand name).
- Uses the local `flag(name)` helper to extract named arguments: `function flag(name: string): string | undefined`.
- Performs all I/O (stdout, stderr, process.exit) directly — it is not a pure function.
- Boots any internal chatlab server via `startChatlab()` if it needs HTTP access, and calls `running.stop()` in a `finally` block.
- Exits with a non-zero code on failure; does not throw to the dispatcher.

**3. Dynamic imports for subcommand dependencies**

Each `run[Name]Command` wraps its internal imports in `await import(...)` so that server-start does not load eval code, and eval does not load server-only code. This keeps the happy-path startup minimal.

**4. Flag parsing**

```typescript
function flag(name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
}
```

Boolean flags (those whose presence alone is the signal) use `argv.includes(name)`. There is no positional-argument convention; all arguments are named flags.

**5. Unknown subcommands**

Any unrecognised `argv[0]` value that does not begin with `--` emits an error to stderr and exits 1:

```
Unknown command: 'foo'. Run `chatlab --help` for usage.
```

### Files

| File | Role |
| --- | --- |
| `src/cli.ts` | Dispatcher + `runEvalCommand` |
| `src/eval/runner.ts` | Core eval logic (HTTP polling loop) |
| `src/eval/loader.ts` | Golden-set YAML parser |
| `src/eval/reporter.ts` | Markdown / JSON report builder |

Future subcommands add a `src/[name]/` module tree and export `run[Name]Command` from a file there, then add one `if` branch in `src/cli.ts`.

## Consequences

- **Positive:** zero new runtime dependencies. The published package does not grow for a CLI framework.
- **Positive:** subcommand functions are testable as plain async functions — `test/eval/cli-eval.test.ts` calls `runEvalCommand(argv)` directly with a spy fetcher, no shell spawning.
- **Positive:** dynamic imports keep server-start on the critical path; eval modules are loaded only when `chatlab eval` is invoked.
- **Positive:** the pattern is readable at a glance. A new contributor adding a subcommand has three steps: `if` branch, help string entry, `run[Name]Command` function.
- **Negative:** the help string and the dispatch logic are not co-located — adding a subcommand requires edits in two places in `src/cli.ts`. Acceptable for the scale we expect.
- **Negative:** the `flag()` helper does not validate that a flag name was followed by a value (not another flag). Invalid invocations surface as `undefined` values rather than explicit parse errors. Mitigated by explicit `if (!agentId) { stderr.write(...); exit(1); }` guards in each subcommand.
- **Neutral:** positional arguments are not supported. All arguments use `--name value` form. This is a deliberate choice, not a limitation — it makes adding new flags non-breaking.

**Checklist for adding a new subcommand:**

1. Add the subcommand name to the `detectUnknownSubcommand` allowlist in `src/cli.ts` (the `if (first === "…") return null;` block).
2. Add `if (argv[0] === "<name>") { await run<Name>Command(argv.slice(1)); return; }` in `main()`, before the `detectUnknownSubcommand` call.
3. Update the `--help` output string in `main()` with the new subcommand and its flags.
4. Create `test/eval/<name>.test.ts` (or `test/cli/<name>.test.ts`) covering at minimum: the missing-required-flag path (exit 1) and the happy path (exit 0, output written).

## Alternatives considered

- **commander** — mature, widely used. Rejected: adds ~75 KB to the published package; the help/flag API is more than we need for two subcommands; it would require rewriting the existing `--version` / `--help` handling.
- **yargs** — similar capabilities, larger. Rejected for the same reasons as commander.
- **meow** — lighter, ESM-friendly. Closer to viable. Rejected because the hand-rolled `flag()` helper is simpler, has zero dependencies, and is already implemented and tested.
- **Node's `util.parseArgs`** — standard library, no deps. Rejected because it requires declaring a flag schema upfront, which doesn't compose cleanly with per-subcommand flag sets; also unavailable before Node 18.3 (we target 22, so it's available, but the added schema ceremony is not worth it).
