# MediZyra Healthcare Solutions

A full-stack hospital management system built with the MERN stack (MongoDB, Express, React, Node.js). Designed to run completely offline on a local machine — no cloud dependency required.

## Features

### Role-based access
Three distinct user roles, each with their own portal and permissions:

- **Patient** — Browse specialists, book appointments, track appointment history, view doctor notes and prescriptions
- **Admin** — Triage appointment requests, manage doctor profiles, review contact messages
- **Doctor** — View assigned appointments, add consultation summaries, prescriptions, and follow-up dates, mark cases as completed

### Appointment workflow
Appointments move through a clear status lifecycle with role-enforced transitions:

```
Requested → Confirmed → Completed
               ↓
           Cancelled  (admin only, from Requested or Confirmed)
```

- Admin or Doctor can confirm a requested appointment
- Only the assigned Doctor can complete a consultation
- Completed appointments are locked from further changes

### Other features
- Email and password authentication with bcrypt hashing
- Patient self-registration
- Doctor directory with specialty filtering and individual profiles
- Appointment booking with slot selection, consultation mode, and symptom notes
- Admin can edit appointment details (date, slot, intake notes) before confirmation
- Demo data reset to seed state
- Contact/support message submission

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Vite 8 |
| Backend | Node.js, Express 5 |
| Database | MongoDB (local, via official driver) |
| Auth | bcryptjs |
| Build | Vite with dev proxy to Express API |

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [MongoDB Community Server](https://www.mongodb.com/try/download/community) installed locally (`mongod` must be available in your PATH)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file and adjust if needed
cp .env.example .env

# 3. Start the local MongoDB instance (runs mongod pointed at ./mongodb-data)
npm run mongo:start

# 4. In a second terminal, start the Express API server
npm run server

# 5. In a third terminal, start the Vite dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

## Environment variables

See `.env.example` for all variables. Defaults work out of the box for local development.

```
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB_NAME=medizyra
PORT=4000
VITE_API_BASE_URL=/api
```

## Demo credentials

The database is pre-seeded with the following accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@medizyra.demo` | `Admin@123` |
| Doctor | `aisha@medizyra.demo` | `Doctor@123` |
| Patient | `patient@medizyra.demo` | `Patient@123` |

Additional doctor and patient accounts are included in the seed data.

## Project structure

```
├── server/
│   ├── index.js        Express app and all API routes
│   ├── db.js           MongoDB connection management
│   └── seedData.js     Seed doctors, patients, and appointments
├── src/
│   ├── pages/          Route-level page components
│   ├── components/     Shared UI components
│   ├── context/        React context for global app state
│   ├── lib/            API client, utilities, and data helpers
│   ├── data/           Static site content and doctor catalogue
│   └── assets/         Images, video, and icons
├── scripts/
│   └── mongo-start.mjs Start local mongod instance
├── public/             Static files served by Vite
├── .env.example        Environment variable template
└── vite.config.js      Vite config with /api proxy to Express
```

## Building for production

```bash
npm run build
```

The compiled output goes to `dist/`. The Express server is configured to serve `dist/` as static files, so after building you only need to run:

```bash
npm run server
```

and visit `http://localhost:4000`.

## Resetting demo data

A **Reset Demo** button is available in the site footer. This wipes all appointments, doctors, users, and contact messages and restores the original seed state, which is useful during presentations or testing.

## MongoDB data directory

MongoDB data files are stored locally in `mongodb-data/` and are git-ignored — they never get uploaded to the repository.
