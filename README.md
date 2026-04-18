# NovaCare Healthcare Solutions

A full-stack hospital management system built with the MERN stack (MongoDB, Express, React, Node.js), deployed on AWS with an integrated AI health assistant powered by AWS Bedrock (DeepSeek).

🌐 **Live Demo:** https://www.nova-care.xyz/

---

## Features

### AI Health Assistant (AWS Bedrock + DeepSeek)
A floating chat widget embedded in the site that helps patients find the right specialist:

- Conversational symptom triage — asks follow-up questions before recommending
- Recommends doctors from the live catalogue based on symptoms
- Advises **Teleconsult vs In-clinic** based on condition severity
- Classifies priority: **Routine / Urgent / Emergency**
- Automatically pre-fills the appointment booking form with AI-gathered data
- Emergency detection — flags life-threatening symptoms immediately
- Conversation logs stored in **AWS DynamoDB** with 90-day auto-expiry TTL
- Powered by **AWS Bedrock** (DeepSeek V3) via the Converse API

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

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Vite 8 |
| Backend | Node.js, Express 5 |
| Database | MongoDB (local via official driver) |
| Auth | bcryptjs |
| AI Assistant | AWS Bedrock — DeepSeek V3 (Converse API) |
| AI Chat Logs | AWS DynamoDB |
| Build | Vite with dev proxy to Express API |

---

## AWS Architecture

```
User Browser
     │
     ▼
Route 53 (DNS)
     │
     ▼
CloudFront (HTTPS, CDN)
     │
     ├──► S3                   ← React frontend (static assets, images, CSS, JS)
     │
     └──► Application Load Balancer
               │
               ▼
            EC2 t3.micro  (Node.js / Express API — eu-north-1)
               │
               ├──► MongoDB 7       ← users, appointments (local on EC2)
               ├──► AWS Bedrock     ← DeepSeek V3 AI responses
               └──► AWS DynamoDB    ← AI chatbot recommendation logs
```

### AWS Services Used

| Service | Purpose |
|---|---|
| **EC2 (t3.micro)** | Runs Node.js Express API server |
| **S3** | Hosts compiled React frontend |
| **CloudFront** | CDN + HTTPS for frontend and API |
| **Application Load Balancer** | Routes traffic to EC2, health checks |
| **AWS Bedrock** | DeepSeek V3 AI model inference |
| **DynamoDB** | Persistent AI conversation logs |
| **IAM Role** | EC2 accesses Bedrock + DynamoDB without hardcoded keys |
| **SSM Parameter Store** | Secure app configuration storage |
| **VPC + Security Groups** | Network isolation — EC2 only reachable via ALB |

---

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [MongoDB Community Server](https://www.mongodb.com/try/download/community) installed locally
- AWS account with Bedrock access (for AI assistant)

### Getting started

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# 3. Start local MongoDB
npm run mongo:start

# 4. Start the Express API server (second terminal)
npm run server

# 5. Start the Vite dev server (third terminal)
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Environment Variables

```env
# MongoDB
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB_NAME=NovaCare
PORT=4000

# AWS Bedrock — AI assistant
BEDROCK_REGION=us-east-1
BEDROCK_MODEL_ID=deepseek.v3-v1:0

# AWS general (DynamoDB region)
AWS_REGION=eu-north-1
```

> **Note:** No API keys are needed for Bedrock or DynamoDB on EC2 — the IAM role attached to the instance grants access automatically. For local development, ensure your AWS CLI is configured (`aws configure`).

---

## Demo Credentials

The database is pre-seeded with the following accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@NovaCare.demo` | `Admin@123` |
| Doctor | `aisha@NovaCare.demo` | `Doctor@123` |
| Patient | `patient@NovaCare.demo` | `Patient@123` |

Additional doctor and patient accounts are included in the seed data.

---

## Project Structure

```
├── server/
│   ├── index.js          Express app and all API routes
│   ├── aiAssistant.js    AWS Bedrock AI integration + DynamoDB logging
│   ├── db.js             MongoDB connection management
│   └── seedData.js       Seed doctors, patients, and appointments
├── src/
│   ├── pages/            Route-level page components
│   ├── components/
│   │   ├── AIAssistant.jsx   Floating AI chat widget
│   │   └── SiteChrome.jsx    Header and footer
│   ├── context/          React context for global app state
│   ├── data/             Static site content and doctor catalogue
│   └── assets/           Images, video, and icons
├── scripts/
│   └── mongo-start.mjs   Start local mongod instance
├── .env.example          Environment variable template
└── vite.config.js        Vite config with /api proxy to Express
```

---

## Building for Production

```bash
npm run build
```

The compiled output goes to `dist/`. To deploy to AWS S3:

```bash
# Sync all assets (immutable cache)
aws s3 sync dist/ s3://your-bucket/ --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html"

# Upload index.html with no-cache
aws s3 cp dist/index.html s3://your-bucket/index.html \
  --cache-control "no-cache,no-store,must-revalidate"

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

---

## Resetting Demo Data

A **Reset Demo** button is available in the site footer. This wipes all appointments, doctors, users, and contact messages and restores the original seed state — useful during presentations or testing.
