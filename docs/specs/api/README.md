---
sidebar_label: Overview
---

# HTTP API contract

The machine-readable contract for chatlab's HTTP surface is **OpenAPI 3.1**. The YAML is the single source of truth — routers, tests, and this docs site are all derived from it.

<div style="display:flex;gap:12px;flex-wrap:wrap;margin:1.5rem 0">
  <a href="https://raw.githubusercontent.com/jvrmaia/chatlab/main/docs/specs/api/openapi.yaml" target="_blank" rel="noopener noreferrer" class="button button--primary button--lg">&#11015; Download openapi.yaml</a>
  <a href="pathname:///chatlab/api/" class="button button--secondary button--lg">Open interactive docs &#8594;</a>
</div>

## Interactive explorer

The panel below renders the full spec with request/response schemas, authentication details, and live navigation by tag. Use the full-page view (`/api/`) for a wider layout.

<div style="border:1px solid var(--ifm-color-emphasis-300);border-radius:8px;overflow:hidden;margin:1rem 0">
  <iframe src="/chatlab/api/" style="width:100%;height:80vh;border:none" title="chatlab API reference (Redoc)"></iframe>
</div>

## Endpoint summary

All endpoints require `Authorization: Bearer <token>` except `/healthz` and `/readyz`. The token matches `CHATLAB_REQUIRE_TOKEN` when set; any non-empty bearer passes in permissive mode.

All `/v1/*` endpoints operate on the **active** workspace.

| Method | Path | Tag | Description |
|--------|------|-----|-------------|
| `GET` | `/healthz` | Health | Liveness probe — no auth required |
| `GET` | `/readyz` | Health | Readiness probe — no auth required |
| `GET` | `/v1/workspaces` | Workspaces | List all workspaces + active ID |
| `POST` | `/v1/workspaces` | Workspaces | Create workspace |
| `GET` | `/v1/workspaces/active` | Workspaces | Get active workspace |
| `POST` | `/v1/workspaces/{id}/activate` | Workspaces | Switch active workspace |
| `DELETE` | `/v1/workspaces/{id}` | Workspaces | Delete workspace (requires `?confirm=true`) |
| `GET` | `/v1/agents` | Agents | List agents in active workspace |
| `POST` | `/v1/agents` | Agents | Create agent |
| `PATCH` | `/v1/agents/{id}` | Agents | Update agent |
| `DELETE` | `/v1/agents/{id}` | Agents | Delete agent |
| `POST` | `/v1/agents/{id}/probe` | Agents | Send a test prompt to the agent |
| `GET` | `/v1/chats` | Chats | List chats in active workspace |
| `POST` | `/v1/chats` | Chats | Create chat |
| `DELETE` | `/v1/chats/{id}` | Chats | Delete chat and its messages |
| `GET` | `/v1/chats/{id}/messages` | Messages | List messages in a chat |
| `POST` | `/v1/chats/{id}/messages` | Messages | Send user message — triggers agent reply |
| `POST` | `/v1/messages/{id}/feedback` | Feedback | Set rating on a message |
| `DELETE` | `/v1/messages/{id}/feedback` | Feedback | Clear feedback |
| `GET` | `/v1/chats/{id}/feedback` | Feedback | List feedback for all messages in a chat |
| `GET` | `/v1/feedback/export` | Feedback | Export feedback corpus as JSONL |
| `GET` | `/v1/chats/{id}/annotation` | Annotations | Get chat annotation |
| `PUT` | `/v1/chats/{id}/annotation` | Annotations | Set chat annotation |
| `POST` | `/v1/media` | Media | Upload a media file |
| `GET` | `/v1/media/{id}` | Media | Get media metadata |
| `GET` | `/v1/media/{id}/download` | Media | Download media file content |
| `DELETE` | `/v1/media/{id}` | Media | Delete media |

## Notes

- **Auth:** Bearer token. Strict when `CHATLAB_REQUIRE_TOKEN` is set (Docker / production); permissive otherwise.
- **WebSocket:** `ws[s]://<host>/ws?token=<token>` — broadcasts `chat.user-message-appended`, `chat.assistant-replied`, `agent.failed`, and `workspace.activated` events in real time.
- **Narrative documentation** lives in [capability specs](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) and [recipes](/recipes).
