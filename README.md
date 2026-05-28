# MultiMind

A multi-agent AI decision analysis system. Users submit a business or technical decision. Three specialized AI agents — **Strategist**, **Risk Analyst**, and **Engineer** — independently evaluate the input (Round 1), then challenge each other in structured debate (Round 2). A **Moderator** synthesizes all outputs into a final recommendation with a confidence score.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Backend | .NET 10 Web API (C#) |
| Database | PostgreSQL 16 + EF Core 9 |
| AI | OpenRouter (GPT-4o via `openai/gpt-4o`) |
| Auth | JWT Bearer tokens (localStorage, 60 min expiry) |
| Container | Docker + Docker Compose |
| Orchestration | Kubernetes (manifests in `k8s/`) |
| CI/CD | GitHub Actions |

## Project Structure

```
MULTIMIND/
├── frontend/                # React Vite TypeScript app (port 5174 local)
│   ├── src/
│   │   ├── api/             # Axios client (client.ts)
│   │   ├── pages/           # Route-level pages
│   │   └── components/      # Reusable UI components
│   ├── Dockerfile
│   └── nginx.conf
├── backend/
│   ├── MultiMind.API/       # .NET 10 Web API (port 5125 local)
│   │   ├── Controllers/
│   │   ├── Services/        # DebateEngine, AgentService, ModeratorService
│   │   ├── Models/
│   │   ├── Data/            # AppDbContext + EF Core migrations
│   │   └── Dockerfile
│   └── MultiMind.API.Tests/ # xUnit unit tests (22 tests)
├── k8s/                     # Kubernetes manifests
├── .github/workflows/ci.yml # GitHub Actions CI pipeline
├── docker-compose.yml
└── README.md
```

## Getting Started (Local Dev)

### Prerequisites
- Node.js 20+
- .NET 10 SDK
- PostgreSQL 16 running locally
- An [OpenRouter](https://openrouter.ai) API key

### 1. Database

Create the database and run migrations:

```bash
# Create database 'multimind' with user 'postgres'
psql -U postgres -c "CREATE DATABASE multimind;"

cd backend/MultiMind.API
dotnet ef database update
```

### 2. Backend

Create `backend/MultiMind.API/appsettings.Development.json` (gitignored — never commit):

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=multimind;Username=postgres;Password=YOUR_PG_PASSWORD"
  },
  "Jwt": {
    "Key": "your-jwt-secret-at-least-32-chars",
    "Issuer": "MultiMind",
    "Audience": "MultiMindUsers",
    "ExpiryMinutes": "60"
  },
  "OpenAI": {
    "ApiKey": "sk-or-v1-...",
    "Model": "openai/gpt-4o",
    "BaseUrl": "https://openrouter.ai/api/v1"
  }
}
```

```bash
cd backend/MultiMind.API
dotnet run --launch-profile http
# API available at http://localhost:5125
# Scalar API docs at http://localhost:5125/scalar
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env          # edit VITE_API_BASE_URL if needed
npm install
npm run dev
# App available at http://localhost:5174
```

## Running Tests

```bash
cd backend/MultiMind.API.Tests
dotnet test -c Release
```

22 unit tests covering:
- Prompt injection detection (`DebateControllerInjectionTests` — 15 cases)
- `DebateEngine.CreateSessionAsync` — new session creation, duplicate-prompt caching, cache expiry, whitespace normalization, rate limiting, cross-user isolation

## Running with Docker Compose

Copy and fill in secrets:

```bash
cp .env.example .env   # or create .env manually
```

Required `.env` vars for Docker:

```
DB_PASSWORD=your-postgres-password
JWT_KEY=your-jwt-secret-at-least-32-chars
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=openai/gpt-4o
```

Then:

```bash
docker compose up --build
# Frontend → http://localhost:3000
# Backend  → http://localhost:5000
# Postgres → localhost:5432
```

## Kubernetes (Local — Minikube)

```bash
# Build images locally
docker build -t multimind-backend:latest ./backend/MultiMind.API
docker build -t multimind-frontend:latest ./frontend

# Load into minikube
minikube image load multimind-backend:latest
minikube image load multimind-frontend:latest

# Fill in base64 secrets in k8s/secrets.yaml, then:
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml

# Access frontend
minikube service frontend
```

## API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset with token |

### Debate
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/debate/start` | Start a new debate session |
| GET | `/api/debate/{sessionId}` | Poll session status + rounds |
| GET | `/api/debate/sessions` | List user's sessions |
| POST | `/api/debate/{sessionId}/favourite` | Toggle favourite |

### User
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/user/profile` | Get profile |
| PUT | `/api/user/profile` | Update profile |
| GET | `/api/user/stats` | Usage statistics |

## Key Features

- **Multi-agent debate**: Three agents with isolated memory debate in parallel (Round 1) then in context (Round 2).
- **Moderator synthesis**: Final decision with confidence score derived from all agent perspectives.
- **Response caching**: Duplicate prompts within 5 minutes return the existing session — no wasted AI calls.
- **Debounce**: Frontend prevents double-submission; 300 ms debounce + `submittingRef` guard.
- **Rate limiting**: Max 70 AI calls per user per hour.
- **Prompt injection protection**: 10 known jailbreak patterns blocked at the controller.
- **AI call logging**: Every OpenAI request is logged to `AiCallLogs` table.
- **Startup cleanup**: Orphaned `running` sessions are marked `failed` on server restart.

## CI/CD

GitHub Actions runs on every push/PR to `main`:
1. **Backend**: restore → build → test (xUnit, Release config)
2. **Frontend**: `npm ci` → `tsc --noEmit` → `npm run build`

