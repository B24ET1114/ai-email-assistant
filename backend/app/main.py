from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.database import init_db, get_db
from app.ai_agent import analyze_email, draft_reply, handle_conflict
import json

app = FastAPI(title="AI Email Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

class EmailInput(BaseModel):
    sender: str
    subject: str
    body: str

class ReplyInput(BaseModel):
    email_id: int
    user_input: str

@app.get("/")
def root():
    return {"status": "AI Email Assistant is running ✓"}

@app.post("/emails/receive")
def receive_email(email: EmailInput):
    analysis = analyze_email(email.sender, email.subject, email.body)
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO emails (sender, subject, body, summary, intent, priority)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        email.sender,
        email.subject,
        email.body,
        analysis.get("summary"),
        analysis.get("intent"),
        analysis.get("priority")
    ))
    db.commit()
    email_id = cursor.lastrowid
    db.close()
    return {
        "email_id": email_id,
        "analysis": analysis
    }

@app.get("/emails")
def get_emails():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM emails ORDER BY received_at DESC")
    emails = [dict(row) for row in cursor.fetchall()]
    db.close()
    return emails

@app.get("/emails/{email_id}")
def get_email(email_id: int):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM emails WHERE id = ?", (email_id,))
    email = cursor.fetchone()
    db.close()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    return dict(email)

@app.post("/emails/reply")
def reply_to_email(reply: ReplyInput):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM emails WHERE id = ?", (reply.email_id,))
    email = cursor.fetchone()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email = dict(email)
    ai_reply = draft_reply(
        sender=email["sender"],
        original_email=email["body"],
        user_input=reply.user_input
    )
    cursor.execute("""
        INSERT INTO replies (email_id, user_input, ai_reply)
        VALUES (?, ?, ?)
    """, (reply.email_id, reply.user_input, ai_reply))
    cursor.execute("""
        UPDATE emails SET status = 'replied' WHERE id = ?
    """, (reply.email_id,))
    db.commit()
    db.close()
    return {"reply": ai_reply}

@app.patch("/emails/{email_id}/status")
def update_status(email_id: int, status: str):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("UPDATE emails SET status = ? WHERE id = ?", (status, email_id))
    db.commit()
    db.close()
    return {"updated": True}
from app.calendar_service import check_conflict, save_schedule, get_all_schedules

class ScheduleInput(BaseModel):
    email_id: int
    title: str
    start_time: str
    attendees: str

@app.post("/schedule/check")
def check_schedule_conflict(time_str: str):
    return check_conflict(time_str)

@app.post("/schedule/save")
def create_schedule(schedule: ScheduleInput):
    result = save_schedule(
        schedule.email_id,
        schedule.title,
        schedule.start_time,
        schedule.attendees
    )
    return result

@app.get("/schedule")
def get_schedules():
    return get_all_schedules()