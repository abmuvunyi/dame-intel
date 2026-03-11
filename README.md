# Online Draughts Platform

A full-featured, real-time multiplayer draughts (checkers) platform built with a modern microservices-ready architecture. This project fulfills the requirements of a comprehensive 4-phase technical specification, providing capabilities similar to large online board game platforms like chess.com.

## 🚀 Features

### **Phase 1: Core Multiplayer**
- Pure TypeScript Draughts Engine enforcing standard rules (forced captures, multi-jumps, king promotions).
- Real-time multiplayer matchmaking via WebSockets (`Socket.IO`).
- Drag-and-drop React frontend board with legal move highlighting.

### **Phase 2: Single Player & Progression**
- **AI Engine:** Play against a Minimax-based AI with Alpha-Beta pruning across 3 difficulty levels (depths 2, 4, and 6).
- **User Accounts:** JWT-based authentication with `bcrypt` password hashing.
- **Profiles & Ratings:** Persistent player profiles tracking wins, losses, draws, and ELO rating changes.
- **Game History:** Full move-by-move histories of all completed games saved to the database.

### **Phase 3: Community & Training**
- **Tournaments:** Arena-style tournaments managed by a backend Cron job that automatically pairs registered players.
- **Puzzles:** A tactical training system where players must find the engine's "best move" in pre-configured board states.
- **Spectator Mode:** Live dashboard of active games allowing users to drop into any room and watch matches in real-time.
- **Social System:** Send, accept, and manage friend requests.

### **Phase 4: Advanced Tools**
- **Analysis Board:** Review finished matches from your history. Step forward/backward through time and query the AI engine to evaluate specific board positions.
- **Anti-Cheat System:** An asynchronous, event-loop-yielding service that analyzes human games against the engine. Players matching depth-4 engine choices >95% of the time are flagged in the database for review.

---

## 🛠 Technology Stack

- **Frontend:** Next.js 14, React, TailwindCSS, Socket.IO Client, Axios.
- **Backend:** NestJS, TypeScript, Socket.IO, TypeORM.
- **Infrastructure:** PostgreSQL, Redis (for scalable WebSocket adapters), Docker Compose.

---

## 🏃 Getting Started (Local Development)

### 1. Start the Database Infrastructure
You need Docker installed to run the PostgreSQL and Redis containers.
```bash
docker compose up -d
```

### 2. Configure the Backend
Navigate to the backend directory, install dependencies, and create an environment file.
```bash
cd backend
npm install
echo "JWT_SECRET=super_secret_dev_key" > .env
```

### 3. Run the Backend Server
```bash
npm run start:dev
```
The NestJS API and WebSocket Gateway will start on `http://localhost:3001`.

### 4. Run the Frontend Client
Open a new terminal window, navigate to the frontend directory, and start the Next.js app.
```bash
cd frontend
npm install
npm run dev
```
The application will be available at **`http://localhost:3000`**.
