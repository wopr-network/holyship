# Event Ingestion — DEFCON Implementation

The concrete implementation of [event ingestion](../../method/pipeline/event-ingestion.md) in DEFCON.

---

## The Webhook Endpoint

```
POST /webhook/:flowName
Headers:
  X-DEFCON-Signature: sha256=<hmac-sha256 of request body>
  Content-Type: application/json
```

Example — release webhook from GitHub Actions:

```json
{
  "event": "release_cut",
  "refs": {
    "github": {
      "repo": "wopr-network/wopr",
      "tag": "v1.4.2",
      "sha": "abc123def456"
    }
  },
  "artifacts": {
    "releaseVersion": "v1.4.2",
    "targetEnv": "production",
    "changelogUrl": "https://github.com/wopr-network/wopr/releases/tag/v1.4.2"
  }
}
```

Response (201 Created):

```json
{
  "entityId": "rel-42",
  "flow": "wopr-release",
  "state": "release_cut",
  "message": "Entity created. A devops worker will pick it up on next claim."
}
```

---

## CLI Trigger

For manual triggering or scripted automation:

```bash
defcon trigger --flow wopr-release \
  --event release_cut \
  --refs '{"github": {"repo": "wopr-network/wopr", "tag": "v1.4.2"}}' \
  --artifacts '{"releaseVersion": "v1.4.2", "targetEnv": "production"}'
```

Same internal code path as the webhook. No difference in entity creation behavior.

---

## HMAC Signature Verification

Signatures use SHA-256 HMAC over the raw request body:

```typescript
// Sending system generates:
const signature = `sha256=${crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex')}`

// DEFCON verifies:
const expected = `sha256=${crypto
  .createHmac('sha256', flowSecret)
  .update(rawBody)
  .digest('hex')}`
crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
```

Per-flow secrets are configured in DEFCON config or environment variables:

```bash
DEFCON_WEBHOOK_SECRET_WOPR_RELEASE=your-secret-here
```

---

## Flow Configuration for Event Ingestion

```json
{
  "name": "wopr-release",
  "discipline": "devops",
  "initialState": "release_cut",
  "acceptsEvents": ["release_cut"],
  "deduplicationKey": "refs.github.tag"
}
```

- `acceptsEvents` — whitelist of allowed event types. Unknown types → 400 error.
- `deduplicationKey` — dot-path into the payload to extract the dedup value. Prevents duplicate entities from repeated webhook deliveries.

---

## Wiring GitHub Actions → DEFCON

In `.github/workflows/release.yml`:

```yaml
on:
  release:
    types: [published]

jobs:
  notify-defcon:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger DEFCON
        run: |
          PAYLOAD=$(jq -n \
            --arg tag "${{ github.event.release.tag_name }}" \
            --arg sha "${{ github.sha }}" \
            --arg repo "${{ github.repository }}" \
            '{event: "release_cut", refs: {github: {repo: $repo, tag: $tag, sha: $sha}}, artifacts: {releaseVersion: $tag, targetEnv: "production"}}')

          SIG="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "${{ secrets.DEFCON_WEBHOOK_SECRET }}" | awk '{print $2}')"

          curl -X POST "${{ secrets.DEFCON_URL }}/webhook/wopr-release" \
            -H "Content-Type: application/json" \
            -H "X-DEFCON-Signature: $SIG" \
            -d "$PAYLOAD"
```

---

See [method/event-ingestion.md](../../method/pipeline/event-ingestion.md) for the principle.

See [disciplines.md](disciplines.md) for why devops flows need event ingestion.

See [worker-protocol.md](worker-protocol.md) for how devops workers claim and process these entities.
