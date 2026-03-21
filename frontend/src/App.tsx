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
  calendar_event_id: string
}

interface Settings {
  start: string
  end: string
  timezone: string
  name: string
}

interface Analytics {
  total_emails: number
  replied: number
  pending: number
  high_priority: number
  meetings_scheduled: number
  response_rate: number
}

export default function App() {
  const [emails, setEmails] = useState<Email[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selected, setSelected] = useState<Email | null>(null)
  const [userInput, setUserInput] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [view, setView] = useState<'inbox' | 'schedule' | 'settings'>('inbox')
  const [notification, setNotification] = useState('')
  const [notifType, setNotifType] = useState<'success' | 'error' | 'warning'>('success')
  const [settings, setSettings] = useState<Settings>({
    start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', name: 'User'
  })
  const [settingsForm, setSettingsForm] = useState<Settings>({
    start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', name: 'User'
  })
  const [analytics, setAnalytics] = useState<Analytics>({
    total_emails: 0, replied: 0, pending: 0,
    high_priority: 0, meetings_scheduled: 0, response_rate: 0
  })

  useEffect(() => {
    fetchEmails()
    fetchSchedules()
    fetchSettings()
    fetchAnalytics()
    const interval = setInterval(() => {
      fetchEmails()
      fetchSchedules()
      fetchAnalytics()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchEmails = async () => {
    try {
      const res = await axios.get(`${API}/emails/priority`)
      setEmails(res.data)
    } catch {}
  }

  const fetchSchedules = async () => {
    try {
      const res = await axios.get(`${API}/schedule`)
      setSchedules(res.data)
    } catch {}
  }

  const fetchSettings = async () => {
    try {
      const res = await axios.get(`${API}/settings/working-hours`)
      setSettings(res.data)
      setSettingsForm(res.data)
    } catch {}
  }

  const fetchAnalytics = async () => {
    try {
      const res = await axios.get(`${API}/analytics`)
      setAnalytics(res.data)
    } catch {}
  }

  const showNotification = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setNotification(msg)
    setNotifType(type)
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
      showNotification('Reply sent successfully!')
      fetchEmails()
      fetchAnalytics()
    } catch {
      showNotification('Error sending reply', 'error')
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
      showNotification('⚠️ Conflict detected! Auto-declining...', 'warning')
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
      showNotification('Meeting scheduled + Google Calendar event created!')
      fetchSchedules()
      fetchAnalytics()
    }
  }

  const handleSimulate = async () => {
    await axios.post(`${API}/emails/simulate`)
    fetchEmails()
    fetchAnalytics()
    showNotification('New simulated email received!')
  }

  const handleFetchGmail = async () => {
    setFetching(true)
    try {
      const res = await axios.get(`${API}/gmail/fetch`)
      fetchEmails()
      fetchAnalytics()
      showNotification(`Fetched ${res.data.fetched} real emails from Gmail!`)
    } catch {
      showNotification('Error fetching Gmail', 'error')
    }
    setFetching(false)
  }

  const handleThreadSummary = async () => {
    if (!selected) return
    try {
      const res = await axios.get(`${API}/emails/thread/${encodeURIComponent(selected.sender)}`)
      showNotification(`Thread (${res.data.email_count} emails): ${res.data.summary}`)
    } catch {
      showNotification('No thread found for this sender', 'error')
    }
  }

  const handleSaveSettings = async () => {
    try {
      await axios.post(`${API}/settings/working-hours`, settingsForm)
      setSettings(settingsForm)
      showNotification('Settings saved!')
    } catch {
      showNotification('Error saving settings', 'error')
    }
  }

  const handleReset = async () => {
    if (!confirm('Clear all emails and schedules for fresh demo?')) return
    await axios.delete(`${API}/reset`)
    fetchEmails()
    fetchSchedules()
    fetchAnalytics()
    setSelected(null)
    showNotification('Database cleared - ready for demo!')
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

  const notifBg = notifType === 'error' ? 'bg-red-600' : notifType === 'warning' ? 'bg-amber-500' : 'bg-green-600'
  const highCount = emails.filter(e => e.priority === 'high' && e.status === 'pending').length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {notification && (
        <div className={`fixed top-4 right-4 ${notifBg} text-white px-6 py-3 rounded-xl shadow-lg z-50 text-sm font-medium max-w-sm`}>
          {notification}
        </div>
      )}

      {/* Header */}
      <div className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div>
          <h1 className="text-xl font-bold">AI Email Assistant</h1>
          <p className="text-indigo-200 text-xs">
            Hi {settings.name} &nbsp;|&nbsp; {settings.start} – {settings.end} &nbsp;|&nbsp; {settings.timezone} &nbsp;|&nbsp; Auto-sync every 1 min
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          <button onClick={() => setView('inbox')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'inbox' ? 'bg-white text-indigo-600' : 'text-white hover:bg-indigo-500'}`}>
            Inbox ({emails.length})
            {highCount > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{highCount}</span>}
          </button>
          <button onClick={() => setView('schedule')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'schedule' ? 'bg-white text-indigo-600' : 'text-white hover:bg-indigo-500'}`}>
            Schedule ({schedules.length})
          </button>
          <button onClick={() => setView('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'settings' ? 'bg-white text-indigo-600' : 'text-white hover:bg-indigo-500'}`}>
            ⚙️ Settings
          </button>
          <button onClick={handleFetchGmail} disabled={fetching}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-50 transition-colors">
            {fetching ? 'Fetching...' : '📬 Fetch Gmail'}
          </button>
          <button onClick={handleSimulate}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500 text-white hover:bg-green-400 transition-colors">
            + Simulate
          </button>
        </div>
      </div>

      {/* Settings View */}
      {view === 'settings' && (
        <div className="flex-1 p-8 max-w-lg mx-auto w-full">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Settings</h2>
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Your Name</label>
              <input type="text" value={settingsForm.name}
                onChange={e => setSettingsForm({...settingsForm, name: e.target.value})}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="Enter your name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Work Start</label>
                <input type="time" value={settingsForm.start}
                  onChange={e => setSettingsForm({...settingsForm, start: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Work End</label>
                <input type="time" value={settingsForm.end}
                  onChange={e => setSettingsForm({...settingsForm, end: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Timezone</label>
              <select value={settingsForm.timezone}
                onChange={e => setSettingsForm({...settingsForm, timezone: e.target.value})}
                className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              </select>
            </div>
            <button onClick={handleSaveSettings}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
              Save Settings
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 mt-4">
            <h3 className="font-bold text-gray-900 mb-3">Connections</h3>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
              <p className="text-sm text-gray-700">Gmail connected via OAuth</p>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
              <p className="text-sm text-gray-700">Google Calendar connected</p>
            </div>
            <button onClick={handleFetchGmail} disabled={fetching}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {fetching ? 'Fetching...' : '📬 Fetch Latest Emails from Gmail'}
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 mt-4">
            <h3 className="font-bold text-gray-900 mb-3">Demo Controls</h3>
            <button onClick={handleReset}
              className="w-full bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors">
              🗑️ Clear All Data (Fresh Demo Start)
            </button>
          </div>
        </div>
      )}

      {/* Schedule View */}
      {view === 'schedule' && (
        <div className="flex-1 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">Upcoming Meetings</h2>
            <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
              Synced with Google Calendar
            </span>
          </div>
          {schedules.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-5xl mb-3">📅</p>
              <p>No meetings scheduled yet</p>
              <p className="text-xs mt-2">Schedule a meeting from an email to see it here</p>
            </div>
          ) : (
            <div className="grid gap-3 max-w-2xl">
              {schedules.map(s => (
                <div key={s.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{s.event_title}</h3>
                      <p className="text-sm text-gray-500 mt-1">With: {s.attendees}</p>
                      {s.calendar_event_id && (
                        <span className="text-xs text-green-600 font-medium mt-1 inline-block">
                          ✓ Google Calendar event created
                        </span>
                      )}
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inbox View */}
      {view === 'inbox' && (
        <div className="flex flex-1 overflow-hidden flex-col">

          {/* Analytics Bar */}
          <div className="grid grid-cols-5 gap-3 p-4 bg-white border-b border-gray-100 shadow-sm">
            <div className="text-center">
              <p className="text-2xl font-bold text-indigo-600">{analytics.total_emails}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{analytics.replied}</p>
              <p className="text-xs text-gray-500">Replied</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{analytics.pending}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{analytics.high_priority}</p>
              <p className="text-xs text-gray-500">High Priority</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{analytics.response_rate}%</p>
              <p className="text-xs text-gray-500">Response Rate</p>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-1/3 bg-white border-r border-gray-200 overflow-y-auto">
              {highCount > 0 && (
                <div className="bg-red-50 border-b border-red-100 px-4 py-2">
                  <p className="text-xs text-red-600 font-medium">⚠️ {highCount} high priority email{highCount > 1 ? 's' : ''} need attention</p>
                </div>
              )}
              {emails.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  <p className="text-4xl mb-2">📭</p>
                  <p>No emails yet</p>
                  <p className="text-xs mt-2">Click "+ Simulate" or "📬 Fetch Gmail"</p>
                </div>
              )}
              {emails.map(email => (
                <div key={email.id}
                  onClick={() => { setSelected(email); setAiReply(''); setUserInput('') }}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-colors
                    ${selected?.id === email.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}
                    ${email.priority === 'high' && selected?.id !== email.id ? 'border-l-4 border-l-red-400' : ''}`}>
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
                    <p className="text-xl font-medium">Select an email to get started</p>
                    <p className="text-sm mt-2">or click "+ Simulate" to receive a test email</p>
                    {highCount > 0 && (
                      <p className="text-red-500 text-sm mt-3 font-medium">
                        ⚠️ {highCount} high priority email{highCount > 1 ? 's' : ''} need attention!
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  <div className="bg-white rounded-xl shadow-sm p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h2 className="text-xl font-bold text-gray-900">{selected.subject}</h2>
                        <p className="text-gray-500 text-sm mt-0.5">From: {selected.sender}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className={`text-xs px-3 py-1 rounded-full font-medium ${priorityColor(selected.priority)}`}>
                          {selected.priority} priority
                        </span>
                        <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
                          {selected.intent.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-3 mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-xs font-semibold text-indigo-600">AI SUMMARY</p>
                        <button onClick={handleThreadSummary}
                          className="text-xs text-indigo-500 hover:text-indigo-700 underline">
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

                  {selected.intent === 'meeting_request' && (
                    <div className="bg-white rounded-xl shadow-sm p-5">
                      <h3 className="font-bold text-gray-900 mb-3">Quick Actions</h3>
                      <button onClick={handleSchedule}
                        className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors">
                        📅 Check Conflicts & Schedule Meeting
                      </button>
                      <p className="text-xs text-gray-400 mt-2 text-center">Creates a real Google Calendar event automatically</p>
                    </div>
                  )}

                  <div className="bg-white rounded-xl shadow-sm p-5">
                    <h3 className="font-bold text-gray-900 mb-3">Your Response</h3>
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {['Yes, confirmed!', 'No, not available', 'Reschedule please', 'Need more info'].map(q => (
                        <button key={q} onClick={() => setUserInput(q)}
                          className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full hover:bg-indigo-100 transition-colors">
                          {q}
                        </button>
                      ))}
                    </div>
                    <textarea value={userInput} onChange={e => setUserInput(e.target.value)}
                      placeholder="Type yes, no, or any instruction..."
                      className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      rows={3} />
                    <button onClick={handleReply} disabled={loading || !userInput}
                      className="mt-3 w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                      {loading ? '✍️ AI is writing...' : '📨 Generate & Send Reply'}
                    </button>
                    {aiReply && (
                      <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                        <p className="text-xs font-semibold text-green-700 mb-2">✅ REPLY SENT</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiReply}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}