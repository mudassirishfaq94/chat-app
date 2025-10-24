# Chat App Milestones

## Milestone 1: MVP Real-time Chat (This Week)
- Express server serving static files from `/public`
- Socket.IO for real-time messaging
- Simple Tailwind UI: message list, input, send button
- System messages for join/leave
- Auto-scroll and timestamps

## Milestone 2: Rooms & Nicknames
- Prompt for display name
- Create/join rooms
- Show who is online in a room

## Milestone 3: File & Image Sharing (Basic)
- Allow sending images via URL (preview in chat)
- Drag & drop files (store temporarily, basic limits)

## Milestone 4: Persistence
- Save messages to a lightweight DB (SQLite or MongoDB)
- Load last 50 messages on room join

## Milestone 5: Authentication (Optional)
- Simple login (JWT or session)
- Private rooms

## Milestone 6: Deployment
- Prepare production build
- Deploy on Render/Vercel (server) and static hosting for client

## Notes
- Keep UI beginner-friendly and minimal
- Prioritize stability and clear error messages
- Each milestone should be merged via PR with concise README updates
