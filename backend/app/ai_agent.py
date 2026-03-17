from groq import Groq
import os
from dotenv import load_dotenv
import json

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def analyze_email(sender: str, subject: str, body: str) -> dict:
    prompt = f"""
    Analyze this email and return a JSON object with these exact fields:
    - summary: 2 sentence summary of the email
    - intent: one of "meeting_request", "follow_up", "general", "conflict"
    - priority: one of "high", "medium", "low"
    - time_slots: list of any time mentions found (empty list if none)
    - requires_response: true or false

    Email:
    From: {sender}
    Subject: {subject}
    Body: {body}

    Return only valid JSON, nothing else.
    """
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1
    )
    text = response.choices[0].message.content.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())

def draft_reply(sender: str, original_email: str, user_input: str, context: str = "") -> str:
    prompt = f"""
    You are an AI email assistant. Draft a professional email reply.

    Original email from {sender}:
    {original_email}

    The user's instruction: "{user_input}"

    {f"Context: {context}" if context else ""}

    Write a complete professional email reply based on the user's instruction.
    End with this exact disclaimer on a new line:
    ---
    This message was sent by an experimental AI email assistant on behalf of the user.

    Return only the email body, nothing else.
    """
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7
    )
    return response.choices[0].message.content.strip()

def handle_conflict(sender: str, requested_time: str) -> str:
    prompt = f"""
    Draft a polite professional email declining a meeting request due to scheduling conflict.
    
    The email is from: {sender}
    They requested a meeting at: {requested_time}
    
    Keep it short, polite, suggest they propose another time.
    End with this disclaimer:
    ---
    This message was sent by an experimental AI email assistant on behalf of the user.
    
    Return only the email body, nothing else.
    """
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7
    )
    return response.choices[0].message.content.strip()
def summarize_thread(emails: list) -> str:
    thread_text = ""
    for i, email in enumerate(emails):
        thread_text += f"\nEmail {i+1} from {email['sender']}:\n{email['body']}\n"
    
    prompt = f"""
    Summarize this email thread in 3-4 sentences. 
    Focus on: what was discussed, what was decided, what is the current status.
    
    Thread:
    {thread_text}
    
    Return only the summary, nothing else.
    """
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )
    return response.choices[0].message.content.strip()