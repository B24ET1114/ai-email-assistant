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

export default function App() {
  const [emails, setEmails] = useState<Email[]>([])
  const [selected, setSelected] = useState<Email | null>(null)
  const [userInput, setUserInput] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchEmails()
    const interval = setInterval(fetchEmails, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchEmails = async () => {
    const res = await axios.get(`${API}/emails`)
    setEmails(res.data)
  }

  const handleReply = async () => {
    if (!selected || !userInput) return
    setLoading(true)
    const res = await axios.post(`${API}/emails/reply`, {
      email_id: selected.id,
      user_input: userInput
    })
    setAiReply(res.data.reply)
    setLoading(false)
    fetchEmails()
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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - Email List */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-indigo-600">
          <h1 className="text-white font-bold text-xl">AI Email Assistant</h1>
          <p className="text-indigo-200 text-sm">{emails.length} emails</p>
        </div>
        <div className="overflow-y-auto flex-1">
          {emails.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p>No emails yet</p>
            </div>
          )}
          {emails.map(email => (
            <div
              key={email.id}
              onClick={() => { setSelected(email); setAiReply(''); setUserInput('') }}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-colors ${selected?.id === email.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}`}
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
      </div>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-6xl mb-4">👆</p>
              <p className="text-xl">Select an email to get started</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            {/* Email Header */}
            <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selected.subject}</h2>
                  <p className="text-gray-500 text-sm">From: {selected.sender}</p>
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
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">AI SUMMARY</p>
                <p className="text-gray-700 text-sm">{selected.summary}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">ORIGINAL EMAIL</p>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">{selected.body}</p>
              </div>
            </div>

            {/* Reply Section */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-3">Your Response</h3>
              <div className="flex gap-2 mb-3">
                {['Yes, confirmed!', 'No, not available', 'Reschedule please'].map(q => (
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
                placeholder="Type yes, no, or any instruction... e.g. 'Reschedule to Thursday 4pm'"
                className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                rows={3}
              />
              <button
                onClick={handleReply}
                disabled={loading || !userInput}
                className="mt-3 w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'AI is writing...' : 'Generate & Send Reply'}
              </button>

              {aiReply && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-green-700 mb-2">AI DRAFTED REPLY</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiReply}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}