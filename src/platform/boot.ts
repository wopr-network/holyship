import { serve } from "@hono/node-server";
import { createHonoApp, type HonoServerDeps } from "../api/hono-server.js";
import { createShipItRoutes } from "../api/ship-it.js";
import { DomainEventPersistAdapter } from "../engine/domain-event-adapter.js";
import { Engine } from "../engine/engine.js";
import { EventEmitter } from "../engine/event-emitter.js";
import { provisionEngineeringFlow } from "../flows/provision.js";
import { DrizzleGitHubInstallationRepository } from "../github/installation-repo.js";
import { createGitHubWebhookRoutes } from "../github/webhook.js";
import { createScopedRepos } from "../repositories/scoped-repos.js";
import { loadPlatformEnv } from "./config.js";
import { createDb, runMigrations, shutdown as shutdownDb } from "./db.js";
import { log } from "./log.js";

export async function boot(): Promise<void> {
  const env = loadPlatformEnv();

  // 1. Database
  const { db } = createDb(env.DATABASE_URL);

  // 2. Migrations
  await runMigrations(db);

  // 3. Repos
  const tenantId = "default";
  const repos = createScopedRepos(db, tenantId);

  // 4. Event emitter
  const eventEmitter = new EventEmitter();
  eventEmitter.register(new DomainEventPersistAdapter(repos.domainEvents));

  // 5. Engine
  const withTransaction = <T>(
    // biome-ignore lint/suspicious/noExplicitAny: cross-driver compat
    fn: (tx: any) => T | Promise<T>,
    // biome-ignore lint/suspicious/noExplicitAny: cross-driver compat
  ): Promise<T> => (db as any).transaction(async (tx: any) => fn(tx));

  const repoFactory = (tx: unknown) => {
    const r = createScopedRepos(tx, tenantId);
    return {
      entityRepo: r.entities,
      flowRepo: r.flows,
      invocationRepo: r.invocations,
      gateRepo: r.gates,
      transitionLogRepo: r.transitionLog,
      domainEvents: r.domainEvents,
    };
  };

  const engine = new Engine({
    entityRepo: repos.entities,
    flowRepo: repos.flows,
    invocationRepo: repos.invocations,
    gateRepo: repos.gates,
    transitionLogRepo: repos.transitionLog,
    adapters: new Map(),
    eventEmitter,
    withTransaction,
    repoFactory,
    domainEvents: repos.domainEvents,
  });

  // 6. Provision the baked-in engineering flow
  const { flowId } = await provisionEngineeringFlow(repos.flows, repos.gates);
  log.info(`Engineering flow provisioned: ${flowId}`);

  // 7. Start reaper
  const stopReaper = engine.startReaper(30_000);

  // 8. Build Hono app with full engine routes
  const mcpDeps = {
    entities: repos.entities,
    flows: repos.flows,
    invocations: repos.invocations,
    gates: repos.gates,
    transitions: repos.transitionLog,
    eventRepo: repos.events,
    domainEvents: repos.domainEvents,
    engine,
    withTransaction,
    repoFactory: (tx: unknown) => {
      const r = createScopedRepos(tx, tenantId);
      return {
        entities: r.entities,
        flows: r.flows,
        invocations: r.invocations,
        gates: r.gates,
        transitions: r.transitionLog,
        eventRepo: r.events,
        domainEvents: r.domainEvents,
      };
    },
  };

  const honoServerDeps: HonoServerDeps = {
    engine,
    mcpDeps,
    db,
    defaultTenantId: tenantId,
    eventEmitter,
    withTransaction,
    repoFactory,
    adminToken: env.HOLYSHIP_ADMIN_TOKEN,
    workerToken: env.HOLYSHIP_WORKER_TOKEN,
    corsOrigins: env.UI_ORIGIN ? [env.UI_ORIGIN] : undefined,
    logger: log,
  };

  const app = createHonoApp(honoServerDeps);

  // 9. Mount Ship It routes
  app.route(
    "/api/ship-it",
    createShipItRoutes({
      engine,
      fetchIssue: async (_owner, _repo, _issueNumber) => {
        // TODO: Use GitHub App installation token to fetch issue
        throw new Error("fetchIssue not yet wired to GitHub App");
      },
    }),
  );

  // 10. Mount GitHub webhook routes (if webhook secret is configured)
  if (env.GITHUB_WEBHOOK_SECRET) {
    const installationRepo = new DrizzleGitHubInstallationRepository(db, tenantId);
    app.route(
      "/api/github/webhook",
      createGitHubWebhookRoutes({
        installationRepo,
        webhookSecret: env.GITHUB_WEBHOOK_SECRET,
        tenantId,
        onIssueOpened: async (payload) => {
          log.info(`Issue opened: ${payload.owner}/${payload.repo}#${payload.issueNumber}`);
          await engine.createEntity("engineering", undefined, {
            repoFullName: `${payload.owner}/${payload.repo}`,
            issueNumber: payload.issueNumber,
            issueTitle: payload.issueTitle,
            issueBody: payload.issueBody,
          });
        },
      }),
    );
    log.info("GitHub webhook routes mounted at /api/github/webhook");
  }

  // 11. Serve
  const server = serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }) as import("node:http").Server;
  log.info(`holyship platform listening on ${env.HOST}:${env.PORT}`);

  // Graceful shutdown
  const onShutdown = async () => {
    log.info("Shutting down...");
    await stopReaper();
    server.close();
    await shutdownDb();
    process.exit(0);
  };
  process.once("SIGINT", () => void onShutdown());
  process.once("SIGTERM", () => void onShutdown());
}
