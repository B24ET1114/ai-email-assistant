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

const priorityConfig: Record<string, { bg: string; text: string; dot: string }> = {
  high:   { bg: 'bg-red-50',    text: 'text-red-600',    dot: 'bg-red-500' },
  medium: { bg: 'bg-amber-50',  text: 'text-amber-600',  dot: 'bg-amber-400' },
  low:    { bg: 'bg-emerald-50',text: 'text-emerald-600',dot: 'bg-emerald-400' },
}

const intentConfig: Record<string, { icon: string; label: string; color: string }> = {
  meeting_request: { icon: '⬡', label: 'Meeting',   color: 'text-violet-500' },
  follow_up:       { icon: '↻', label: 'Follow-up', color: 'text-sky-500' },
  conflict:        { icon: '⚠', label: 'Conflict',  color: 'text-rose-500' },
  general:         { icon: '◎', label: 'General',   color: 'text-slate-400' },
}

function Dot({ color }: { color: string }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`} />
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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 5000)
    return () => clearInterval(iv)
  }, [])

  const fetchAll = () => {
    fetchEmails(); fetchSchedules(); fetchAnalytics()
  }

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

  const notify = (msg: string, type: 'ok' | 'err' | 'warn' = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  useEffect(() => { fetchSettings() }, [])

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
      notify('Conflict! Auto-declining...', 'warn')
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
      notify(`Thread (${r.data.email_count}): ${r.data.summary}`)
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

  const toastColors = { ok: 'bg-emerald-600', err: 'bg-rose-600', warn: 'bg-amber-500' }

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }} className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 ${toastColors[toast.type]} text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-2xl max-w-xs border border-white/10`}>
          {toast.msg}
        </div>
      )}

      {/* Sidebar + Main layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left Sidebar Navigation */}
        <div className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-6 gap-4 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold text-lg mb-4">A</div>

          {[
            { id: 'inbox', icon: '◫', label: 'Inbox' },
            { id: 'schedule', icon: '⬡', label: 'Schedule' },
            { id: 'settings', icon: '⊙', label: 'Settings' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setView(tab.id as typeof view)}
              title={tab.label}
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all
                ${view === tab.id ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/50' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'}`}>
              {tab.icon}
              {tab.id === 'inbox' && highCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full" />
              )}
            </button>
          ))}

          <div className="flex-1" />

          <button onClick={handleSimulate} title="Simulate Email"
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-lg transition-all">
            +
          </button>
          <button onClick={handleFetchGmail} disabled={fetching} title="Fetch Gmail"
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-lg transition-all disabled:opacity-40">
            {fetching ? '…' : '⇩'}
          </button>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden flex-col">

          {/* Top bar */}
          <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-base font-semibold text-white tracking-tight">AI Email Assistant</h1>
              <p className="text-xs text-slate-500">Hi {settings.name} · {settings.start}–{settings.end} · {settings.timezone} · auto-sync 1 min</p>
            </div>
            {/* Analytics Pills */}
            <div className="flex gap-3">
              {[
                { label: 'Total',     value: analytics.total_emails,     color: 'text-slate-300' },
                { label: 'Replied',   value: analytics.replied,           color: 'text-emerald-400' },
                { label: 'Pending',   value: analytics.pending,           color: 'text-amber-400' },
                { label: '🔴 High',   value: analytics.high_priority,     color: 'text-rose-400' },
                { label: 'Rate',      value: `${analytics.response_rate}%`, color: 'text-violet-400' },
              ].map(stat => (
                <div key={stat.label} className="text-center px-3 py-1.5 bg-slate-800 rounded-xl border border-slate-700">
                  <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* INBOX VIEW */}
          {view === 'inbox' && (
            <div className="flex flex-1 overflow-hidden">
              {/* Email List */}
              <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 overflow-y-auto">
                {highCount > 0 && (
                  <div className="mx-3 mt-3 mb-1 px-3 py-2 bg-rose-950/60 border border-rose-800/50 rounded-xl">
                    <p className="text-xs text-rose-400 font-medium">⚠ {highCount} high priority need attention</p>
                  </div>
                )}
                {emails.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                    <p className="text-4xl mb-3">◫</p>
                    <p className="text-sm">No emails yet</p>
                    <p className="text-xs mt-1">Press + or ⇩ above</p>
                  </div>
                )}
                {emails.map(email => {
                  const pc = priorityConfig[email.priority] || priorityConfig.low
                  const ic = intentConfig[email.intent] || intentConfig.general
                  const isSelected = selected?.id === email.id
                  return (
                    <div key={email.id}
                      onClick={() => { setSelected(email); setAiReply(''); setUserInput('') }}
                      className={`mx-2 my-1 p-3 rounded-xl cursor-pointer transition-all border
                        ${isSelected
                          ? 'bg-violet-600/20 border-violet-500/40'
                          : 'bg-slate-800/50 border-slate-700/40 hover:bg-slate-800 hover:border-slate-600'
                        }`}>
                      <div className="flex justify-between items-start mb-1.5">
                        <span className="text-xs font-semibold text-slate-300 truncate max-w-[140px]">{email.sender.split('<')[0].trim()}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pc.bg} ${pc.text}`}>
                          <Dot color={pc.dot} />{email.priority}
                        </span>
                      </div>
                      <p className="text-xs text-white font-medium truncate mb-1">{email.subject}</p>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{email.summary}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className={`text-xs font-medium ${ic.color}`}>{ic.icon} {ic.label}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${email.status === 'replied' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
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
                    <p className="text-6xl mb-4">◫</p>
                    <p className="text-lg font-medium">Select an email</p>
                    <p className="text-sm mt-1">or press + to simulate one</p>
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto p-6 space-y-4">

                    {/* Email Header Card */}
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1 mr-4">
                          <h2 className="text-lg font-semibold text-white mb-1">{selected.subject}</h2>
                          <p className="text-sm text-slate-400">From: {selected.sender}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {(() => {
                            const pc = priorityConfig[selected.priority] || priorityConfig.low
                            const ic = intentConfig[selected.intent] || intentConfig.general
                            return <>
                              <span className={`text-xs px-3 py-1.5 rounded-xl font-medium ${pc.bg} ${pc.text} border border-current/20`}>
                                {selected.priority}
                              </span>
                              <span className={`text-xs px-3 py-1.5 rounded-xl font-medium bg-slate-800 ${ic.color} border border-slate-700`}>
                                {ic.icon} {ic.label}
                              </span>
                            </>
                          })()}
                        </div>
                      </div>

                      {/* AI Summary */}
                      <div className="bg-violet-950/40 border border-violet-800/30 rounded-xl p-4 mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">AI Summary</p>
                          <button onClick={handleThreadSummary}
                            className="text-xs text-violet-400 hover:text-violet-300 underline underline-offset-2">
                            View thread
                          </button>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed">{selected.summary}</p>
                      </div>

                      {/* Original Email */}
                      <div>
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Original</p>
                        <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{selected.body}</p>
                      </div>
                    </div>

                    {/* Schedule Button */}
                    {selected.intent === 'meeting_request' && (
                      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Action</p>
                        <button onClick={handleSchedule}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-medium transition-all text-sm">
                          ⬡ Check Conflicts & Schedule Meeting
                        </button>
                        <p className="text-xs text-slate-600 text-center mt-2">Creates Google Calendar event automatically</p>
                      </div>
                    )}

                    {/* Reply Section */}
                    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Your Response</p>
                      <div className="flex gap-2 mb-3 flex-wrap">
                        {['Yes, confirmed!', 'No, not available', 'Reschedule please', 'Need more info'].map(q => (
                          <button key={q} onClick={() => setUserInput(q)}
                            className={`text-xs px-3 py-1.5 rounded-lg transition-all border
                              ${userInput === q
                                ? 'bg-violet-600 text-white border-violet-500'
                                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'}`}>
                            {q}
                          </button>
                        ))}
                      </div>
                      <textarea value={userInput} onChange={e => setUserInput(e.target.value)}
                        placeholder="Or type a custom instruction..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
                        rows={3} />
                      <button onClick={handleReply} disabled={loading || !userInput}
                        className="mt-3 w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-3 rounded-xl font-medium transition-all text-sm">
                        {loading ? '✍ Writing reply...' : '↑ Generate & Send Reply'}
                      </button>

                      {aiReply && (
                        <div className="mt-4 bg-emerald-950/40 border border-emerald-800/30 rounded-xl p-4">
                          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">✓ Reply Sent</p>
                          <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{aiReply}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SCHEDULE VIEW */}
          {view === 'schedule' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-2xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-semibold text-white">Upcoming Meetings</h2>
                  <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800/40 px-3 py-1.5 rounded-xl">
                    ✓ Synced with Google Calendar
                  </span>
                </div>
                {schedules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-700">
                    <p className="text-5xl mb-3">⬡</p>
                    <p className="text-base">No meetings yet</p>
                    <p className="text-sm mt-1">Schedule one from an email</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedules.map(s => (
                      <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center hover:border-slate-700 transition-all">
                        <div>
                          <h3 className="font-semibold text-white text-sm">{s.event_title}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">With: {s.attendees}</p>
                          {s.calendar_event_id && (
                            <span className="text-xs text-emerald-500 mt-1 inline-block">✓ Google Calendar</span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-violet-400">{new Date(s.start_time).toLocaleDateString()}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{new Date(s.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS VIEW */}
          {view === 'settings' && (
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="max-w-lg mx-auto space-y-4">
                <h2 className="text-lg font-semibold text-white mb-6">Settings</h2>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Your Name</label>
                    <input type="text" value={settingsForm.name}
                      onChange={e => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
                      placeholder="Your name" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Work Start</label>
                      <input type="time" value={settingsForm.start}
                        onChange={e => setSettingsForm({ ...settingsForm, start: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Work End</label>
                      <input type="time" value={settingsForm.end}
                        onChange={e => setSettingsForm({ ...settingsForm, end: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Timezone</label>
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
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <p className="text-sm text-slate-300">Gmail connected via OAuth</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <p className="text-sm text-slate-300">Google Calendar connected</p>
                    </div>
                  </div>
                  <button onClick={handleFetchGmail} disabled={fetching}
                    className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white py-2.5 rounded-xl font-medium text-sm transition-all">
                    {fetching ? 'Fetching...' : '⇩ Fetch Latest from Gmail'}
                  </button>
                </div>

                <div className="bg-slate-900 border border-rose-900/50 rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Demo Controls</p>
                  <button onClick={handleReset}
                    className="w-full bg-rose-900/50 hover:bg-rose-800/60 border border-rose-800/50 text-rose-400 py-2.5 rounded-xl font-medium text-sm transition-all">
                    ⊘ Clear All Data — Fresh Demo Start
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