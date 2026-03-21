import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API = 'http://localhost:8000'

interface Email {
  id: number; sender: string; subject: string; body: string
  summary: string; intent: string; priority: string
  status: string; is_read: number; received_at: string
}
interface Schedule {
  id: number; email_id: number; event_title: string
  start_time: string; end_time: string; attendees: string; calendar_event_id: string
}
interface Settings { start: string; end: string; timezone: string; name: string }
interface Analytics {
  total_emails: number; replied: number; pending: number
  high_priority: number; meetings_scheduled: number; response_rate: number; unread: number
}
interface Weather {
  greeting: string; time_of_day: string; temp_c: string
  weather_desc: string; weather_type: string; suggestion: string; alert: boolean
}
interface AIAction {
  id: number; action_type: string; email_id: number
  description: string; result: string; can_undo: number; undone: number; created_at: string
}
interface VIP { id: number; email: string; name: string }

function WeatherIcon({ type, tod }: { type: string; tod: string }) {
  const night = tod === 'night'
  if (type === 'storm') return <span style={{fontSize:18}}>⛈️</span>
  if (type === 'rainy') return <span style={{fontSize:18}}>{night ? '🌧️' : '🌦️'}</span>
  if (type === 'cloudy') return <span style={{fontSize:18}}>{night ? '☁️' : '⛅'}</span>
  if (type === 'foggy') return <span style={{fontSize:18}}>🌫️</span>
  if (type === 'snow') return <span style={{fontSize:18}}>❄️</span>
  if (night) return <span style={{fontSize:18}}>🌙</span>
  return <span style={{fontSize:18}}>☀️</span>
}

export default function App() {
  const [dark, setDark] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [emails, setEmails] = useState<Email[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selected, setSelected] = useState<Email | null>(null)
  const [userInput, setUserInput] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [view, setView] = useState<'inbox'|'schedule'|'settings'|'actions'|'vip'|'coordinate'>('inbox')
  const [toast, setToast] = useState<{msg:string;type:'ok'|'err'|'warn'}|null>(null)
  const [settings, setSettings] = useState<Settings>({start:'09:00',end:'18:00',timezone:'Asia/Kolkata',name:'User'})
  const [settingsForm, setSettingsForm] = useState<Settings>({start:'09:00',end:'18:00',timezone:'Asia/Kolkata',name:'User'})
  const [analytics, setAnalytics] = useState<Analytics>({total_emails:0,replied:0,pending:0,high_priority:0,meetings_scheduled:0,response_rate:0,unread:0})
  const [weather, setWeather] = useState<Weather>({greeting:'Good morning',time_of_day:'morning',temp_c:'--',weather_desc:'',weather_type:'sunny',suggestion:'',alert:false})
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [actions, setActions] = useState<AIAction[]>([])
  const [vips, setVips] = useState<VIP[]>([])
  const [newVipEmail, setNewVipEmail] = useState('')
  const [newVipName, setNewVipName] = useState('')
  const [ambiguity, setAmbiguity] = useState<{is_ambiguous:boolean;clarification_question:string}|null>(null)
  const [selectedEmails, setSelectedEmails] = useState<number[]>([])
  const [coordination, setCoordination] = useState<any>(null)
  const [digestEmail, setDigestEmail] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null)
  const [clock, setClock] = useState('')

  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const timeStr = now.toLocaleTimeString('en-IN', {
        timeZone: settings.timezone || 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
      setClock(timeStr)
    }
    updateClock()
    const iv = setInterval(updateClock, 1000)
    return () => clearInterval(iv)
  }, [settings.timezone])

  // Theme colors
  const t = {
    bg: dark ? '#0f172a' : '#f8f9fb',
    card: dark ? '#1e293b' : '#ffffff',
    border: dark ? '#334155' : '#e8eaed',
    text: dark ? '#f1f5f9' : '#1a1d23',
    muted: dark ? '#94a3b8' : '#6b7280',
    hover: dark ? '#1e293b' : '#f9fafb',
    input: dark ? '#0f172a' : '#f8f9fb',
    inputBorder: dark ? '#334155' : '#e8eaed',
    sidebar: dark ? '#1e293b' : '#ffffff',
    header: dark ? '#1e293b' : '#ffffff',
    activeNav: dark ? '#1d3461' : '#eff6ff',
    activeNavText: '#1d4ed8',
  }

  useEffect(() => {
    checkOnboarding()
    fetchAll()
    fetchSettings()
    fetchWeather()
    fetchActions()
    fetchVips()
    const iv = setInterval(() => { fetchAll(); fetchWeather() }, 60000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (selected) {
      fetchSuggestions(selected.id)
      checkAmbiguity(selected.id)
      markRead(selected.id)
    }
  }, [selected])

  const checkOnboarding = async () => {
    try {
      const r = await axios.get(`${API}/onboarding/status`)
      if (!r.data.complete) setOnboarding(true)
    } catch {}
  }

  const fetchAll = () => { fe(); fs(); fa() }
  const fe = async () => { try { const r = await axios.get(`${API}/emails/priority`); setEmails(r.data) } catch {} }
  const fs = async () => { try { const r = await axios.get(`${API}/schedule`); setSchedules(r.data) } catch {} }
  const fetchSettings = async () => { try { const r = await axios.get(`${API}/settings/working-hours`); setSettings(r.data); setSettingsForm(r.data) } catch {} }
  const fa = async () => { try { const r = await axios.get(`${API}/analytics`); setAnalytics(r.data) } catch {} }
  const fetchWeather = async () => { try { const r = await axios.get(`${API}/weather`); setWeather(r.data) } catch {} }
  const fetchActions = async () => { try { const r = await axios.get(`${API}/actions`); setActions(r.data) } catch {} }
  const fetchVips = async () => { try { const r = await axios.get(`${API}/vip`); setVips(r.data) } catch {} }
  const fetchSuggestions = async (id: number) => { try { const r = await axios.get(`${API}/emails/${id}/suggestions`); setSuggestions(r.data.suggestions) } catch {} }
  const checkAmbiguity = async (id: number) => { try { const r = await axios.get(`${API}/emails/${id}/ambiguity`); setAmbiguity(r.data) } catch {} }
  const markRead = async (id: number) => { try { await axios.patch(`${API}/emails/${id}/read`) } catch {} }

  const notify = (msg: string, type: 'ok'|'err'|'warn' = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({msg, type})
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  const completeOnboarding = async () => {
    try {
      await axios.post(`${API}/settings/working-hours`, settingsForm)
      await axios.post(`${API}/onboarding/complete`)
      setSettings(settingsForm)
      setOnboarding(false)
      notify('Welcome! Your assistant is ready.')
    } catch { notify('Setup failed', 'err') }
  }

  const handleReply = async () => {
    if (!selected || !userInput) return
    setLoading(true)
    try {
      const r = await axios.post(`${API}/emails/reply`, {email_id: selected.id, user_input: userInput})
      setAiReply(r.data.reply); notify('Reply sent!'); fe(); fa(); fetchActions()
    } catch { notify('Failed to send reply', 'err') }
    setLoading(false)
  }

  const handleSchedule = async () => {
    if (!selected) return
    const t2 = selected.body.match(/\d{1,2}(am|pm|:\d{2})/i)?.[0] || 'tomorrow 3pm'
    const cr = await axios.post(`${API}/schedule/check?time_str=${encodeURIComponent(t2)}`)
    if (cr.data.conflict) {
      notify('Conflict detected! Auto-declining...', 'warn')
      await axios.post(`${API}/emails/reply`, {email_id: selected.id, user_input: 'decline politely due to scheduling conflict, suggest another time'})
      fe(); fetchActions()
    } else {
      await axios.post(`${API}/schedule/save`, {email_id: selected.id, title: selected.subject, start_time: t2, attendees: selected.sender})
      notify('Meeting scheduled + Calendar event created!'); fs(); fa(); fetchActions()
    }
  }

  const handleUndo = async (actionId: number) => {
    try {
      await axios.post(`${API}/actions/${actionId}/undo`)
      notify('Action undone!'); fetchActions(); fe()
    } catch { notify('Cannot undo this action', 'err') }
  }

  const handleAddVip = async () => {
    if (!newVipEmail) return
    try {
      await axios.post(`${API}/vip/add`, {email: newVipEmail, name: newVipName || newVipEmail})
      notify(`${newVipName || newVipEmail} added as VIP`)
      setNewVipEmail(''); setNewVipName(''); fetchVips()
    } catch { notify('Failed to add VIP', 'err') }
  }

  const handleCoordinate = async () => {
    if (selectedEmails.length < 2) { notify('Select at least 2 emails to coordinate', 'warn'); return }
    try {
      const r = await axios.post(`${API}/coordinate`, {subject: 'Meeting Coordination', email_ids: selectedEmails})
      setCoordination(r.data)
      notify(`Found ${r.data.common_slots.length} common time slots!`)
    } catch { notify('Coordination failed', 'err') }
  }

  const handleSimulate = async () => { await axios.post(`${API}/emails/simulate`); fe(); fa(); notify('Test email added!') }
  const handleFetchGmail = async () => {
    setFetching(true)
    try { const r = await axios.get(`${API}/gmail/fetch`); fe(); fa(); notify(`${r.data.fetched} emails synced from Gmail`) }
    catch { notify('Gmail sync failed', 'err') }
    setFetching(false)
  }
  const handleSaveSettings = async () => {
    try { await axios.post(`${API}/settings/working-hours`, settingsForm); setSettings(settingsForm); notify('Settings saved!') }
    catch { notify('Save failed', 'err') }
  }
  const handleReset = async () => {
    if (!confirm('Clear all data?')) return
    await axios.delete(`${API}/reset`); fetchAll(); setSelected(null); notify('Cleared!')
  }
  const handleSetupDigest = async () => {
    if (!digestEmail) return
    try { await axios.post(`${API}/digest/setup?email=${encodeURIComponent(digestEmail)}`); notify(`Daily digest set for ${digestEmail}`) }
    catch { notify('Failed', 'err') }
  }

  const highCount = emails.filter(e => e.priority === 'high' && e.status === 'pending').length
  const unreadCount = emails.filter(e => !e.is_read).length

  const pb = (p: string) => p === 'high' ? {bg:'#fef2f2',color:'#b91c1c',border:'#fecaca'} : p === 'medium' ? {bg:'#fffbeb',color:'#92400e',border:'#fde68a'} : {bg:'#f0fdf4',color:'#166534',border:'#bbf7d0'}
  const ib = (i: string) => i === 'meeting_request' ? {label:'Meeting',color:'#1d4ed8'} : i === 'follow_up' ? {label:'Follow-up',color:'#4338ca'} : i === 'conflict' ? {label:'Conflict',color:'#dc2626'} : {label:'General',color:'#6b7280'}
  const tc2 = toast?.type === 'err' ? '#dc2626' : toast?.type === 'warn' ? '#d97706' : '#059669'

  const navItems = [
    {id:'inbox', label:'Inbox', icon:'✉', badge: unreadCount, alert: highCount > 0},
    {id:'schedule', label:'Schedule', icon:'◷', badge: schedules.length, alert: false},
    {id:'coordinate', label:'Coordinate', icon:'⇄', badge: 0, alert: false},
    {id:'actions', label:'AI Actions', icon:'⚡', badge: actions.filter(a=>!a.undone).length, alert: false},
    {id:'vip', label:'VIP Contacts', icon:'★', badge: vips.length, alert: false},
    {id:'settings', label:'Settings', icon:'◈', badge: 0, alert: false},
  ]

  const s = (x: object) => Object.assign({}, x)

  // ── ONBOARDING ──
  if (onboarding) {
    return (
      <div style={{minHeight:'100vh',background: dark ? '#0f172a' : '#f8f9fb',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Inter','Segoe UI',sans-serif"}}>
        <div style={{background: dark ? '#1e293b' : '#fff',borderRadius:16,border:`1px solid ${dark?'#334155':'#e8eaed'}`,padding:40,width:480,boxShadow:'0 20px 60px rgba(0,0,0,0.1)'}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <div style={{width:56,height:56,borderRadius:14,background:'#1d4ed8',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:20,margin:'0 auto 16px'}}>AI</div>
            <h1 style={{fontSize:22,fontWeight:700,color: dark?'#f1f5f9':'#1a1d23',marginBottom:8}}>Welcome to AI Email Assistant</h1>
            <p style={{fontSize:14,color: dark?'#94a3b8':'#6b7280'}}>Let's set up your assistant in 3 quick steps</p>
          </div>

          <div style={{display:'flex',gap:8,marginBottom:28,justifyContent:'center'}}>
            {[1,2,3].map(n => (
              <div key={n} style={{width:32,height:4,borderRadius:2,background: onboardingStep >= n ? '#1d4ed8' : (dark?'#334155':'#e8eaed'),transition:'background 0.3s'}} />
            ))}
          </div>

          {onboardingStep === 1 && (
            <div>
              <p style={{fontSize:13,fontWeight:600,color:dark?'#94a3b8':'#6b7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:16}}>Step 1 — Your Profile</p>
              <div style={{marginBottom:16}}>
                <label style={{fontSize:13,fontWeight:500,color:dark?'#f1f5f9':'#374151',display:'block',marginBottom:6}}>Your Name</label>
                <input value={settingsForm.name} onChange={e=>setSettingsForm({...settingsForm,name:e.target.value})}
                  style={{width:'100%',background:dark?'#0f172a':'#f8f9fb',border:`1px solid ${dark?'#334155':'#e8eaed'}`,borderRadius:8,padding:'10px 12px',fontSize:14,color:dark?'#f1f5f9':'#1a1d23',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
                  placeholder="Enter your name" />
              </div>
              <button onClick={() => setOnboardingStep(2)} style={{width:'100%',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'12px',fontSize:14,fontWeight:600,cursor:'pointer'}}>Continue →</button>
            </div>
          )}

          {onboardingStep === 2 && (
            <div>
              <p style={{fontSize:13,fontWeight:600,color:dark?'#94a3b8':'#6b7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:16}}>Step 2 — Working Hours</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div>
                  <label style={{fontSize:13,fontWeight:500,color:dark?'#f1f5f9':'#374151',display:'block',marginBottom:6}}>Start Time</label>
                  <input type="time" value={settingsForm.start} onChange={e=>setSettingsForm({...settingsForm,start:e.target.value})}
                    style={{width:'100%',background:dark?'#0f172a':'#f8f9fb',border:`1px solid ${dark?'#334155':'#e8eaed'}`,borderRadius:8,padding:'10px 12px',fontSize:14,color:dark?'#f1f5f9':'#1a1d23',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
                </div>
                <div>
                  <label style={{fontSize:13,fontWeight:500,color:dark?'#f1f5f9':'#374151',display:'block',marginBottom:6}}>End Time</label>
                  <input type="time" value={settingsForm.end} onChange={e=>setSettingsForm({...settingsForm,end:e.target.value})}
                    style={{width:'100%',background:dark?'#0f172a':'#f8f9fb',border:`1px solid ${dark?'#334155':'#e8eaed'}`,borderRadius:8,padding:'10px 12px',fontSize:14,color:dark?'#f1f5f9':'#1a1d23',outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={() => setOnboardingStep(1)} style={{flex:1,background:'transparent',color:dark?'#94a3b8':'#6b7280',border:`1px solid ${dark?'#334155':'#e8eaed'}`,borderRadius:8,padding:'12px',fontSize:14,fontWeight:500,cursor:'pointer'}}>← Back</button>
                <button onClick={() => setOnboardingStep(3)} style={{flex:2,background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'12px',fontSize:14,fontWeight:600,cursor:'pointer'}}>Continue →</button>
              </div>
            </div>
          )}

          {onboardingStep === 3 && (
            <div>
              <p style={{fontSize:13,fontWeight:600,color:dark?'#94a3b8':'#6b7280',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:16}}>Step 3 — Ready!</p>
              <div style={{background:dark?'#0f172a':'#f0fdf4',border:`1px solid ${dark?'#334155':'#bbf7d0'}`,borderRadius:10,padding:16,marginBottom:20}}>
                <p style={{fontSize:13,color:dark?'#86efac':'#166534',lineHeight:1.7}}>
                  ✓ Name: {settingsForm.name}<br/>
                  ✓ Working hours: {settingsForm.start} – {settingsForm.end}<br/>
                  ✓ AI will auto-fetch your Gmail every 60 seconds<br/>
                  ✓ Conflicts detected and declined automatically<br/>
                  ✓ Google Calendar events created on scheduling
                </p>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={() => setOnboardingStep(2)} style={{flex:1,background:'transparent',color:dark?'#94a3b8':'#6b7280',border:`1px solid ${dark?'#334155':'#e8eaed'}`,borderRadius:8,padding:'12px',fontSize:14,fontWeight:500,cursor:'pointer'}}>← Back</button>
                <button onClick={completeOnboarding} style={{flex:2,background:'#059669',color:'#fff',border:'none',borderRadius:8,padding:'12px',fontSize:14,fontWeight:600,cursor:'pointer'}}>Launch Assistant 🚀</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── MAIN APP ──
  return (
    <div style={{fontFamily:"'Inter','Segoe UI',sans-serif",background:t.bg,height:'100vh',display:'flex',flexDirection:'column',fontSize:13,color:t.text,transition:'background 0.3s',overflow:'hidden'}}>

      {toast && (
        <div style={{position:'fixed',top:20,right:20,zIndex:999,background:tc2,color:'#fff',padding:'10px 18px',borderRadius:10,fontSize:13,fontWeight:500,boxShadow:'0 4px 20px rgba(0,0,0,0.15)',maxWidth:320}}>
          {toast.msg}
        </div>
      )}

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* ── Sidebar ── */}
        <aside style={{width:220,background:t.sidebar,borderRight:`1px solid ${t.border}`,display:'flex',flexDirection:'column',padding:'20px 12px',flexShrink:0,transition:'background 0.3s'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'0 8px',marginBottom:24}}>
            <div style={{width:32,height:32,borderRadius:8,background:'#1d4ed8',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:12,flexShrink:0}}>AI</div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:t.text,lineHeight:1.2}}>Mail Assistant</div>
              <div style={{fontSize:11,color:t.muted,lineHeight:1.2}}>Autonomous Agent</div>
            </div>
          </div>

          <nav style={{display:'flex',flexDirection:'column',gap:2}}>
            {navItems.map(tab => {
              const active = view === tab.id
              return (
                <button key={tab.id} onClick={() => setView(tab.id as typeof view)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:8,border:'none',cursor:'pointer',textAlign:'left',background: active ? t.activeNav : 'transparent',color: active ? t.activeNavText : t.muted,width:'100%',transition:'background 0.15s'}}>
                  <span style={{fontSize:14,width:18,textAlign:'center',flexShrink:0}}>{tab.icon}</span>
                  <span style={{fontSize:13,fontWeight: active ? 600 : 400,flex:1,color: active ? t.activeNavText : t.text}}>{tab.label}</span>
                  {tab.badge > 0 && (
                    <span style={{fontSize:11,background: tab.alert ? '#fee2e2' : (dark?'#334155':'#f3f4f6'),color: tab.alert ? '#dc2626' : t.muted,padding:'1px 7px',borderRadius:10,fontWeight:600}}>{tab.badge}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div style={{flex:1}} />

          <div style={{borderTop:`1px solid ${t.border}`,paddingTop:12,display:'flex',flexDirection:'column',gap:2}}>
            <button onClick={handleSimulate}
              style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:8,border:'none',cursor:'pointer',background:'transparent',color:t.muted,width:'100%',transition:'background 0.15s'}}
              onMouseEnter={e=>(e.currentTarget.style.background=t.hover)}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <span style={{fontSize:14,width:18,textAlign:'center'}}>＋</span>
              <div><div style={{fontSize:13,fontWeight:500,color:t.text}}>Simulate</div><div style={{fontSize:11,color:t.muted}}>Add test email</div></div>
            </button>
            <button onClick={handleFetchGmail} disabled={fetching}
              style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:8,border:'none',cursor:'pointer',background:'transparent',color:t.muted,width:'100%',opacity:fetching?0.5:1,transition:'background 0.15s'}}
              onMouseEnter={e=>(e.currentTarget.style.background=t.hover)}
              onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
              <span style={{fontSize:14,width:18,textAlign:'center'}}>⇩</span>
              <div><div style={{fontSize:13,fontWeight:500,color:t.text}}>{fetching?'Syncing...':'Sync Gmail'}</div><div style={{fontSize:11,color:t.muted}}>Fetch real emails</div></div>
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <div style={{display:'flex',flex:1,overflow:'hidden',flexDirection:'column'}}>

          {/* Header */}
          <header style={{background:t.header,borderBottom:`1px solid ${t.border}`,padding:'12px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,transition:'background 0.3s'}}>
            <div style={{display:'flex',alignItems:'center',gap:16}}>
              <div style={{display:'flex',alignItems:'center',gap:16}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <WeatherIcon type={weather.weather_type} tod={weather.time_of_day} />
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:t.text,lineHeight:1.3}}>{weather.greeting}, {settings.name}</div>
                    <div style={{fontSize:11,color:t.muted,lineHeight:1.3}}>{weather.temp_c}°C · {weather.weather_desc||'Loading...'} · {settings.start}–{settings.end}</div>
                  </div>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'6px 14px',background: dark?'#0f172a':'#f8f9fb',borderRadius:10,border:`1px solid ${t.border}`,minWidth:90}}>
                  <div style={{fontSize:15,fontWeight:700,color:t.text,lineHeight:1.2,fontVariantNumeric:'tabular-nums'}}>{clock}</div>
                  <div style={{fontSize:10,color:t.muted,lineHeight:1.3}}>{settings.timezone?.split('/')[1]?.replace('_',' ') || 'IST'}</div>
                </div>
              </div>
              {weather.alert && (
                <div style={{display:'flex',alignItems:'center',gap:6,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'5px 12px'}}>
                  <span style={{fontSize:12}}>⚠</span>
                  <span style={{fontSize:12,color:'#92400e',fontWeight:500}}>{weather.suggestion}</span>
                </div>
              )}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {[
                {label:'Emails',val:analytics.total_emails,c:'#1d4ed8'},
                {label:'Unread',val:analytics.unread,c:'#7c3aed'},
                {label:'Replied',val:analytics.replied,c:'#059669'},
                {label:'Pending',val:analytics.pending,c:'#d97706'},
                {label:'High',val:analytics.high_priority,c:'#dc2626'},
                {label:'Rate',val:`${analytics.response_rate}%`,c:'#0891b2'},
              ].map(s2 => (
                <div key={s2.label} style={{textAlign:'center',padding:'5px 12px',background:dark?'#0f172a':'#f8f9fb',borderRadius:8,border:`1px solid ${t.border}`,minWidth:52}}>
                  <div style={{fontSize:14,fontWeight:700,color:s2.c,lineHeight:1.2}}>{s2.val}</div>
                  <div style={{fontSize:10,color:t.muted,lineHeight:1.3}}>{s2.label}</div>
                </div>
              ))}
              <button onClick={() => setDark(!dark)}
                style={{width:36,height:36,borderRadius:8,border:`1px solid ${t.border}`,background:dark?'#334155':'#f3f4f6',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>
                {dark ? '☀️' : '🌙'}
              </button>
            </div>
          </header>

          {/* ── INBOX ── */}
          {view === 'inbox' && (
            <div style={{display:'flex',flex:1,overflow:'hidden'}}>
              <div style={{width:320,flexShrink:0,background:t.sidebar,borderRight:`1px solid ${t.border}`,overflowY:'auto'}}>
                {highCount > 0 && (
                  <div style={{margin:'12px 12px 4px',padding:'8px 12px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8}}>
                    <span style={{fontSize:12,color:'#b91c1c',fontWeight:500}}>⚠ {highCount} high-priority need attention</span>
                  </div>
                )}
                {emails.length === 0 && (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:180,color:t.muted}}>
                    <div style={{fontSize:32,marginBottom:8}}>✉</div>
                    <div style={{fontSize:13,fontWeight:500}}>No messages</div>
                    <div style={{fontSize:11,marginTop:4}}>Simulate or sync Gmail</div>
                  </div>
                )}
                {emails.map(email => {
                  const p = pb(email.priority)
                  const i = ib(email.intent)
                  const active = selected?.id === email.id
                  const isVip = vips.some(v => email.sender.includes(v.email))
                  return (
                    <div key={email.id} onClick={() => { setSelected(email); setAiReply(''); setUserInput('') }}
                      style={{margin:'4px 8px',padding:'11px 12px',borderRadius:8,cursor:'pointer',border: active ? '1px solid #bfdbfe' : `1px solid transparent`,background: active ? (dark?'#1d3461':'#eff6ff') : 'transparent',transition:'all 0.15s',opacity: email.is_read ? 0.8 : 1}}
                      onMouseEnter={e => { if(!active) e.currentTarget.style.background=t.hover }}
                      onMouseLeave={e => { if(!active) e.currentTarget.style.background='transparent' }}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,overflow:'hidden'}}>
                          {!email.is_read && <div style={{width:6,height:6,borderRadius:'50%',background:'#1d4ed8',flexShrink:0}} />}
                          {isVip && <span style={{fontSize:10,color:'#d97706'}}>★</span>}
                          <span style={{fontSize:12,fontWeight: email.is_read ? 400 : 600,color:t.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:150}}>
                            {email.sender.split('<')[0].replace(/"/g,'').trim()}
                          </span>
                        </div>
                        <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,fontWeight:500,flexShrink:0,marginLeft:6,background:p.bg,color:p.color,border:`1px solid ${p.border}`}}>
                          {email.priority}
                        </span>
                      </div>
                      <div style={{fontSize:12,fontWeight:600,color:t.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:4}}>{email.subject}</div>
                      <div style={{fontSize:11,color:t.muted,lineHeight:1.5,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',marginBottom:6}}>{email.summary}</div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <span style={{fontSize:11,fontWeight:500,color:i.color}}>{i.label}</span>
                        <span style={{fontSize:11,padding:'1px 8px',borderRadius:20,background: email.status==='replied' ? '#dcfce7' : (dark?'#334155':'#f3f4f6'),color: email.status==='replied' ? '#15803d' : t.muted,fontWeight:500}}>
                          {email.status}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{flex:1,overflowY:'auto',background:t.bg}}>
                {!selected ? (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100%',color:t.muted}}>
                    <div style={{fontSize:40,marginBottom:12}}>✉</div>
                    <div style={{fontSize:14,fontWeight:500,color:t.muted}}>Select a message</div>
                    <div style={{fontSize:12,marginTop:4,color:t.muted}}>Choose from the list to view details</div>
                  </div>
                ) : (
                  <div style={{maxWidth:640,margin:'0 auto',padding:24,display:'flex',flexDirection:'column',gap:16}}>

                    {ambiguity?.is_ambiguous && (
                      <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:12,padding:14,display:'flex',gap:12,alignItems:'flex-start'}}>
                        <span style={{fontSize:16}}>🤔</span>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:'#92400e',marginBottom:4}}>AMBIGUOUS REQUEST DETECTED</div>
                          <div style={{fontSize:12,color:'#78350f'}}>{ambiguity.clarification_question}</div>
                          <button onClick={() => setUserInput(ambiguity.clarification_question || '')}
                            style={{marginTop:8,fontSize:11,padding:'4px 12px',background:'#f59e0b',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontWeight:600}}>
                            Ask for clarification
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{background:t.card,borderRadius:12,border:`1px solid ${t.border}`,padding:20}}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:16}}>
                        <div style={{flex:1,minWidth:0}}>
                          <h2 style={{fontSize:15,fontWeight:700,color:t.text,lineHeight:1.3,marginBottom:4}}>{selected.subject}</h2>
                          <div style={{fontSize:12,color:t.muted}}>From: {selected.sender}</div>
                        </div>
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          {(() => { const p = pb(selected.priority); const i = ib(selected.intent); return <>
                            <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600,background:p.bg,color:p.color,border:`1px solid ${p.border}`}}>{selected.priority}</span>
                            <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:600,background:dark?'#334155':'#f3f4f6',color:i.color}}>{i.label}</span>
                          </> })()}
                        </div>
                      </div>

                      <div style={{background: dark?'#1d3461':'#eff6ff',border:`1px solid ${dark?'#2d5299':'#dbeafe'}`,borderRadius:8,padding:14,marginBottom:14}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                          <span style={{fontSize:10,fontWeight:700,color:'#1d4ed8',textTransform:'uppercase',letterSpacing:'0.06em'}}>AI Summary</span>
                          <button onClick={async () => { try { const r = await axios.get(`${API}/emails/thread/${encodeURIComponent(selected.sender)}`); notify(`Thread (${r.data.email_count}): ${r.data.summary}`) } catch {} }}
                            style={{fontSize:11,color:'#1d4ed8',background:'none',border:'none',cursor:'pointer',textDecoration:'underline',padding:0}}>View thread</button>
                        </div>
                        <p style={{fontSize:12,color: dark?'#93c5fd':'#1e3a5f',lineHeight:1.6}}>{selected.summary}</p>
                      </div>

                      <div>
                        <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Original Message</div>
                        <p style={{fontSize:12,color:t.muted,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{selected.body}</p>
                      </div>
                    </div>

                    {selected.intent === 'meeting_request' && (
                      <div style={{background:t.card,borderRadius:12,border:`1px solid ${t.border}`,padding:20}}>
                        <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Scheduling</div>
                        {weather.alert && (
                          <div style={{display:'flex',alignItems:'center',gap:8,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',marginBottom:12}}>
                            <span>⚠</span><span style={{fontSize:12,color:'#92400e'}}>{weather.suggestion}</span>
                          </div>
                        )}
                        <button onClick={handleSchedule}
                          style={{width:'100%',background:'#059669',color:'#fff',border:'none',borderRadius:8,padding:'11px',fontSize:13,fontWeight:600,cursor:'pointer',transition:'background 0.15s'}}
                          onMouseEnter={e=>(e.currentTarget.style.background='#047857')}
                          onMouseLeave={e=>(e.currentTarget.style.background='#059669')}>
                          Check Conflicts & Schedule Meeting
                        </button>
                        <div style={{fontSize:11,color:t.muted,textAlign:'center',marginTop:8}}>Creates Google Calendar event · sends invites · auto-generates agenda</div>
                      </div>
                    )}

                    <div style={{background:t.card,borderRadius:12,border:`1px solid ${t.border}`,padding:20}}>
                      <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Compose Reply</div>

                      {suggestions.length > 0 && (
                        <div style={{marginBottom:12}}>
                          <div style={{fontSize:11,color:t.muted,marginBottom:6}}>AI suggestions:</div>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                            {suggestions.map(s3 => (
                              <button key={s3} onClick={() => setUserInput(s3)}
                                style={{fontSize:11,padding:'5px 12px',borderRadius:20,border: userInput===s3 ? '1.5px solid #1d4ed8' : `1px solid ${t.border}`,background: userInput===s3 ? (dark?'#1d3461':'#eff6ff') : t.card,color: userInput===s3 ? '#1d4ed8' : t.muted,cursor:'pointer',fontWeight: userInput===s3 ? 600 : 400,transition:'all 0.15s'}}>
                                {s3}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                        {['Yes, confirmed', 'Not available', 'Reschedule', 'Need details'].map(q => (
                          <button key={q} onClick={() => setUserInput(q)}
                            style={{fontSize:12,padding:'6px 14px',borderRadius:20,border: userInput===q ? '1.5px solid #1d4ed8' : `1px solid ${t.border}`,background: userInput===q ? (dark?'#1d3461':'#eff6ff') : t.card,color: userInput===q ? '#1d4ed8' : t.muted,cursor:'pointer',fontWeight: userInput===q ? 600 : 400,transition:'all 0.15s'}}>
                            {q}
                          </button>
                        ))}
                      </div>

                      <textarea value={userInput} onChange={e => setUserInput(e.target.value)}
                        placeholder="Or type a custom instruction..."
                        style={{width:'100%',background:t.input,border:`1px solid ${t.inputBorder}`,borderRadius:8,padding:'12px 14px',fontSize:13,color:t.text,resize:'none',outline:'none',lineHeight:1.6,boxSizing:'border-box',fontFamily:'inherit',transition:'border 0.15s'}}
                        rows={3}
                        onFocus={e=>(e.currentTarget.style.border='1px solid #1d4ed8')}
                        onBlur={e=>(e.currentTarget.style.border=`1px solid ${t.inputBorder}`)} />

                      <div style={{display:'flex',gap:8,marginTop:10}}>
                        <button onClick={handleReply} disabled={loading || !userInput}
                          style={{flex:1,background: loading||!userInput ? '#9ca3af' : '#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'11px',fontSize:13,fontWeight:600,cursor: loading||!userInput ? 'not-allowed' : 'pointer',transition:'background 0.15s'}}
                          onMouseEnter={e=>{ if(!loading&&userInput) e.currentTarget.style.background='#1e40af' }}
                          onMouseLeave={e=>{ if(!loading&&userInput) e.currentTarget.style.background='#1d4ed8' }}>
                          {loading ? 'Composing...' : 'Generate & Send Reply'}
                        </button>
                        <button onClick={async () => { try { await axios.post(`${API}/emails/${selected.id}/snooze?hours=24`); notify('Email snoozed for 24 hours'); fe() } catch {} }}
                          style={{padding:'11px 14px',background:t.input,border:`1px solid ${t.border}`,borderRadius:8,fontSize:12,color:t.muted,cursor:'pointer',fontWeight:500}}>
                          😴 Snooze
                        </button>
                      </div>

                      {aiReply && (
                        <div style={{marginTop:14,background: dark?'#052e16':'#f0fdf4',border:`1px solid ${dark?'#166534':'#bbf7d0'}`,borderRadius:8,padding:14}}>
                          <div style={{fontSize:10,fontWeight:700,color:'#15803d',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>✓ Reply Sent</div>
                          <p style={{fontSize:12,color: dark?'#86efac':'#14532d',lineHeight:1.7,whiteSpace:'pre-wrap'}}>{aiReply}</p>
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
                  <h2 style={{fontSize:16,fontWeight:700,color:t.text}}>Upcoming Meetings</h2>
                  <span style={{fontSize:11,background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',padding:'4px 12px',borderRadius:20,fontWeight:600}}>✓ Google Calendar Synced</span>
                </div>
                {weather.alert && (
                  <div style={{display:'flex',alignItems:'center',gap:8,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'10px 14px',marginBottom:16}}>
                    <span>⚠</span><span style={{fontSize:12,color:'#92400e',fontWeight:500}}>{weather.suggestion} — prefer online meetings</span>
                  </div>
                )}
                {schedules.length === 0 ? (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:160,color:t.muted}}>
                    <div style={{fontSize:32,marginBottom:8}}>◷</div>
                    <div style={{fontSize:13,fontWeight:500}}>No meetings scheduled</div>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {schedules.map(s3 => (
                      <div key={s3.id} style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',transition:'border 0.15s'}}
                        onMouseEnter={e=>(e.currentTarget.style.border='1px solid #bfdbfe')}
                        onMouseLeave={e=>(e.currentTarget.style.border=`1px solid ${t.border}`)}>
                        <div style={{flex:1,minWidth:0,marginRight:16}}>
                          <div style={{fontSize:13,fontWeight:600,color:t.text,marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s3.event_title}</div>
                          <div style={{fontSize:11,color:t.muted}}>With: {s3.attendees}</div>
                          {s3.calendar_event_id && <div style={{fontSize:11,color:'#059669',marginTop:3,fontWeight:500}}>✓ Google Calendar event created</div>}
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#1d4ed8'}}>{new Date(s3.start_time).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</div>
                          <div style={{fontSize:11,color:t.muted,marginTop:2}}>{new Date(s3.start_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── COORDINATE ── */}
          {view === 'coordinate' && (
            <div style={{flex:1,padding:24,overflowY:'auto'}}>
              <div style={{maxWidth:640,margin:'0 auto'}}>
                <h2 style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:6}}>Multi-Participant Coordination</h2>
                <p style={{fontSize:13,color:t.muted,marginBottom:20}}>Select 2+ emails from participants to find common availability slots</p>

                <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:12,padding:20,marginBottom:16}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Select Emails to Coordinate</div>
                  {emails.length === 0 ? (
                    <div style={{fontSize:13,color:t.muted}}>No emails available. Simulate some first.</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                      {emails.map(email => (
                        <label key={email.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,border:`1px solid ${selectedEmails.includes(email.id) ? '#1d4ed8' : t.border}`,background: selectedEmails.includes(email.id) ? (dark?'#1d3461':'#eff6ff') : t.input,cursor:'pointer',transition:'all 0.15s'}}>
                          <input type="checkbox" checked={selectedEmails.includes(email.id)}
                            onChange={e => setSelectedEmails(e.target.checked ? [...selectedEmails, email.id] : selectedEmails.filter(id => id !== email.id))}
                            style={{cursor:'pointer'}} />
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:12,fontWeight:600,color:t.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{email.sender.split('<')[0].trim()}</div>
                            <div style={{fontSize:11,color:t.muted,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{email.subject}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  <button onClick={handleCoordinate} disabled={selectedEmails.length < 2}
                    style={{width:'100%',background: selectedEmails.length < 2 ? '#9ca3af' : '#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'11px',fontSize:13,fontWeight:600,cursor: selectedEmails.length < 2 ? 'not-allowed' : 'pointer'}}>
                    Find Common Availability ({selectedEmails.length} selected)
                  </button>
                </div>

                {coordination && (
                  <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:12,padding:20}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>
                      Common Slots — {coordination.total_participants} Participants
                    </div>
                    {coordination.common_slots.length === 0 ? (
                      <div style={{fontSize:13,color:t.muted}}>No common slots found. Participants may have conflicting schedules.</div>
                    ) : (
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {coordination.common_slots.map((slot: any, i: number) => (
                          <div key={i} style={{padding:'12px 14px',background: dark?'#052e16':'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color: dark?'#86efac':'#166534'}}>{slot.slot}</div>
                              <div style={{fontSize:11,color: dark?'#4ade80':'#15803d',marginTop:2}}>Works for: {slot.works_for?.join(', ')}</div>
                            </div>
                            <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background: slot.confidence==='high'?'#dcfce7':'#fef9c3',color: slot.confidence==='high'?'#15803d':'#854d0e',fontWeight:600}}>
                              {slot.confidence} confidence
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── AI ACTIONS ── */}
          {view === 'actions' && (
            <div style={{flex:1,padding:24,overflowY:'auto'}}>
              <div style={{maxWidth:640,margin:'0 auto'}}>
                <h2 style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:6}}>AI Action Log</h2>
                <p style={{fontSize:13,color:t.muted,marginBottom:20}}>All autonomous actions taken by your AI assistant — undo any action you disagree with</p>
                {actions.length === 0 ? (
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:160,color:t.muted}}>
                    <div style={{fontSize:32,marginBottom:8}}>⚡</div>
                    <div style={{fontSize:13,fontWeight:500}}>No actions yet</div>
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {actions.map(action => (
                      <div key={action.id} style={{background:t.card,border:`1px solid ${action.undone ? t.border : '#dbeafe'}`,borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',opacity: action.undone ? 0.6 : 1}}>
                        <div style={{flex:1,minWidth:0,marginRight:12}}>
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                            <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background: action.action_type==='reply'?'#dbeafe': action.action_type==='schedule'?'#dcfce7':'#fee2e2',color: action.action_type==='reply'?'#1d4ed8': action.action_type==='schedule'?'#15803d':'#dc2626',fontWeight:600}}>
                              {action.action_type}
                            </span>
                            {action.undone && <span style={{fontSize:11,color:t.muted}}>✓ Undone</span>}
                          </div>
                          <div style={{fontSize:12,fontWeight:500,color:t.text,marginBottom:2}}>{action.description}</div>
                          <div style={{fontSize:11,color:t.muted}}>{new Date(action.created_at).toLocaleString()}</div>
                        </div>
                        {!action.undone && action.can_undo ? (
                          <button onClick={() => handleUndo(action.id)}
                            style={{fontSize:12,padding:'6px 14px',background:'#fff',border:'1px solid #fecaca',borderRadius:8,color:'#dc2626',cursor:'pointer',fontWeight:500,flexShrink:0,whiteSpace:'nowrap'}}>
                            Undo
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── VIP ── */}
          {view === 'vip' && (
            <div style={{flex:1,padding:24,overflowY:'auto'}}>
              <div style={{maxWidth:480,margin:'0 auto'}}>
                <h2 style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:6}}>VIP Contacts</h2>
                <p style={{fontSize:13,color:t.muted,marginBottom:20}}>Emails from VIP contacts are always marked high priority</p>

                <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:12,padding:20,marginBottom:16}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Add VIP Contact</div>
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    <input value={newVipName} onChange={e=>setNewVipName(e.target.value)}
                      placeholder="Name (optional)"
                      style={{width:'100%',background:t.input,border:`1px solid ${t.inputBorder}`,borderRadius:8,padding:'9px 12px',fontSize:13,color:t.text,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
                    <input value={newVipEmail} onChange={e=>setNewVipEmail(e.target.value)}
                      placeholder="Email address"
                      style={{width:'100%',background:t.input,border:`1px solid ${t.inputBorder}`,borderRadius:8,padding:'9px 12px',fontSize:13,color:t.text,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
                    <button onClick={handleAddVip}
                      style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'10px',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                      Add VIP Contact
                    </button>
                  </div>
                </div>

                {vips.length > 0 && (
                  <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:12,padding:20}}>
                    <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Your VIP Contacts ({vips.length})</div>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {vips.map(vip => (
                        <div key={vip.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:t.input,borderRadius:8,border:`1px solid ${t.border}`}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:t.text}}>★ {vip.name}</div>
                            <div style={{fontSize:11,color:t.muted,marginTop:1}}>{vip.email}</div>
                          </div>
                          <button onClick={async () => { await axios.delete(`${API}/vip/${vip.email}`); fetchVips(); notify('VIP removed') }}
                            style={{fontSize:11,padding:'4px 10px',background:'transparent',border:`1px solid ${t.border}`,borderRadius:6,color:'#dc2626',cursor:'pointer'}}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {view === 'settings' && (
            <div style={{flex:1,padding:24,overflowY:'auto'}}>
              <div style={{maxWidth:480,margin:'0 auto',display:'flex',flexDirection:'column',gap:16}}>
                <h2 style={{fontSize:16,fontWeight:700,color:t.text,marginBottom:4}}>Settings</h2>

                <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em'}}>Profile & Working Hours</div>
                  <div>
                    <label style={{fontSize:12,fontWeight:500,color:t.text,display:'block',marginBottom:6}}>Your Name</label>
                    <input value={settingsForm.name} onChange={e=>setSettingsForm({...settingsForm,name:e.target.value})}
                      style={{width:'100%',background:t.input,border:`1px solid ${t.inputBorder}`,borderRadius:8,padding:'9px 12px',fontSize:13,color:t.text,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
                      placeholder="Your name" />
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[['Work Start','start'],['Work End','end']].map(([label,key]) => (
                      <div key={key}>
                        <label style={{fontSize:12,fontWeight:500,color:t.text,display:'block',marginBottom:6}}>{label}</label>
                        <input type="time" value={settingsForm[key as keyof Settings]} onChange={e=>setSettingsForm({...settingsForm,[key]:e.target.value})}
                          style={{width:'100%',background:t.input,border:`1px solid ${t.inputBorder}`,borderRadius:8,padding:'9px 12px',fontSize:13,color:t.text,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <label style={{fontSize:12,fontWeight:500,color:t.text,display:'block',marginBottom:6}}>Timezone</label>
                    <select value={settingsForm.timezone} onChange={e=>setSettingsForm({...settingsForm,timezone:e.target.value})}
                      style={{width:'100%',background:t.input,border:`1px solid ${t.inputBorder}`,borderRadius:8,padding:'9px 12px',fontSize:13,color:t.text,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                    </select>
                  </div>
                  <button onClick={handleSaveSettings}
                    style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,padding:'10px',fontSize:13,fontWeight:600,cursor:'pointer'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#1e40af')}
                    onMouseLeave={e=>(e.currentTarget.style.background='#1d4ed8')}>
                    Save Changes
                  </button>
                </div>

                <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:12,padding:20}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:14}}>Daily Digest Email</div>
                  <div style={{marginBottom:10}}>
                    <input value={digestEmail} onChange={e=>setDigestEmail(e.target.value)}
                      placeholder="Your email for daily digest"
                      style={{width:'100%',background:t.input,border:`1px solid ${t.inputBorder}`,borderRadius:8,padding:'9px 12px',fontSize:13,color:t.text,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
                  </div>
                  <button onClick={handleSetupDigest}
                    style={{width:'100%',background:'#0284c7',color:'#fff',border:'none',borderRadius:8,padding:'10px',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                    Enable Daily Digest at 9am
                  </button>
                </div>

                <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:12,padding:20}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:14}}>Integrations</div>
                  {[['Gmail','OAuth 2.0 · Connected'],['Google Calendar','API · Connected']].map(([name,status]) => (
                    <div key={name} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',background:t.input,borderRadius:8,border:`1px solid ${t.border}`,marginBottom:8}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:t.text}}>{name}</div>
                        <div style={{fontSize:11,color:t.muted,marginTop:1}}>{status}</div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:7,height:7,borderRadius:'50%',background:'#059669'}} />
                        <span style={{fontSize:11,color:'#059669',fontWeight:600}}>Active</span>
                      </div>
                    </div>
                  ))}
                  <button onClick={handleFetchGmail} disabled={fetching}
                    style={{width:'100%',background:'#0284c7',color:'#fff',border:'none',borderRadius:8,padding:'10px',fontSize:13,fontWeight:600,cursor:'pointer',opacity:fetching?0.6:1,marginTop:4}}>
                    {fetching?'Syncing...':'Sync Latest Emails from Gmail'}
                  </button>
                </div>

                <div style={{background:t.card,border:'1px solid #fecaca',borderRadius:12,padding:20}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.muted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Danger Zone</div>
                  <button onClick={handleReset}
                    style={{width:'100%',background:'#fff',color:'#dc2626',border:'1px solid #fecaca',borderRadius:8,padding:'10px',fontSize:13,fontWeight:600,cursor:'pointer'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='#fef2f2')}
                    onMouseLeave={e=>(e.currentTarget.style.background='#fff')}>
                    Clear All Data — Reset for Demo
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