# Exporting feedback

The `GET /v1/feedback/export` endpoint streams **JSON Lines** — one `FeedbackExportItem` per line — that downstream pipelines (HuggingFace `datasets`, DPO trainers, eval harnesses) consume without conversion.

The schema is locked in [ADR 0007](./specs/adr/0007-feedback-corpus-model.md) and documented in [`docs/specs/api/openapi.yaml`](./specs/api/openapi.yaml). v1.0 publishes `schema_version: 1`.

---

## Pull the corpus

```bash
export CL=http://127.0.0.1:4480
export TOKEN=dev-token

curl -H "Authorization: Bearer $TOKEN" $CL/v1/feedback/export > corpus.jsonl
```

The endpoint streams; it does not buffer. Cancelling the curl mid-flight is safe — the server stops emitting.

### Filter at the server

```bash
# only thumbs-down ratings
curl -H "Authorization: Bearer $TOKEN" \
  "$CL/v1/feedback/export?rating=down" > down.jsonl

# only the last 7 days
SINCE=$(date -u -v-7d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -d '7 days ago' +"%Y-%m-%dT%H:%M:%SZ")
curl -H "Authorization: Bearer $TOKEN" \
  "$CL/v1/feedback/export?since=$SINCE" > recent.jsonl

# only one chat
curl -H "Authorization: Bearer $TOKEN" \
  "$CL/v1/feedback/export?chat_id=$CHAT_ID" > chat.jsonl
```

Combine with `&` if you need multiple filters.

---

## What's in each line

```jsonc
{
  "schema_version": 1,
  "workspace_id": "1c1f...",
  "chat_id": "f08b...",
  "theme": "Aprendendo Python",
  "agent_message": {
    "id": "ce19...",
    "content": "Comece pelos tipos básicos: int, str, list...",
    "created_at": "2026-04-30T14:32:09.182Z",
    "role": "assistant"
  },
  "prompt_message": {
    "id": "9b5e...",
    "content": "Como começo a aprender Python?",
    "created_at": "2026-04-30T14:32:08.034Z",
    "role": "user"
  },
  "rating": "up",
  "rated_at": "2026-04-30T14:32:14.501Z",
  "comment": "didactic",
  "annotation": {
    "body": "user followed up with concrete examples",
    "updated_at": "2026-04-30T14:35:02.117Z"
  },
  "agent_version": "ollama:llama3"
}
```

Required: `schema_version`, `workspace_id`, `chat_id`, `theme`, `agent_message`, `prompt_message`, `rating`, `rated_at`, `annotation`.
Optional: `comment`, `agent_version`, `failure_category`, `flagged_for_review`.

---

## `jq` recipes

### Count by rating

```bash
jq -s 'group_by(.rating) | map({rating: .[0].rating, count: length})' corpus.jsonl
# [
#   { "rating": "up",   "count": 482 },
#   { "rating": "down", "count":  37 }
# ]
```

### Show only the agent text + rating

```bash
jq -c '{ rating, content: .agent_message.content }' corpus.jsonl
```

### Slice by `agent_version`

```bash
jq -c 'select(.agent_version == "ollama:llama3.1")' corpus.jsonl > llama3.1.jsonl
```

### Convert to chat-format (`messages` array) for SFT

```bash
jq -c '{ messages: [
  { role: "system", content: "" },
  { role: "user", content: .prompt_message.content },
  { role: "assistant", content: .agent_message.content }
], rating }' corpus.jsonl > sft.jsonl
```

### Convert to DPO format

DPO trainers want `(prompt, chosen, rejected)` triples. Group by prompt and pair every 👍 with a 👎 of the same prompt:

```bash
jq -s '
  group_by(.prompt_message.content)
  | map({
      prompt: .[0].prompt_message.content,
      chosen: (map(select(.rating == "up")) | first | .agent_message.content),
      rejected: (map(select(.rating == "down")) | first | .agent_message.content)
    })
  | map(select(.chosen != null and .rejected != null))
' corpus.jsonl > dpo.jsonl
```

This is the cheapest baseline. For real DPO you'll want richer pairing (e.g. same agent, same theme, time-windowed) — see the pandas approach below.

---

## Pandas

```python
import pandas as pd

df = pd.read_json("corpus.jsonl", lines=True)

# Flatten the nested messages.
df["prompt"]   = df["prompt_message"].apply(lambda m: m["content"])
df["response"] = df["agent_message"].apply(lambda m: m["content"])

# Rating distribution by theme.
print(df.groupby(["theme", "rating"]).size().unstack(fill_value=0))

# Most thumbs-down agent versions.
print(df[df.rating == "down"]
      .groupby("agent_version")
      .size()
      .sort_values(ascending=False)
      .head(10))

# Save a clean SFT dataset.
df[df.rating == "up"][["prompt", "response", "theme", "agent_version"]] \
  .to_parquet("sft.parquet", index=False)
```

### Build DPO pairs in pandas

```python
ups   = df[df.rating == "up"][["prompt", "response", "theme"]]
downs = df[df.rating == "down"][["prompt", "response", "theme"]]

pairs = (ups.merge(downs, on=["prompt", "theme"], suffixes=("_chosen", "_rejected"))
            .rename(columns={"response_chosen": "chosen",
                             "response_rejected": "rejected"})
            .drop_duplicates(["prompt", "chosen", "rejected"]))

print(f"{len(pairs)} DPO triples")
pairs.to_json("dpo.jsonl", orient="records", lines=True)
```

The `theme` join keeps prompts in their own context — a 👍 from "support-bot" never pairs with a 👎 from "code-review-bot" even if both used the same prompt.

---

## HuggingFace `datasets`

```python
from datasets import load_dataset

ds = load_dataset("json", data_files="corpus.jsonl", split="train")
print(ds)            # Dataset({features: [...], num_rows: 519})

# Filter and reshape into the chat-template the trainer expects.
ds = ds.filter(lambda r: r["rating"] == "up")
ds = ds.map(lambda r: {
  "messages": [
    {"role": "user", "content": r["prompt_message"]["content"]},
    {"role": "assistant", "content": r["agent_message"]["content"]},
  ],
  "theme": r["theme"],
}, remove_columns=ds.column_names)

ds.save_to_disk("sft-dataset")
```

For DPO, do the pandas pairing above and then `Dataset.from_pandas(pairs)`.

---

## DuckDB (zero-copy analytics)

If your active workspace already runs on the DuckDB adapter, the JSONL export is a direct dump of the `feedback` + `messages` tables joined together. You can also point DuckDB at the JSONL itself for ad-hoc queries:

```sql
-- inside the duckdb CLI
SELECT theme, count(*) AS rated, sum(rating = 'up') AS up
FROM read_json_auto('corpus.jsonl')
GROUP BY theme
ORDER BY rated DESC;
```

DuckDB reads JSONL natively — no preprocessing. Export the result to Parquet with `COPY (...) TO 'corpus.parquet' (FORMAT 'parquet')`.

---

## Schema evolution

The `schema_version` field is **part of the contract**. Reading code should branch on it instead of assuming v1 forever:

```python
def normalize(row):
    if row["schema_version"] == 1:
        return row
    raise ValueError(f"Unsupported schema_version {row['schema_version']}")
```

Future versions add fields (token counts, cost estimates, multi-rater rows). When that lands, ADR 0007 gets a new row in its evolution log — see [`specs/adr/0007-feedback-corpus-model.md`](./specs/adr/0007-feedback-corpus-model.md).

---

## See also

- [`recipes.md`](./recipes.md) — copy-paste curl for every endpoint.
- [`cookbook.md`](./cookbook.md) — task-oriented mini-recipes.
- [Capability 0004](./specs/capabilities/0004-feedback-and-export.md) — the feature spec.
- [ADR 0007](./specs/adr/0007-feedback-corpus-model.md) — the schema's durable rationale.
