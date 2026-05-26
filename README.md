# PulseChain

Pharma demand planning SaaS platform — AI-powered forecasting, inventory intelligence, and social demand signals.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI + SQLAlchemy + Alembic |
| ML / Forecasting | Prophet, XGBoost, statsmodels |
| Social Signals | Google Trends, Reddit (PRAW), NewsAPI |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State | Zustand |
| Charts | Recharts |
| Database | PostgreSQL 16 |
| Auth | JWT (python-jose) + bcrypt |

## Quick Start

### 1. Environment

```bash
cp .env.example .env
# Edit .env with your secrets and API keys
```

### 2. Backend (local)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend (local)

```bash
cd frontend
npm install
npm run dev
```

### 4. Docker Compose (full stack)

```bash
docker-compose up --build
```

Services:
- Frontend → http://localhost:5173
- Backend API → http://localhost:8000
- API Docs → http://localhost:8000/docs
- PostgreSQL → localhost:5432

## Brand Colors

| Token | Hex |
|-------|-----|
| `--color-navy` | `#0A1628` |
| `--color-teal` | `#00D4B4` |
| `--color-orange` | `#FF6B35` |
