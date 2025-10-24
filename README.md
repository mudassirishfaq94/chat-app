# Chat App

A modern, real-time chat application built with Node.js, Express, Socket.IO, and Prisma. It supports authenticated messaging, room membership, file uploads, and persistent storage via SQLite.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white) ![Express](https://img.shields.io/badge/Express.js-4.x-black?logo=express) ![Socket.IO](https://img.shields.io/badge/Socket.IO-real--time-010101?logo=socketdotio) ![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma) ![SQLite](https://img.shields.io/badge/SQLite-DB-003B57?logo=sqlite)

## Features
- Real-time messaging with Socket.IO
- Rooms and membership management
- JWT auth stored in HTTP-only cookies
- File uploads for message attachments
- Persistent storage with Prisma + SQLite
- Simple REST API for auth and uploads

## Tech Stack
- Backend: Node.js, Express, Socket.IO
- Database/ORM: SQLite + Prisma
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
# Prisma
DATABASE_URL="file:./prisma/dev.db"

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
- Default dev database: `prisma/dev.db` (SQLite). For production, configure `DATABASE_URL` accordingly.

## License
MIT
