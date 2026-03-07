# Disciplines — DEFCON Implementation

The concrete implementation of the [discipline model](../../method/pipeline/disciplines.md) in DEFCON.

---

## WOPR's Four Disciplines

### engineering

The primary DEFCON discipline. An engineering worker owns a `wopr-changeset` entity from backlog through merge.

```
flow.claim({ workerId: "wkr_abc123", role: "engineering" })
→ entity feat-392 in state "architecting"
→ prompt: "Write an implementation spec for WOP-392..."

flow.report({ workerId: "wkr_abc123", signal: "spec_ready" })
→ gate: spec-posted (did the spec land in Linear?)
→ entity advances to "coding"
→ prompt: "Implement the spec. Worktree: ~/worktrees/WOP-392..."

flow.report({ workerId: "wkr_abc123", signal: "pr_created", artifacts: { prUrl: "..." } })
→ gate: ci-green (CI must pass before review)
→ entity advances to "reviewing"
→ prompt: "Review the PR. Check CI, read bot comments, read the diff..."

... and so on through fixing, merging, done.
```

One worker. One claim. Sequential reports. The engineering worker IS the architect, coder, reviewer, fixer, and merger.

### devops

Handles WOPR releases, deploys, and production incidents. Push-triggered — entities are created by GitHub webhooks (release tags) or monitoring alerts (PagerDuty).

Future flows:
- `wopr-release` — triggered by GitHub tag, handles staging → production deploy
- `wopr-incident` — triggered by PagerDuty alert, handles investigation → mitigation → postmortem

### qa

Handles test authoring, coverage gap remediation, and post-deploy verification failures. Push-triggered by coverage analysis and audit findings.

Future flow: `wopr-qa-coverage` — triggered by coverage threshold breach.

### security

Handles CVE remediation, dependency audits, and security findings. Push-triggered by `npm audit`, Snyk, or scheduled scans.

Future flow: `wopr-security-audit` — triggered by scheduled scan finding high-severity CVEs.

---

## Flow Seed Format

The `discipline` field is required on every flow. States do not declare roles.

```json
{
  "flows": [
    {
      "name": "wopr-changeset",
      "discipline": "engineering",
      "initialState": "backlog",
      "maxConcurrent": 4,
      "defaultModelTier": "sonnet"
    }
  ],
  "states": [
    {
      "name": "architecting",
      "flowName": "wopr-changeset",
      "modelTier": "opus",
      "mode": "active",
      "promptTemplate": "..."
    },
    {
      "name": "coding",
      "flowName": "wopr-changeset",
      "modelTier": "sonnet",
      "mode": "active",
      "promptTemplate": "..."
    }
  ]
}
```

Note: `modelTier` on states is for **active mode model selection only** — it tells DEFCON what model to spawn when running autonomously. It has nothing to do with discipline routing. Passive workers use whatever model they are.

If a seed file contains `agentRole` on any state, the loader will reject it with an error — that field has been removed.

---

## Claim Routing

`flow.claim(role: "engineering")` queries:

```sql
SELECT entities.*
FROM entities
JOIN flows ON entities.flow_id = flows.id
WHERE flows.discipline = 'engineering'
  AND entities.claimed_by IS NULL
  AND entities.status = 'active'
ORDER BY
  -- Affinity: prefer entities this worker last touched
  CASE WHEN entities.affinity_worker_id = :workerId
       AND entities.affinity_expires_at > NOW()
  THEN 0 ELSE 1 END,
  -- Then priority from issue tracker
  entities.priority,
  -- Then time in current state
  entities.entered_state_at
LIMIT 1
```

The worker never sees devops or security entities. The discipline filter is the boundary.

---

## Adding a New Discipline Flow

1. Create a seed file with `"discipline": "your-discipline"` on the flow
2. Set `initialState` to reflect the trigger (e.g. `"alert_fired"` for an incident flow)
3. If push-triggered, add `"acceptsEvents": ["your-event-type"]`
4. Load with `defcon init --seed seeds/your-flow.json`
5. Workers call `flow.claim({ role: "your-discipline" })` to receive work

See [seeds/wopr-changeset.json](../../../seeds/wopr-changeset.json) for the canonical engineering flow example.

---

See [method/disciplines.md](../../method/pipeline/disciplines.md) for the principle.

See [worker-protocol.md](worker-protocol.md) for how claim routing works end-to-end.
