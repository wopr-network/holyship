/**
 * Flow Design Prompt Template.
 *
 * Dispatched to a runner after interrogation gaps are resolved.
 * The AI takes the RepoConfig + engineering flow template and produces
 * a custom flow definition tailored to what the repo actually supports.
 */

import type { RepoConfig } from "./interrogation-prompt.js";

export const FLOW_DESIGN_PROMPT = `You are a flow designer. Your job is to design a custom software engineering flow for a specific repo, based on its capabilities.

## Repo
{{repoFullName}}

## Repo Capabilities (from interrogation)
{{repoConfigJson}}

## Base Flow Template

The base engineering flow is:

  spec → code → review ←→ fix
                   ↓
                 docs → learning → merge → done

States: spec, code, review, fix, docs, learning, merge, done, stuck, cancelled, budget_exceeded
Signals: spec_ready, pr_created, clean, issues, ci_failed, fixes_pushed, cant_resolve, docs_ready, cant_document, learned, merged, blocked, closed

Gates:
- spec-posted: checks issue_tracker.comment_exists for "## Implementation Spec"
- ci-green: checks vcs.ci_status on PR head SHA
- pr-mergeable: checks vcs.pr_status on PR number

## Your Task

Adapt the base flow to match this repo's actual capabilities. Rules:

1. **No CI? Remove ci-green gate.** If ci.supported is false, the code→review transition should not be gated.
2. **No tests? Adjust prompts.** If testing.supported is false, remove test-related instructions from code/review prompts.
3. **No docs? Remove docs state.** If docs.supported is false, transition directly from review(clean) to learning.
4. **No linter/formatter?** Remove lint/format instructions from code prompts.
5. **Has review bots?** Add instructions to check bot comments in review prompt.
6. **Has merge queue?** Mention merge queue in merge prompt.
7. **Customize CI gate command.** Use the repo's actual gate command in code prompts.
8. **Customize model tiers.** Complex repos → sonnet for spec, simple repos → haiku.
9. **Tune timeouts.** If you know CI is slow (from config), increase ci-green timeout.
10. **Keep terminal states.** Always include: done, stuck, cancelled, budget_exceeded.
11. **Keep the review↔fix loop.** This is non-negotiable.
12. **Keep learning state.** This feeds the prompt engineering loop.

## Output Format

Output a JSON block on a line starting with \`FLOW_DESIGN:\` followed by the JSON. Do not wrap in markdown code fences.

The JSON must have this schema:

FLOW_DESIGN:{"flow":{"name":"engineering","description":"...","initialState":"spec","maxConcurrent":4,"maxConcurrentPerRepo":2,"affinityWindowMs":300000,"claimRetryAfterMs":30000,"gateTimeoutMs":120000,"defaultModelTier":"sonnet","maxInvocationsPerEntity":50},"states":[{"name":"spec","agentRole":"architect","modelTier":"sonnet","mode":"active","promptTemplate":"..."},{"name":"done","mode":"passive"}],"gates":[{"name":"spec-posted","type":"primitive","primitiveOp":"issue_tracker.comment_exists","primitiveParams":{"issueNumber":"{{entity.artifacts.issueNumber}}","pattern":"## Implementation Spec"},"timeoutMs":120000,"failurePrompt":"...","timeoutPrompt":"..."}],"transitions":[{"fromState":"spec","toState":"code","trigger":"spec_ready","priority":0}],"gateWiring":{"spec-posted":{"fromState":"spec","trigger":"spec_ready"}}}

After the FLOW_DESIGN block, output a DESIGN_NOTES: line with a brief explanation of what you changed and why:

DESIGN_NOTES:Removed docs state because docs.supported is false. Increased ci-green timeout to 600s because CI has 6 required checks. Added biome lint instructions to code prompt.

flow_design_complete`;

export interface FlowDesignOutput {
  flow: {
    name: string;
    description: string;
    initialState: string;
    maxConcurrent?: number;
    maxConcurrentPerRepo?: number;
    affinityWindowMs?: number;
    claimRetryAfterMs?: number;
    gateTimeoutMs?: number;
    defaultModelTier?: string;
    maxInvocationsPerEntity?: number;
  };
  states: Array<{
    name: string;
    agentRole?: string;
    modelTier?: string;
    mode?: string;
    promptTemplate?: string;
  }>;
  gates: Array<{
    name: string;
    type: string;
    primitiveOp?: string;
    primitiveParams?: Record<string, unknown>;
    timeoutMs?: number;
    failurePrompt?: string;
    timeoutPrompt?: string;
    outcomes?: Record<string, { proceed?: boolean; toState?: string }>;
  }>;
  transitions: Array<{
    fromState: string;
    toState: string;
    trigger: string;
    priority?: number;
  }>;
  gateWiring: Record<string, { fromState: string; trigger: string }>;
}

export interface FlowDesignResult {
  design: FlowDesignOutput;
  notes: string;
}

/**
 * Render the flow design prompt with repo-specific context.
 */
export function renderFlowDesignPrompt(repoFullName: string, config: RepoConfig): string {
  return FLOW_DESIGN_PROMPT.replace("{{repoFullName}}", repoFullName).replace(
    "{{repoConfigJson}}",
    JSON.stringify(config, null, 2),
  );
}

/**
 * Parse the AI's flow design output into structured data.
 */
export function parseFlowDesignOutput(output: string): FlowDesignResult {
  const lines = output.split("\n");

  let design: FlowDesignOutput | null = null;
  let notes = "";

  for (const line of lines) {
    if (line.startsWith("FLOW_DESIGN:")) {
      const json = line.slice("FLOW_DESIGN:".length).trim();
      design = JSON.parse(json) as FlowDesignOutput;
    } else if (line.startsWith("DESIGN_NOTES:")) {
      notes = line.slice("DESIGN_NOTES:".length).trim();
    }
  }

  if (!design) {
    throw new Error("Flow design output missing FLOW_DESIGN line");
  }

  // Validate required fields
  if (!design.flow?.name || !design.flow?.initialState) {
    throw new Error("Flow design missing required flow.name or flow.initialState");
  }
  if (!design.states || design.states.length === 0) {
    throw new Error("Flow design missing states");
  }
  if (!design.transitions || design.transitions.length === 0) {
    throw new Error("Flow design missing transitions");
  }

  // Ensure terminal states exist
  const stateNames = new Set(design.states.map((s) => s.name));
  for (const terminal of ["done", "stuck", "cancelled", "budget_exceeded"]) {
    if (!stateNames.has(terminal)) {
      design.states.push({ name: terminal, mode: "passive" });
    }
  }

  return { design, notes };
}
