# MultiMind

A multi-agent AI decision analysis system. Users submit a business or technical decision. Three specialized AI agents — Strategist, Risk Analyst, and Engineer — independently evaluate the input (Round 1), then challenge each other in structured debate rounds (Round 2+). A Moderator agent synthesizes all outputs into a final recommendation with a confidence score.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | .NET 8 Web API (C#) |
| Database | PostgreSQL + EF Core |
| AI | OpenAI API |
| Auth | JWT (HTTP-only cookies) |
| Container | Docker + Docker Compose |
| CI/CD | GitHub Actions |

## Project Structure

```
MULTIMIND/
├── frontend/       # React Vite TypeScript app
├── backend/        # .NET 8 Web API
├── Knowledge/      # Project epics and stories
└── docker-compose.yml
```

## Getting Started

### Prerequisites
- Node.js 20+
- .NET 8 SDK
- PostgreSQL
- Docker (optional)

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
dotnet restore
dotnet run
```

### Environment Variables
- Copy `frontend/.env.example` to `frontend/.env`
- Copy `backend/.env.example` to `backend/.env`
