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
interface Settings { start: string; end: string; timezone: string; name: string }
interface Analytics { total_emails: number; replied: number; pending: number; high_priority: number; meetings_scheduled: number; response_rate: number }
interface Weather { greeting: string; time_of_day: string; temp_c: string; weather_desc: string; weather_type: string; humidity: string; suggestion: string; alert: boolean }

function WeatherIcon({ type, tod }: { type: string; tod: string }) {
  const night = tod === 'night'
  const base = "transition-all duration-500"
  if (type === 'storm')  return <span className={base} style={{fontSize:20}}>⛈️</span>
  if (type === 'rainy')  return <span className={base} style={{fontSize:20}}>{night ? '🌧️' : '🌦️'}</span>
  if (type === 'cloudy') return <span className={base} style={{fontSize:20}}>{night ? '☁️' : '⛅'}</span>
  if (type === 'foggy')  return <span className={base} style={{fontSize:20}}>🌫️</span>
  if (type === 'snow')   return <span className={base} style={{fontSize:20}}>❄️</span>
  if (night)             return <span className={base} style={{fontSize:20}}>🌙</span>
  return <span className={base} style={{fontSize:20}}>☀️</span>
}

const P_COLOR: Record<string, {pill:string; dot:string}> = {
  high:   { pill: 'bg-red-50 text-red-700 ring-1 ring-red-200',         dot: 'bg-red-500' },
  medium: { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',   dot: 'bg-amber-400' },
  low:    { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
}
const I_COLOR: Record<string, {label:string; color:string}> = {
  meeting_request: { label:'Meeting',   color:'text-blue-600' },
  follow_up:       { label:'Follow-up', color:'text-indigo-600' },
  conflict:        { label:'Conflict',  color:'text-rose-600' },
  general:         { label:'General',   color:'text-slate-500' },
}

export default function App() {
  const [emails, setEmails]           = useState<Email[]>([])
  const [schedules, setSchedules]     = useState<Schedule[]>([])
  const [selected, setSelected]       = useState<Email | null>(null)
  const [userInput, setUserInput]     = useState('')
  const [aiReply, setAiReply]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [fetching, setFetching]       = useState(false)
  const [view, setView]               = useState<'inbox'|'schedule'|'settings'>('inbox')
  const [toast, setToast]             = useState<{msg:string;type:'ok'|'err'|'warn'}|null>(null)
  const [settings, setSettings]       = useState<Settings>({start:'09:00',end:'18:00',timezone:'Asia/Kolkata',name:'User'})
  const [settingsForm, setSettingsForm] = useState<Settings>({start:'09:00',end:'18:00',timezone:'Asia/Kolkata',name:'User'})
  const [analytics, setAnalytics]     = useState<Analytics>({total_emails:0,replied:0,pending:0,high_priority:0,meetings_scheduled:0,response_rate:0})
  const [weather, setWeather]         = useState<Weather>({greeting:'Good morning',time_of_day:'morning',temp_c:'--',weather_desc:'',weather_type:'sunny',humidity:'--',suggestion:'',alert:false})
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(() => {
    fetchAll(); fetchSettings(); fetchWeather()
    const iv = setInterval(() => { fetchAll(); fetchWeather() }, 60000)
    return () => clearInterval(iv)
  }, [])

  const fetchAll = () => { fe(); fs(); fa() }
  const fe = async () => { try { const r = await axios.get(`${API}/emails/priority`); setEmails(r.data) } catch {} }
  const fs = async () => { try { const r = await axios.get(`${API}/schedule`); setSchedules(r.data) } catch {} }
  const fetchSettings = async () => { try { const r = await axios.get(`${API}/settings/working-hours`); setSettings(r.data); setSettingsForm(r.data) } catch {} }
  const fa = async () => { try { const r = await axios.get(`${API}/analytics`); setAnalytics(r.data) } catch {} }
  const fetchWeather = async () => { try { const r = await axios.get(`${API}/weather`); setWeather(r.data) } catch {} }

  const notify = (msg: string, type: 'ok'|'err'|'warn' = 'ok') => {
    if (timer.current) clearTimeout(timer.current)
    setToast({msg, type})
    timer.current = setTimeout(() => setToast(null), 5000)
  }

  const handleReply = async () => {
    if (!selected || !userInput) return
    setLoading(true)
    try {
      const r = await axios.post(`${API}/emails/reply`, {email_id: selected.id, user_input: userInput})
      setAiReply(r.data.reply); notify('Reply sent successfully'); fe(); fa()
    } catch { notify('Failed to send reply', 'err') }
    setLoading(false)
  }

  const handleSchedule = async () => {
    if (!selected) return
    const t = selected.body.match(/\d{1,2}(am|pm|:\d{2})/i)?.[0] || 'tomorrow 3pm'
    const cr = await axios.post(`${API}/schedule/check?time_str=${encodeURIComponent(t)}`)
    if (cr.data.conflict) {
      notify('Scheduling conflict — auto-declining request', 'warn')
      await axios.post(`${API}/emails/reply`, {email_id: selected.id, user_input: 'decline politely due to scheduling conflict, suggest another time'})
      fe()
    } else {
      await axios.post(`${API}/schedule/save`, {email_id: selected.id, title: selected.subject, start_time: t, attendees: selected.sender})
      notify('Meeting scheduled · Calendar event created'); fs(); fa()
    }
  }

  const handleSimulate   = async () => { await axios.post(`${API}/emails/simulate`); fe(); fa(); notify('Test email added to inbox') }
  const handleFetchGmail = async () => {
    setFetching(true)
    try { const r = await axios.get(`${API}/gmail/fetch`); fe(); fa(); notify(`${r.data.fetched} emails synced from Gmail`) }
    catch { notify('Gmail sync failed', 'err') }
    setFetching(false)
  }
  const handleThread = async () => {
    if (!selected) return
    try { const r = await axios.get(`${API}/emails/thread/${encodeURIComponent(selected.sender)}`); notify(`Thread · ${r.data.email_count} emails: ${r.data.summary}`) }
    catch { notify('Thread not found', 'err') }
  }
  const handleSave = async () => {
    try { await axios.post(`${API}/settings/working-hours`, settingsForm); setSettings(settingsForm); notify('Settings updated') }
    catch { notify('Update failed', 'err') }
  }
  const handleReset = async () => {
    if (!confirm('Clear all data and start fresh?')) return
    await axios.delete(`${API}/reset`); fetchAll(); setSelected(null); notify('Database cleared')
  }

  const highCount = emails.filter(e => e.priority === 'high' && e.status === 'pending').length
  const tc = toast?.type === 'err' ? '#dc2626' : toast?.type === 'warn' ? '#d97706' : '#059669'

  const navItems = [
    { id: 'inbox',    label: 'Inbox',    icon: '✉', badge: emails.length, alert: highCount > 0 },
    { id: 'schedule', label: 'Schedule', icon: '◷', badge: schedules.length, alert: false },
    { id: 'settings', label: 'Settings', icon: '◈', badge: 0, alert: false },
  ]

  return (
    <div style={{fontFamily:"'Inter','Segoe UI',sans-serif",background:'#f8f9fb',minHeight:'100vh',display:'flex',flexDirection:'column',fontSize:13,color:'#1a1d23'}}>

      {/* Toast */}
      {toast && (
        <div style={{position:'fixed',top:20,right:20,zIndex:999,background:tc,color:'#fff',padding:'10px 18px',borderRadius:10,fontSize:13,fontWeight:500,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',maxWidth:320,transition:'all 0.3s'}}>
          {toast.msg}
        </div>
      )}

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* ── Sidebar ── */}
        <aside style={{width:220,background:'#ffffff',borderRight:'1px solid #e8eaed',display:'flex',flexDirection:'column',padding:'20px 12px',flexShrink:0}}>

          {/* Brand */}
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'0 8px',marginBottom:28}}>
            <div style={{width:32,height:32,borderRadius:8,background:'#1d4ed8',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:12,flexShrink:0}}>AI</div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:'#1a1d23',lineHeight:1.2}}>Mail Assistant</div>
              <div style={{fontSize:11,color:'#9ca3af',lineHeight:1.2}}>Autonomous Agent</div>
            </div>
          </div>

          {/* Nav */}
          <nav style={{display:'flex',flexDirection:'column',gap:2}}>
            {navItems.map(tab => {
              const active = view === tab.id
              return (
                <button key={tab.id} onClick={() => setView(tab.id as typeof view)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:8,border:'none',cursor:'pointer',textAlign:'left',transition:'background 0.15s',background: active ? '#eff6ff' : 'transparent',color: active ? '#1d4ed8' : '#6b7280',width:'100%'}}>
                  <span style={{fontSize:15,width:18,textAlign:'center',flexShrink:0}}>{tab.icon}</span>
                  <span style={{fontSize:13,fontWeight: active ? 600 : 400,flex:1}}>{tab.label}</span>
                  {tab.badge > 0 && (
                    <span style={{fontSize:11,background: tab.alert ? '#fee2e2' : '#f3f4f6',color: tab.alert ? '#dc2626' : '#6b7280',padding:'1px 7px',borderRadius:10,fontWeight:600}}>{tab.badge}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div style={{flex:1}} />

          {/* Actions */}
          <div style={{borderTop:'1px solid #f3f4f6',paddingTop:12,display:'flex',flexDirection:'column',gap:2}}>
            <button onClick={handleSimulate}
              style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:8,border:'none',cursor:'pointer',textAlign:'left',background:'transparent',color:'#6b7280',width:'100%',transition:'background 0.15s'}}
              onMouseEnter={e=>(e.currentTarget.style.background='#f9fafb')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <span style={{fontSize:15,width:18,textAlign:'center',flexShrink:0}}>＋</span>
              <div>
                <div style={{fontSize:13,fontWeight:500,lineHeight:1.2,color:'#374151'}}>Simulate Email</div>
                <div style={{fontSize:11,color:'#9ca3af',lineHeight:1.4}}>Add test message</div>
              </div>
            </button>
            <button onClick={handleFetchGmail} disabled={fetching}
              style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:8,border:'none',cursor:'pointer',textAlign:'left',background:'transparent',color:'#6b7280',width:'100%',opacity: fetching ? 0.5 : 1,transition:'background 0.15s'}}
              onMouseEnter={e=>(e.currentTarget.style.background='#f9fafb')}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <span style={{fontSize:15,width:18,textAlign:'center',flexShrink:0}}>⇩</span>
              <div>
                <div style={{fontSize:13,fontWeight:500,lineHeight:1.2,color:'#374151'}}>{fetching ? 'Syncing...' : 'Sync Gmail'}</div>
                <div style={{fontSize:11,color:'#9ca3af',lineHeight:1.4}}>Fetch real emails</div>
              </div>
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={{display:'flex',flex:1,overflow:'hidden',flexDirection:'column'}}>

          {/* Header */}
          <header style={{background:'#ffffff',borderBottom:'1px solid #e8eaed',padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:16}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <WeatherIcon type={weather.weather_type} tod={weather.time_of_day} />
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:'#1a1d23',lineHeight:1.3}}>{weather.greeting}, {settings.name}</div>
                  <div style={{fontSize:11,color:'#9ca3af',lineHeight:1.3}}>{weather.temp_c}°C · {weather.weather_desc || 'Loading...'} · {settings.start}–{settings.end} IST</div>
                </div>
              </div>
              {weather.alert && (
                <div style={{display:'flex',alignItems:'center',gap:6,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'5px 12px'}}>
                  <span style={{fontSize:12}}>⚠</span>
                  <span style={{fontSize:12,color:'#92400e',fontWeight:500}}>{weather.suggestion}</span>
                </div>
              )}
            </div>

            {/* Stats */}
            <div style={{display:'flex',gap:8}}>
              {[
                {label:'Emails',  val:analytics.total_emails,       c:'#1d4ed8'},
                {label:'Replied', val:analytics.replied,             c:'#059669'},
                {label:'Pending', val:analytics.pending,             c:'#d97706'},
                {label:'High',    val:analytics.high_priority,       c:'#dc2626'},
                {label:'Rate',    val:`${analytics.response_rate}%`, c:'#7c3aed'},
              ].map(s => (
                <div key={s.label} style={{textAlign:'center',padding:'6px 14px',background:'#f8f9fb',borderRadius:8,border:'1px solid #e8eaed',minWidth:58}}>
                  <div style={{fontSize:15,fontWeight:700,color:s.c,lineHeight:1.2}}>{s.val}</div>
                  <div style={{fontSize:10,color:'#9ca3af',lineHeight:1.3,marginTop:1}}>{s.label}</div>
                </div>
              ))}
            </div>
          </header>

          {/* ── INBOX ── */}
          {view === 'inbox' && (
            <div style={{display:'flex',flex:1,overflow:'hidden'}}>

              {/* List */}
              <div style={{width:320,flexShrink:0,background:'#ffffff',borderRight:'1px solid #e8eaed',overflowY:'auto'}}>
                {highCount > 0 && (
                  <div style={{margin:'12px 12px 4px',padding:'8px 12px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8}}>
                    <span style={{fontSize:12,color:'#b91c1c',fontWeight:500}}>⚠ {highCount} high-priority message{highCount > 1 ? 's' : ''} require attention</span>
                  </div>
                )}
                {emails.length === 0 && (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:180,color:'#d1d5db'}}>
                    <div style={{fontSize:32,marginBottom:8}}>✉</div>
                    <div style={{fontSize:13,fontWeight:500,color:'#9ca3af'}}>No messages</div>
                    <div style={{fontSize:11,color:'#d1d5db',marginTop:4}}>Simulate or sync Gmail to begin</div>
                  </div>
                )}
                {emails.map(email => {
                  const pc = P_COLOR[email.priority] || P_COLOR.low
                  const ic = I_COLOR[email.intent] || I_COLOR.general
                  const active = selected?.id === email.id
                  return (
                    <div key={email.id} onClick={() => { setSelected(email); setAiReply(''); setUserInput('') }}
                      style={{margin:'4px 8px',padding:'11px 12px',borderRadius:8,cursor:'pointer',border: active ? '1px solid #bfdbfe' : '1px solid transparent',background: active ? '#eff6ff' : 'transparent',transition:'all 0.15s'}}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f9fafb' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>
                          {email.sender.split('<')[0].replace(/"/g,'').trim()}
                        </span>
                        <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,fontWeight:500,flexShrink:0,marginLeft:6}} className={pc.pill}>
                          {email.priority}
                        </span>
                      </div>
                      <div style={{fontSize:12,fontWeight:600,color:'#1a1d23',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:4}}>{email.subject}</div>
                      <div style={{fontSize:11,color:'#6b7280',lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',marginBottom:6}}>{email.summary}</div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <span style={{fontSize:11,fontWeight:500}} className={ic.color}>{ic.label}</span>
                        <span style={{fontSize:11,padding:'1px 8px',borderRadius:20,background: email.status==='replied' ? '#dcfce7' : '#f3f4f6',color: email.status==='replied' ? '#15803d' : '#9ca3af',fontWeight:500}}>
                          {email.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Detail */}
              <div style={{flex:1,overflowY:'auto',background:'#f8f9fb'}}>
                {!selected ? (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',color:'#d1d5db'}}>
                    <div style={{fontSize:40,marginBottom:12}}>✉</div>
                    <div style={{fontSize:14,fontWeight:500,color:'#9ca3af'}}>Select a message</div>
                    <div style={{fontSize:12,color:'#d1d5db',marginTop:4}}>Choose from the list to view details</div>
                  </div>
                ) : (
                  <div style={{maxWidth:640,margin:'0 auto',padding:24,display:'flex',flexDirection:'column',gap:16}}>

                    {/* Email Card */}
                    <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8eaed',padding:20}}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:16}}>
                        <div style={{flex:1,minWidth:0}}>
                          <h2 style={{fontSize:15,fontWeight:700,color:'#1a1d23',lineHeight:1.3,marginBottom:4}}>{selected.subject}</h2>
                          <div style={{fontSize:12,color:'#6b7280'}}>From: {selected.sender}</div>
                        </div>
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          {(() => {
                            const pc = P_COLOR[selected.priority] || P_COLOR.low
                            const ic = I_COLOR[selected.intent] || I_COLOR.general
                            return <>
                              <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600}} className={pc.pill}>{selected.priority}</span>
                              <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600,background:'#f3f4f6',color:'#374151'}} className={ic.color}>{ic.label}</span>
                            </>
                          })()}
                        </div>
                      </div>

                      {/* Summary */}
                      <div style={{background:'#eff6ff',border:'1px solid #dbeafe',borderRadius:8,padding:14,marginBottom:14}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                          <span style={{fontSize:10,fontWeight:700,color:'#1d4ed8',textTransform:'uppercase',letterSpacing:'0.06em'}}>AI Summary</span>
                          <button onClick={handleThread} style={{fontSize:11,color:'#1d4ed8',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',padding:0}}>View thread</button>
                        </div>
                        <p style={{fontSize:12,color:'#1e3a5f',lineHeight:1.6}}>{selected.summary}</p>
                      </div>

                      {/* Body */}
                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Original Message</div>
                        <p style={{fontSize:12,color:'#374151',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{selected.body}</p>
                      </div>
                    </div>

                    {/* Schedule */}
                    {selected.intent === 'meeting_request' && (
                      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8eaed',padding:20}}>
                        <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Scheduling</div>
                        {weather.alert && (
                          <div style={{display:'flex',alignItems:'center',gap:8,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',marginBottom:12}}>
                            <span style={{fontSize:12}}>⚠</span>
                            <span style={{fontSize:12,color:'#92400e'}}>{weather.suggestion}</span>
                          </div>
                        )}
                        <button onClick={handleSchedule}
                          style={{width:'100%',background:'#059669',color:'#fff',border:'none',borderRadius:8,padding:'11px 16px',fontSize:13,fontWeight:600,cursor:'pointer',transition:'background 0.15s'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='#047857')}
                          onMouseLeave={e=>(e.currentTarget.style.background='#059669')}>
                          Check Conflicts & Schedule Meeting
                        </button>
                        <div style={{fontSize:11,color:'#9ca3af',textAlign:'center',marginTop:8}}>Creates a Google Calendar event and sends invites automatically</div>
                      </div>
                    )}

                    {/* Reply */}
                    <div style={{background:'#fff',borderRadius:12,border:'1px solid #e8eaed',padding:20}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Compose Reply</div>
                      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                        {['Yes, confirmed', 'Not available', 'Reschedule', 'Need details'].map(q => (
                          <button key={q} onClick={() => setUserInput(q)}
                            style={{fontSize:12,padding:'6px 14px',borderRadius:20,border: userInput === q ? '1.5px solid #1d4ed8' : '1px solid #e8eaed',background: userInput === q ? '#eff6ff' : '#fff',color: userInput === q ? '#1d4ed8' : '#6b7280',cursor:'pointer',fontWeight: userInput === q ? 600 : 400,transition:'all 0.15s'}}>
                            {q}
                          </button>
                        ))}
                      </div>
                      <textarea value={userInput} onChange={e => setUserInput(e.target.value)}
                        placeholder="Or type a custom instruction for the AI..."
                        style={{width:'100%',background:'#f8f9fb',border:'1px solid #e8eaed',borderRadius:8,padding:'12px 14px',fontSize:13,color:'#1a1d23',resize:'none',outline:'none',lineHeight:1.6,boxSizing:'border-box',fontFamily:'inherit',transition:'border 0.15s'}}
                        rows={3}
                        onFocus={e=>(e.currentTarget.style.border='1px solid #1d4ed8')}
                        onBlur={e=>(e.currentTarget.style.border='1px solid #e8eaed')} />
                      <button onClick={handleReply} disabled={loading || !userInput}
                        style={{marginTop:10,width:'100%',background: loading || !userInput ? '#9ca3af' : '#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'11px 16px',fontSize:13,fontWeight:600,cursor: loading || !userInput ? 'not-allowed' : 'pointer',transition:'background 0.15s'}}
                        onMouseEnter={e=>{ if(!loading && userInput) e.currentTarget.style.background='#1e40af' }}
                        onMouseLeave={e=>{ if(!loading && userInput) e.currentTarget.style.background='#1d4ed8' }}>
                        {loading ? 'Composing reply...' : 'Generate & Send Reply'}
                      </button>
                      {aiReply && (
                        <div style={{marginTop:14,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:14}}>
                          <div style={{fontSize:10,fontWeight:700,color:'#15803d',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>✓ Reply Sent</div>
                          <p style={{fontSize:12,color:'#14532d',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{aiReply}</p>
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
            <div style={{flex:1,padding:24,overflowY:'auto'}}>
              <div style={{maxWidth:640,margin:'0 auto'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
                  <h2 style={{fontSize:16,fontWeight:700,color:'#1a1d23'}}>Upcoming Meetings</h2>
                  <span style={{fontSize:11,background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',padding:'4px 12px',borderRadius:20,fontWeight:600}}>✓ Google Calendar Synced</span>
                </div>
                {weather.alert && (
                  <div style={{display:'flex',alignItems:'center',gap:8,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'10px 14px',marginBottom:16}}>
                    <span style={{fontSize:13}}>⚠</span>
                    <span style={{fontSize:12,color:'#92400e',fontWeight:500}}>{weather.suggestion} — consider scheduling online meetings</span>
                  </div>
                )}
                {schedules.length === 0 ? (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:160,color:'#d1d5db'}}>
                    <div style={{fontSize:32,marginBottom:8}}>◷</div>
                    <div style={{fontSize:13,fontWeight:500,color:'#9ca3af'}}>No meetings scheduled</div>
                    <div style={{fontSize:11,color:'#d1d5db',marginTop:4}}>Schedule one from an email</div>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {schedules.map(s => (
                      <div key={s.id} style={{background:'#fff',border:'1px solid #e8eaed',borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',transition:'border 0.15s'}}
                        onMouseEnter={e=>(e.currentTarget.style.border='1px solid #bfdbfe')}
                        onMouseLeave={e=>(e.currentTarget.style.border='1px solid #e8eaed')}>
                        <div style={{flex:1,minWidth:0,marginRight:16}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#1a1d23',marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.event_title}</div>
                          <div style={{fontSize:11,color:'#9ca3af'}}>With: {s.attendees}</div>
                          {s.calendar_event_id && <div style={{fontSize:11,color:'#059669',marginTop:3,fontWeight:500}}>✓ Google Calendar event created</div>}
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#1d4ed8'}}>{new Date(s.start_time).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</div>
                          <div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>{new Date(s.start_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
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
            <div style={{flex:1,padding:24,overflowY:'auto'}}>
              <div style={{maxWidth:480,margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>
                <h2 style={{fontSize:16,fontWeight:700,color:'#1a1d23',marginBottom:4}}>Settings</h2>

                {/* Profile */}
                <div style={{background:'#fff',border:'1px solid #e8eaed',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em'}}>Profile & Working Hours</div>
                  <div>
                    <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Your Name</label>
                    <input type="text" value={settingsForm.name} onChange={e => setSettingsForm({...settingsForm, name: e.target.value})}
                      style={{width:'100%',background:'#f8f9fb',border:'1px solid #e8eaed',borderRadius:8,padding:'9px 12px',fontSize:13,color:'#1a1d23',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
                      onFocus={e=>(e.currentTarget.style.border='1px solid #1d4ed8')}
                      onBlur={e=>(e.currentTarget.style.border='1px solid #e8eaed')}
                      placeholder="Enter your name" />
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[['Work Start','start'],['Work End','end']].map(([label, key]) => (
                      <div key={key}>
                        <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>{label}</label>
                        <input type="time" value={settingsForm[key as keyof Settings]}
                          onChange={e => setSettingsForm({...settingsForm, [key]: e.target.value})}
                          style={{width:'100%',background:'#f8f9fb',border:'1px solid #e8eaed',borderRadius:8,padding:'9px 12px',fontSize:13,color:'#1a1d23',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
                          onFocus={e=>(e.currentTarget.style.border='1px solid #1d4ed8')}
                          onBlur={e=>(e.currentTarget.style.border='1px solid #e8eaed')} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label style={{fontSize:12,fontWeight:500,color:'#374151',display:'block',marginBottom:6}}>Timezone</label>
                    <select value={settingsForm.timezone} onChange={e => setSettingsForm({...settingsForm, timezone: e.target.value})}
                      style={{width:'100%',background:'#f8f9fb',border:'1px solid #e8eaed',borderRadius:8,padding:'9px 12px',fontSize:13,color:'#1a1d23',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                    </select>
                  </div>
                  <button onClick={handleSave}
                    style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer',transition:'background 0.15s'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#1e40af')}
                    onMouseLeave={e=>(e.currentTarget.style.background='#1d4ed8')}>
                    Save Changes
                  </button>
                </div>

                {/* Connections */}
                <div style={{background:'#fff',border:'1px solid #e8eaed',borderRadius:12,padding:20}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:14}}>Integrations</div>
                  <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:14}}>
                    {[['Gmail','OAuth 2.0 · Connected'],['Google Calendar','API · Connected']].map(([name, status]) => (
                      <div key={name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:'#f8f9fb',borderRadius:8,border:'1px solid #e8eaed'}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:'#1a1d23'}}>{name}</div>
                          <div style={{fontSize:11,color:'#9ca3af',marginTop:1}}>{status}</div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:7,height:7,borderRadius:'50%',background:'#059669'}} />
                          <span style={{fontSize:11,color:'#059669',fontWeight:600}}>Active</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleFetchGmail} disabled={fetching}
                    style={{width:'100%',background:'#0284c7',color:'#fff',border:'none',borderRadius:8,padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer',opacity: fetching ? 0.6 : 1,transition:'background 0.15s'}}
                    onMouseEnter={e=>{ if(!fetching) e.currentTarget.style.background='#0369a1' }}
                    onMouseLeave={e=>{ if(!fetching) e.currentTarget.style.background='#0284c7' }}>
                    {fetching ? 'Syncing...' : 'Sync Latest Emails from Gmail'}
                  </button>
                </div>

                {/* Danger */}
                <div style={{background:'#fff',border:'1px solid #fecaca',borderRadius:12,padding:20}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Danger Zone</div>
                  <button onClick={handleReset}
                    style={{width:'100%',background:'#fff',color:'#dc2626',border:'1px solid #fecaca',borderRadius:8,padding:'10px 16px',fontSize:13,fontWeight:600,cursor:'pointer',transition:'all 0.15s'}}
                    onMouseEnter={e=>{ e.currentTarget.style.background='#fef2f2' }}
                    onMouseLeave={e=>{ e.currentTarget.style.background='#fff' }}>
                    Clear All Data — Reset for Demo
                  </button>
                  <div style={{fontSize:11,color:'#9ca3af',marginTop:8,textAlign:'center'}}>This will permanently delete all emails, schedules and replies</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}