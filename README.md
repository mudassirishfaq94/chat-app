# Chat App

A modern, real-time chat application built with Node.js, Express, Socket.IO, and Prisma. It supports authenticated messaging, room membership, file uploads, and persistent storage via Postgres in production.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white) ![Express](https://img.shields.io/badge/Express.js-4.x-black?logo=express) ![Socket.IO](https://img.shields.io/badge/Socket.IO-real--time-010101?logo=socketdotio) ![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma) ![Postgres](https://img.shields.io/badge/Postgres-DB-336791?logo=postgresql)

## Features
- Real-time messaging with Socket.IO
- Rooms and membership management
- JWT auth stored in HTTP-only cookies
- File uploads for message attachments
- Persistent storage with Prisma + Postgres (Render or Supabase)
- Simple REST API for auth and uploads

## Tech Stack
- Backend: Node.js, Express, Socket.IO
- Database/ORM: Postgres + Prisma
- Client: Static HTML/JS served from `public/`

## Project Structure
```
chat-app/
├─ prisma/
│  ├─ migrations/
│  └─ schema.prisma
├─ public/
│  ├─ index.html
│  └─ client.js
├─ server.js
├─ package.json
└─ README.md
```

## Getting Started
### Prerequisites
- Node.js v18+ and npm

### 1) Install dependencies
```
npm install
```

### 2) Environment variables
Create a `.env` file in the project root:
```
# Prisma (Postgres)
DATABASE_URL="postgres://<user>:<password>@<host>:5432/<db>"

# App
JWT_SECRET="change-me-to-a-very-strong-secret"
PORT=3000
```

### 3) Apply database migrations and generate Prisma client
```
npx prisma migrate dev --name init
npx prisma generate
```

### 4) Run the app
```
# Development (if available)
npm run dev

# Or start directly
npm start
# or
node server.js
```
Visit http://localhost:3000 to open the web client.

## Usage
- Sign up and log in via REST endpoints (`/api/signup`, `/api/login`, `/api/logout`, `/api/me`).
- Upload files via `/api/upload`.
- The web client connects via Socket.IO:
  - Join a room: `socket.emit('join-room', roomId)`
  - Send a message: `socket.emit('message', { roomId, content, attachmentUrl? })`

## API (Quick Reference)
- `POST /api/signup` — create account
- `POST /api/login` — authenticate and set cookie
- `POST /api/logout` — clear auth cookie
- `GET  /api/me` — get current user
- `POST /api/upload` — upload attachment

## Development Notes
- Prisma schema defines Users, Rooms, Membership, Messages, Attachments, and Friend relationships.
Development historically used SQLite, but production requires Postgres. Set `DATABASE_URL` to a Postgres connection string and run Prisma migrations.

## Deploying to Render (recommended)

Render supports long‑running Node servers and WebSockets. To deploy:

1. Push your repository to GitHub.
2. Create a new Web Service on Render and connect the repo.
3. Environment Variables:
   - `NODE_ENV=production`
   - `PORT=3000` (Render injects PORT; the app reads it automatically)
   - `DATABASE_URL` (Render Managed Postgres or Supabase Postgres)
   - `JWT_SECRET` (strong random string)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`
   - Optional admin bootstrap: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_FORCE_RESET`
4. Build command: `npm ci && npm run build && npm run migrate`
5. Start command: `npm start`
6. Health check path: `/health`

Notes:
- If you scale to multiple instances, add a Socket.IO adapter (e.g., Redis) so broadcasts reach all nodes.
- Attachments are stored in Supabase Storage using signed URLs (default 7 days). Consider storing storage path and re‑signing URLs when fetching messages to avoid expiration.

## Deploying to Netlify or GitHub Pages

These platforms are great for static sites, but this project is a full Node server with WebSockets and uploads. You can host only the `/public` frontend there, but the backend must run elsewhere (e.g., Render). For a one‑step end‑to‑end deploy with minimal setup, use Render.

## Prisma & Database Migration (Postgres)

1. `prisma/schema.prisma` datasource:
   ```
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Set `DATABASE_URL` in your environment (Render or Supabase Postgres).
3. Generate the client: `npm run build` (or `npx prisma generate`).
4. Create Postgres‑compatible migrations and deploy them:
   - Fresh setup (no prod data): `npx prisma migrate dev --name init` locally, then commit and `npm run migrate` in Render.
   - Existing migrations from SQLite are not portable. Create a new migration set for Postgres using `migrate dev` and remove old SQLite migrations, or use `prisma db push` for initial schema provisioning.

## License
MIT
