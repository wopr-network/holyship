/**
 * Gap Actualization Service — turns interrogation gaps into actionable issues.
 *
 * For each gap, creates a GitHub issue in the repo, links it back to the gap
 * record, and optionally creates an entity in the engineering flow so Holy Ship
 * can actualize the fix.
 */

import type { Engine } from "../engine/engine.js";
import { logger } from "../logger.js";
import type { Gap } from "./interrogation-prompt.js";
import type { InterrogationService } from "./interrogation-service.js";

export interface GapActualizationConfig {
  interrogationService: InterrogationService;
  engine: Engine;
  getGithubToken: () => Promise<string | null>;
}

export interface CreatedIssue {
  gapId: string;
  issueNumber: number;
  issueUrl: string;
  entityId?: string;
}

/** Priority → GitHub label mapping. */
const PRIORITY_LABELS: Record<string, string> = {
  high: "priority: high",
  medium: "priority: medium",
  low: "priority: low",
};

export class GapActualizationService {
  private readonly interrogationService: InterrogationService;
  private readonly engine: Engine;
  private readonly getGithubToken: () => Promise<string | null>;

  constructor(config: GapActualizationConfig) {
    this.interrogationService = config.interrogationService;
    this.engine = config.engine;
    this.getGithubToken = config.getGithubToken;
  }

  /**
   * Create a GitHub issue from a single gap and link it back.
   */
  async createIssueFromGap(
    repoFullName: string,
    gapId: string,
    options?: { createEntity?: boolean },
  ): Promise<CreatedIssue> {
    const tag = "[gap-actualize]";
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      throw new Error(`Invalid repo name: ${repoFullName}`);
    }

    // Get the gap
    const gaps = await this.interrogationService.getGaps(repoFullName);
    const gap = gaps.find((g) => g.id === gapId);
    if (!gap) {
      throw new Error(`Gap ${gapId} not found for repo ${repoFullName}`);
    }
    if (gap.status === "issue_created") {
      throw new Error(`Gap ${gapId} already has an issue: ${gap.issueUrl}`);
    }

    const token = await this.getGithubToken();
    if (!token) {
      throw new Error("No GitHub token available");
    }

    // Create GitHub issue
    logger.info(`${tag} creating issue`, { repo: repoFullName, gap: gap.title });
    const issue = await this.createGitHubIssue(owner, repo, token, gap);

    // Link back to gap
    await this.interrogationService.linkGapToIssue(gapId, repoFullName, issue.html_url);
    logger.info(`${tag} issue linked`, { gapId, issueUrl: issue.html_url });

    const result: CreatedIssue = {
      gapId,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    };

    // Optionally create an engineering flow entity to actualize the fix
    if (options?.createEntity) {
      try {
        const entity = await this.engine.createEntity("engineering", undefined, {
          repoFullName,
          issueNumber: issue.number,
          issueUrl: issue.html_url,
          gapCapability: gap.capability,
          gapTitle: gap.title,
        });
        result.entityId = entity.id;
        logger.info(`${tag} entity created`, { entityId: entity.id, issueNumber: issue.number });
      } catch (err) {
        // Entity creation failure shouldn't fail the issue creation
        logger.warn(`${tag} entity creation failed (issue still created)`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  /**
   * Create issues for all open gaps in a repo.
   */
  async createIssuesFromAllGaps(repoFullName: string, options?: { createEntity?: boolean }): Promise<CreatedIssue[]> {
    const gaps = await this.interrogationService.getGaps(repoFullName);
    const openGaps = gaps.filter((g) => g.status === "open");

    if (openGaps.length === 0) {
      return [];
    }

    const results: CreatedIssue[] = [];
    for (const gap of openGaps) {
      try {
        const result = await this.createIssueFromGap(repoFullName, gap.id, options);
        results.push(result);
      } catch (err) {
        logger.error("[gap-actualize] failed for gap", {
          gapId: gap.id,
          capability: gap.capability,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  /**
   * Create a GitHub issue via the REST API.
   */
  private async createGitHubIssue(
    owner: string,
    repo: string,
    token: string,
    gap: Gap,
  ): Promise<{ number: number; html_url: string }> {
    const labels = ["holyship", "gap"];
    const priorityLabel = PRIORITY_LABELS[gap.priority];
    if (priorityLabel) labels.push(priorityLabel);

    const body = [
      `## ${gap.title}`,
      "",
      gap.description,
      "",
      "---",
      `**Capability:** \`${gap.capability}\``,
      `**Priority:** ${gap.priority}`,
      `**Source:** Holy Ship repo interrogation`,
    ].join("\n");

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `[Holy Ship] ${gap.title}`,
        body,
        labels,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub issue creation failed: HTTP ${res.status} — ${text.slice(0, 500)}`);
    }

    return (await res.json()) as { number: number; html_url: string };
  }
}
