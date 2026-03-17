import { useState, useEffect } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000'

interface Email {
  id: number
  sender: string
  subject: string
  body: string
  summary: string
  intent: string
  priority: string
  status: string
  received_at: string
}

interface Schedule {
  id: number
  email_id: number
  event_title: string
  start_time: string
  end_time: string
  attendees: string
}

interface Settings {
  name: string
  email: string
  working_hours_start: string
  working_hours_end: string
  timezone: string
}

export default function App() {
  const [emails, setEmails] = useState<Email[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selected, setSelected] = useState<Email | null>(null)
  const [userInput, setUserInput] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'inbox' | 'schedule' | 'settings'>('inbox')
  const [notification, setNotification] = useState('')
  const [settings, setSettings] = useState<Settings>({
    name: 'Pranav',
    email: 'pranavkelapure2024.etc@mmcoe.edu.in',
    working_hours_start: '09:00',
    working_hours_end: '18:00',
    timezone: 'Asia/Kolkata'
  })
  const [settingsForm, setSettingsForm] = useState<Settings>({ ...settings })

  useEffect(() => {
    fetchEmails()
    fetchSchedules()
    fetchSettings()
    const interval = setInterval(() => {
      fetchEmails()
      fetchSchedules()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchEmails = async () => {
    const res = await axios.get(`${API}/emails/priority`)
    setEmails(res.data)
  }

  const fetchSchedules = async () => {
    const res = await axios.get(`${API}/schedule`)
    setSchedules(res.data)
  }

  const fetchSettings = async () => {
    const res = await axios.get(`${API}/settings`)
    setSettings(res.data)
    setSettingsForm(res.data)
  }

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(''), 6000)
  }

  const handleReply = async () => {
    if (!selected || !userInput) return
    setLoading(true)
    try {
      const res = await axios.post(`${API}/emails/reply`, {
        email_id: selected.id,
        user_input: userInput
      })
      setAiReply(res.data.reply)
      showNotification('Reply generated successfully!')
      fetchEmails()
    } catch {
      showNotification('Error generating reply')
    }
    setLoading(false)
  }

  const handleSchedule = async () => {
    if (!selected) return
    const timeSlot = selected.body.match(/\d{1,2}(am|pm|:\d{2})/i)?.[0] || 'tomorrow 3pm'
    const conflictRes = await axios.post(
      `${API}/schedule/check?time_str=${encodeURIComponent(timeSlot)}`
    )
    if (conflictRes.data.conflict) {
      showNotification('⚠️ Conflict detected! Auto-declining and notifying sender...')
      await axios.post(`${API}/emails/reply`, {
        email_id: selected.id,
        user_input: 'decline politely due to scheduling conflict, ask them to suggest another time'
      })
      fetchEmails()
    } else {
      await axios.post(`${API}/schedule/save`, {
        email_id: selected.id,
        title: selected.subject,
        start_time: timeSlot,
        attendees: selected.sender
      })
      showNotification('✅ Meeting scheduled successfully!')
      fetchSchedules()
    }
  }

  const handleSimulate = async () => {
    await axios.post(`${API}/emails/simulate`)
    fetchEmails()
    showNotification('📧 New email received!')
  }

  const handleThreadSummary = async () => {
    if (!selected) return
    try {
      const res = await axios.get(`${API}/emails/thread/${encodeURIComponent(selected.sender)}`)
      showNotification(`🧵 Thread (${res.data.email_count} emails): ${res.data.summary}`)
    } catch {
      showNotification('No thread found for this sender')
    }
  }

  const handleSaveSettings = async () => {
    await axios.post(`${API}/settings`, settingsForm)
    setSettings(settingsForm)
    showNotification('✅ Settings saved!')
  }

  const priorityColor = (p: string) => {
    if (p === 'high') return 'bg-red-100 text-red-800'
    if (p === 'medium') return 'bg-yellow-100 text-yellow-800'
    return 'bg-green-100 text-green-800'
  }

  const intentIcon = (i: string) => {
    if (i === 'meeting_request') return '📅'
    if (i === 'follow_up') return '🔄'
    if (i === 'conflict') return '⚠️'
    return '📧'
  }

  const highCount = emails.filter(e => e.priority === 'high' && e.status === 'pending').length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {notification && (
        <div className="fixed top-4 right-4 bg-indigo-600 text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-sm">
          {notification}
        </div>
      )}

      {/* Header */}
      <div className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-xl font-bold">AI Email Assistant</h1>
          <p className="text-indigo-200 text-xs">
            {settings.name} &nbsp;·&nbsp; {settings.working_hours_start}–{settings.working_hours_end} {settings.timezone}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={() => setView('inbox')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'inbox' ? 'bg-white text-indigo-600' : 'text-white hover:bg-indigo-500'}`}>
            Inbox ({emails.length})
            {highCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{highCount}</span>
            )}
          </button>
          <button onClick={() => setView('schedule')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'schedule' ? 'bg-white text-indigo-600' : 'text-white hover:bg-indigo-500'}`}>
            Schedule ({schedules.length})
          </button>
          <button onClick={() => setView('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'settings' ? 'bg-white text-indigo-600' : 'text-white hover:bg-indigo-500'}`}>
            ⚙️ Settings
          </button>
          <button onClick={handleSimulate}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-400 transition-colors">
            + Simulate Email
          </button>
        </div>
      </div>

      {/* Settings View */}
      {view === 'settings' && (
        <div className="flex-1 p-8 max-w-xl mx-auto w-full">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Settings</h2>
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">YOUR NAME</label>
              <input
                value={settingsForm.name}
                onChange={e => setSettingsForm({...settingsForm, name: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">YOUR EMAIL</label>
              <input
                value={settingsForm.email}
                onChange={e => setSettingsForm({...settingsForm, email: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-500 block mb-1">WORK START</label>
                <input
                  type="time"
                  value={settingsForm.working_hours_start}
                  onChange={e => setSettingsForm({...settingsForm, working_hours_start: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-500 block mb-1">WORK END</label>
                <input
                  type="time"
                  value={settingsForm.working_hours_end}
                  onChange={e => setSettingsForm({...settingsForm, working_hours_end: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">TIMEZONE</label>
              <select
                value={settingsForm.timezone}
                onChange={e => setSettingsForm({...settingsForm, timezone: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
              </select>
            </div>
            <button
              onClick={handleSaveSettings}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              Save Settings
            </button>
          </div>

          {/* AI Disclaimer */}
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-yellow-700 mb-1">AI DISCLAIMER</p>
            <p className="text-xs text-yellow-600">
              All outgoing emails sent by this assistant include the disclaimer:
              "This message was sent by an experimental AI email assistant on behalf of {settings.name}."
            </p>
          </div>
        </div>
      )}

      {/* Schedule View */}
      {view === 'schedule' && (
        <div className="flex-1 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Upcoming Meetings</h2>
          {schedules.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-5xl mb-3">📅</p>
              <p>No meetings scheduled yet</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {schedules.map(s => (
                <div key={s.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-gray-900">{s.event_title}</h3>
                    <p className="text-sm text-gray-500 mt-1">With: {s.attendees}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-indigo-600">
                      {new Date(s.start_time).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(s.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inbox View */}
      {view === 'inbox' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-1/3 bg-white border-r border-gray-200 overflow-y-auto">
            {emails.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                <p className="text-4xl mb-2">📭</p>
                <p>No emails yet</p>
                <p className="text-xs mt-2">Click + Simulate Email to test</p>
              </div>
            )}
            {emails.map(email => (
              <div
                key={email.id}
                onClick={() => { setSelected(email); setAiReply(''); setUserInput('') }}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-colors
                  ${selected?.id === email.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}
                  ${email.priority === 'high' && selected?.id !== email.id ? 'border-l-4 border-l-red-400' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-gray-900 text-sm truncate">{email.sender}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor(email.priority)}`}>
                    {email.priority}
                  </span>
                </div>
                <div className="flex items-center gap-1 mb-1">
                  <span>{intentIcon(email.intent)}</span>
                  <p className="text-sm text-gray-700 font-medium truncate">{email.subject}</p>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{email.summary}</p>
                <span className={`text-xs mt-1 inline-block px-2 py-0.5 rounded-full ${email.status === 'replied' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {email.status}
                </span>
              </div>
            ))}
          </div>

          {/* Main Panel */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <p className="text-6xl mb-4">👆</p>
                  <p className="text-xl">Select an email to get started</p>
                  {highCount > 0 && (
                    <p className="text-red-500 text-sm mt-3 font-medium">
                      ⚠️ {highCount} high priority email{highCount > 1 ? 's' : ''} need attention!
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {/* Email Header */}
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selected.subject}</h2>
                      <p className="text-gray-500 text-sm">From: {selected.sender}</p>
                      <p className="text-gray-400 text-xs">{new Date(selected.received_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap justify-end">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${priorityColor(selected.priority)}`}>
                        {selected.priority} priority
                      </span>
                      <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
                        {selected.intent.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* AI Summary */}
                  <div className="bg-indigo-50 rounded-lg p-3 mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-xs font-semibold text-indigo-600">AI SUMMARY</p>
                      <button
                        onClick={handleThreadSummary}
                        className="text-xs text-indigo-500 hover:text-indigo-700 underline"
                      >
                        View full thread
                      </button>
                    </div>
                    <p className="text-gray-700 text-sm">{selected.summary}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">ORIGINAL EMAIL</p>
                    <p className="text-gray-700 text-sm whitespace-pre-wrap">{selected.body}</p>
                  </div>
                </div>

                {/* Schedule Button */}
                {selected.intent === 'meeting_request' && (
                  <div className="bg-white rounded-xl shadow-sm p-5">
                    <h3 className="font-bold text-gray-900 mb-3">Quick Actions</h3>
                    <button
                      onClick={handleSchedule}
                      className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors"
                    >
                      📅 Check Conflicts & Schedule Meeting
                    </button>
                  </div>
                )}

                {/* Reply Section */}
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <h3 className="font-bold text-gray-900 mb-3">Your Response</h3>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {['Yes, confirmed!', 'No, not available', 'Reschedule please', 'Need more info'].map(q => (
                      <button
                        key={q}
                        onClick={() => setUserInput(q)}
                        className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    placeholder="Type yes, no, or any instruction..."
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    rows={3}
                  />
                  <button
                    onClick={handleReply}
                    disabled={loading || !userInput}
                    className="mt-3 w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {loading ? '⏳ AI is writing...' : '✉️ Generate & Send Reply'}
                  </button>

                  {aiReply && (
                    <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-xs font-semibold text-green-700 mb-2">✅ AI DRAFTED REPLY</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiReply}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}