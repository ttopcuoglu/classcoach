# Wivoza server

Express + Prisma (SQLite) backend for the Wivoza web app. Proxies calls to
the Anthropic Claude API so the API key never reaches the client.

## Setup

```bash
npm install
cp .env.example .env   # then fill in ANTHROPIC_API_KEY
npm run prisma:migrate
npm run seed            # loads the curated fallback scenario bank
npm run dev
```

Runs on `http://localhost:3001` by default (see `PORT` in `.env`).

## Routes

- `GET /api/health`
- `GET/POST /api/scenarios`, `GET /api/scenarios/:id`
- `POST /api/scenarios/generate` — generates a scenario via Claude; falls back
  to a random scenario from the curated bank (`source: "curated"`, seeded via
  `npm run seed`) if the Claude call fails, so the feature keeps working
  offline or without an API key
- `GET/POST /api/attempts`, `PATCH /api/attempts/:id` (toggle `saved`)
- `GET/POST /api/qa`, `PATCH /api/qa/:id` (toggle `starred`)
- `GET/PUT /api/profile` — single local profile, no auth in v1
- `POST /api/claude/messages` — generic proxy to the Anthropic API (`{ system?, messages, maxTokens? }`)

## Data

SQLite file at `prisma/dev.db` (gitignored). Schema lives in `prisma/schema.prisma`;
run `npm run prisma:studio` to browse data.
