from datetime import datetime, timedelta
from app.database import get_db
import dateparser

def check_conflict(requested_time_str: str) -> dict:
    if not requested_time_str:
        return {"conflict": False, "existing_event": None}
    
    requested_time = dateparser.parse(requested_time_str)
    if not requested_time:
        return {"conflict": False, "existing_event": None}
    
    window_start = requested_time - timedelta(hours=1)
    window_end = requested_time + timedelta(hours=1)
    
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT * FROM schedules 
        WHERE start_time BETWEEN ? AND ?
    """, (window_start.isoformat(), window_end.isoformat()))
    
    existing = cursor.fetchone()
    db.close()
    
    if existing:
        return {
            "conflict": True,
            "existing_event": dict(existing)
        }
    return {"conflict": False, "existing_event": None}

def save_schedule(email_id: int, title: str, start_time_str: str, attendees: str) -> dict:
    parsed_time = dateparser.parse(start_time_str)
    if not parsed_time:
        parsed_time = datetime.now() + timedelta(days=1)
    
    end_time = parsed_time + timedelta(hours=1)
    
    db = get_db()
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO schedules (email_id, event_title, start_time, end_time, attendees)
        VALUES (?, ?, ?, ?, ?)
    """, (
        email_id,
        title,
        parsed_time.isoformat(),
        end_time.isoformat(),
        attendees
    ))
    db.commit()
    schedule_id = cursor.lastrowid
    db.close()
    
    return {
        "id": schedule_id,
        "title": title,
        "start_time": parsed_time.isoformat(),
        "end_time": end_time.isoformat(),
        "attendees": attendees
    }

def get_all_schedules() -> list:
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT * FROM schedules ORDER BY start_time ASC")
    schedules = [dict(row) for row in cursor.fetchall()]
    db.close()
    return schedules