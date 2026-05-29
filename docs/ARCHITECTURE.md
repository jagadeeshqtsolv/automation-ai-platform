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

---

## 1. System Architecture

High-level view of every component and how they relate.

```mermaid
graph TB
    subgraph Client["Browser (User)"]
        UI["Next.js Frontend\n(React / Tailwind)"]
    end

    subgraph Platform["AutomationAI Platform  —  Next.js on Node.js"]
        direction TB
        API["API Routes\n/api/**"]
        Auth["Auth & RBAC\nJWT · invite-only · org roles"]
        AIEngine["AI Generation Engine\nVercel AI SDK"]
        Recorder["Browser Recorder\ncapture-dom.mjs"]
        Executor["Test Executor\nPlaywright · Mobilewright"]
        GitSvc["Git Integration\ngit-config / repo-ops"]
        JiraSvc["Jira Integration\nfetch stories · JQL"]
        Scaffold["Framework Scaffold\nper-project on-disk workspace"]
    end

    subgraph Storage["Storage"]
        DB[("SQLite\nvia Prisma")]
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
    end

    subgraph Packages["npm registry  —  registry.npmjs.org"]
        Core["@jagadeeshqtsolv/core\nZod schemas · types"]
        WebSupport["@jagadeeshqtsolv/web-support\nfixtures · locators · actions"]
    end

    subgraph External["External Services"]
        GitHub["GitHub Actions\nCI pipeline"]
        BS["BrowserStack\ncloud execution"]
        JiraAPI["Jira Cloud API"]
    end

    UI -->|HTTPS| API
    API --> Auth & AIEngine & Recorder & Executor & GitSvc & JiraSvc & Scaffold
    Auth --> DB
    AIEngine -->|generateText| OpenAI & Claude
    AIEngine --> DB
    Scaffold --> FS
    Executor --> FS
    Recorder --> FS
    FS --> Framework
    Framework --> WebSupport
    GitSvc --> GitHub
    Executor -->|remote run| BS
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
    }
    Organization {
        uuid id PK
        string name
        string slug
        bool disabled
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
        string gitRemoteUrl
        string jiraBaseUrl
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
        string gitTokenEnc
    }
    Environment {
        uuid id PK
        uuid projectId FK
        string name
        string slug
        string configJson
    }
    Requirement {
        uuid id PK
        uuid projectId FK
        string title
        string content
    }
    TestPlan {
        uuid id PK
        uuid requirementId FK
        string json
        string model
    }
    GeneratedCode {
        uuid id PK
        uuid testPlanId FK
        uuid environmentId FK
        string typescript
        string model
    }
    PageObject {
        uuid id PK
        uuid projectId FK
        string className
        string modulePath
        string content
        string methodSummary
    }
    TestRun {
        uuid id PK
        uuid projectId FK
        string status
        string provider
        json resultsAnalysis
        string pipelineUrl
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
    E -->|5 Auto scaffold| F["Playwright workspace created on disk\npageobjects/ tests/ environments/ …"]
    F -->|6 npm install + playwright install chromium| G[Framework ready]

    G -->|7 Configure AI provider\nOpenAI or Claude key| H[AI key stored encrypted]

    H --> I{Import requirements}
    I -->|Manual| J[Paste requirement text]
    I -->|Jira import| K[Fetch via JQL → Jira API]
    J & K --> L[Requirement saved to DB]

    L -->|8 Generate test plan| M["AI analyses requirement\n→ structured test plan JSON\ntest cases + steps + assertions"]

    M -->|9 Generate test code| N["AI generates TypeScript\nPlaywright / Mobilewright spec"]

    N --> O{Page objects needed?}
    O -->|Yes — record browser| P[Browser Recorder\ncaptures live DOM snapshot]
    P -->|AI generates class| Q[PageObject saved to DB + disk]
    O -->|Already have POs| Q

    Q -->|10 Run tests| R[Test Executor spawns Playwright]
    R -->|11 Results| S[Pass / Fail / Flaky report\nHTML report generated]
    S -->|12 Optional: push to Git + trigger CI| T[GitHub Actions pipeline]
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
    participant DB as SQLite DB
    participant AI as AI Engine
    participant LLM as LLM Provider<br/>(OpenAI / Claude)
    participant FS as Disk / Framework

    User->>UI: Paste requirement text
    UI->>API: POST /api/requirements
    API->>DB: Save Requirement

    User->>UI: Click "Generate test plan"
    UI->>API: POST /api/generate/plan
    API->>DB: Fetch requirement + page objects
    API->>AI: resolveAIModel(projectId)
    AI->>DB: Read aiProvider + decrypt key
    AI-->>API: LanguageModel instance
    API->>LLM: generateText(system prompt + requirement)
    LLM-->>API: Structured test plan JSON
    API->>DB: Save TestPlan
    API-->>UI: Test plan with cases & steps

    User->>UI: Review plan, click "Generate code"
    UI->>API: POST /api/generate/playwright
    API->>DB: Fetch test plan + page object library
    API->>AI: resolveAIModel(projectId)
    AI-->>API: LanguageModel instance
    API->>LLM: generateText(system prompt + plan + page objects)
    LLM-->>API: TypeScript Playwright spec
    API->>DB: Save GeneratedCode
    API->>FS: Write .spec.ts to tests/
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
    participant Script as capture-dom.mjs<br/>(node_modules/@automation-ai/web-support)
    participant PW as Playwright Browser
    participant LLM as LLM Provider
    participant DB as SQLite DB
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

    User->>UI: Name the page (e.g. "Login")
    UI->>API: POST /api/recorder/save-screen
    API->>FS: Read latest-dom-snapshot.json
    API->>API: Parse DOM → interactive elements
    API->>LLM: generateText(DOM elements → Page Object)
    LLM-->>API: TypeScript Page Object class
    API->>API: Sanitize + validate class
    API->>DB: Upsert PageObject record
    API->>FS: Write pageobjects/LoginPage.ts
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

    E --> F{Execution target}

    F -->|Local| G[spawn npx playwright test\ncwd: frameworks/web/projectId]
    F -->|BrowserStack| H[spawn playwright test\nwith BrowserStack config]
    F -->|CI Pipeline| I[POST to GitHub Actions\ndispatch workflow_dispatch]

    G & H --> J[Stream stdout/stderr\nstored in TestRun.output]
    I --> K[CI runs tests remotely\nCallback: POST /pipeline-callback]

    J --> L[Process exits]
    K --> L

    L --> M[Parse Playwright JSON reporter\nextract pass/fail/flaky/skipped counts]
    M --> N[Save resultsAnalysis to DB]
    N --> O[Generate HTML report\nlogs/reports/runId/]
    O --> P[Update TestRun status:\npassed / failed / error]

    P --> Q{Any failures?}
    Q -->|Yes| R[POST /api/test-runs/:id/heal\nAI re-writes broken locators]
    R --> G
    Q -->|No| S([Run complete — results shown in UI])
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
    participant Git as Git (libgit / spawn)
    participant GitHub as GitHub Remote
    participant CI as GitHub Actions

    User->>UI: Configure project git settings\n(repo URL, base branch, CI token)
    UI->>API: PATCH /api/projects/:id/git-config
    API->>API: Encrypt CI token (AES-256-GCM)
    API-->>UI: Saved

    User->>UI: Set personal branch & author\n(per-user git config)
    UI->>API: PATCH /api/projects/:id/git-config/user
    API->>API: Encrypt personal token
    API-->>UI: Saved

    Note over User,GitHub: Daily workflow

    User->>UI: Generate / edit tests
    UI->>API: GET /api/projects/:id/git-config/files
    API->>FS: Read changed .spec.ts / PageObject files
    API-->>UI: File diff view

    User->>UI: Click "Push to branch"
    UI->>API: POST /api/projects/:id/git-config/push
    API->>Git: git init / git remote set-url
    API->>Git: git checkout -b user-branch
    API->>FS: Stage changed files
    API->>Git: git commit + git push (personal token)
    Git->>GitHub: Push to user branch

    User->>UI: Click "Raise PR to base branch"
    UI->>API: POST /api/projects/:id/git-config/push-to-base
    API->>GitHub: Create pull request via API

    GitHub->>CI: PR triggers workflow_dispatch
    CI->>CI: Run Playwright tests
    CI->>API: POST /api/projects/:id/pipeline-callback\n(callbackToken + results)
    API->>API: Update TestRun with CI results
    API-->>UI: Pass / Fail badge updated
```

---

## Package dependency map

```mermaid
graph LR
    Platform["automation-ai-platform\n(apps/web)"]
    Core["@jagadeeshqtsolv/core\n(automation-ai-core/src)"]
    WebSupport["@jagadeeshqtsolv/web-support\n(automation-ai-core/web)"]
    PW["@playwright/test"]
    VSDK["Vercel AI SDK\n(ai, @ai-sdk/openai, @ai-sdk/anthropic)"]
    Framework["Per-project Playwright workspace\n(frameworks/web/projectId)"]

    Platform -->|schemas & types| Core
    Platform -->|Vercel AI SDK| VSDK
    Framework -->|helpers| WebSupport
    WebSupport -->|peer dep| PW
    VSDK -->|OpenAI API| OpenAI["OpenAI"]
    VSDK -->|Anthropic API| Claude["Anthropic Claude"]
```
