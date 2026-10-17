# Healthcare Portal

A full-stack healthcare appointment and patient portal portfolio project. It combines a React interface, an Express API, PostgreSQL persistence, appointment-scoped real-time chat, and a Python FastAPI service for extractive medical-text summaries.

> **Portfolio/demo notice:** This project is not a production clinical system. The document summarizer uses basic keyword matching, can misinterpret negated or historical mentions, and does not assess clinical urgency or provide medical advice. Do not use it for diagnosis or treatment decisions.

## Architecture

```text
Browser
  └── React + Vite + Tailwind CSS
        └── Nginx (Docker; proxies /api and /socket.io)
              └── Node.js + Express + Socket.IO
                    ├── PostgreSQL
                    └── FastAPI document summarizer
```

| Service | Technologies | Purpose |
| --- | --- | --- |
| Client | React, Vite, Tailwind CSS, Axios, Socket.IO client | Doctor search and appointment booking UI, plus a reusable appointment-chat hook |
| API | Node.js, Express, PostgreSQL `pg`, bcrypt, JWT, Socket.IO | Authentication, doctor search, appointment booking, and authorized real-time chat |
| AI service | Python, FastAPI, Uvicorn, Pydantic | Extractive summaries and keyword-matched symptom mentions from text |
| Database | PostgreSQL | Users, doctor profiles, appointments, medical documents, and chat messages |
| Delivery | Docker, Docker Compose, GitHub Actions | Local multi-service orchestration and automated validation |

## Features

- Password hashing with bcrypt and signed, one-day JWTs. New account registrations are assigned the `patient` role.
- Doctor discovery with name/specialization search, location matching, and a maximum-fee filter.
- Appointment booking uses a PostgreSQL unique constraint on doctor and slot; an occupied slot returns HTTP `409 Conflict`.
- Appointment chat verifies JWTs and appointment participation, persists messages before delivery, and broadcasts only to the participants' sockets.
- Document summarization accepts JSON text or UTF-8 `.txt`/`.md` uploads up to 1 MB. Symptom detection is keyword-based; `urgencyLevel` is always `not_assessed`.
- Health endpoints are available at `/api/health` (API) and `/health` (AI service).

## Repository layout

```text
.
├── .github/workflows/ci.yml
├── ai-service/
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
├── client/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
│       ├── App.jsx
│       ├── components/DoctorSearch.jsx
│       └── hooks/useAppointmentChat.js
├── server/
│   ├── controllers/
│   ├── middleware/
│   ├── migrations/001_create_messages.sql
│   ├── routes/
│   ├── socket/chatSocket.js
│   ├── db.js
│   ├── index.js
│   └── schema.sql
└── docker-compose.yml
```

## Run with Docker Compose

Prerequisites: Docker Engine/Desktop with Docker Compose.

1. Create your local environment file:

   ```sh
   cp .env.example .env
   ```

   On PowerShell, use `Copy-Item .env.example .env`. Edit `.env` and replace `POSTGRES_PASSWORD` and `JWT_SECRET` with strong, unique values.

2. Build and start all services:

   ```sh
   docker compose up --build
   ```

3. Open the client at [http://localhost:5173](http://localhost:5173). The API is available through the Nginx `/api` proxy; PostgreSQL and the AI service stay on the internal Compose network.

To stop the services, run `docker compose down`. PostgreSQL data is stored in the named `postgres_data` volume and remains after stopping containers. To remove that data as well, use `docker compose down --volumes` **only when you intend to delete the database contents**.

The Postgres image runs `server/schema.sql` only when initializing an empty data volume. **This schema contains `DROP TABLE` statements for development resets. Never rerun it against a database whose data you need to preserve.** Existing databases can create the chat table with `server/migrations/001_create_messages.sql`.

## Run services locally

Prerequisites: Node.js 20+, Python 3.11+, and PostgreSQL.

### Database

Create a PostgreSQL database and configure its connection string in `server/.env`:

```env
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/healthcare
JWT_SECRET=replace-with-a-long-random-secret
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
```

Initialize a new development database with `server/schema.sql`. It drops existing tables, so only run it against an empty or disposable database. For an existing database, apply the messages migration as needed.

### Backend

```sh
cd server
npm ci
node index.js
```

The API listens on port `5000` by default. API routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register a patient |
| `POST` | `/api/auth/login` | Authenticate and return a JWT |
| `GET` | `/api/doctors` | Search/filter doctors (`search`, `specialization`, `location`, `maxFee`) |
| `POST` | `/api/appointments` | Book a slot; requires a patient Bearer token |
| `GET` | `/api/appointments` | List appointments for the authenticated patient or doctor |
| `GET` | `/api/health` | API health check |

Socket.IO clients authenticate with `auth: { token }`, join using `join_appointment` with an `appointmentId`, and send `send_message` events with `appointmentId` and `messageText`.

### Client

```sh
cd client
npm ci
npm run dev
```

Set `VITE_API_URL` to the backend origin if the Vite development server is not proxying API calls. In Docker, Nginx proxies API and Socket.IO requests to the backend.

### AI service

```sh
cd ai-service
python -m venv .venv
# Activate .venv for your shell, then:
python -m pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Send a JSON request:

```sh
curl -X POST http://localhost:8000/api/summarize-doc \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Patient reports a headache and fatigue.\"}"
```

For an upload, send `multipart/form-data` with a `.txt`/`.md` file field named `file`, or a plain text field named `text`. The service returns a short extractive excerpt, keyword-matched symptom mentions, general recommendations, a disclaimer, and `urgencyLevel: "not_assessed"`.

## Validation and CI

Run focused local checks:

```sh
# Backend JavaScript syntax
cd server
node --check index.js

# AI-service Python syntax
cd ../ai-service
python -m py_compile main.py

# Frontend production build
cd ../client
npm ci
npm run build

# Docker Compose configuration (requires POSTGRES_PASSWORD and JWT_SECRET)
cd ..
docker compose config
```

The [GitHub Actions workflow](.github/workflows/ci.yml) runs backend syntax checks, builds the frontend, verifies AI-service Python syntax, and validates Docker Compose on pushes and pull requests targeting `main`. The repository does not currently define a unit-test suite or a separate lint command.

## Security and deployment notes

- Use unique secrets, TLS, restricted network access, and a managed secret store for any deployment beyond local development. Never commit `.env`.
- The Compose configuration is a local portfolio setup, not a complete production deployment strategy.
- Appointment chat access is limited to the patient and doctor associated with an appointment. Keep authorization checks server-side; never trust a client-supplied sender or recipient ID.
- Review the summarizer's limitations and privacy obligations before processing real health information.
