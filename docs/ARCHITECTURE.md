# AutomationAI — Architecture & Flow Diagrams

All diagrams use [Mermaid](https://mermaid.js.org/) and render natively on GitHub.

---

## Table of contents

1. [System Architecture](#1-system-architecture)
2. [Data Model](#2-data-model)
3. [User Journey](#3-user-journey)
4. [AI Test Generation Flow](#4-ai-test-generation-flow)
5. [Browser Recorder Flow](#5-browser-recorder-flow)
6. [Test Execution Flow](#6-test-execution-flow)
7. [Git & CI Integration Flow](#7-git--ci-integration-flow)
8. [Excel Export Flow](#8-excel-export-flow)
9. [Package Dependency Map](#9-package-dependency-map)

---

## 1. System Architecture

High-level view of every component and how they relate.

```mermaid
graph TB
    subgraph Client["Browser (User)"]
        UI["Next.js Frontend\n(React 19 / Tailwind CSS)"]
    end

    subgraph Platform["AutomationAI Platform  —  Next.js 15 on Node.js"]
        direction TB
        API["API Routes\n/api/**"]
        Auth["Auth & RBAC\nSession-based · invite-only · org roles"]
        AIEngine["AI Generation Engine\nVercel AI SDK"]
        Recorder["Browser Recorder\ncapture-dom.mjs"]
        Executor["Test Executor\nPlaywright · Mobilewright"]
        GitSvc["Git Integration\ngit-config / repo-ops"]
        JiraSvc["Jira Integration\nfetch stories · JQL"]
        Scaffold["Framework Scaffold\nper-project on-disk workspace"]
        AuthFiles["Auth File Manager\nstorageState · .auth/"]
        ExcelExport["Excel Export\nxlsx · test cases → .xlsx"]
    end

    subgraph Storage["Storage"]
        DB[("SQLite / PostgreSQL\nvia Prisma ORM")]
        FS["Local Filesystem\nframeworks/web/&lt;projectId&gt;/"]
    end

    subgraph AIProviders["AI Providers"]
        OpenAI["OpenAI\nGPT-4.1 / GPT-4o"]
        Claude["Anthropic\nClaude Sonnet / Opus"]
    end

    subgraph Framework["Per-Project Playwright Workspace"]
        PW["playwright.config.ts"]
        PO["pageobjects/"]
        Tests["tests/"]
        Envs["environments/qa.json"]
        AuthDir[".auth/auth.json\n(storageState)"]
        Fixtures["support/fixtures.ts\n(auto-generated)"]
        TestData["testdata/test-data.json"]
    end

    subgraph Packages["npm  —  @jagadeeshqtsolv"]
        Core["@jagadeeshqtsolv/core\nZod schemas · types · constants"]
        WebSupport["@jagadeeshqtsolv/web-support\nfixtures · locators · actions"]
    end

    subgraph External["External Services"]
        GitHub["GitHub Actions\nCI pipeline"]
        BS["BrowserStack\ncloud execution"]
        LT["LambdaTest\ncloud execution"]
        SL["SauceLabs\ncloud execution"]
        JiraAPI["Jira Cloud API"]
    end

    UI -->|HTTPS| API
    API --> Auth & AIEngine & Recorder & Executor & GitSvc & JiraSvc & Scaffold & AuthFiles & ExcelExport
    Auth --> DB
    AIEngine -->|generateText| OpenAI & Claude
    AIEngine --> DB
    Scaffold --> FS
    Executor --> FS
    Recorder --> FS
    AuthFiles --> DB & FS
    FS --> Framework
    Framework --> WebSupport
    GitSvc --> GitHub
    Executor -->|remote run| BS & LT & SL
    JiraSvc --> JiraAPI
    Platform --> Core
```

---

## 2. Data Model

Entity-relationship diagram derived from `apps/web/prisma/schema.prisma`.

```mermaid
erDiagram
    User {
        uuid id PK
        string email
        string passwordHash
        string name
        bool isPlatformAdmin
        datetime createdAt
        datetime updatedAt
    }
    Organization {
        uuid id PK
        string name
        string slug
        bool disabled
        datetime createdAt
    }
    OrganizationMember {
        uuid id PK
        uuid organizationId FK
        uuid userId FK
        string role
    }
    OrganizationInvite {
        uuid id PK
        string token
        uuid organizationId FK
        string email
        string role
        uuid invitedById FK
        datetime expiresAt
        datetime usedAt
    }
    Project {
        uuid id PK
        uuid organizationId FK
        string name
        string platformType
        string aiProvider
        string openaiApiKeyEnc
        string claudeApiKeyEnc
        string executionConfigJson
        string gitRemoteUrl
        string gitBaseBranch
        string gitCiTokenEnc
        string gitWorkflowFile
        string jiraBaseUrl
        string jiraEmail
        string jiraApiTokenEnc
    }
    ProjectMember {
        uuid id PK
        uuid projectId FK
        uuid userId FK
        string role
    }
    ProjectUserGitConfig {
        uuid id PK
        uuid projectId FK
        uuid userId FK
        string gitBranch
        string gitAuthorName
        string gitAuthorEmail
        string gitTokenEnc
    }
    Environment {
        uuid id PK
        uuid projectId FK
        string name
        string slug
        string description
        string configJson
    }
    Requirement {
        uuid id PK
        uuid projectId FK
        string title
        string content
        datetime createdAt
    }
    TestPlan {
        uuid id PK
        uuid requirementId FK
        string json
        string model
        datetime createdAt
    }
    GeneratedCode {
        uuid id PK
        uuid testPlanId FK
        uuid environmentId FK
        string typescript
        string model
        datetime createdAt
    }
    PageObject {
        uuid id PK
        uuid projectId FK
        string className
        string modulePath
        string content
        string methodSummary
        string elementsJson
        string screenName
        datetime createdAt
        datetime updatedAt
    }
    TestRun {
        uuid id PK
        uuid projectId FK
        string provider
        string status
        string specPaths
        string command
        string output
        json resultsAnalysis
        string htmlReportRel
        string callbackToken
        string pipelineUrl
        string label
        datetime createdAt
        datetime finishedAt
    }
    ProjectAuthFile {
        uuid id PK
        uuid projectId FK
        string filename
        string content
        int sizeBytes
        datetime createdAt
        datetime updatedAt
    }

    User ||--o{ OrganizationMember : "belongs to"
    Organization ||--o{ OrganizationMember : "has"
    Organization ||--o{ OrganizationInvite : "sends"
    Organization ||--o{ Project : "owns"
    Project ||--o{ ProjectMember : "has"
    User ||--o{ ProjectMember : "member of"
    Project ||--o{ ProjectUserGitConfig : "has"
    User ||--o{ ProjectUserGitConfig : "configures"
    Project ||--o{ Environment : "has"
    Project ||--o{ Requirement : "has"
    Project ||--o{ PageObject : "has"
    Project ||--o{ TestRun : "has"
    Project ||--o{ ProjectAuthFile : "has"
    Requirement ||--o{ TestPlan : "generates"
    TestPlan ||--o{ GeneratedCode : "produces"
    Environment ||--o{ GeneratedCode : "scopes"
```

---

## 3. User Journey

End-to-end flow from account creation to a passing test run.

```mermaid
flowchart TD
    A([Platform Admin]) -->|1 Create organisation| B[Organisation created]
    B -->|2 Send email invite| C[Invite token emailed]
    C -->|3 User registers with token| D[Account created & joined org]

    D -->|4 Create project\nweb or mobile| E[Project record saved]
    E -->|5 Auto scaffold| F["Playwright workspace created on disk\npageobjects/ tests/ environments/\nsupport/fixtures.ts  testdata/"]
    F -->|6 npm install + playwright install chromium| G[Framework ready]

    G -->|7 Configure AI provider\nOpenAI or Claude key| H[AI key stored encrypted]
    H -->|8 Import storageState JSON| HA["Auth file stored in DB + .auth/\nused automatically in all test specs"]

    HA --> I{Import requirements}
    I -->|Manual| J[Paste requirement text]
    I -->|Jira import| K[Fetch via JQL → Jira API]
    J & K --> L[Requirement saved to DB]

    L -->|9 Generate test plan| M["AI analyses requirement\n→ structured test plan JSON\ntest cases + steps + assertions + tags"]

    M -->|10 Review & edit test cases\nin built-in editor| ME[Test cases refined]
    ME -->|10a Export for manual testers| MX["Excel download\n.xlsx — Requirement · Suite · TC ID\nSteps · Expected Results · Preconditions"]

    ME -->|11 Generate test code| N["AI generates TypeScript\nPlaywright / Mobilewright spec\nsupport/fixtures.ts auto-wired"]

    N --> O{Page objects needed?}
    O -->|Yes — record browser| P[Browser Recorder\ncaptures live DOM snapshot]
    P -->|AI generates class| Q[PageObject saved to DB + disk]
    O -->|Already have POs| Q

    Q -->|12 Run tests| R[Test Executor spawns Playwright]
    R -->|13 Results| S[Pass / Fail / Flaky report\nHTML report generated]
    S -->|14 Optional: push to Git + trigger CI| T[GitHub Actions pipeline]
    T -->|CI callback| S
```

---

## 4. AI Test Generation Flow

Detail of how a requirement becomes executable test code.

```mermaid
sequenceDiagram
    actor User
    participant UI as Frontend
    participant API as API Route
    participant DB as Database (SQLite/PG)
    participant AI as AI Engine
    participant LLM as LLM Provider<br/>(OpenAI / Claude)
    participant FS as Disk / Framework

    User->>UI: Paste requirement text
    UI->>API: POST /api/requirements
    API->>DB: Save Requirement

    User->>UI: Click "Generate test plan"
    UI->>API: POST /api/generate/plan
    API->>DB: Fetch requirement + page object method summaries
    API->>AI: resolveAIModel(projectId)
    AI->>DB: Read aiProvider + decrypt key
    AI-->>API: LanguageModel instance
    API->>LLM: generateText(system prompt + requirement + page object context)
    LLM-->>API: Structured test plan JSON\n(suiteName · cases · steps · assertions · tags · priority)
    API->>API: normalizeLlmTestPlan() — coerce & validate
    API->>DB: Save TestPlan
    API-->>UI: Test plan with cases & steps

    User->>UI: Review plan, click "Generate code"
    UI->>API: POST /api/generate/playwright
    API->>DB: Fetch test plan + page object library + auth files
    API->>AI: resolveAIModel(projectId)
    AI-->>API: LanguageModel instance
    API->>LLM: generateText(system prompt + plan + page objects + auth context)
    LLM-->>API: TypeScript Playwright spec
    API->>API: sanitizeGeneratedTestFile() — fix tags / imports
    API->>DB: Save GeneratedCode
    API->>FS: Write .spec.ts to tests/
    API->>FS: Regenerate support/fixtures.ts
    API-->>UI: Generated code preview
```

---

## 5. Browser Recorder Flow

How a live page becomes a typed Page Object class.

```mermaid
sequenceDiagram
    actor User
    participant UI as Frontend
    participant API as Recorder API
    participant Script as capture-dom.mjs<br/>(@jagadeeshqtsolv/web-support)
    participant PW as Playwright Browser
    participant LLM as LLM Provider
    participant DB as Database
    participant FS as Disk / pageobjects/

    User->>UI: Click "Open browser & capture"
    UI->>API: POST /api/recorder/start
    API->>Script: spawn capture-dom.mjs start
    Script->>PW: Launch Chromium + Inspector
    PW-->>User: Browser window opens

    User->>PW: Navigate to target page
    User->>UI: Click "Capture DOM"
    UI->>API: POST /api/recorder/capture-dom
    API->>Script: Signal capture via .signal file
    Script->>PW: page.content() snapshot
    PW-->>Script: Full DOM HTML
    Script->>FS: Write latest-dom-snapshot.json

    User->>UI: Name the page (e.g. "LoginPage")
    UI->>API: POST /api/recorder/save-screen
    API->>FS: Read latest-dom-snapshot.json
    API->>API: Parse DOM → interactive elements
    API->>LLM: generateText(DOM elements → Page Object class)
    LLM-->>API: TypeScript Page Object class
    API->>API: sanitize + normalizePageClassName()
    API->>DB: Upsert PageObject record\n(className · modulePath · content · methodSummary · elementsJson)
    API->>FS: Write pageobjects/LoginPage.ts
    API->>FS: Regenerate support/fixtures.ts
    API-->>UI: Page Object preview

    User->>UI: Click "Stop recorder"
    UI->>API: POST /api/recorder/stop
    API->>Script: Write .stop signal file
    Script->>PW: browser.close()
```

---

## 6. Test Execution Flow

How a test run is started, executed, and reported.

```mermaid
flowchart TD
    A([User clicks Run Tests]) --> B[POST /api/projects/:id/test-runs]
    B --> C[Create TestRun record\nstatus: running]
    C --> D[Write test specs to disk\ntests/*.spec.ts]
    D --> E[Write environments/qa.json\nwith selected environment config]
    E --> EA[Write .auth/auth.json\nif storageState imported]

    EA --> F{Execution target}

    F -->|Local| G[spawn npx playwright test\ncwd: frameworks/web/projectId]
    F -->|BrowserStack| H[spawn browserstack-node-sdk playwright test\nreads browserstack.yml]
    F -->|LambdaTest| LT[spawn playwright test\nwith LambdaTest tunnel config]
    F -->|SauceLabs| SL[spawn playwright test\nwith SauceLabs credentials]
    F -->|CI Pipeline| I[POST to GitHub Actions\ndispatch workflow_dispatch]

    G & H & LT & SL --> J[Stream stdout/stderr\nstored in TestRun.output]
    I --> K[CI runs tests remotely\nCallback: POST /pipeline-callback]

    J --> L[Process exits]
    K --> L

    L --> M[Parse Playwright JSON reporter\nextract pass/fail/flaky/skipped counts]
    M --> N[Save resultsAnalysis to DB]
    N --> O[Generate HTML report\nlogs/reports/runId/]
    O --> P[Update TestRun status:\npassed / failed / error]
    P --> Q([Results shown in Test Reports panel])
```

---

## 7. Git & CI Integration Flow

How test code is versioned and pushed to a shared repository.

```mermaid
sequenceDiagram
    actor User
    participant UI as Frontend
    participant API as Git Config API
    participant FS as Local Framework Disk
    participant Git as Git (spawn)
    participant GitHub as GitHub Remote
    participant CI as GitHub Actions

    User->>UI: Configure project git settings\n(repo URL, base branch, CI token, workflow file)
    UI->>API: PATCH /api/projects/:id/git-config
    API->>API: Encrypt CI token (AES-256-GCM)
    API-->>UI: Saved

    User->>UI: Set personal branch & author identity\n(per-user git config)
    UI->>API: PATCH /api/projects/:id/git-config/user
    API->>API: Encrypt personal token (AES-256-GCM)
    API-->>UI: Saved

    Note over User,GitHub: Daily workflow

    User->>UI: Generate / edit tests or page objects
    UI->>API: GET /api/projects/:id/framework/push-status
    API->>FS: Diff changed .spec.ts / PageObject / fixture files\n(tracked via owned-files.json per user)
    API-->>UI: File list with diff view

    User->>UI: Click "Push to branch"
    UI->>API: POST /api/projects/:id/git-config/push
    API->>Git: git init / git remote set-url
    API->>Git: git checkout -b user-branch
    API->>Git: git add <changed files>
    API->>Git: git commit --author + git push (personal token)
    Git->>GitHub: Push to user branch

    User->>UI: Click "Raise PR to base branch"
    UI->>API: POST /api/projects/:id/git-config/push-to-base
    API->>GitHub: Create pull request via GitHub API

    GitHub->>CI: PR triggers workflow_dispatch
    CI->>CI: Run Playwright tests
    CI->>API: POST /api/projects/:id/pipeline-callback\n(callbackToken + results)
    API->>API: Verify callbackToken, update TestRun
    API-->>UI: Pass / Fail badge updated
```

---

## 8. Excel Export Flow

How test plans are exported for manual testers.

```mermaid
sequenceDiagram
    actor User
    participant UI as Test Plans Section
    participant API as Export API Route
    participant DB as Database
    participant XLSX as xlsx package

    User->>UI: Click "Export Excel"
    UI->>API: GET /api/projects/:id/test-plans/export
    API->>DB: Fetch all Requirements + TestPlans (ordered by createdAt)
    DB-->>API: requirements[]\n  └ testPlans[]\n      └ json (test plan)

    API->>API: Parse each TestPlan JSON via testPlanSchema
    API->>API: For each test case:\n  • TC ID — RequirementName_001 (sequential)\n  • Tags — strip @ prefix for readability\n  • Preconditions — default if empty:\n    "Login required; User should have access"\n  • Steps → stepDescription() human-readable text\n  • Assertions → expectedResult() text

    API->>XLSX: Build worksheet (aoa_to_sheet)\nColumns: Requirement · Suite · TC ID · Title\nPriority · Tags · Platforms · Preconditions\nStep# · Step Description · Expected Result

    XLSX-->>API: Buffer
    API->>API: Build filename:\n  <RequirementTitle>_<epoch>.xlsx
    API-->>UI: application/vnd.openxmlformats-officedocument\nContent-Disposition: attachment
    UI-->>User: File download triggered
```

---

## 9. Package Dependency Map

```mermaid
graph LR
    Platform["automation-ai-platform\n(apps/web — Next.js 15)"]
    Core["@jagadeeshqtsolv/core\nZod schemas · types · constants\nPAGE_OBJECT_CONTENT_MAX etc."]
    WebSupport["@jagadeeshqtsolv/web-support\nfixtures · locators · actions\ncapture-dom.mjs"]
    PW["@playwright/test"]
    VSDK["Vercel AI SDK\n(ai · @ai-sdk/openai · @ai-sdk/anthropic)"]
    XLSX["xlsx\nExcel export"]
    Framework["Per-project Playwright workspace\n(frameworks/web/projectId)"]

    Platform -->|schemas & types| Core
    Platform -->|AI generation| VSDK
    Platform -->|Excel export| XLSX
    Framework -->|helpers & fixtures| WebSupport
    WebSupport -->|peer dep| PW
    VSDK -->|OpenAI API| OpenAI["OpenAI\nGPT-4.1 / GPT-4o"]
    VSDK -->|Anthropic API| Claude["Anthropic\nClaude Sonnet / Opus"]
```

---

## Technology Stack Summary

| Layer | Technology |
|---|---|
| **Web App** | Next.js 15 (App Router), React 19, Tailwind CSS |
| **Database** | SQLite (dev) / PostgreSQL (prod) via Prisma ORM |
| **AI Engine** | Vercel AI SDK — OpenAI GPT-4.1 / GPT-4o or Anthropic Claude |
| **Web Testing** | Playwright (TypeScript) |
| **Mobile Testing** | Mobilewright |
| **Cloud Execution** | BrowserStack · LambdaTest · SauceLabs |
| **Auth** | Session-based + Playwright storageState (`.auth/auth.json`) |
| **CI/CD** | GitHub Actions (workflow_dispatch + callback token) |
| **Excel Export** | xlsx npm package |
| **Encryption** | AES-256-GCM (API keys, git tokens) |
| **Containerisation** | Docker + Docker Compose |
