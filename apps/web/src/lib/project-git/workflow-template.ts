import type { CiProvider, CiRunConfig } from "@automation-ai/core";
import { DEFAULT_CI_RUN_CONFIG } from "@automation-ai/core";

/** Returns a starter CI workflow YAML the user can commit to their repo. */
export function generateWorkflowTemplate(
  provider: CiProvider,
  workflowFile: string,
  platformType: "web" | "mobile",
  ciConfig?: CiRunConfig,
): string {
  const cfg = ciConfig ?? DEFAULT_CI_RUN_CONFIG;

  let testCmd: string;
  if (platformType === "web") {
    const flags = [
      `$SPEC_PATHS_ARG`,
      `$GREP_ARG`,
      `--workers=${cfg.workers}`,
      `--retries=${cfg.retries}`,
      ...cfg.browsers.map((b: string) => `--project=${b}`),
    ].join(" ");
    testCmd = `npx playwright test ${flags}`;
  } else {
    testCmd = "npx mobilewright test $SPEC_PATHS_ARG $GREP_ARG";
  }

  switch (provider) {
    case "github":
      return githubTemplate(workflowFile, testCmd, platformType, cfg);
    case "gitlab":
      return gitlabTemplate(testCmd);
    case "bitbucket":
      return bitbucketTemplate(testCmd);
  }
}

function githubTemplate(workflowFile: string, testCmd: string, platformType: "web" | "mobile", cfg: CiRunConfig): string {
  const name = workflowFile.replace(/\.ya?ml$/i, "");
  const browsersArg = cfg.browsers.join(" ");
  const installBrowsersStep = platformType === "web"
    ? `\n      - run: npx playwright install --with-deps ${browsersArg}\n`
    : "";
  return `# .github/workflows/${workflowFile}
# Triggered by AutomationAI via workflow_dispatch.
# Requires: Node.js, npm, and test dependencies installed.
name: ${name}

on:
  workflow_dispatch:
    inputs:
      spec_paths:
        description: "Space-separated spec file paths to run"
        required: false
        default: ""
      environment:
        description: "Environment slug (e.g. staging)"
        required: false
        default: ""
      grep:
        description: "Test title filter (e.g. @smoke)"
        required: false
        default: "${cfg.defaultTag}"
      callback_url:
        description: "AutomationAI webhook URL to post results back"
        required: true
      run_id:
        description: "AutomationAI run ID"
        required: true

permissions:
  contents: read

jobs:
  run-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${cfg.branch}

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: |
          if [ -f package-lock.json ]; then
            npm ci
          else
            npm install
          fi
${installBrowsersStep}
      - name: Run tests
        env:
          AUTOM_ENVIRONMENT: \${{ inputs.environment }}
        run: |
          SPEC_PATHS_ARG=\${{ inputs.spec_paths }}
          GREP_ARG=""
          if [ -n "\${{ inputs.grep }}" ]; then
            GREP_ARG="--grep \${{ inputs.grep }}"
          fi
          ${testCmd}
        continue-on-error: true
        id: run

      - name: Report results to AutomationAI
        if: always()
        run: |
          STATUS="passed"
          if [ "\${{ steps.run.outcome }}" != "success" ]; then
            STATUS="failed"
          fi
          curl -s -X POST "\${{ inputs.callback_url }}" \\
            -H "Content-Type: application/json" \\
            -d "{
              \\"status\\": \\"\${STATUS}\\",
              \\"run_id\\": \\"\${{ inputs.run_id }}\\",
              \\"pipelineUrl\\": \\"\${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}\\"
            }"
`;
}

function gitlabTemplate(testCmd: string): string {
  return `# .gitlab-ci.yml (or a child pipeline included from it)
# Triggered by AutomationAI via the Pipelines API.
# Variables injected: SPEC_PATHS, ENVIRONMENT, GREP, CALLBACK_URL, RUN_ID

run-tests:
  image: node:20
  stage: test
  script:
    - npm ci
    # Web projects only: npx playwright install --with-deps chromium
    - |
      SPEC_PATHS_ARG="\${SPEC_PATHS:-}"
      GREP_ARG=""
      if [ -n "\${GREP:-}" ]; then GREP_ARG="--grep \${GREP}"; fi
      ${testCmd} || true
    - |
      STATUS="passed"
      EXIT=\$?
      [ \$EXIT -ne 0 ] && STATUS="failed"
      curl -s -X POST "\${CALLBACK_URL}" \\
        -H "Content-Type: application/json" \\
        -d "{\\\"status\\\":\\\"\${STATUS}\\\",\\\"run_id\\\":\\\"\${RUN_ID}\\\",\\\"pipelineUrl\\\":\\\"\${CI_PIPELINE_URL}\\\"}"
  variables:
    SPEC_PATHS: ""
    ENVIRONMENT: ""
    GREP: ""
    CALLBACK_URL: ""
    RUN_ID: ""
`;
}

function bitbucketTemplate(testCmd: string): string {
  return `# bitbucket-pipelines.yml
# AutomationAI triggers this via the Pipelines API.
# Variables injected: SPEC_PATHS, ENVIRONMENT, GREP, CALLBACK_URL, RUN_ID

pipelines:
  custom:
    run-tests:
      - variables:
          - name: SPEC_PATHS
          - name: ENVIRONMENT
          - name: GREP
          - name: CALLBACK_URL
          - name: RUN_ID
      - step:
          name: Run tests
          image: node:20
          script:
            - npm ci
            # Web projects only: npx playwright install --with-deps chromium
            - |
              SPEC_PATHS_ARG="\${SPEC_PATHS:-}"
              GREP_ARG=""
              [ -n "\${GREP:-}" ] && GREP_ARG="--grep \${GREP}"
              ${testCmd} || true
              STATUS="passed"
              [ \$? -ne 0 ] && STATUS="failed"
              curl -s -X POST "\${CALLBACK_URL}" \\
                -H "Content-Type: application/json" \\
                -d "{\\\"status\\\":\\\"\${STATUS}\\\",\\\"run_id\\\":\\\"\${RUN_ID}\\\"}"
`;
}
