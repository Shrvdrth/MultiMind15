# MultiMind

**MultiMind** is a full-stack multi-agent AI decision analysis platform. Users submit any business or technical question and three specialized AI agents — **Strategist**, **Risk Analyst**, and **Engineer** — independently evaluate it in a structured two-round debate. A **Moderator** then synthesizes all perspectives into a final recommendation with a confidence score. The entire debate streams live to the browser in real-time via Server-Sent Events (SSE).

> Developed as a capstone project demonstrating full-stack engineering, AI integration, containerization, and Kubernetes orchestration.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [System Architecture](#system-architecture)
4. [Core Features](#core-features)
5. [Data Models](#data-models)
6. [Debate Flow](#debate-flow)
7. [API Reference](#api-reference)
8. [Frontend Pages & Components](#frontend-pages--components)
9. [Security](#security)
10. [Local Development Setup](#local-development-setup)
11. [Running with Docker Compose](#running-with-docker-compose)
12. [Kubernetes Deployment (Minikube)](#kubernetes-deployment-minikube)
13. [Testing](#testing)
14. [CI/CD Pipeline](#cicd-pipeline)

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Single-page application |
| Backend | ASP.NET Core (.NET 10, C#) | REST API + SSE streaming |
| Database | PostgreSQL 16 + EF Core 9 | Persistent storage + migrations |
| AI Provider | OpenRouter API | Access to Claude / GPT-4o models |
| Authentication | JWT Bearer + Refresh Token Rotation | Stateless auth, 60 min access tokens |
| Containerization | Docker + Docker Compose | Local orchestration |
| Orchestration | Kubernetes (k8s manifests) | Production-grade deployment |
| Web Server | nginx (alpine) | Frontend serving + reverse proxy |
| CI/CD | GitHub Actions | Automated build, test, lint on every PR |

---

## Project Structure

```
MULTIMIND/
├── frontend/
│   ├── src/
│   │   ├── api/                  # Axios API clients (auth, debate, comments, admin)
│   │   ├── pages/                # Route-level page components
│   │   │   ├── admin/            # AdminDashboard, AdminUsers, AdminDebates, AdminLogs
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── SessionPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── ForgotPasswordPage.tsx
│   │   │   └── ResetPasswordPage.tsx
│   │   ├── components/
│   │   │   ├── LiveDebateView.tsx     # SSE streaming debate UI
│   │   │   ├── ChatDebateView.tsx     # 3-column arena view
│   │   │   ├── AnalyticsPanel.tsx     # Charts + NLP analytics
│   │   │   ├── CommentSection.tsx     # Threaded comments + AI replies
│   │   │   ├── ChatbotWidget.tsx      # Floating AI assistant
│   │   │   ├── AdminLayout.tsx        # Admin sidebar navigation
│   │   │   ├── ProtectedRoute.tsx     # Auth guard
│   │   │   └── AdminRoute.tsx         # Admin role guard
│   │   ├── context/
│   │   │   └── AuthContext.tsx        # JWT state + refresh interceptor
│   │   ├── App.tsx                    # Router + route definitions
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf                     # nginx reverse proxy config
│   ├── vite.config.ts
│   └── package.json
│
├── backend/
│   ├── MultiMind.API/
│   │   ├── Controllers/
│   │   │   ├── AuthController.cs
│   │   │   ├── DebateController.cs
│   │   │   ├── UsersController.cs
│   │   │   ├── CommentsController.cs
│   │   │   ├── AdminController.cs
│   │   │   └── ChatbotController.cs
│   │   ├── Services/
│   │   │   ├── DebateEngine.cs        # Core debate orchestration
│   │   │   ├── AgentService.cs        # AI agent personas + OpenRouter calls
│   │   │   ├── ModeratorService.cs    # Synthesis + confidence scoring
│   │   │   ├── AuthService.cs         # Registration, login, token refresh
│   │   │   ├── JwtService.cs          # JWT generation
│   │   │   ├── AdminService.cs        # Admin CRUD operations
│   │   │   ├── CommentService.cs      # Comments + AI replies
│   │   │   ├── DebateEventBus.cs      # In-memory SSE event bus
│   │   │   └── AdminActionLogger.cs   # Audit trail logging
│   │   ├── Models/                    # EF Core entity classes
│   │   ├── DTOs/                      # Request/response transfer objects
│   │   ├── Data/
│   │   │   └── AppDbContext.cs        # EF Core DbContext + query filters
│   │   ├── Repositories/              # Data access layer
│   │   ├── Middleware/
│   │   │   ├── ExceptionHandlingMiddleware.cs
│   │   │   └── RequestLoggingMiddleware.cs
│   │   ├── Migrations/                # EF Core database migrations
│   │   ├── Program.cs                 # App bootstrap + DI registration
│   │   └── Dockerfile
│   └── MultiMind.API.Tests/
│       ├── DebateEngineTests.cs
│       ├── DebateControllerInjectionTests.cs
│       ├── AuthServiceTests.cs
│       └── ModeratorServiceTests.cs
│
├── k8s/
│   ├── secrets.yaml.example           # Template for DB password, JWT key, API key
│   ├── postgres-deployment.yaml       # PostgreSQL Deployment + PVC + ClusterIP Service
│   ├── backend-deployment.yaml        # Backend Deployment + NodePort Service (30081)
│   └── frontend-deployment.yaml       # Frontend Deployment + NodePort Service (30080)
│
├── .github/
│   └── workflows/ci.yml               # GitHub Actions CI pipeline
│
├── docker-compose.yml
└── README.md
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│  ┌───────────────┐  HTTP/SSE  ┌──────────────────────────┐  │
│  │  React Pages  │◄──────────►│  nginx (port 80/3000)    │  │
│  │  Axios Client │            │  - Serves /dist static   │  │
│  └───────────────┘            │  - Proxies /api/* to     │  │
└───────────────────────────────│    backend:8080          │──┘
                                └──────────────────────────┘
                                             │ /api/*
                                             ▼
                                ┌──────────────────────────┐
                                │   ASP.NET Core API       │
                                │   (port 8080)            │
                                │                          │
                                │  ┌────────────────────┐  │
                                │  │  DebateEngine      │  │
                                │  │  AgentService      │──┼──► OpenRouter API
                                │  │  ModeratorService  │  │    (Claude / GPT-4o)
                                │  │  DebateEventBus    │  │
                                │  └────────────────────┘  │
                                │                          │
                                │  JWT Auth │ CORS │ Logs  │
                                └──────────┬───────────────┘
                                           │ EF Core
                                           ▼
                                ┌──────────────────────────┐
                                │     PostgreSQL 16        │
                                │  Users, DebateSessions,  │
                                │  AgentResponses,         │
                                │  ModeratorSynthesis,     │
                                │  Comments, AdminLogs,    │
                                │  AiCallLogs              │
                                └──────────────────────────┘
```

### Key Architectural Decisions

| Decision | Rationale |
|---|---|
| SSE over WebSockets | One-way server push; simpler reconnection, native HTTP/1.1 support |
| In-memory event bus | Decouples debate execution from HTTP response, allows background task streaming |
| nginx proxy (`/api/` → backend) | Single origin for browser; eliminates CORS preflight in production |
| Soft deletes on all entities | Preserves data integrity, allows admin recovery |
| Refresh token rotation | Limits exposure of stolen tokens; server-side revocation |
| EF Core global query filters | `IsDeleted = false` applied automatically on every query |

---

## Core Features

### For Users
- **Submit a debate** — Enter any question (up to 4,000 characters)
- **Live streaming** — Watch each agent's response appear word-by-word via SSE
- **3-column arena view** — Strategist, Risk Analyst, and Engineer responses side by side
- **Moderator synthesis** — Final recommendation with a 0–100 confidence score
- **Debate history** — Searchable/filterable list of all past sessions
- **Favourites** — Bookmark important debates for quick access
- **Export** — Download any debate session as JSON
- **Analytics panel** — Per-debate NLP metrics:
  - Radar chart (Strategy, Risk, Technical, Innovation, Depth dimensions)
  - Word count bar chart per round per agent
  - Sentiment analysis line chart
  - Flesch-Kincaid readability score
  - Lexical diversity (unique word ratio)
  - Pairwise Jaccard agreement scores between agents
  - Key theme extraction
- **Comments** — Post comments on any debate; all three AI agents auto-reply
- **AI Chatbot** — Floating assistant widget available on any page
- **Profile management** — Update display name, change password, view personal stats

### For Admins
- **Dashboard stats** — Total users, active/suspended, total debates, AI calls
- **User management** — Promote to Admin, suspend, soft-delete users
- **Debate management** — Browse all debates across all users, soft-delete
- **Comment moderation** — View and delete any comment system-wide
- **Audit log** — Complete trail of every admin action (who, what, when, target)

### System-Level
- **Duplicate prompt caching** — Same prompt within 5 minutes returns the cached session (no wasted AI credits)
- **Rate limiting** — Max 70 AI calls per user per hour
- **Prompt injection detection** — 10 known jailbreak/injection patterns blocked before any AI call
- **AI call logging** — Every OpenRouter request logged with tokens used, agent type, session, user
- **Startup cleanup** — Sessions stuck in `running` state (server crash) automatically marked `failed`
- **First-user bootstrap** — First registered account is automatically promoted to Admin

---

## Data Models

### Entity Relationship Overview

```
User ──< DebateSession ──< DebateRound ──< AgentResponse
                      └──< ModeratorSynthesis
                      └──< UserComment ──< UserComment (self-ref replies)
User ──< RefreshToken
User ──< AiCallLog
AdminLog (FK: AdminId → User)
```

### Entity Definitions

| Entity | Key Fields |
|---|---|
| **User** | `Id`, `Email`, `PasswordHash`, `DisplayName`, `Role` (User/Admin), `Status` (Active/Suspended), `IsDeleted` |
| **DebateSession** | `Id`, `UserId`, `OriginalPrompt`, `Status` (pending/running/completed/failed), `IsFavourite`, `IsDeleted`, `CreatedAt` |
| **DebateRound** | `Id`, `SessionId`, `RoundNumber` (1 or 2) |
| **AgentResponse** | `Id`, `RoundId`, `AgentType` (Strategist/RiskAnalyst/Engineer), `ResponseText` |
| **ModeratorSynthesis** | `Id`, `SessionId`, `Recommendation`, `ConfidenceScore` (0–100), `KeyDissentingViewpoints`, `FullSynthesis` |
| **UserComment** | `Id`, `SessionId`, `UserId`, `Content`, `ParentCommentId` (nullable), `IsAiReply`, `AiAgentType` |
| **RefreshToken** | `Id`, `UserId`, `Token`, `ExpiresAt`, `IsRevoked` |
| **AiCallLog** | `Id`, `UserId`, `SessionId`, `AgentType`, `TokensUsed`, `CreatedAt` |
| **AdminLog** | `Id`, `AdminId`, `Action`, `TargetType`, `TargetId`, `Details`, `CreatedAt` |

---

## Debate Flow

### Step-by-Step Execution

```
User submits prompt
        │
        ▼
DebateController
  ├── Validate prompt length (max 4000 chars)
  ├── Check for injection patterns (15 regex rules)
  └── Call DebateEngine.CreateSessionAsync()
           │
           ├── Same prompt by same user in last 5 min? → return cached session
           ├── User exceeded 70 AI calls/hour? → 429 Too Many Requests
           └── Create DebateSession (status = "running"), persist to DB
                    │
                    ▼
        Task.Run (background, non-blocking)
        DebateEngine.RunDebateAsync()
                    │
        ┌───────────▼───────────┐
        │       ROUND 1         │
        │  Agents run           │
        │  sequentially         │
        │                       │
        │  Strategist  → SSE    │
        │  RiskAnalyst → SSE    │
        │  Engineer    → SSE    │
        └───────────┬───────────┘
                    │  Round 1 summaries prepared
        ┌───────────▼───────────┐
        │       ROUND 2         │
        │  (cross-examination)  │
        │                       │
        │  Strategist sees      │
        │   Round 1 summary     │
        │                       │
        │  RiskAnalyst sees     │
        │   summary + Strat R2  │
        │                       │
        │  Engineer sees full   │
        │   context             │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │    MODERATOR STAGE    │
        │                       │
        │  Full transcript sent │
        │  Returns JSON:        │
        │  - recommendation     │
        │  - confidenceScore    │
        │  - dissentingViews    │
        │  - fullSynthesis      │
        └───────────┬───────────┘
                    │
        Session marked "completed"
        DebateComplete event published
        SSE channel closed
```

### Confidence Score Mapping

| Score Range | Meaning |
|---|---|
| 80–100 | All three agents largely aligned |
| 60–79 | Two agents aligned, one dissents |
| 40–59 | Significant disagreement across agents |
| < 40 | Fundamental contradiction — high uncertainty |

### Agent Personas

| Agent | Focus |
|---|---|
| **Strategist** | Business strategy, competitive advantage, long-term growth, market positioning |
| **Risk Analyst** | Risk identification, worst-case scenarios, stress-testing assumptions |
| **Engineer** | Technical feasibility, scalability, implementation realism, cost of change |

---

## API Reference

All endpoints (except Auth) require `Authorization: Bearer <token>` header.

### Authentication — `/api/auth`

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| POST | `/register` | `{ email, password, displayName }` | `{ token, refreshToken, email, role }` | None |
| POST | `/login` | `{ email, password }` | `{ token, refreshToken, email, role }` | None |
| POST | `/forgot-password` | `{ email }` | `{ resetToken }` | None |
| POST | `/reset-password` | `{ email, token, newPassword }` | 200 OK | None |
| POST | `/refresh` | `{ refreshToken }` | `{ token, refreshToken }` | None |
| POST | `/logout` | `{ refreshToken }` | 200 OK | JWT |

### Users — `/api/users`

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/me` | — | Get current user profile + stats |
| PUT | `/me` | `{ displayName }` | Update display name |
| PUT | `/me/password` | `{ currentPassword, newPassword }` | Change password |

### Debate — `/api/debate`

| Method | Endpoint | Query Params | Description |
|--------|----------|------|-------------|
| POST | `/start` | — | Start a new debate; body: `{ prompt }` |
| GET | `/{sessionId}/stream` | — | SSE stream of live debate events |
| GET | `/{sessionId}` | — | Get completed session with all rounds + synthesis |
| GET | `/history` | `search`, `status`, `page`, `pageSize` | Paginated debate history |
| PUT | `/{sessionId}/favourite` | — | Toggle favourite flag |
| GET | `/stats` | — | Personal stats (total, completed, failed, avg confidence) |

#### SSE Event Types

| Event | Payload |
|---|---|
| `RoundStart` | `{ roundNumber }` |
| `AgentStart` | `{ agentType }` |
| `AgentChunk` | `{ agentType, chunk }` |
| `AgentDone` | `{ agentType }` |
| `RoundEnd` | `{ roundNumber }` |
| `ModeratorStart` | — |
| `ModeratorChunk` | `{ chunk }` |
| `ModeratorDone` | — |
| `DebateComplete` | `{ sessionId }` |
| `Error` | `{ message }` |

### Comments — `/api/comments`

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/{sessionId}` | — | Get all comments (nested tree with AI replies) |
| POST | `/{sessionId}` | `{ content }` | Post a comment (triggers AI auto-replies) |
| PUT | `/{commentId}` | `{ content }` | Edit own comment |
| DELETE | `/{commentId}` | — | Delete own comment |

### Admin — `/api/admin` _(Admin role required)_

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stats` | Global stats (users, debates, AI calls) |
| GET | `/users` | Paginated user list with search |
| PUT | `/users/{id}/role` | Set user role (User/Admin) |
| PUT | `/users/{id}/status` | Set user status (Active/Suspended) |
| DELETE | `/users/{id}` | Soft-delete user |
| GET | `/debates` | Paginated debates across all users |
| DELETE | `/debates/{id}` | Soft-delete debate |
| GET | `/comments` | All comments system-wide |
| DELETE | `/comments/{id}` | Delete any comment |
| GET | `/logs` | Paginated admin audit logs |

### Chatbot — `/api/chatbot`

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/chat` | `{ message, sessionId? }` | AI assistant response (context-aware if sessionId provided) |

---

## Frontend Pages & Components

### Pages

| Page | Route | Description |
|---|---|---|
| `LoginPage` | `/login` | Email + password login form |
| `RegisterPage` | `/register` | New account registration |
| `ForgotPasswordPage` | `/forgot-password` | Request password reset token |
| `ResetPasswordPage` | `/reset-password` | Submit new password with token |
| `DashboardPage` | `/dashboard` | Submit debate prompt + debate history list + personal stats |
| `SessionPage` | `/session/:id` | Live streaming or completed session view with analytics + comments |
| `ProfilePage` | `/profile` | Display name update, password change, personal statistics |
| `AdminDashboardPage` | `/admin` | Admin stats cards |
| `AdminUsersPage` | `/admin/users` | User management table |
| `AdminDebatesPage` | `/admin/debates` | Debate management table |
| `AdminLogsPage` | `/admin/logs` | Audit log viewer |

### Key Components

| Component | Description |
|---|---|
| `LiveDebateView` | Consumes the SSE stream, renders agent messages as they arrive in real-time |
| `ChatDebateView` | Three-column arena layout showing both rounds per agent side-by-side |
| `AnalyticsPanel` | Radar chart, word count chart, sentiment chart, readability + lexical diversity metrics |
| `CommentSection` | Threaded comment tree; posts trigger automatic AI agent replies |
| `ChatbotWidget` | Floating chat bubble; context-aware assistant using the current debate session |
| `ProtectedRoute` | Redirects unauthenticated users to `/login` |
| `AdminRoute` | Redirects non-Admin users to `/dashboard` |
| `AdminLayout` | Persistent sidebar navigation for all admin pages |

### Auth State (`AuthContext`)
- Stores `token`, `email`, `role` in `localStorage`
- `login()` / `logout()` methods
- Axios interceptor: on 401, automatically attempts token refresh; redirects to `/login` if refresh fails

---

## Security

| Mechanism | Implementation |
|---|---|
| Password hashing | BCrypt with salt (minimum 8-character passwords enforced) |
| JWT access tokens | HS256, configurable expiry (default 60 min), validated issuer + audience |
| Refresh token rotation | 30-day expiry, single-use, server-side revocation on logout |
| Role-based access control | `[Authorize(Policy = "AdminOnly")]` on all admin endpoints |
| CORS whitelist | Explicit `WithOrigins()` list; no wildcard origins allowed |
| Soft deletes | `IsDeleted` flag; global EF Core query filters hide deleted records |
| Prompt injection detection | Regex match against 15 known jailbreak/injection patterns before any AI call |
| Sensitive config | All secrets via environment variables / Kubernetes Secrets (never committed) |
| Token revocation | `RefreshToken.IsRevoked = true` persisted on logout |
| Error responses | `ProblemDetails` JSON format (no stack traces in Production) |

---

## Local Development Setup

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [PostgreSQL 16](https://www.postgresql.org/download/) running locally
- An [OpenRouter](https://openrouter.ai) API key

### 1 — Database

```bash
psql -U postgres -c "CREATE DATABASE multimind;"
cd backend/MultiMind.API
dotnet ef database update
```

### 2 — Backend

Create `backend/MultiMind.API/appsettings.Development.json` (gitignored — **never commit secrets**):

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=multimind;Username=postgres;Password=YOUR_PG_PASSWORD"
  },
  "Jwt": {
    "Key": "your-jwt-secret-at-least-32-characters-long",
    "Issuer": "MultiMind",
    "Audience": "MultiMindUsers",
    "ExpiryMinutes": "60"
  },
  "OpenAI": {
    "ApiKey": "sk-or-v1-...",
    "Model": "anthropic/claude-sonnet-4.5",
    "BaseUrl": "https://openrouter.ai/api/v1"
  }
}
```

```bash
cd backend/MultiMind.API
dotnet run --launch-profile http
# REST API  → http://localhost:5125
# Scalar UI → http://localhost:5125/scalar
```

### 3 — Frontend

```bash
cd frontend
npm install
npm run dev
# App → http://localhost:5174
```

> The Vite dev server proxies `/api` requests to `http://localhost:5125` — no manual CORS setup needed in dev.

---

## Running with Docker Compose

The fastest way to run the full stack locally without installing PostgreSQL or .NET:

```bash
# Create a .env file in the project root
DB_PASSWORD=changeme
JWT_KEY=your-jwt-secret-at-least-32-chars
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=anthropic/claude-sonnet-4.5
```

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| PostgreSQL | localhost:5432 |

EF Core migrations run automatically on startup. The backend waits for the database health check before starting.

---

## Kubernetes Deployment (Minikube)

### Prerequisites

- [Minikube](https://minikube.sigs.k8s.io/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- Docker

### 1 — Start Minikube

```powershell
minikube start --driver=docker --memory=4096 --cpus=2
```

### 2 — Build images inside Minikube's Docker daemon

```powershell
# Point Docker CLI at Minikube's daemon (images go directly into cluster)
& minikube -p minikube docker-env | Invoke-Expression

docker build -t multimind-backend:latest ./backend/MultiMind.API
docker build --build-arg VITE_API_BASE_URL="/api" -t multimind-frontend:latest ./frontend
```

### 3 — Populate secrets

```powershell
Copy-Item k8s/secrets.yaml.example k8s/secrets.yaml
```

Edit `k8s/secrets.yaml` and replace the placeholder values. The template uses Kubernetes `stringData`, so you can paste normal text values; Kubernetes will encode them when the Secret is created. Keep the real `k8s/secrets.yaml` file private.

### 4 — Apply manifests

```powershell
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml

kubectl get pods   # Wait for all 3 pods to show Running
```

### 5 — Open the app

```powershell
minikube service frontend --url
# Keep this terminal open — closing it stops the tunnel
```

### Cluster Services

| Service | Type | Port |
|---|---|---|
| `postgres` | ClusterIP | 5432 |
| `backend` | NodePort | 30081 |
| `frontend` | NodePort | 30080 |

nginx inside the frontend pod proxies `/api/*` to `http://backend:8080/api/*` via Kubernetes internal DNS — no hardcoded IP addresses required.

### Useful Commands

```powershell
kubectl logs deployment/backend --tail=50 -f    # Stream backend logs
kubectl rollout restart deployment/backend       # Redeploy after image rebuild
kubectl exec -it deployment/backend -- /bin/bash # Shell into pod
```

---

## Testing

```bash
cd backend/MultiMind.API.Tests
dotnet test -c Release --logger "console;verbosity=normal"
```

### Test Coverage

| Test Class | Tests | What is Tested |
|---|---|---|
| `DebateEngineTests` | 6 | `CreateSessionAsync`: new session, duplicate-prompt caching, cache expiry after 5 min, whitespace normalization, per-user rate limit (70 calls/hour), cross-user isolation |
| `DebateControllerInjectionTests` | 15 | Prompt injection detection — 15 known jailbreak phrases blocked before reaching the AI |
| `AuthServiceTests` | varies | Registration validation, duplicate email rejection, login with wrong password |
| `ModeratorServiceTests` | varies | Synthesis output parsing, confidence score range validation |

**Testing tools:**
- **xUnit** — test framework
- **Moq** — mocking `IAgentService`, `IModeratorService`, `IDebateEventBus`
- **EF Core InMemory** — database context without PostgreSQL dependency

---

## CI/CD Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

```
Push / PR to main
        │
        ├── Backend job
        │     ├── dotnet restore
        │     ├── dotnet build -c Release
        │     └── dotnet test -c Release
        │
        └── Frontend job
              ├── npm ci
              ├── tsc --noEmit  (type checking)
              └── npm run build (production bundle)
```

Both jobs must pass before a PR can be merged.

---

## Environment Variables Reference

### Backend

| Variable | Description | Example |
|---|---|---|
| `ConnectionStrings__DefaultConnection` | PostgreSQL connection string | `Host=db;Port=5432;Database=multimind;...` |
| `Jwt__Key` | JWT signing secret (min 32 chars) | `my-super-secret-key-32-chars-long` |
| `Jwt__Issuer` | JWT issuer claim | `MultiMind` |
| `Jwt__Audience` | JWT audience claim | `MultiMindUsers` |
| `Jwt__ExpiryMinutes` | Access token lifetime | `60` |
| `OpenAI__ApiKey` | OpenRouter API key | `sk-or-v1-...` |
| `OpenAI__Model` | Model identifier | `anthropic/claude-sonnet-4.5` |
| `OpenAI__BaseUrl` | OpenRouter base URL | `https://openrouter.ai/api/v1` |
| `Frontend__Url` | Allowed CORS origin | `http://localhost:3000` |
| `ASPNETCORE_ENVIRONMENT` | Runtime environment | `Development` / `Production` |

### Frontend (build-time)

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL | `/api` (nginx proxy) or `http://localhost:5125` |
