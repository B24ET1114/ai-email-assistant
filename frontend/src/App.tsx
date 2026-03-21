import { useState, useEffect, useRef } from 'react'
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

interface Weather {
  greeting: string
  time_of_day: string
  temp_c: string
  weather_desc: string
  weather_type: string
  humidity: string
  suggestion: string
  alert: boolean
}

function WeatherIcon({ type, timeOfDay }: { type: string; timeOfDay: string }) {
  const isNight = timeOfDay === 'night'
  if (type === 'storm') return <span className="text-2xl animate-pulse">⛈️</span>
  if (type === 'rainy' && isNight) return <span className="text-2xl animate-bounce" style={{ animationDuration: '2s' }}>🌧️</span>
  if (type === 'rainy') return <span className="text-2xl animate-bounce" style={{ animationDuration: '2s' }}>🌦️</span>
  if (type === 'cloudy' && isNight) return <span className="text-2xl">☁️</span>
  if (type === 'cloudy') return <span className="text-2xl">⛅</span>
  if (type === 'foggy') return <span className="text-2xl animate-pulse">🌫️</span>
  if (type === 'snow') return <span className="text-2xl animate-bounce" style={{ animationDuration: '3s' }}>❄️</span>
  if (isNight) return <span className="text-2xl animate-pulse" style={{ animationDuration: '3s' }}>🌙</span>
  return <span className="text-2xl animate-spin" style={{ animationDuration: '10s' }}>☀️</span>
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
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'warn' } | null>(null)
  const [settings, setSettings] = useState<Settings>({ start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', name: 'User' })
  const [settingsForm, setSettingsForm] = useState<Settings>({ start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', name: 'User' })
  const [analytics, setAnalytics] = useState<Analytics>({ total_emails: 0, replied: 0, pending: 0, high_priority: 0, meetings_scheduled: 0, response_rate: 0 })
  const [weather, setWeather] = useState<Weather>({
    greeting: 'Hello',
    time_of_day: 'morning',
    temp_c: '--',
    weather_desc: '',
    weather_type: 'sunny',
    humidity: '--',
    suggestion: '',
    alert: false
  })
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchAll()
    fetchSettings()
    fetchWeather()
    const iv = setInterval(() => { fetchAll(); fetchWeather() }, 60000)
    return () => clearInterval(iv)
  }, [])

  const fetchAll = () => { fetchEmails(); fetchSchedules(); fetchAnalytics() }

  const fetchEmails = async () => {
    try { const r = await axios.get(`${API}/emails/priority`); setEmails(r.data) } catch {}
  }
  const fetchSchedules = async () => {
    try { const r = await axios.get(`${API}/schedule`); setSchedules(r.data) } catch {}
  }
  const fetchSettings = async () => {
    try { const r = await axios.get(`${API}/settings/working-hours`); setSettings(r.data); setSettingsForm(r.data) } catch {}
  }
  const fetchAnalytics = async () => {
    try { const r = await axios.get(`${API}/analytics`); setAnalytics(r.data) } catch {}
  }
  const fetchWeather = async () => {
    try { const r = await axios.get(`${API}/weather`); setWeather(r.data) } catch {}
  }

  const notify = (msg: string, type: 'ok' | 'err' | 'warn' = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  const handleReply = async () => {
    if (!selected || !userInput) return
    setLoading(true)
    try {
      const r = await axios.post(`${API}/emails/reply`, { email_id: selected.id, user_input: userInput })
      setAiReply(r.data.reply); notify('Reply sent!'); fetchEmails(); fetchAnalytics()
    } catch { notify('Failed to send reply', 'err') }
    setLoading(false)
  }

  const handleSchedule = async () => {
    if (!selected) return
    const timeSlot = selected.body.match(/\d{1,2}(am|pm|:\d{2})/i)?.[0] || 'tomorrow 3pm'
    const cr = await axios.post(`${API}/schedule/check?time_str=${encodeURIComponent(timeSlot)}`)
    if (cr.data.conflict) {
      notify('Conflict detected! Auto-declining...', 'warn')
      await axios.post(`${API}/emails/reply`, { email_id: selected.id, user_input: 'decline politely due to scheduling conflict, suggest another time' })
      fetchEmails()
    } else {
      await axios.post(`${API}/schedule/save`, { email_id: selected.id, title: selected.subject, start_time: timeSlot, attendees: selected.sender })
      notify('Meeting scheduled + Calendar event created!'); fetchSchedules(); fetchAnalytics()
    }
  }

  const handleSimulate = async () => {
    await axios.post(`${API}/emails/simulate`); fetchEmails(); fetchAnalytics(); notify('New email arrived!')
  }

  const handleFetchGmail = async () => {
    setFetching(true)
    try {
      const r = await axios.get(`${API}/gmail/fetch`); fetchEmails(); fetchAnalytics()
      notify(`Fetched ${r.data.fetched} emails from Gmail`)
    } catch { notify('Gmail fetch failed', 'err') }
    setFetching(false)
  }

  const handleThreadSummary = async () => {
    if (!selected) return
    try {
      const r = await axios.get(`${API}/emails/thread/${encodeURIComponent(selected.sender)}`)
      notify(`Thread (${r.data.email_count} emails): ${r.data.summary}`)
    } catch { notify('No thread found', 'err') }
  }

  const handleSaveSettings = async () => {
    try { await axios.post(`${API}/settings/working-hours`, settingsForm); setSettings(settingsForm); notify('Settings saved!') }
    catch { notify('Save failed', 'err') }
  }

  const handleReset = async () => {
    if (!confirm('Clear all data for a fresh demo?')) return
    await axios.delete(`${API}/reset`); fetchAll(); setSelected(null); notify('Cleared — ready for demo!')
  }

  const highCount = emails.filter(e => e.priority === 'high' && e.status === 'pending').length

  const priorityBadge = (p: string) => {
    if (p === 'high') return 'bg-red-900/60 text-red-400 border-red-800/50'
    if (p === 'medium') return 'bg-amber-900/60 text-amber-400 border-amber-800/50'
    return 'bg-emerald-900/60 text-emerald-400 border-emerald-800/50'
  }

  const intentBadge = (i: string) => {
    if (i === 'meeting_request') return { label: 'Meeting', color: 'text-violet-400' }
    if (i === 'follow_up') return { label: 'Follow-up', color: 'text-sky-400' }
    if (i === 'conflict') return { label: 'Conflict', color: 'text-rose-400' }
    return { label: 'General', color: 'text-slate-400' }
  }

  const toastBg = toast?.type === 'err' ? 'bg-rose-600' : toast?.type === 'warn' ? 'bg-amber-500' : 'bg-emerald-600'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col text-sm">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 ${toastBg} text-white text-sm px-5 py-3 rounded-2xl shadow-2xl max-w-xs border border-white/10`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col py-5 px-3 flex-shrink-0">

          {/* Logo */}
          <div className="flex items-center gap-3 px-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">AI</div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">Email Assistant</p>
              <p className="text-xs text-slate-500 leading-tight">Autonomous Agent</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {[
              { id: 'inbox',    label: 'Inbox',    sub: `${emails.length} emails`,      icon: '📥' },
              { id: 'schedule', label: 'Schedule',  sub: `${schedules.length} meetings`, icon: '📅' },
              { id: 'settings', label: 'Settings',  sub: 'Config & connections',         icon: '⚙️' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setView(tab.id as typeof view)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left
                  ${view === tab.id ? 'bg-violet-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                <span className="text-base w-5 text-center flex-shrink-0">{tab.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium leading-none">{tab.label}</span>
                    {tab.id === 'inbox' && highCount > 0 && (
                      <span className="bg-rose-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{highCount}</span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 leading-none ${view === tab.id ? 'text-violet-200' : 'text-slate-600'}`}>{tab.sub}</p>
                </div>
              </button>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Bottom Actions */}
          <div className="flex flex-col gap-1 border-t border-slate-800 pt-3">
            <button onClick={handleSimulate}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-left">
              <span className="text-base w-5 text-center flex-shrink-0">✉️</span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none">Simulate Email</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-none">Add test email</p>
              </div>
            </button>
            <button onClick={handleFetchGmail} disabled={fetching}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-left disabled:opacity-40">
              <span className="text-base w-5 text-center flex-shrink-0">📬</span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-none">{fetching ? 'Fetching...' : 'Fetch Gmail'}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-none">Sync real emails</p>
              </div>
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="flex flex-1 overflow-hidden flex-col">

          {/* Top Bar */}
          <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              {/* Greeting + Weather */}
              <div className="flex items-center gap-3">
                <WeatherIcon type={weather.weather_type} timeOfDay={weather.time_of_day} />
                <div>
                  <p className="text-sm font-semibold text-white leading-tight">
                    {weather.greeting}, {settings.name}!
                  </p>
                  <p className="text-xs text-slate-500 leading-tight">
                    {weather.temp_c}°C · {weather.weather_desc || 'Loading weather...'} · {settings.start}–{settings.end}
                  </p>
                </div>
              </div>
              {/* Weather Alert */}
              {weather.alert && (
                <div className="flex items-center gap-2 bg-amber-900/40 border border-amber-800/50 px-3 py-1.5 rounded-xl">
                  <span className="text-xs">⚠️</span>
                  <p className="text-xs text-amber-400 font-medium">{weather.suggestion}</p>
                </div>
              )}
            </div>

            {/* Analytics Pills */}
            <div className="flex gap-2">
              {[
                { label: 'Total',   val: analytics.total_emails,       color: 'text-slate-300' },
                { label: 'Replied', val: analytics.replied,             color: 'text-emerald-400' },
                { label: 'Pending', val: analytics.pending,             color: 'text-amber-400' },
                { label: 'High',    val: analytics.high_priority,       color: 'text-rose-400' },
                { label: 'Rate',    val: `${analytics.response_rate}%`, color: 'text-violet-400' },
              ].map(s => (
                <div key={s.label} className="text-center px-3 py-1.5 bg-slate-800 rounded-xl border border-slate-700 min-w-[52px]">
                  <p className={`text-sm font-bold leading-tight ${s.color}`}>{s.val}</p>
                  <p className="text-xs text-slate-500 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          </header>

          {/* ── INBOX ── */}
          {view === 'inbox' && (
            <div className="flex flex-1 overflow-hidden">

              {/* Email List */}
              <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 overflow-y-auto">
                {highCount > 0 && (
                  <div className="m-3 px-3 py-2 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                    <p className="text-xs text-rose-400 font-medium">⚠ {highCount} high priority need attention</p>
                  </div>
                )}
                {emails.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-600">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-sm font-medium">No emails yet</p>
                    <p className="text-xs mt-1 text-slate-700">Use Simulate or Fetch Gmail</p>
                  </div>
                )}
                {emails.map(email => {
                  const intent = intentBadge(email.intent)
                  const isSelected = selected?.id === email.id
                  return (
                    <div key={email.id}
                      onClick={() => { setSelected(email); setAiReply(''); setUserInput('') }}
                      className={`mx-2 my-1 p-3 rounded-xl cursor-pointer transition-all border
                        ${isSelected
                          ? 'bg-violet-600/20 border-violet-500/50'
                          : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800 hover:border-slate-600'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-300 truncate max-w-[150px]">
                          {email.sender.split('<')[0].replace(/"/g, '').trim()}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ml-1 ${priorityBadge(email.priority)}`}>
                          {email.priority}
                        </span>
                      </div>
                      <p className="text-xs text-white font-medium truncate mb-1">{email.subject}</p>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-2">{email.summary}</p>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${intent.color}`}>{intent.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${email.status === 'replied' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-700/80 text-slate-400'}`}>
                          {email.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Email Detail */}
              <div className="flex-1 overflow-y-auto bg-slate-950">
                {!selected ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-700">
                    <p className="text-5xl mb-3">👈</p>
                    <p className="text-base font-medium text-slate-600">Select an email</p>
                    <p className="text-xs mt-1 text-slate-700">or simulate one from the sidebar</p>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto p-6 space-y-4">

                    {/* Header Card */}
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-semibold text-white leading-tight mb-1">{selected.subject}</h2>
                          <p className="text-xs text-slate-400">From: {selected.sender}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${priorityBadge(selected.priority)}`}>
                            {selected.priority}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-lg border bg-slate-800 border-slate-700 font-medium ${intentBadge(selected.intent).color}`}>
                            {intentBadge(selected.intent).label}
                          </span>
                        </div>
                      </div>

                      {/* AI Summary */}
                      <div className="bg-violet-950/40 border border-violet-800/30 rounded-xl p-4 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">AI Summary</p>
                          <button onClick={handleThreadSummary}
                            className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2">
                            View thread
                          </button>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{selected.summary}</p>
                      </div>

                      {/* Original */}
                      <div>
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Original Email</p>
                        <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{selected.body}</p>
                      </div>
                    </div>

                    {/* Schedule */}
                    {selected.intent === 'meeting_request' && (
                      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Action</p>
                        {weather.alert && (
                          <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-800/40 rounded-xl px-3 py-2 mb-3">
                            <span className="text-xs">⚠️</span>
                            <p className="text-xs text-amber-400">{weather.suggestion}</p>
                          </div>
                        )}
                        <button onClick={handleSchedule}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl font-medium transition-all text-sm">
                          📅 Check Conflicts & Schedule Meeting
                        </button>
                        <p className="text-xs text-slate-600 text-center mt-2">Creates a real Google Calendar event automatically</p>
                      </div>
                    )}

                    {/* Reply */}
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Your Response</p>
                      <div className="flex gap-2 mb-3 flex-wrap">
                        {['Yes, confirmed!', 'No, not available', 'Reschedule please', 'Need more info'].map(q => (
                          <button key={q} onClick={() => setUserInput(q)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition-all
                              ${userInput === q
                                ? 'bg-violet-600 text-white border-violet-500'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-white'}`}>
                            {q}
                          </button>
                        ))}
                      </div>
                      <textarea value={userInput} onChange={e => setUserInput(e.target.value)}
                        placeholder="Or type a custom instruction..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500 transition-colors leading-relaxed"
                        rows={3} />
                      <button onClick={handleReply} disabled={loading || !userInput}
                        className="mt-3 w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-2.5 rounded-xl font-medium transition-all text-sm">
                        {loading ? '✍️ Writing reply...' : '📨 Generate & Send Reply'}
                      </button>
                      {aiReply && (
                        <div className="mt-4 bg-emerald-950/40 border border-emerald-800/30 rounded-xl p-4">
                          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">✅ Reply Sent</p>
                          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{aiReply}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SCHEDULE ── */}
          {view === 'schedule' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-base font-semibold text-white">Upcoming Meetings</h2>
                  <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/40 px-3 py-1.5 rounded-xl font-medium">
                    ✓ Synced with Google Calendar
                  </span>
                </div>
                {weather.alert && (
                  <div className="flex items-center gap-2 bg-amber-900/30 border border-amber-800/40 rounded-xl px-4 py-3 mb-4">
                    <span>⚠️</span>
                    <p className="text-xs text-amber-400 font-medium">{weather.suggestion} — consider rescheduling outdoor meetings</p>
                  </div>
                )}
                {schedules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-700">
                    <p className="text-4xl mb-3">📅</p>
                    <p className="text-sm font-medium text-slate-600">No meetings yet</p>
                    <p className="text-xs mt-1">Schedule one from an email</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedules.map(s => (
                      <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between hover:border-slate-700 transition-all">
                        <div className="min-w-0 flex-1 mr-4">
                          <h3 className="text-sm font-semibold text-white leading-tight truncate">{s.event_title}</h3>
                          <p className="text-xs text-slate-500 mt-1">With: {s.attendees}</p>
                          {s.calendar_event_id && (
                            <p className="text-xs text-emerald-500 mt-1 font-medium">✓ Google Calendar event created</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold text-violet-400 leading-tight">
                            {new Date(s.start_time).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {view === 'settings' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-lg mx-auto space-y-4">
                <h2 className="text-base font-semibold text-white mb-6">Settings</h2>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Profile & Working Hours</p>
                  <div>
                    <label className="text-xs font-medium text-slate-400 block mb-1.5">Your Name</label>
                    <input type="text" value={settingsForm.name}
                      onChange={e => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
                      placeholder="Your name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-400 block mb-1.5">Work Start</label>
                      <input type="time" value={settingsForm.start}
                        onChange={e => setSettingsForm({ ...settingsForm, start: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-400 block mb-1.5">Work End</label>
                      <input type="time" value={settingsForm.end}
                        onChange={e => setSettingsForm({ ...settingsForm, end: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 block mb-1.5">Timezone</label>
                    <select value={settingsForm.timezone}
                      onChange={e => setSettingsForm({ ...settingsForm, timezone: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors">
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                    </select>
                  </div>
                  <button onClick={handleSaveSettings}
                    className="w-full bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-xl font-medium text-sm transition-all">
                    Save Settings
                  </button>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Connections</p>
                  <div className="space-y-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      <p className="text-sm text-slate-300">Gmail connected via OAuth</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                      <p className="text-sm text-slate-300">Google Calendar connected</p>
                    </div>
                  </div>
                  <button onClick={handleFetchGmail} disabled={fetching}
                    className="w-full bg-sky-700 hover:bg-sky-600 disabled:opacity-40 text-white py-2.5 rounded-xl font-medium text-sm transition-all">
                    {fetching ? 'Fetching...' : '📬 Fetch Latest Emails from Gmail'}
                  </button>
                </div>

                <div className="bg-slate-900 border border-rose-900/40 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Demo Controls</p>
                  <button onClick={handleReset}
                    className="w-full bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800/50 text-rose-400 hover:text-rose-300 py-2.5 rounded-xl font-medium text-sm transition-all">
                    🗑️ Clear All Data — Fresh Demo Start
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}