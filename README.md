# ExVis（展视） — AI-Assisted Market Intelligence

> **ENT207TC Digital Startup Lab · Team 8 · Academic Year 2026–2027**  
> A research workspace for discovering public market information, retaining traceable evidence, reviewing AI-generated findings, and producing decision-ready research reports.

## 1. Product Overview

ExVis is an AI-assisted market-intelligence web application designed for market research, strategy, product, and business-development teams in manufacturing. **Domel** is the initial business context.

Traditional market research is fragmented across company websites, exhibition pages, reports, and other public sources. ExVis aims to reduce repeated searches while making findings easier to trace, review, and update.

**Core research workflow**

```text
Define research question
    ↓
Create research project and optionally provide source URLs
    ↓
Search for and collect relevant public-source excerpts
    ↓
Extract candidate findings using AI (when configured)
    ↓
Inspect source evidence and review findings
    ↓
Generate a report from approved findings
```

The human reviewer remains responsible for verifying relevance and accuracy. AI-generated findings are not treated as verified facts automatically.

## 2. Intended Users and Use Cases

- **Marketing and strategy teams:** monitor market developments and exhibition opportunities.
- **Product managers:** research competitors and product-related developments.
- **Business-development teams:** identify potential partners or prospects and review supporting evidence.

**Example scenario:** A researcher creates a project about a target exhibition, supplies any relevant public URLs, collects additional public information, reviews candidate findings, and produces a report highlighting possible business opportunities with linked evidence.

## 3. Product Capabilities

The project codebase used to prepare this README contains the following application areas. **Live availability depends on the environment, credentials, backend configuration, and current deployment.**

| Capability | What it does |
| --- | --- |
| Research workspace | Create and browse research projects, questions, and research status. |
| Public-source collection | Combine user-provided URLs with automatically discovered public sources, subject to safety checks and source/time limits. |
| Data-source preferences | Maintain preferred source pages; team defaults may also be configured. |
| Evidence library | Inspect collected source excerpts, source links, retrieval metadata, and export collected-source evidence as JSON. |
| AI candidate findings | Use configured research/extraction services to produce findings for human review. |
| Human review | Accept, reject, or edit findings with an auditable review history. |
| Report generation | Create versioned research outputs from approved findings rather than unreviewed claims. |
| Job visibility | Inspect queued, running, succeeded, or failed research tasks in host-execution mode. |
| Account access | Use Supabase authentication for authenticated research workflows; a demonstration mode may also be available. |

**Important distinctions**

- Collected source excerpts are **not automatically approved evidence or confirmed facts**.
- A completed execution job does **not** guarantee comprehensive source coverage or valid findings.
- Preselected team source URLs can remain empty. User-selected sources should supplement, not replace, automatic discovery.
- The project should be presented in Demo Day only with features that have been tested in the actual delivery environment.

## 4. Architecture

```text
React + TypeScript web application
             │
             ├── Supabase Auth (user identity)
             │
             ▼
       Node.js Host API
             │
             ├── Supabase PostgreSQL (projects, jobs, sources,
             │                        findings, reviews, reports)
             │
             ▼
        Host Worker / Queue
             │
             ▼
      DeepSeek search / fetch / extraction
             │
             ▼
       Collected sources and candidate findings
             │
             ▼
         Human review → Report
```

The host/cloud model separates application execution from persistent storage and authentication:

- **Frontend:** React, TypeScript, Vite.
- **Authentication and database:** Supabase Auth and PostgreSQL.
- **Application service:** Node.js host API and background worker.
- **Research integration:** DeepSeek adapter, subject to valid credentials and service availability.
- **Deployment:** static frontend hosting is possible, but the host API/worker must also be reachable for live research.

For the historical architecture decision and API details, see `docs/ADR-001-host-cloud.md`, `docs/HOST_API.md`, and `HOST_SETUP.md` **where these files exist in the project checkout**.

## 5. Local Setup

These commands describe the previously verified `domel-market-intelligence` codebase. **Before using them in the local `ShowProof` folder, compare its current `package.json` and configuration files.**

### Requirements

- Node.js 24 (the runtime documented by the original host setup).
- npm.
- A configured Supabase project for authenticated/live usage.
- DeepSeek API credentials for provider-backed research.
- Network access to the configured services.

### Install

```bash
npm ci
```

### Configure frontend environment

Create `.env` from `.env.example` if the file exists:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
VITE_BACKEND_URL=http://127.0.0.1:8787
VITE_EXECUTION_MODE=host
```

### Configure host environment

Create `.env.host` from `.env.host.example`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY
DEEPSEEK_API_KEY=YOUR_SERVER_ONLY_KEY
QUEUE_ENV=development
API_BIND=127.0.0.1
API_PORT=8787
APP_ORIGINS=http://127.0.0.1:5174
SOURCE_DEFAULT_URLS=[]
SOURCE_RESTRICT_DOMAINS=
```

**Security:** Do not commit `.env`, `.env.host`, service-role keys, API keys, credentials, private datasets, or test-user passwords. Never expose server-only values through `VITE_` variables.

### Run locally

In separate terminals:

```bash
npm run host:api
npm run host:worker
npm run dev
```

Open the local URL shown by Vite (the earlier configuration uses `http://127.0.0.1:5174`).

On Windows, `npm.cmd` can be used when the PowerShell execution policy blocks `npm.ps1`.

**Database setup:** Existing Supabase projects may require additive SQL migrations. Follow the migration guidance in `HOST_SETUP.md`; do not reapply initial schema migrations to a populated database without verifying their effect.

### Build and test

```bash
npm run build
npm test
```

If available in the checked-out version:

```bash
npm run host:doctor
```

A successful build or unit test run does not by itself establish live provider integration, hosted deployment, accessibility, or user acceptance.

## 6. Demo Day — Evaluator Access and Walkthrough

### Evaluator access

Provide these details to assessors **through the course submission or an approved private channel**:

| Item | Delivery information |
| --- | --- |
| Web application URL | To be supplied by the team after deployment verification |
| Test account / access procedure | To be provided privately; do not publish passwords in Git |
| Research API availability | Requires a reachable host API and worker |
| Code repository | Link to the final application repository or provide the approved archive |
| Support contact | Team 8 / designated demonstrator |

### Suggested live demonstration

1. Open the web application and sign in with the evaluator/demo account.
2. Create a market-research project and enter an exhibition or company research question.
3. Optionally enter a public source URL; explain how search discovers additional sources.
4. Start the research job and show its execution status.
5. Inspect source links, saved excerpts, and any coverage limitations.
6. Review a candidate finding and demonstrate approval/rejection or editing.
7. Generate or open an approved-findings report.
8. Explain how the evidence and report could support a manufacturing-market decision.

**Demonstration safeguard:** Prepare a previously completed, non-sensitive research project as a fallback if an external API is slow or unavailable. Clearly distinguish historical/demo data from a live run.

### Course deliverables

For ENT207TC Demo Day, the team also prepares:

- Live presentation slides (`.pptx` or `.pdf`).
- Working application and assessor access instructions.
- Live scenario walkthrough and Q&A.
- Recording of the live Demo Day event.
- Separately edited, professionally subtitled pitch video (`.mp4`).

The final presentation package is submitted through the course-designated channel; its submission is separate from this README.

## 7. Evidence and Evaluation

Recommended evidence to retain for the final assessment:

- Representative research inputs and generated outputs.
- Source links, retrieval metadata, and coverage notices.
- Human review/audit history and report snapshots.
- Build/test records and configuration readiness checks (with secrets redacted).
- Genuine user-testing feedback, identified issues, and improvements made.
- Promotion materials and dated engagement metrics.
- Git history, Kanban records, and weekly contribution proofs.

For the course assessment, the product is expected to support a test with **at least 10 real users**. Record actual testing outcomes; simulated sessions are not interchangeable with real-user evidence.

## 8. Known Limitations and Responsible Use

The reference implementation documented in October 2026 had the following explicitly recorded limits; **revalidate them against the final local release**:

- Research collection may return partial results because of source limits, timeouts, or upstream provider failures.
- Saved page excerpts are not guaranteed to be complete archival copies of the original webpage.
- Publication dates and the relevance of a source to a target market or quarter may require manual verification.
- The initial host queue schedules whole research runs rather than a full per-URL distributed crawler.
- Periodic source scheduling, a full source registry, advanced crawling, and live event replay were planned integrations, not proven completed capabilities at that point.
- Provider-backed research requires functional service credentials, host connectivity, and adequate upstream availability.
- AI-generated material must be reviewed before it is used for business decisions.

The application is a research-support tool. It does not guarantee comprehensive coverage, source accuracy, or automatically validated market conclusions.

## 9. Project Background

- **Course:** ENT207TC — Digital Startup Lab.
- **Team:** Team 8.
- **Product:** ExVis（展视）, an AI-assisted manufacturing-market intelligence application.
- **Initial use case:** Domel market and exhibition research.
- **Development approach:** iterative product prototyping, feature integration, promotion, testing, and final demonstration.

AI assistance was used in aspects of the development and documentation workflow. The team remains responsible for understanding, verifying, and accurately representing its own work and test evidence.

---

**Final handover note:** Before submission, replace any evaluator-access placeholders above; check every command against this checkout's `package.json`, verify actual production/demo availability, and update the limitations section with the final release's tested status.
