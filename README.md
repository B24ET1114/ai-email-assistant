# AI Email Assistant 🤖

An AI-powered email coordination assistant built for INSPIRON 5.0 Hackathon.

## What it does
- Reads incoming emails and generates AI summaries
- Detects intent (meeting request, follow-up, general)
- Assigns priority (high, medium, low)
- Detects scheduling conflicts automatically
- Auto-declines conflicting meetings
- Drafts professional replies from your one-word response
- Summarizes full email threads
- Manages your schedule

## Tech Stack
- **Backend:** FastAPI + Python
- **Frontend:** React + TypeScript + TailwindCSS
- **AI:** Groq (LLaMA 3.1)
- **Database:** SQLite

## How to run

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment Variables
Create `backend/.env`:
```
GROQ_API_KEY=your_key_here
```

## Demo
- Backend API: http://localhost:8000/docs
- Frontend: http://localhost:5173