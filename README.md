# DEFCON

You're a developer. You've been there.

You gave the AI a task. It came back fast — faster than you expected. The code looks right. The tests pass. You feel good. You merge it. You deploy. And then your phone buzzes at 2am because the thing the AI wrote handles the happy path perfectly and falls apart the moment a real user touches it.

Or you're running a team. You've got eight AI agents writing code in parallel and you're shipping faster than you ever have. The board is thrilled. The velocity charts are beautiful. And then one of those agents merges a change that breaks authentication in production. Not because it was malicious. Not because the model was bad. Because the pipeline between "code written" and "code in production" was a prompt that said *please be careful*. And the agent was careful — until it wasn't.

Or you're a Fortune 500 CTO. You've invested millions in AI-assisted development. The pitch was "10x productivity." And it delivered — until the first time an AI agent deployed untested code to your payment processing system and you spent the next 72 hours in an incident room explaining to regulators what happened. The AI did exactly what you asked. The problem was that nobody verified it did it *correctly* before it went live.

This is the problem with vibe coding. Not that the AI can't do the work. It can. The problem is what happens between "the work is done" and "the work is in production." That space is where software goes wrong. And right now, for most teams, that space is filled with hope.

**Hope is not a gate.**

---

In WarGames, WOPR escalated to launch because nothing in the system had the ability to say *not yet*. DEFCON 5. 4. 3. 2. 1. Each level a step closer, each step unchallenged. The system had no mechanism for doubt — only momentum.

AI pipelines have the same problem. They have momentum. What they lack is earned escalation — the structural requirement that each step *prove* it's ready before the next one begins.

**DEFCON is that structure.**

Each level in the pipeline is a question: *are we ready to go further?* Not asked in a prompt. Not left to the agent's judgment. Answered by a deterministic gate — a check that runs, passes or fails, and cannot be skipped. The pipeline doesn't move forward on confidence. It moves forward on evidence.

You don't get to DEFCON 3 without passing DEFCON 4. You don't get to DEFCON 2 without passing DEFCON 3. Each gate builds on the last. The system accumulates certainty the way the real DEFCON system accumulates readiness — one verified level at a time, until the answer to *are we sure?* isn't a feeling. It's a fact.

That's when you ship. Not before.

## Let Me Show You What I Mean

Here's a flow. A feature request enters your pipeline:

```
backlog → spec → coding → reviewing → merging → done
                              ↓            ↓
                            fixing      reviewing
                              ↓
                            stuck
```

An architect agent writes the spec. It emits `spec_ready`. The engine checks: is that signal valid from this state? Is there a transition for it? It finds `spec → coding` on trigger `spec_ready`. The entity advances. A coder agent gets spawned.

The coder writes the code, pushes a PR, emits `pr_created`. The entity moves to `reviewing`. A reviewer agent gets spawned.

Now here's where it gets interesting.

The reviewer runs CI. Reads the diff. Checks every review comment. If everything passes, it emits `clean` — and the entity moves to `merging`. But if anything fails — a test, a lint error, a security finding — the reviewer emits `issues`. The entity moves to `fixing`. A fixer agent gets spawned with the specific findings baked into its prompt.

The fixer addresses the findings, pushes, emits `fixes_pushed`. The entity goes *back to reviewing*. Not forward. Back. The reviewer runs again from scratch. New CI. New diff. New review. If it's clean this time, *then* it moves to merging. If not, back to fixing. The loop continues until the work actually passes — or until the system detects it's stuck and flags it for a human.

The entity cannot reach `merging` without the reviewer saying `clean`. It cannot reach `done` without the merge succeeding. There is no shortcut from `coding` to `done`. There is no "looks good enough." The escalation is the path, and the path is enforced.

That's one flow. You define others — incident response, deployments, onboarding — each with their own states, their own gates, their own escalation path. DEFCON doesn't care what the work is. It cares that the work earns each level before the next one unlocks.

## The Engine

A **flow** is a state machine. Entities enter it and move through states. At each state an agent does work. At each boundary a deterministic gate verifies the output. Transitions fire on signals — not parsed natural language, not regex, but typed strings agents emit via tool call. The entire definition lives in a database and can be mutated at runtime.

```
What you'd hand-code          What DEFCON does
──────────────────────        ──────────────────────────────────
if-statement routing      →   signal → transition → gate → state
hard-coded CI check       →   shell gate: npm test
manual agent spawning     →   invocation lifecycle per state
message parsing           →   flow.report({ signal: "pr.created" })
stuck detection counter   →   conditional transition rule
slot counting             →   flow-level concurrency config
new workflow = new code   →   new flow definition in DB
```

Two execution modes. **Passive**: agents connect via MCP and pull work — `flow.claim()`, do the work, `flow.report()`. The engine manages state. **Active**: the engine calls AI provider APIs directly and runs the full pipeline autonomously. Stages can mix modes within the same flow.

```bash
# Bootstrap from a flow definition
npx defcon init --seed seeds/my-pipeline.json

# Serve MCP (passive mode — agents pull work)
npx defcon serve

# Run autonomous pipeline (active mode)
npx defcon run --flow my-pipeline

# Check pipeline state
npx defcon status
```

---

```
Vibe Coding:  Human → AI → Hope → Production
DEFCON:       Human → AI → Gate → AI → Gate → AI → Gate → Production
```

Every transition is earned. Every gate is deterministic. Every failure feeds back so the same mistake can't happen twice. The pipeline gets smarter over time — sprint 100 is easier than sprint 1 because the gates evolve.

## Documentation

**[`docs/method/`](docs/method/)** — The principles. Tool-agnostic patterns for building gated AI pipelines. Why deterministic gates work. How agents, triggers, and gates compose. Adopt it with whatever tools you use.

**[`docs/adoption/`](docs/adoption/)** — The bridge. [Getting started](docs/adoption/getting-started.md), [checklist](docs/adoption/checklist.md), [migration guide](docs/adoption/migration-guide.md).

## Who This Is For

- **Developers** who've been burned by AI code that looked right and wasn't
- **Team leads** running multi-agent pipelines who need to know the output is safe to ship
- **Organizations** investing in AI-assisted development who can't afford the 2am phone call

## License

MIT
