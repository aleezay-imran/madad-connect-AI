import { useState } from 'react'
import './App.css'
import { resources } from './data/resources'
import { matchResources, CATEGORY_LABELS } from './matchresources'

const EXAMPLES = [
  'My father has cancer and we cannot afford treatment',
  "I cannot pay my children's school fees, I need a scholarship",
  'We have no food at home and I am a widow',
  'I need help',
]

function buildPlanText(rec) {
  const lines = ['MadadConnect AI - My action plan', '']
  rec.plan.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
  lines.push('', 'Organizations:')
  rec.items.forEach(({ resource: r }) => {
    lines.push(`- ${r.name}: ${r.contact}`)
    lines.push(`  Documents: ${r.documents.join(', ')}`)
  })
  lines.push('', 'Please confirm the details with each organization before applying.')
  return lines.join('\n')
}

function ResourceCard({ item, fit }) {
  const { resource, matchedCategories } = item

  return (
    <article className="card">
      <div className="card-top">
        <h3>{resource.name}</h3>
        {resource.verified ? (
          <span className="badge ok">
            ✓ Verified{resource.verifiedOn ? ` (${resource.verifiedOn})` : ''}
          </span>
        ) : (
          <span className="badge warn">Not yet verified</span>
        )}
      </div>

      {matchedCategories.length > 0 && (
        <div className="match">
          Matches: {matchedCategories.map((c) => CATEGORY_LABELS[c]).join(', ')}
        </div>
      )}

      {fit && (
        <div className={`fit ${fit.status}`}>
          {fit.status === 'likely' ? '✅ You may be eligible. ' : 'ℹ️ Please confirm eligibility. '}
          {fit.reason}
        </div>
      )}

      {resource.cities && (
        <div className="cities">
          📍{' '}
          {resource.cities.includes('all')
            ? 'Available across Pakistan'
            : resource.cities.join(', ')}
        </div>
      )}

      <p>{resource.description}</p>

      <div className="cols">
        <div>
          <h4>Eligibility</h4>
          <ul>
            {resource.eligibility.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Documents needed</h4>
          <ul>
            {resource.documents.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="how">
        <b>How to apply:</b> {resource.howToApply}
      </div>

      <div className="contact">
        🌐{' '}
        <a href={resource.website} target="_blank" rel="noreferrer">
          {resource.contact}
        </a>
      </div>
    </article>
  )
}

export default function App() {
  const [text, setText] = useState('')
  const [messages, setMessages] = useState([])
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voiceLang, setVoiceLang] = useState('ur-PK')

  function startVoice() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser. Please use Chrome or Edge.')
      return
    }

    const rec = new SpeechRecognition()
    rec.lang = voiceLang
    rec.interimResults = false
    rec.onstart = () => setListening(true)
    rec.onend = () => setListening(false)
    rec.onerror = (e) => {
      setListening(false)
      alert('Voice error: ' + e.error)
    }
    rec.onresult = (event) => {
      const spoken = event.results[0][0].transcript
      setText((prev) => (prev ? prev + ' ' : '') + spoken)
    }
    rec.start()
  }

  function readAloud() {
    if (!('speechSynthesis' in window)) {
      alert('Read aloud is not supported in this browser.')
      return
    }
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const toRead = [recommendation.summary, ...recommendation.plan]
      .filter(Boolean)
      .join('. ')
    const utter = new SpeechSynthesisUtterance(toRead)
    utter.lang = /[\u0600-\u06FF]/.test(toRead) ? 'ur-PK' : 'en-US'
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utter)
  }

  function shareWhatsApp() {
    const message = encodeURIComponent(buildPlanText(recommendation))
    window.open(`https://wa.me/?text=${message}`, '_blank')
  }

  async function send() {
    const message = text.trim()
    if (!message || loading) return

    const updated = [...messages, { role: 'user', text: message }]
    setMessages(updated)
    setText('')
    setLoading(true)

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated }),
      })
      if (!res.ok) throw new Error('Agent unavailable')
      const data = await res.json()

      if (data.action === 'ask') {
        setMessages([...updated, { role: 'assistant', text: data.reply }])
        return
      }

      const found = data.resourceIds
        .map((id) => resources.find((r) => r.id === id))
        .filter(Boolean)
      if (found.length === 0) throw new Error('No resources found')

      const fitById = {}
      ;(data.fit || []).forEach((f) => {
        fitById[f.id] = f
      })

      setMessages([...updated, { role: 'assistant', text: data.reply }])
      setRecommendation({
        items: found.map((r) => ({ resource: r, matchedCategories: [] })),
        plan: data.plan,
        fit: fitById,
        summary: data.reply,
        mode: 'agent',
      })
    } catch {
      // If the AI agent fails, fall back to simple keyword matching.
      const allUserText = updated
        .filter((m) => m.role === 'user')
        .map((m) => m.text)
        .join(' ')
      const fallback = matchResources(allUserText)

      if (fallback.results.length > 0) {
        setMessages([
          ...updated,
          {
            role: 'assistant',
            text: 'The AI agent is not available right now, so these results come from simple keyword matching.',
          },
        ])
        setRecommendation({
          items: fallback.results,
          plan: [],
          fit: {},
          summary: '',
          mode: 'keywords',
        })
      } else {
        setMessages([
          ...updated,
          {
            role: 'assistant',
            text: 'We could not understand your need yet. Please add a few more details, for example: food, treatment, school fees, or a loan.',
          },
        ])
      }
    } finally {
      setLoading(false)
    }
  }

  function startOver() {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
    setMessages([])
    setRecommendation(null)
    setText('')
  }

  return (
    <div className="page">
      <header className="hero">
        <h1>🤝 MadadConnect AI</h1>
        <p>
          Tell us what you need, and our AI agent will guide you to trusted
          welfare organizations, scholarships, and free healthcare.
        </p>
        <div className="trust">
          <span>🇵🇰 English, Urdu, Roman Urdu</span>
          <span>🎤 Voice support</span>
          <span>🆓 Free to use</span>
        </div>
      </header>

      <div className="emergency">
        🚨 Emergency? Call <b>1122</b> (rescue) or <b>115</b> (Edhi ambulance) right now.
      </div>

      <main className="box">
        {messages.length > 0 && (
          <div className="chat">
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role === 'user' ? 'user' : 'agent'}`}>
                {m.text}
              </div>
            ))}
            {loading && <div className="bubble agent">Thinking...</div>}
          </div>
        )}

        <label htmlFor="need">
          {messages.length === 0 ? 'What kind of help do you need?' : 'Your reply'}
        </label>
        <textarea
          id="need"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={
            messages.length === 0
              ? 'Describe your situation here (English, Urdu, or Roman Urdu)...'
              : 'Type your answer here...'
          }
        />

        <div className="actions">
          <button className="btn" onClick={send} disabled={loading}>
            {loading ? 'Thinking...' : messages.length === 0 ? '🔍 Find Help' : '➤ Send'}
          </button>
          <button className="btn mic" onClick={startVoice} disabled={listening}>
            {listening ? '🎙️ Listening...' : '🎤 Speak'}
          </button>
          <select
            className="lang"
            value={voiceLang}
            onChange={(e) => setVoiceLang(e.target.value)}
          >
            <option value="ur-PK">Urdu</option>
            <option value="en-US">English</option>
          </select>
          {messages.length > 0 && (
            <button className="btn mic" onClick={startOver}>
              ↺ Start over
            </button>
          )}
        </div>

        {messages.length === 0 && (
          <div className="chips">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="chip" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}

        {recommendation && (
          <section className="results">
            <div className="source">
              {recommendation.mode === 'agent'
                ? '✨ Recommended by the AI agent, from our resource database'
                : 'Matched by keywords'}
            </div>

            <div className="actions noprint">
              <button className="btn mic" onClick={() => window.print()}>
                🖨️ Print / Save PDF
              </button>
              <button className="btn mic" onClick={shareWhatsApp}>
                📱 Share on WhatsApp
              </button>
              {recommendation.plan.length > 0 && (
                <button className="btn mic" onClick={readAloud}>
                  {speaking ? '⏹ Stop' : '🔊 Read aloud'}
                </button>
              )}
            </div>

            {recommendation.plan.length > 0 && (
              <div className="plan-box">
                <h2>Your action plan</h2>
                <ol className="plan">
                  {recommendation.plan.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            <h2>Recommended help ({recommendation.items.length})</h2>
            {recommendation.items.map((item) => (
              <ResourceCard
                key={item.resource.id}
                item={item}
                fit={recommendation.fit[item.resource.id]}
              />
            ))}
          </section>
        )}
      </main>

      <footer className="footer">
        MadadConnect AI is a guide only. Please confirm details with each
        organization before applying.
      </footer>
    </div>
  )
}