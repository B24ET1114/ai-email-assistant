from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.database import init_db, get_db
from app.ai_agent import analyze_email, draft_reply, handle_conflict, summarize_thread
from app.calendar_service import check_conflict, save_schedule, get_all_schedules
import json
import re

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
    Timer(60, auto_fetch_emails).start()
    print("Auto-fetch started - checking Gmail every 1 minutes!")

class EmailInput(BaseModel):
    sender: str
    subject: str
    body: str

class ReplyInput(BaseModel):
    email_id: int
    user_input: str

class ScheduleInput(BaseModel):
    email_id: int
    title: str
    start_time: str
    attendees: str

class WorkingHoursInput(BaseModel):
    start: str
    end: str
    timezone: str
    name: str

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
    return {"email_id": email_id, "analysis": analysis}

@app.get("/emails")
def get_emails():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM emails ORDER BY received_at DESC")
    emails = [dict(row) for row in cursor.fetchall()]
    db.close()
    return emails

@app.get("/emails/priority")
def get_priority_emails():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM emails 
        ORDER BY 
            CASE priority 
                WHEN 'high' THEN 1 
                WHEN 'medium' THEN 2 
                WHEN 'low' THEN 3 
            END,
            received_at DESC
    """)
    emails = [dict(row) for row in cursor.fetchall()]
    db.close()
    return emails

@app.get("/emails/thread/{sender}")
def get_thread_summary(sender: str):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM emails 
        WHERE sender = ? 
        ORDER BY received_at ASC
    """, (sender,))
    emails = [dict(row) for row in cursor.fetchall()]
    db.close()
    if not emails:
        raise HTTPException(status_code=404, detail="No emails found from this sender")
    if len(emails) == 1:
        return {"summary": emails[0]["summary"], "email_count": 1}
    summary = summarize_thread(emails)
    return {"summary": summary, "email_count": len(emails), "sender": sender}

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

    # Get user name from settings
    db2 = get_db()
    cursor2 = db2.cursor()
    try:
        cursor2.execute("SELECT value FROM settings WHERE key = 'name'")
        row = cursor2.fetchone()
        user_name = row[0] if row else "User"
    except:
        user_name = "User"
    db2.close()

    ai_reply = draft_reply(
        sender=email["sender"],
        original_email=email["body"],
        user_input=reply.user_input,
        user_name=user_name
    )

    # Actually send the email via Gmail
    try:
        from app.email_reader import send_email
        email_match = re.search(r'<(.+?)>', email["sender"])
        to_address = email_match.group(1) if email_match else email["sender"]
        send_email(
            to=to_address,
            subject=f"Re: {email['subject']}",
            body=ai_reply
        )
    except Exception as e:
        print(f"Email send error: {e}")

    cursor.execute("""
        INSERT INTO replies (email_id, user_input, ai_reply)
        VALUES (?, ?, ?)
    """, (reply.email_id, reply.user_input, ai_reply))
    cursor.execute("UPDATE emails SET status = 'replied' WHERE id = ?", (reply.email_id,))
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

@app.post("/emails/simulate")
def simulate_incoming_email():
    import random
    test_emails = [
        {
            "sender": "client@business.com",
            "subject": "Urgent: Contract Review",
            "body": "Hi, I need to urgently discuss the contract terms. Can we meet today at 5pm? This is time sensitive."
        },
        {
            "sender": "teammate@company.com",
            "subject": "Quick Sync",
            "body": "Hey, can we have a quick sync tomorrow at 11am to discuss the project progress?"
        },
        {
            "sender": "hr@company.com",
            "subject": "Performance Review",
            "body": "Hi, your performance review is scheduled for Friday at 2pm. Please confirm your availability."
        },
        {
            "sender": "investor@venture.com",
            "subject": "Investment Discussion",
            "body": "Hello, we are interested in your project. Can we schedule a call this week at 3pm to discuss further?"
        },
        {
            "sender": "professor@university.com",
            "subject": "Project Deadline Reminder",
            "body": "This is a reminder that your project submission is due next Monday. Please confirm you are on track."
        }
    ]
    email = random.choice(test_emails)
    analysis = analyze_email(email["sender"], email["subject"], email["body"])
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO emails (sender, subject, body, summary, intent, priority)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        email["sender"],
        email["subject"],
        email["body"],
        analysis.get("summary"),
        analysis.get("intent"),
        analysis.get("priority")
    ))
    db.commit()
    db.close()
    return {"message": "Simulated email received!", "email": email}

@app.get("/gmail/fetch")
def fetch_gmail():
    try:
        from app.email_reader import fetch_latest_emails
        emails = fetch_latest_emails(max_results=10)
        saved = []
        for email in emails:
            analysis = analyze_email(email['sender'], email['subject'], email['body'])
            db = get_db()
            cursor = db.cursor()
            cursor.execute("""
                INSERT INTO emails (sender, subject, body, summary, intent, priority)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                email['sender'],
                email['subject'],
                email['body'],
                analysis.get('summary'),
                analysis.get('intent'),
                analysis.get('priority')
            ))
            db.commit()
            db.close()
            saved.append(email['subject'])
        return {"fetched": len(saved), "emails": saved}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/gmail/auth")
def gmail_auth():
    try:
        from app.email_reader import get_gmail_service
        get_gmail_service()
        return {"status": "Gmail connected successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/settings/working-hours")
def get_working_hours():
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute("SELECT key, value FROM settings")
        rows = dict(cursor.fetchall())
        db.close()
        return {
            "start": rows.get("start", "09:00"),
            "end": rows.get("end", "18:00"),
            "timezone": rows.get("timezone", "Asia/Kolkata"),
            "name": rows.get("name", "User")
        }
    except:
        db.close()
        return {
            "start": "09:00",
            "end": "18:00",
            "timezone": "Asia/Kolkata",
            "name": "User"
        }

@app.post("/settings/working-hours")
def save_working_hours(settings: WorkingHoursInput):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    cursor.execute("INSERT OR REPLACE INTO settings VALUES ('start', ?)", (settings.start,))
    cursor.execute("INSERT OR REPLACE INTO settings VALUES ('end', ?)", (settings.end,))
    cursor.execute("INSERT OR REPLACE INTO settings VALUES ('timezone', ?)", (settings.timezone,))
    cursor.execute("INSERT OR REPLACE INTO settings VALUES ('name', ?)", (settings.name,))
    db.commit()
    db.close()
    return {"message": "Settings saved!"}
@app.delete("/reset")
def reset_database():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("DELETE FROM emails")
    cursor.execute("DELETE FROM schedules")
    cursor.execute("DELETE FROM replies")
    db.commit()
    db.close()
    return {"message": "Database cleared for fresh demo!"}
    from threading import Timer

def auto_fetch_emails():
    try:
        from app.email_reader import fetch_latest_emails
        emails = fetch_latest_emails(max_results=5)
        for email in emails:
            analysis = analyze_email(email['sender'], email['subject'], email['body'])
            db = get_db()
            cursor = db.cursor()
            cursor.execute("""
                INSERT INTO emails (sender, subject, body, summary, intent, priority)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                email['sender'],
                email['subject'],
                email['body'],
                analysis.get('summary'),
                analysis.get('intent'),
                analysis.get('priority')
            ))
            db.commit()
            db.close()
        print(f"Auto-fetched {len(emails)} emails")
    except Exception as e:
        print(f"Auto-fetch error: {e}")
    finally:
        Timer(300, auto_fetch_emails).start()
        @app.get("/analytics")
def get_analytics():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT COUNT(*) FROM emails")
    total = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM emails WHERE status = 'replied'")
    replied = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM emails WHERE priority = 'high'")
    high = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM schedules")
    meetings = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM emails WHERE intent = 'meeting_request'")
    meeting_requests = cursor.fetchone()[0]
    db.close()
    return {
        "total_emails": total,
        "replied": replied,
        "pending": total - replied,
        "high_priority": high,
        "meetings_scheduled": meetings,
        "meeting_requests": meeting_requests,
        "response_rate": round((replied / total * 100) if total > 0 else 0, 1)
    }
from app.ai_agent import analyze_email, draft_reply, handle_conflict, summarize_thread, extract_availability, find_common_slots

class AvailabilityInput(BaseModel):
    email_id: int

@app.post("/availability/extract")
def extract_email_availability(data: AvailabilityInput):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM emails WHERE id = ?", (data.email_id,))
    email = cursor.fetchone()
    db.close()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email = dict(email)
    availability = extract_availability(email["body"], email["sender"])
    return availability

@app.post("/availability/overlap")
def find_overlap(email_ids: list[int]):
    availabilities = []
    for email_id in email_ids:
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT * FROM emails WHERE id = ?", (email_id,))
        email = cursor.fetchone()
        db.close()
        if email:
            email = dict(email)
            availability = extract_availability(email["body"], email["sender"])
            availabilities.append(availability)
    if not availabilities:
        raise HTTPException(status_code=404, detail="No emails found")
    common_slots = find_common_slots(availabilities)
    return {"common_slots": common_slots, "participants": len(availabilities)}

@app.get("/schedule/check-duplicate")
def check_duplicate(title: str, start_time: str):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM schedules 
        WHERE event_title = ? AND start_time = ?
    """, (title, start_time))
    existing = cursor.fetchone()
    db.close()
    return {"duplicate": existing is not None}