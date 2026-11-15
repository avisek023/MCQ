# QuizDuel — Private MCQ Arena

Real-time **1 Host + 2 Participants** private MCQ arena with secret answer lock-in, simultaneous reveal, speed bonuses, streaks, persistent room chat, and mobile-first touch controls.

## Requirements

- **Node.js >= 22** (Node.js 24 LTS recommended)

## Local Development

```bash
npm install
npm run dev
```

The server runs on port `3000` (Express + WebSockets on `/ws` + Vite dev middleware).

## Publishing from a Private GitHub Repository

QuizDuel requires a live WebSocket backend (`server.ts`) for room state and simultaneous answer reveal. You have two deployment options:

### Option A — Full-Stack Container Deploy (Recommended for Private Repos)

Deploy directly from your private GitHub repository using the included `Dockerfile` (Cloud Run, Render, Railway, or Fly.io):

- **Port:** `3000`
- **Start command:** `npm start` (`NODE_ENV=production node server.ts`)
- **Health check:** `GET /api/health`

GitHub Actions CI (`.github/workflows/ci.yml`) runs typechecking, Vite build, and a Node 24 production server smoke test automatically on every push/PR in private repos.

### Option B — Split Frontend on GitHub Pages + Hosted Backend

> **Note on Private Repositories:** GitHub Pages on a private repository requires **GitHub Pro, Team, or Enterprise** (otherwise deploy the full-stack app via Option A, or make only a frontend mirror public).

1. Deploy the backend (`server.ts` / `Dockerfile`) to any Node/container host and copy its public URL (e.g. `https://quizduel-backend.example.com`).
2. In your GitHub repository **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_WS_URL`: `wss://quizduel-backend.example.com/ws`
3. In **Settings → Pages**, set **Source** to **GitHub Actions**.
4. Push to `main` (or trigger **Deploy Frontend to GitHub Pages** manually). The workflow uses Node 24-native actions (`actions/checkout@v6`, `actions/setup-node@v6`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`).
