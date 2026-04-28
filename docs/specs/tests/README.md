# Test specifications

This directory holds **deployment-tier test plans** (release-candidate scenarios — npm install, Docker pull, multi-arch parity).

The active scenarios are in [`cross-cutting/`](./cross-cutting/). They run on a `workflow_dispatch` + tag-push pipeline before publishing artifacts.

The active runtime test suite (Vitest, ~90 tests) lives in `test/` at the repo root — see [`docs/testing.md`](../../testing.md).

## Layout

```
tests/
├── _template.md             Template for new scenarios
└── cross-cutting/
    └── distribution.test.md Cross-channel deployment tests (npm + Docker + source)
```

The active test suite is **runtime, not in this directory**. See [`docs/testing.md`](../../testing.md).
