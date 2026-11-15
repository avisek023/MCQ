# QuizDuel — Private MCQ Arena

Real-time **1 Host + 2 Participants** private MCQ arena with secret answer lock-in, simultaneous reveal, speed bonuses, streaks, persistent room chat, and mobile-first touch controls.

## Requirements

- **Node.js >= 22** (Node.js 24 LTS recommended)

## Deploy as a 100% Static Website on GitHub Pages (Zero Setup)

No backend server, environment variables, or secrets are required to publish on GitHub Pages:

1. Push the repository to GitHub (private repos are supported on GitHub Pro, Team, or Enterprise; GitHub Actions runs on both public and private repos).
2. In your repository **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` (or trigger **Deploy Frontend to GitHub Pages** under **Actions**).
4. Share your GitHub Pages URL — when hosted statically, QuizDuel automatically uses an encrypted serverless WSS room relay so the Host browser coordinates the match and both Android participants can join with the room code and play seamlessly. *(Keep the Host tab open while the match runs so auto-timers advance each round.)*

All workflows use **Node.js 24-native** GitHub Actions (`actions/checkout@v6`, `actions/setup-node@v6`, `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`).

## Local Development / Full-Stack Container Deploy

```bash
npm install
npm run dev
```

For full-stack container hosting (`Dockerfile`, port `3000`, `npm start`), QuizDuel runs `server.ts` directly on Node.js 22/24 (`GET /api/health`).
