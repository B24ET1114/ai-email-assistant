import os
import base64
import json
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar'
]

CREDENTIALS_FILE = 'credentials.json'
TOKEN_FILE = 'token.json'

def get_gmail_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
    return build('gmail', 'v1', credentials=creds)

def get_calendar_service():
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    return build('calendar', 'v3', credentials=creds)

def fetch_latest_emails(max_results: int = 10) -> list:
    service = get_gmail_service()
    results = service.users().messages().list(
        userId='me',
        maxResults=max_results,
        labelIds=['INBOX'],
        q='is:unread'
    ).execute()
    
    messages = results.get('messages', [])
    emails = []
    
    for msg in messages:
        msg_data = service.users().messages().get(
            userId='me',
            id=msg['id'],
            format='full'
        ).execute()
        
        headers = msg_data['payload']['headers']
        subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
        sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
        
        body = ''
        if 'parts' in msg_data['payload']:
            for part in msg_data['payload']['parts']:
                if part['mimeType'] == 'text/plain':
                    body = base64.urlsafe_b64decode(
                        part['body']['data']
                    ).decode('utf-8')
                    break
        elif 'body' in msg_data['payload']:
            if 'data' in msg_data['payload']['body']:
                body = base64.urlsafe_b64decode(
                    msg_data['payload']['body']['data']
                ).decode('utf-8')
        
        emails.append({
            'gmail_id': msg['id'],
            'sender': sender,
            'subject': subject,
            'body': body[:1000]
        })
    
    return emails

def send_email(to: str, subject: str, body: str) -> bool:
    try:
        service = get_gmail_service()
        message_text = f"To: {to}\nSubject: {subject}\n\n{body}"
        encoded = base64.urlsafe_b64encode(message_text.encode()).decode()
        service.users().messages().send(
            userId='me',
            body={'raw': encoded}
        ).execute()
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

def create_calendar_event(title: str, start_time: str, end_time: str, attendees: list) -> str:
    try:
        service = get_calendar_service()
        event = {
            'summary': title,
            'start': {'dateTime': start_time, 'timeZone': 'Asia/Kolkata'},
            'end': {'dateTime': end_time, 'timeZone': 'Asia/Kolkata'},
            'attendees': [{'email': a} for a in attendees]
        }
        result = service.events().insert(
            calendarId='primary',
            body=event,
            sendUpdates='all'
        ).execute()
        return result.get('id', '')
    except Exception as e:
        print(f"Error creating calendar event: {e}")
        return ''
    