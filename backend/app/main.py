from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.database import init_db, get_db
from app.ai_agent import analyze_email, draft_reply, handle_conflict, summarize_thread, extract_availability, find_common_slots
from app.calendar_service import check_conflict, save_schedule, get_all_schedules
import json
import re
import datetime
import requests as http_requests
from threading import Timer

app = FastAPI(title="AI Email Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
                email['sender'], email['subject'], email['body'],
                analysis.get('summary'), analysis.get('intent'), analysis.get('priority')
            ))
            db.commit()
            db.close()
        print(f"Auto-fetched {len(emails)} emails")
    except Exception as e:
        print(f"Auto-fetch error: {e}")
    finally:
        Timer(60, auto_fetch_emails).start()

@app.on_event("startup")
def startup():
    init_db()
    Timer(60, auto_fetch_emails).start()
    print("Auto-fetch started - checking Gmail every 1 minute!")

# ── Models ──────────────────────────────────────────────

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

class AvailabilityInput(BaseModel):
    email_id: int

# ── Root ────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "AI Email Assistant is running ✓"}

# ── Emails ──────────────────────────────────────────────

@app.post("/emails/receive")
def receive_email(email: EmailInput):
    analysis = analyze_email(email.sender, email.subject, email.body)
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO emails (sender, subject, body, summary, intent, priority)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        email.sender, email.subject, email.body,
        analysis.get("summary"), analysis.get("intent"), analysis.get("priority")
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

@app.get("/emails/unread/count")
def get_unread_count():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT COUNT(*) FROM emails WHERE is_read = 0")
    count = cursor.fetchone()[0]
    db.close()
    return {"unread": count}

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

    try:
        cursor.execute("SELECT value FROM settings WHERE key = 'name'")
        row = cursor.fetchone()
        user_name = row[0] if row else "User"
    except:
        user_name = "User"

    ai_reply = draft_reply(
        sender=email["sender"],
        original_email=email["body"],
        user_input=reply.user_input,
        user_name=user_name
    )

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

@app.patch("/emails/{email_id}/read")
def mark_as_read(email_id: int):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("UPDATE emails SET is_read = 1 WHERE id = ?", (email_id,))
    db.commit()
    db.close()
    return {"updated": True}

@app.patch("/emails/{email_id}/status")
def update_status(email_id: int, status: str):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("UPDATE emails SET status = ? WHERE id = ?", (status, email_id))
    db.commit()
    db.close()
    return {"updated": True}

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
        email["sender"], email["subject"], email["body"],
        analysis.get("summary"), analysis.get("intent"), analysis.get("priority")
    ))
    db.commit()
    db.close()
    return {"message": "Simulated email received!", "email": email}

# ── Schedule ─────────────────────────────────────────────

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

# ── Availability ──────────────────────────────────────────

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

# ── Gmail ─────────────────────────────────────────────────

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
                email['sender'], email['subject'], email['body'],
                analysis.get('summary'), analysis.get('intent'), analysis.get('priority')
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

# ── Settings ──────────────────────────────────────────────

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
        return {"start": "09:00", "end": "18:00", "timezone": "Asia/Kolkata", "name": "User"}

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

# ── Analytics ─────────────────────────────────────────────

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
    cursor.execute("SELECT COUNT(*) FROM emails WHERE is_read = 0")
    unread = cursor.fetchone()[0]
    db.close()
    return {
        "total_emails": total,
        "replied": replied,
        "pending": total - replied,
        "high_priority": high,
        "meetings_scheduled": meetings,
        "meeting_requests": meeting_requests,
        "unread": unread,
        "response_rate": round((replied / total * 100) if total > 0 else 0, 1)
    }

# ── Weather ───────────────────────────────────────────────

@app.get("/weather")
def get_weather():
    try:
        url = "https://wttr.in/Pune?format=j1"
        res = http_requests.get(url, timeout=5)
        data = res.json()
        temp = data['current_condition'][0]['temp_C']
        weather_desc = data['current_condition'][0]['weatherDesc'][0]['value'].lower()
        humidity = data['current_condition'][0]['humidity']

        if any(w in weather_desc for w in ['rain', 'drizzle', 'shower']):
            weather_type = 'rainy'
        elif any(w in weather_desc for w in ['thunder', 'storm']):
            weather_type = 'storm'
        elif any(w in weather_desc for w in ['cloud', 'overcast']):
            weather_type = 'cloudy'
        elif any(w in weather_desc for w in ['snow', 'blizzard']):
            weather_type = 'snow'
        elif any(w in weather_desc for w in ['fog', 'mist', 'haze']):
            weather_type = 'foggy'
        else:
            weather_type = 'sunny'

        if weather_type in ['rainy', 'storm', 'snow']:
            suggestion = "Bad weather — prefer online meetings today"
            alert = True
        elif weather_type == 'foggy':
            suggestion = "Foggy conditions — consider online meetings"
            alert = True
        else:
            suggestion = "Weather looks good for in-person meetings"
            alert = False

        hour = datetime.datetime.now().hour
        if 5 <= hour < 12:
            greeting = "Good morning"
            time_of_day = "morning"
        elif 12 <= hour < 17:
            greeting = "Good afternoon"
            time_of_day = "afternoon"
        elif 17 <= hour < 21:
            greeting = "Good evening"
            time_of_day = "evening"
        else:
            greeting = "Good night"
            time_of_day = "night"

        return {
            "greeting": greeting,
            "time_of_day": time_of_day,
            "temp_c": temp,
            "weather_desc": weather_desc,
            "weather_type": weather_type,
            "humidity": humidity,
            "suggestion": suggestion,
            "alert": alert
        }
    except Exception as e:
        hour = datetime.datetime.now().hour
        if 5 <= hour < 12:
            greeting, time_of_day = "Good morning", "morning"
        elif 12 <= hour < 17:
            greeting, time_of_day = "Good afternoon", "afternoon"
        elif 17 <= hour < 21:
            greeting, time_of_day = "Good evening", "evening"
        else:
            greeting, time_of_day = "Good night", "night"
        return {
            "greeting": greeting,
            "time_of_day": time_of_day,
            "temp_c": "N/A",
            "weather_desc": "unavailable",
            "weather_type": "sunny",
            "humidity": "N/A",
            "suggestion": "Weather data unavailable",
            "alert": False
        }

# ── Reset ─────────────────────────────────────────────────

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
@app.post("/emails/{email_id}/snooze")
def snooze_email(email_id: int, hours: int = 24):
    db = get_db()
    cursor = db.cursor()
    snooze_until = (datetime.datetime.now() + datetime.timedelta(hours=hours)).isoformat()
    cursor.execute("UPDATE emails SET status = 'snoozed', snooze_until = ? WHERE id = ?", (snooze_until, email_id))
    db.commit()
    db.close()
    return {"message": f"Email snoozed for {hours} hours", "snooze_until": snooze_until}

@app.get("/emails/snoozed/check")
def check_snoozed():
    db = get_db()
    cursor = db.cursor()
    now = datetime.datetime.now().isoformat()
    cursor.execute("""
        UPDATE emails SET status = 'pending'
        WHERE status = 'snoozed' AND snooze_until <= ?
    """, (now,))
    db.commit()
    count = cursor.rowcount
    db.close()
    return {"unsnoozed": count}
def send_daily_digest():
    try:
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT COUNT(*) FROM emails WHERE status = 'pending'")
        pending = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM emails WHERE priority = 'high' AND status = 'pending'")
        high = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM schedules WHERE start_time >= ?", (datetime.datetime.now().isoformat(),))
        meetings = cursor.fetchone()[0]
        cursor.execute("SELECT * FROM emails WHERE status = 'pending' ORDER BY received_at DESC LIMIT 3")
        recent = [dict(row) for row in cursor.fetchall()]
        db.close()

        digest_body = f"""Good morning!

Here is your daily email digest:

INBOX SUMMARY
- Pending emails: {pending}
- High priority: {high}
- Upcoming meetings: {meetings}

RECENT PENDING EMAILS:
"""
        for email in recent:
            digest_body += f"\n- From: {email['sender']}\n  Subject: {email['subject']}\n  Summary: {email['summary']}\n"

        digest_body += """
---
This digest was sent by your AI Email Assistant.
"""
        from app.email_reader import send_email
        from app.database import get_db as gdb
        db2 = gdb()
        cursor2 = db2.cursor()
        cursor2.execute("SELECT value FROM settings WHERE key = 'digest_email'")
        row = cursor2.fetchone()
        db2.close()
        if row:
            send_email(to=row[0], subject="Your Daily Email Digest", body=digest_body)
            print("Daily digest sent!")
    except Exception as e:
        print(f"Digest error: {e}")
    finally:
        now = datetime.datetime.now()
        tomorrow_9am = now.replace(hour=9, minute=0, second=0) + datetime.timedelta(days=1)
        delay = (tomorrow_9am - now).total_seconds()
        Timer(delay, send_daily_digest).start()

@app.post("/digest/send-now")
def send_digest_now():
    send_daily_digest()
    return {"message": "Digest sent!"}

@app.post("/digest/setup")
def setup_digest(email: str):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("INSERT OR REPLACE INTO settings VALUES ('digest_email', ?)", (email,))
    db.commit()
    db.close()
    return {"message": f"Daily digest will be sent to {email} every morning at 9am"}
from app.ai_agent import analyze_email, draft_reply, handle_conflict, summarize_thread, extract_availability, find_common_slots, generate_meeting_agenda, detect_ambiguity

@app.get("/emails/{email_id}/ambiguity")
def check_ambiguity(email_id: int):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM emails WHERE id = ?", (email_id,))
    email = cursor.fetchone()
    db.close()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email = dict(email)
    result = detect_ambiguity(email["body"])
    return result
@app.get("/emails/{email_id}/suggestions")
def get_reply_suggestions(email_id: int):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM emails WHERE id = ?", (email_id,))
    email = cursor.fetchone()
    db.close()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    email = dict(email)
    suggestions = suggest_replies(
        email["sender"], email["subject"],
        email["body"], email["intent"]
    )
    return {"suggestions": suggestions}
@app.get("/actions")
def get_ai_actions():
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM ai_actions
        ORDER BY created_at DESC
        LIMIT 20
    """)
    actions = [dict(row) for row in cursor.fetchall()]
    db.close()
    return actions

@app.post("/actions/log")
def log_action(action_type: str, email_id: int, description: str, result: str):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO ai_actions (action_type, email_id, description, result)
        VALUES (?, ?, ?, ?)
    """, (action_type, email_id, description, result))
    db.commit()
    action_id = cursor.lastrowid
    db.close()
    return {"action_id": action_id}

@app.post("/actions/{action_id}/undo")
def undo_action(action_id: int):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM ai_actions WHERE id = ?", (action_id,))
    action = cursor.fetchone()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    action = dict(action)
    if action["undone"]:
        raise HTTPException(status_code=400, detail="Already undone")
    if action["action_type"] == "auto_decline":
        cursor.execute("UPDATE emails SET status = 'pending' WHERE id = ?", (action["email_id"],))
    elif action["action_type"] == "schedule":
        cursor.execute("DELETE FROM schedules WHERE email_id = ?", (action["email_id"],))
    elif action["action_type"] == "reply":
        cursor.execute("UPDATE emails SET status = 'pending' WHERE id = ?", (action["email_id"],))
    cursor.execute("UPDATE ai_actions SET undone = 1, can_undo = 0 WHERE id = ?", (action_id,))
    db.commit()
    db.close()
    return {"message": "Action undone successfully"}