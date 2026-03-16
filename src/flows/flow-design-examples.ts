/**
 * Flow Design Examples — one per language ecosystem.
 *
 * Selected at render time based on the repo's primary language.
 * Each example uses the REAL prompts from engineering.ts as the base,
 * with only language-specific adaptations (CI gate command, tool names,
 * conventions, review focus areas).
 */

export interface FlowDesignExample {
  language: string;
  description: string;
  /** The full FLOW_DESIGN:... + DESIGN_NOTES:... block */
  output: string;
}

/**
 * Select the best example for a repo based on its languages.
 * Falls back to TypeScript if no match.
 */
export function selectExample(languages: string[]): FlowDesignExample {
  const primary = languages[0]?.toLowerCase() ?? "";

  for (const example of EXAMPLES) {
    if (example.language === primary) return example;
  }

  // Fuzzy matches
  if (primary.includes("python")) return getExample("python");
  if (primary === "kotlin") return getExample("kotlin");
  if (primary.includes("java")) return getExample("java");
  if (primary.includes("ruby")) return getExample("ruby");
  if (primary.includes("csharp") || primary.includes("c#") || primary === "dotnet") return getExample("csharp");
  if (primary === "swift") return getExample("swift");
  if (primary === "php") return getExample("php");
  if (primary === "elixir" || primary === "erlang") return getExample("elixir");
  if (primary === "c" || primary === "cpp" || primary === "c++") return getExample("cpp");
  if (primary === "dart" || primary === "flutter") return getExample("dart");
  if (primary === "scala") return getExample("java"); // close enough

  return getExample("typescript");
}

function getExample(lang: string): FlowDesignExample {
  return EXAMPLES.find((e) => e.language === lang) ?? EXAMPLES[0];
}

// ─── Language-specific adaptations ───
// These are the ONLY parts that change per language.
// Everything else is the real prompt from engineering.ts.

interface LanguageAdaptation {
  language: string;
  description: string;
  repoExample: string;
  ciGateCommand: string;
  ciGateTimeout: number;
  conventions: string;
  reviewFocus: string;
  docStyle: string;
  hasDocs: boolean;
  hasReviewBots: boolean;
  reviewBotNames: string;
  hasMergeQueue: boolean;
  mergeCommand: string;
  designNotes: string;
}

const ADAPTATIONS: LanguageAdaptation[] = [
  {
    language: "typescript",
    description: "TypeScript API with biome, vitest, GitHub Actions, merge queue, no docs",
    repoExample: "acme/api — TypeScript API",
    ciGateCommand: "pnpm lint && pnpm build && pnpm test",
    ciGateTimeout: 600000,
    conventions: `- Conventional commits (feat:, fix:, chore:)
- biome for lint and format
- All imports sorted: external → parent → sibling
- Tests colocated in tests/ mirroring src/ structure
- vitest with 98% coverage threshold`,
    reviewFocus: "import ordering violations, unused exports, type safety gaps",
    docStyle: "JSDoc",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: true,
    mergeCommand: "gh pr merge --auto",
    designNotes:
      "Removed docs state — docs.supported is false, review(clean) goes to learning. Code/fix prompts use exact CI gate (pnpm lint && pnpm build && pnpm test). Merge uses merge queue (gh pr merge --auto). Review checks 98% coverage threshold. Prompts reference biome and conventional commits.",
  },
  {
    language: "python",
    description: "Python ML service with ruff, pytest, poetry, GitHub Actions, has docs, no merge queue",
    repoExample: "acme/ml-service — Python ML service",
    ciGateCommand: "ruff check . && ruff format --check . && pytest --cov=src --cov-fail-under=85",
    ciGateTimeout: 480000,
    conventions: `- Type hints on all public functions
- Docstrings (Google style) on all public functions
- ruff for lint and format
- pytest with fixtures in conftest.py
- poetry for dependency management
- If adding dependencies, use: poetry add <package>`,
    reviewFocus:
      "type hint coverage, missing docstrings, ML-specific issues (data leakage, reproducibility), test fixture hygiene",
    docStyle: "Google-style docstrings, docs/ directory",
    hasDocs: true,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "Kept docs state — this repo has docs/. Prompts reference ruff (not eslint/biome), pytest with 85% coverage, poetry for deps. Review includes ML-specific checks (data leakage, reproducibility). CI timeout 8 min for pytest suite. Merge uses gh pr merge --squash (no merge queue).",
  },
  {
    language: "go",
    description: "Go microservice with golangci-lint, go test, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/auth-svc — Go microservice",
    ciGateCommand: "golangci-lint run ./... && go test -race -cover ./...",
    ciGateTimeout: 300000,
    conventions: `- Standard Go project layout (cmd/, internal/, pkg/)
- gofmt is law — code must be formatted
- Errors are values — wrap with fmt.Errorf("context: %w", err)
- Table-driven tests
- No global state
- Interfaces accepted, structs returned`,
    reviewFocus: "error handling (no swallowed errors), race conditions, interface compliance, unnecessary allocations",
    docStyle: "godoc comments",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Go-specific: prompts emphasize error wrapping, interfaces, table-driven tests, race detector. CI gate uses golangci-lint + go test -race. CI timeout 5 min (Go builds fast). No merge queue — squash merge.",
  },
  {
    language: "rust",
    description: "Rust CLI with clippy, cargo test, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/ctl — Rust CLI",
    ciGateCommand: "cargo clippy -- -D warnings && cargo test && cargo build --release",
    ciGateTimeout: 900000,
    conventions: `- clippy warnings are errors (deny warnings)
- All public types documented
- Error handling via thiserror + anyhow
- No unsafe unless justified and documented in a SAFETY comment
- Prefer iterators over loops, Result over panic`,
    reviewFocus:
      "unsafe usage (must be justified), unnecessary clones/allocations, error handling patterns, API design",
    docStyle: "rustdoc",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Rust-specific: review prompt notes the compiler handles memory safety, so focus on design/unsafe/performance. CI timeout 15 min — Rust release builds are slow. Clippy with -D warnings. Prompts emphasize thiserror+anyhow, no unnecessary clones.",
  },
  {
    language: "java",
    description:
      "Java Spring Boot API with checkstyle, JUnit 5, Gradle, GitHub Actions, has docs, CodeRabbit review bot",
    repoExample: "acme/order-api — Java Spring Boot",
    ciGateCommand: "./gradlew check && ./gradlew test && ./gradlew build",
    ciGateTimeout: 900000,
    conventions: `- Spring Boot 3 with constructor injection (no @Autowired on fields)
- JUnit 5 with @SpringBootTest for integration, plain JUnit for unit
- Checkstyle enforced in CI
- Gradle wrapper (./gradlew)
- DTOs for API boundaries, entities for persistence`,
    reviewFocus:
      "Spring anti-patterns (field injection, missing @Transactional), SQL injection, missing validation, N+1 queries",
    docStyle: "Javadoc on all public classes and methods, docs/ directory",
    hasDocs: true,
    hasReviewBots: true,
    reviewBotNames: "CodeRabbit",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "Full pipeline — docs state included. Review prompt instructs checking CodeRabbit comments. CI timeout 15 min for Gradle. Prompts reference Spring Boot conventions (constructor injection, @Transactional). Merge verifies CodeRabbit has no unresolved findings.",
  },
  {
    language: "ruby",
    description: "Ruby on Rails app with rubocop, rspec, bundler, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/webapp — Ruby on Rails",
    ciGateCommand: "bundle exec rubocop && bundle exec rspec",
    ciGateTimeout: 600000,
    conventions: `- Rails conventions (fat models, skinny controllers)
- rubocop enforced
- rspec with FactoryBot for test data
- Database migrations via rails generate migration
- Strong parameters for mass assignment protection`,
    reviewFocus:
      "N+1 queries, missing validations, mass assignment vulnerabilities, reversible migrations, rubocop violations",
    docStyle: "YARD",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Rails-specific: review checks for N+1 queries, mass assignment, reversible migrations. Prompts reference rubocop, rspec with FactoryBot. Code prompt includes rails generate migration for schema changes.",
  },
  {
    language: "csharp",
    description: "C# .NET API with dotnet format, xUnit, GitHub Actions, has docs, no merge queue",
    repoExample: "acme/payments-api — C# .NET 8",
    ciGateCommand: "dotnet format --verify-no-changes && dotnet build --no-restore && dotnet test --no-build",
    ciGateTimeout: 600000,
    conventions: `- .NET 8 minimal APIs or controller-based
- dotnet format enforced (editorconfig rules)
- xUnit with FluentAssertions
- Dependency injection via built-in DI container
- Nullable reference types enabled (no null warnings)
- If adding packages: dotnet add package <name>`,
    reviewFocus:
      "null reference warnings, missing async/await (sync-over-async), DI lifetime issues (scoped vs singleton), missing input validation",
    docStyle: "XML doc comments on public APIs, docs/ directory",
    hasDocs: true,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "Kept docs state — has docs/. Prompts reference dotnet format, xUnit, FluentAssertions. Review checks for null reference issues, async anti-patterns, DI lifetime bugs. CI timeout 10 min.",
  },
  {
    language: "swift",
    description: "Swift iOS app with SwiftLint, XCTest, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/ios-app — Swift iOS",
    ciGateCommand: "swiftlint lint --strict && xcodebuild test -scheme App -destination 'platform=iOS Simulator,name=iPhone 16'",
    ciGateTimeout: 900000,
    conventions: `- SwiftLint enforced (strict mode)
- Swift concurrency (async/await, actors) preferred over GCD
- MVVM architecture
- XCTest for unit tests, XCUITest for UI tests
- Swift Package Manager for dependencies`,
    reviewFocus:
      "retain cycles (weak/unowned), main thread violations, force unwraps, missing error handling, concurrency safety (@Sendable)",
    docStyle: "Swift documentation comments (///)",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Swift-specific: review checks for retain cycles, main thread violations, force unwraps. CI timeout 15 min — Xcode builds are slow. SwiftLint strict mode. Prompts emphasize async/await over GCD, MVVM pattern.",
  },
  {
    language: "php",
    description: "PHP Laravel app with PHP CS Fixer, PHPUnit, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/store-api — PHP Laravel",
    ciGateCommand: "php-cs-fixer fix --dry-run --diff && php artisan test --parallel",
    ciGateTimeout: 480000,
    conventions: `- Laravel conventions (Eloquent, service classes, form requests)
- PHP CS Fixer for code style (PSR-12)
- PHPUnit with Laravel test helpers
- Migrations via php artisan make:migration
- Type declarations on all method signatures (PHP 8.2+)`,
    reviewFocus:
      "SQL injection (raw queries), mass assignment (missing $fillable/$guarded), N+1 queries, missing form request validation, untyped returns",
    docStyle: "PHPDoc",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Laravel-specific: review checks for mass assignment, N+1 queries, SQL injection on raw queries. Prompts reference php-cs-fixer (PSR-12), PHPUnit, Eloquent. CI timeout 8 min.",
  },
  {
    language: "kotlin",
    description: "Kotlin Spring Boot API with ktlint, Kotest, Gradle, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/catalog-api — Kotlin Spring Boot",
    ciGateCommand: "./gradlew ktlintCheck && ./gradlew test && ./gradlew build",
    ciGateTimeout: 900000,
    conventions: `- Kotlin idioms (data classes, sealed classes, extension functions)
- Spring Boot 3 with constructor injection
- Kotest with BehaviorSpec style
- ktlint enforced via Gradle plugin
- Coroutines for async operations (not CompletableFuture)`,
    reviewFocus:
      "platform type usage (missing nullability annotations on Java interop), blocking calls in coroutine context, unnecessary mutability (var vs val)",
    docStyle: "KDoc",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Kotlin-specific: review checks for platform types, blocking-in-coroutines, var-vs-val. Prompts reference ktlint, Kotest BehaviorSpec, coroutines. CI timeout 15 min for Gradle.",
  },
  {
    language: "elixir",
    description: "Elixir Phoenix app with mix format, ExUnit, GitHub Actions, has docs, no merge queue",
    repoExample: "acme/realtime-api — Elixir Phoenix",
    ciGateCommand: "mix format --check-formatted && mix credo --strict && mix test",
    ciGateTimeout: 480000,
    conventions: `- Phoenix conventions (contexts, schemas, changesets)
- mix format enforced
- Credo for static analysis (strict mode)
- ExUnit with setup/setup_all blocks
- Pattern matching preferred over conditionals
- Pipe operator for data transformations`,
    reviewFocus:
      "process leaks (unsupervised processes), missing error tuples ({:ok, _}/{:error, _}), changeset validation gaps, missing typespec",
    docStyle: "@moduledoc and @doc with ExDoc",
    hasDocs: true,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "Kept docs state — Elixir has strong ExDoc culture. Review checks for process leaks, missing error tuples, changeset gaps. Prompts reference mix format, Credo strict, ExUnit. CI timeout 8 min.",
  },
  {
    language: "cpp",
    description: "C++ library with clang-tidy, Google Test, CMake, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/core-lib — C++ library",
    ciGateCommand: "cmake --build build && cd build && ctest --output-on-failure && cd .. && clang-tidy -p build src/**/*.cpp",
    ciGateTimeout: 900000,
    conventions: `- Modern C++ (C++20, RAII, smart pointers)
- CMake build system
- Google Test / Google Mock for testing
- clang-tidy for static analysis
- No raw new/delete — use std::unique_ptr/std::shared_ptr
- Header-only where possible for library code`,
    reviewFocus:
      "memory safety (raw pointers, manual new/delete), undefined behavior, missing const-correctness, include hygiene, thread safety",
    docStyle: "Doxygen",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. C++-specific: review focuses on memory safety, undefined behavior, const-correctness. CI timeout 15 min — C++ builds are slow. Prompts emphasize RAII, smart pointers, modern C++20.",
  },
  {
    language: "dart",
    description: "Dart Flutter app with dart analyze, flutter test, GitHub Actions, no docs, no merge queue",
    repoExample: "acme/mobile-app — Dart Flutter",
    ciGateCommand: "dart analyze --fatal-infos && flutter test --coverage",
    ciGateTimeout: 600000,
    conventions: `- Flutter/Dart conventions (Widget composition, BLoC or Riverpod for state)
- dart analyze with fatal-infos (zero warnings)
- flutter test for widget and unit tests
- Effective Dart style guide
- Immutable state objects
- If adding packages: flutter pub add <name>`,
    reviewFocus:
      "widget rebuild efficiency (unnecessary setState/build), state management leaks, missing null safety, platform-specific code without abstraction",
    docStyle: "dartdoc (///)",
    hasDocs: false,
    hasReviewBots: false,
    reviewBotNames: "",
    hasMergeQueue: false,
    mergeCommand: "gh pr merge --squash",
    designNotes:
      "No docs state. Flutter-specific: review checks for unnecessary rebuilds, state management leaks. Prompts reference dart analyze (fatal-infos), flutter test. CI timeout 10 min.",
  },
];

// ─── Build examples from real prompts + adaptations ───

function buildExample(a: LanguageAdaptation): FlowDesignExample {
  const specPrompt = `You are an architect. Read the codebase, analyze the issue, and write a detailed implementation spec.

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

{{entity.artifacts.issueBody}}

## Repo
${a.repoExample}

## Conventions
${a.conventions}

## Instructions
1. Read the codebase thoroughly. Understand existing patterns, conventions, and architecture.
2. Identify which files to create, modify, or delete.
3. Specify function signatures, data structures, and test cases.
4. Post the spec as a comment on the issue starting with "## Implementation Spec".
5. When done, output the following signal on a line by itself with no other text:

spec_ready`;

  const codePrompt = `You are a software engineer. Implement the architect's spec, create a PR, and signal when ready for review.

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

## Architect's Spec
{{entity.artifacts.architectSpec}}

{{#if entity.artifacts.gate_failures}}
## Prior Gate Failures — Fix These First
{{#each entity.artifacts.gate_failures}}
- Gate: {{this.gateName}} — {{this.output}}
{{/each}}
{{/if}}

## CI Gate — Run Before Pushing
${a.ciGateCommand}

## Instructions
1. Follow the architect's spec closely.
2. Write clean, tested code.
3. Create a pull request with a clear description.
4. Run the CI gate locally before pushing. All steps must pass.
5. When done, output the following signal on a line by itself with no other text:

pr_created

Include the PR URL in your response.`;

  const reviewBotLine = a.hasReviewBots
    ? `2. Check every ${a.reviewBotNames} comment on the PR — address or acknowledge each one.\n`
    : "2. Check every automated review bot comment (CodeRabbit, Sourcery, etc.) if any are present.\n";

  const reviewPrompt = `You are a code reviewer. Check the PR for correctness, security, and quality.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

## Architect's Spec
{{entity.artifacts.architectSpec}}

## Instructions
1. Read the full PR diff.
${reviewBotLine}3. Verify CI is green.
4. Check for: bugs, security issues, missing tests, spec violations, dead code, ${a.reviewFocus}.
5. When done, output ONE of the following signals on a line by itself with no other text:

clean

If there are issues, list every finding with file, line, and description, then output:

issues

If CI failed, output:

ci_failed`;

  const fixPrompt = `You are a software engineer. Fix every issue found during review, push the fixes, and signal ready for re-review.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

{{#if entity.artifacts.reviewFindings}}
## Review Findings — Fix All of These
{{entity.artifacts.reviewFindings}}
{{/if}}

{{#if entity.artifacts.gate_failures}}
## Gate Failures
{{#each entity.artifacts.gate_failures}}
- {{this.gateName}}: {{this.output}}
{{/each}}
{{/if}}

## CI Gate — Run Before Pushing
${a.ciGateCommand}

## Instructions
1. Fix every finding. Do not skip any.
2. Run the CI gate locally before pushing. All steps must pass.
3. Push to the same branch.
4. When done, output the following signal on a line by itself with no other text:

fixes_pushed

If a finding contradicts the architect's spec, output instead:

cant_resolve`;

  const docsPrompt = `You are a technical writer. Update documentation to reflect the changes in this PR.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Architect's Spec
{{entity.artifacts.architectSpec}}

## Instructions
1. Read the PR diff and spec.
2. Update or create documentation (README, docs/, ${a.docStyle}, comments).
3. Push doc updates to the same branch. Do NOT create a new PR.
4. When done, output the following signal on a line by itself with no other text:

docs_ready

If you can't complete documentation, output instead:

cant_document`;

  const learningPrompt = `You are a learning agent. Extract patterns and update project memory from this completed work.

## Issue
#{{entity.artifacts.issueNumber}}: {{entity.artifacts.issueTitle}}

## What Happened
- Spec: {{entity.artifacts.architectSpec}}
- PR: {{entity.artifacts.prUrl}}

## Instructions
1. What patterns or conventions did this work establish or reinforce?
2. Were there any surprising findings during review?
3. Update CLAUDE.md or project docs if new conventions were established.
4. When done, output the following signal on a line by itself with no other text:

learned`;

  const mergePrompt = a.hasMergeQueue
    ? `You are a merge agent. Merge the PR via the merge queue.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Instructions
1. Verify the PR is mergeable (no conflicts, CI green, reviews approved).
2. Add the PR to the merge queue: ${a.mergeCommand}
3. If the merge queue rejects (DIRTY status), rebase and force-push, then re-enqueue.
4. When done, output ONE of the following signals on a line by itself with no other text:

merged

If blocked (merge queue rejected, conflicts), output:

blocked

If PR was closed without merge, output:

closed`
    : `You are a merge agent. Merge the PR.

## PR
{{entity.artifacts.prUrl}} (#{{entity.artifacts.prNumber}})

## Instructions
1. Verify the PR is mergeable (no conflicts, CI green, reviews approved).
2. Merge the PR: ${a.mergeCommand}
3. When done, output ONE of the following signals on a line by itself with no other text:

merged

If blocked (conflicts, failing checks), output:

blocked

If PR was closed without merge, output:

closed`;

  // Build states array
  const states: Record<string, unknown>[] = [
    { name: "spec", agentRole: "architect", modelTier: "sonnet", mode: "active", promptTemplate: specPrompt },
    { name: "code", agentRole: "coder", modelTier: "sonnet", mode: "active", promptTemplate: codePrompt },
    { name: "review", agentRole: "reviewer", modelTier: "sonnet", mode: "active", promptTemplate: reviewPrompt },
    { name: "fix", agentRole: "fixer", modelTier: "sonnet", mode: "active", promptTemplate: fixPrompt },
  ];

  if (a.hasDocs) {
    states.push({
      name: "docs",
      agentRole: "technical-writer",
      modelTier: "sonnet",
      mode: "active",
      promptTemplate: docsPrompt,
    });
  }

  states.push(
    { name: "learning", agentRole: "learner", modelTier: "haiku", mode: "active", promptTemplate: learningPrompt },
    { name: "merge", agentRole: "merger", modelTier: "haiku", mode: "active", promptTemplate: mergePrompt },
    { name: "done", mode: "passive" },
    { name: "stuck", mode: "passive" },
    { name: "cancelled", mode: "passive" },
    { name: "budget_exceeded", mode: "passive" },
  );

  // Build transitions
  const transitions: Record<string, unknown>[] = [
    { fromState: "spec", toState: "code", trigger: "spec_ready", priority: 0 },
    { fromState: "code", toState: "review", trigger: "pr_created", priority: 0 },
  ];

  if (a.hasDocs) {
    transitions.push(
      { fromState: "review", toState: "docs", trigger: "clean", priority: 0 },
      { fromState: "review", toState: "fix", trigger: "issues", priority: 0 },
      { fromState: "review", toState: "fix", trigger: "ci_failed", priority: 0 },
      { fromState: "fix", toState: "review", trigger: "fixes_pushed", priority: 0 },
      { fromState: "fix", toState: "stuck", trigger: "cant_resolve", priority: 0 },
      { fromState: "docs", toState: "learning", trigger: "docs_ready", priority: 0 },
      { fromState: "docs", toState: "stuck", trigger: "cant_document", priority: 0 },
    );
  } else {
    transitions.push(
      { fromState: "review", toState: "learning", trigger: "clean", priority: 0 },
      { fromState: "review", toState: "fix", trigger: "issues", priority: 0 },
      { fromState: "review", toState: "fix", trigger: "ci_failed", priority: 0 },
      { fromState: "fix", toState: "review", trigger: "fixes_pushed", priority: 0 },
      { fromState: "fix", toState: "stuck", trigger: "cant_resolve", priority: 0 },
    );
  }

  transitions.push(
    { fromState: "learning", toState: "merge", trigger: "learned", priority: 0 },
    { fromState: "merge", toState: "done", trigger: "merged", priority: 0 },
    { fromState: "merge", toState: "fix", trigger: "blocked", priority: 0 },
    { fromState: "merge", toState: "stuck", trigger: "closed", priority: 0 },
  );

  // Build gates
  const gates = [
    {
      name: "spec-posted",
      type: "primitive",
      primitiveOp: "issue_tracker.comment_exists",
      primitiveParams: { issueNumber: "{{entity.artifacts.issueNumber}}", pattern: "## Implementation Spec" },
      timeoutMs: 120000,
      failurePrompt: `The spec gate checked for a comment starting with "## Implementation Spec" on issue #{{entity.artifacts.issueNumber}} and did not find one. Post the spec as a comment on the issue. The comment MUST start with the exact heading "## Implementation Spec".`,
      timeoutPrompt: "The spec gate timed out after 2 minutes. The GitHub API may be slow. Try posting the spec again.",
    },
    {
      name: "ci-green",
      type: "primitive",
      primitiveOp: "vcs.ci_status",
      primitiveParams: { ref: "{{entity.artifacts.headSha}}" },
      timeoutMs: a.ciGateTimeout,
      failurePrompt: `CI checks failed on PR #{{entity.artifacts.prNumber}}. Check the failing runs, fix the issues, and push again. The CI gate for this repo is: ${a.ciGateCommand}`,
      timeoutPrompt: `CI checks are still running after ${Math.round(a.ciGateTimeout / 60000)} minutes. They may be queued or slow. The pipeline will retry.`,
      outcomes: { passed: { proceed: true }, pending: { toState: "review" }, failed: { toState: "fix" } },
    },
    {
      name: "pr-mergeable",
      type: "primitive",
      primitiveOp: "vcs.pr_status",
      primitiveParams: { pullNumber: "{{entity.artifacts.prNumber}}" },
      timeoutMs: 120000,
      failurePrompt:
        "PR #{{entity.artifacts.prNumber}} is not mergeable. Check for conflicts or failing required checks.",
      outcomes: {
        merged: { proceed: true },
        mergeable: { proceed: true },
        blocked: { toState: "fix" },
        closed: { toState: "stuck" },
      },
    },
  ];

  const gateWiring: Record<string, { fromState: string; trigger: string }> = {
    "spec-posted": { fromState: "spec", trigger: "spec_ready" },
    "ci-green": { fromState: "code", trigger: "pr_created" },
    "pr-mergeable": { fromState: "merge", trigger: "merged" },
  };

  const flow = {
    name: "engineering",
    description: `Engineering flow for ${a.repoExample}. ${a.description}.`,
    initialState: "spec",
    maxConcurrent: 4,
    maxConcurrentPerRepo: 2,
    affinityWindowMs: 300000,
    claimRetryAfterMs: 30000,
    gateTimeoutMs: 120000,
    defaultModelTier: "sonnet",
    maxInvocationsPerEntity: 50,
  };

  const designJson = JSON.stringify({ flow, states, gates, transitions, gateWiring });

  return {
    language: a.language,
    description: a.description,
    output: `FLOW_DESIGN:${designJson}\nDESIGN_NOTES:${a.designNotes}`,
  };
}

export const EXAMPLES: FlowDesignExample[] = ADAPTATIONS.map(buildExample);
