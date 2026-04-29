# 0005 — Media

- **Status:** Implemented (v1.0.0)
- **Authors:** @jvrmaia
- **Related ADRs:** _none_
- **Depends on:** [`0001-workspaces`](./0001-workspaces.md), [`0003-chats-and-messages`](./0003-chats-and-messages.md)

## Summary

Users can attach images, audio, video, documents, and stickers to messages. chatlab stores binary content in the active workspace's storage and exposes upload / metadata / download / delete endpoints. Each `Message` may carry zero or more `attachments[]`, each pointing at a stored media id.

## Motivation

- Multimodal agents (gpt-4o, Claude with vision, Gemini) can consume images. v1.0 stores attachments; **forwarding them to providers is deferred** — but the storage shape lets a future capability drop in a converter.
- A chat-agent dev wants to test "what does my agent do when the user sends a screenshot?" — even if v1.0's runner doesn't forward the bytes, the dev can paste a transcription themselves and validate the rest of the loop.
- Documents and stickers are common enough in support-bot scenarios that emitting "media not supported" felt like a feature gap.

## User stories

- As a **chat-agent developer**, I want to drag-and-drop a file into the composer and have it appear as an attachment on the next user message, so that I don't need a separate upload step.
- As a **chat-agent developer**, I want media stored in the same workspace as the chat that referenced it, so that switching workspaces shows the right pictures.
- As a **chat-agent developer**, I want oversized uploads to fail fast with a clear 413, so that I know the limit instead of staring at a hung upload.

## Behavior

### Limits

- Max upload size: **16 MB** (`DEFAULT_MAX_BYTES` constant in `src/types/media.ts`; configurable env var deferred to v1.1).
- Allowed mime types per `type`:
  - `image`: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/svg+xml`
  - `audio`: `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/webm`
  - `video`: `video/mp4`, `video/webm`
  - `document`: `application/pdf`, `text/plain`, `text/csv`, `application/json`
  - `sticker`: `image/webp` (animated or static)
- Mime/type mismatch → 415.
- Oversize → 413.

### Endpoints

- `POST /v1/media` (multipart):
  - Required form fields: `file`, `type` (one of the strings above).
  - Returns `{ id }` (201).
- `GET /v1/media/{id}` returns metadata `{ id, type, mime_type, size, sha256, filename?, created_at }`. 404 if absent.
- `GET /v1/media/{id}/download` streams the bytes with the recorded `Content-Type` and `Content-Disposition: inline` (with filename if known). 404 if absent.
- `DELETE /v1/media/{id}` removes. 404 if absent.

### Linking to messages

When a user appends a message via `POST /v1/chats/{id}/messages`, they include:

```json
{
  "content": "look at this",
  "attachments": [
    { "media_id": "media-uuid-1", "mime_type": "image/png", "filename": "screenshot.png" }
  ]
}
```

The server validates that every `media_id` exists in the active workspace's media namespace. Unknown ids → 400.

### Persistence

- Storage namespace `media`.
- `memory` adapter: `Map<id, { meta, content: Buffer }>`.
- `sqlite`: a `media` table with a `BLOB content` column.
- `duckdb`: a `media` table — note that the `@duckdb/node-api` Buffer-binding limitation means DuckDB's media path may need a workaround. Tracked as the `skipMedia` option in the storage test battery.

### Workspace scoping

- Media uploads land in the **active** workspace's storage.
- Switching workspaces makes the previously-uploaded media unreachable from `GET /v1/media/{id}` until you switch back.
- Workspace deletion (`DELETE /v1/workspaces/{id}?confirm=true`) removes the media file alongside the rest of the data.

## Out of scope

- **Forwarding attachments to LLM providers.** v1.0's runner sends only text. Future capability.
- **Streaming uploads** for very large files.
- **Image transformations** (resize, format conversion).
- **External object storage** (S3 et al.). All bytes live in the workspace's local file.
- **Quotas per workspace.** Process-global limit only.
- **Virus scanning.**

## Open questions

1. Should v1.0 already wire image attachments through to multimodal providers (gpt-4o, Claude vision)? It would require encoding the image into the provider's message-array format. **Decision target:** v1.1 unless a clean implementation arrives in time.
2. Should DuckDB's media path be fixed in v1.0 or stay best-effort with the test skipped? The bug is upstream in `@duckdb/node-api`'s parameter binding. **Decision target:** investigate during the storage adapter rewrite; if a workaround (`?::BLOB` cast, or Uint8Array conversion) works, fix it.

## Verification

- [ ] Upload a PNG via `POST /v1/media` with `type: image`. Get back an id. `GET /v1/media/{id}` returns metadata. `GET /v1/media/{id}/download` returns the bytes with `Content-Type: image/png`.
- [ ] Upload a PNG declared as `type: audio` — returns 415.
- [ ] Upload a 17 MB file — returns 413.
- [ ] Reference an unknown `media_id` in `POST /v1/chats/{id}/messages` — returns 400.
- [ ] Upload media in workspace A. Switch to workspace B. `GET /v1/media/{id}` returns 404. Switch back — visible again.
- [ ] Drag-and-drop a file into the UI composer — confirm a single user message with the attachment appears in the chat.

## Acceptance

- **Vitest test ID(s):** `test/http/media-router.test.ts` (upload + GET + download + DELETE + 415 / 413 / 400 paths); storage battery in `test/storage/_battery.ts` (memory + sqlite — DuckDB intentionally skipped).
- **OpenAPI operation(s):** `uploadMedia`, `getMedia`, `downloadMedia`, `deleteMedia` in [`openapi.yaml`](../api/openapi.yaml).
- **User Guide section:** [`docs/user-guide/03-chats-and-messages.md`](../../user-guide/03-chats-and-messages.md) (attachment flow).
