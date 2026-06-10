import type { CiProvider, CiRunConfig } from "@jagadeeshqtsolv/core";
import { DEFAULT_CI_RUN_CONFIG } from "@jagadeeshqtsolv/core";

/** Returns a starter CI workflow YAML the user can commit to their repo. */
export function generateWorkflowTemplate(
  provider: CiProvider,
  workflowFile: string,
  platformType: "web" | "mobile",
  ciConfig?: CiRunConfig,
): string {
  const cfg = ciConfig ?? DEFAULT_CI_RUN_CONFIG;

  // workers, retries, and browser/project come from environments/<env>.json via playwright.config.ts.
  // GREP_PATTERN must be quoted so test titles with spaces work. SPEC_PATHS_ARG is unquoted
  // intentionally so space-separated paths undergo word-splitting into separate CLI args.
  const baseCmd = platformType === "web" ? "npx playwright test" : "npx mobilewright test";
  const testCmd = `if [ -n "$GREP_PATTERN" ]; then
  ${baseCmd} $SPEC_PATHS_ARG --grep "$GREP_PATTERN"
else
  ${baseCmd} $SPEC_PATHS_ARG
fi`;

  switch (provider) {
    case "github":
      return githubTemplate(workflowFile, testCmd, platformType, cfg);
    case "gitlab":
      return gitlabTemplate(testCmd, platformType);
    case "bitbucket":
      return bitbucketTemplate(testCmd, platformType);
  }
}

function indentLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function githubTemplate(workflowFile: string, testCmd: string, platformType: "web" | "mobile", cfg: CiRunConfig): string {
  const name = workflowFile.replace(/\.ya?ml$/i, "");
  const browsersArg = cfg.browsers.join(" ");
  const installBrowsersStep = platformType === "web"
    ? `\n      - run: npx playwright install --with-deps ${browsersArg}\n`
    : "";
  // Email sending is handled server-side via the callback — no extra step needed in the YML.
  return `# .github/workflows/${workflowFile}
# Triggered by AutomationAI via workflow_dispatch.
# Requires: Node.js, npm, and test dependencies installed.
name: ${name}

on:
  workflow_dispatch:
    inputs:
      branch:
        description: "Feature branch to check out and run tests on"
        required: false
        default: ""
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
        default: ""
      callback_url:
        description: "AutomationAI webhook URL to post results back"
        required: true
      run_id:
        description: "AutomationAI run ID"
        required: true
      auth_state:
        description: "Base64-encoded Playwright storageState JSON (auth file)"
        required: false
        default: ""
      auth_state_filename:
        description: "Filename to write inside .auth/ (e.g. auth.json)"
        required: false
        default: ""

permissions:
  contents: read

jobs:
  run-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ inputs.branch || github.ref }}

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm install

      - name: Write auth state
        if: \${{ inputs.auth_state != '' && inputs.auth_state_filename != '' }}
        run: |
          mkdir -p .auth
          echo "\${{ inputs.auth_state }}" | base64 -d > ".auth/\${{ inputs.auth_state_filename }}"
${installBrowsersStep}
      - name: Run tests
        env:
          AUTOM_ENVIRONMENT: \${{ inputs.environment }}
          TEST_ENV: \${{ inputs.environment }}
        run: |
          SPEC_PATHS_ARG="\${{ inputs.spec_paths }}"
          GREP_PATTERN="\${{ inputs.grep }}"
${indentLines(testCmd, "          ")}
        continue-on-error: true
        id: run

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-\${{ inputs.run_id }}
          path: |
            playwright-report/
            logs/playwright-report.json
          retention-days: 7
          if-no-files-found: warn

      - name: Report results to AutomationAI
        if: always()
        run: |
          STATUS="passed"
          if [ "\${{ steps.run.outcome }}" != "success" ]; then
            STATUS="failed"
          fi
          PAYLOAD="{\\"status\\":\\"$\{STATUS}\\",\\"run_id\\":\\"\${{ inputs.run_id }}\\",\\"pipelineUrl\\":\\"\${{ github.server_url }}/\${{ github.repository }}/actions/runs/\${{ github.run_id }}\\"}"
          for attempt in 1 2 3 4 5; do
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "\${{ inputs.callback_url }}" \\
              -H "Content-Type: application/json" \\
              -d "$PAYLOAD")
            echo "Attempt $attempt — HTTP $HTTP_CODE"
            if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
              echo "Callback delivered."
              break
            fi
            [ $attempt -lt 5 ] && sleep $((attempt * 10))
          done
          true
`;
}

function gitlabTemplate(testCmd: string, platformType: "web" | "mobile"): string {
  const installBrowsers = platformType === "web"
    ? `\n    - npx playwright install --with-deps chromium\n` : "";
  return `# .gitlab-ci.yml (or a child pipeline included from it)
# Triggered by AutomationAI via the Pipelines API.
# Variables injected: SPEC_PATHS, ENVIRONMENT, GREP, CALLBACK_URL, RUN_ID

run-tests:
  image: node:22
  stage: test
  script:
    - if [ -f package-lock.json ]; then npm ci; else npm install; fi
${installBrowsers}    - |
      SPEC_PATHS_ARG="\${SPEC_PATHS:-}"
      GREP_PATTERN="\${GREP:-}"
${indentLines(testCmd, "      ")}
      TEST_EXIT=\$?
      STATUS="passed"
      [ \$TEST_EXIT -ne 0 ] && STATUS="failed"
      curl -s -X POST "\${CALLBACK_URL}" \\
        -H "Content-Type: application/json" \\
        -d "{\\\"status\\\":\\\"\${STATUS}\\\",\\\"run_id\\\":\\\"\${RUN_ID}\\\",\\\"pipelineUrl\\\":\\\"\${CI_PIPELINE_URL}\\\"}"
      exit \$TEST_EXIT
  variables:
    SPEC_PATHS: ""
    ENVIRONMENT: ""
    GREP: ""
    CALLBACK_URL: ""
    RUN_ID: ""
`;
}

function bitbucketTemplate(testCmd: string, platformType: "web" | "mobile"): string {
  const installBrowsers = platformType === "web"
    ? `            - npx playwright install --with-deps chromium\n` : "";
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
          image: node:22
          script:
            - if [ -f package-lock.json ]; then npm ci; else npm install; fi
${installBrowsers}            - |
              SPEC_PATHS_ARG="\${SPEC_PATHS:-}"
              GREP_PATTERN="\${GREP:-}"
${indentLines(testCmd, "              ")}
              TEST_EXIT=\$?
              STATUS="passed"
              [ \$TEST_EXIT -ne 0 ] && STATUS="failed"
              curl -s -X POST "\${CALLBACK_URL}" \\
                -H "Content-Type: application/json" \\
                -d "{\\\"status\\\":\\\"\${STATUS}\\\",\\\"run_id\\\":\\\"\${RUN_ID}\\\"}"
              exit \$TEST_EXIT
`;
}
