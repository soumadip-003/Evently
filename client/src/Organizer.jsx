
import { useEffect, useState } from 'react'
import './Organizer.css'

const API_BASE = 'http://localhost:4001/api'

const EMPTY_EVENT = {
  title: '',
  description: '',
  event_date: '',
  schedule: '',
  venue: '',
  capacity: '100',
  category: 'Technology',
  price: '0',
  currency: 'INR',
  image_url: '',
  status: 'draft',
}

export default function Organizer({ onBack }) {
  const [token, setToken] = useState(() =>
    localStorage.getItem('evently-organizer-token') || ''
  )
  const [organizer, setOrganizer] = useState(null)
  const [mode, setMode] = useState('login')
  const [authData, setAuthData] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [events, setEvents] = useState([])
  const [eventForm, setEventForm] = useState(EMPTY_EVENT)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function request(path, options = {}, authToken = token) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...options.headers,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong.')
    }

    return data
  }

  async function loadDashboard(currentToken = token) {
    setLoading(true)
    setError('')

    try {
      const profile = await request('/auth/me', {}, currentToken)
      const result = await request(
        '/organizer/events',
        {},
        currentToken
      )

      setOrganizer(profile.organizer)
      setEvents(result.events || [])
    } catch (err) {
      localStorage.removeItem('evently-organizer-token')
      setToken('')
      setOrganizer(null)
      setError(err.message || 'Unable to load your dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      loadDashboard(token)
    }
  }, []) // Restore the existing login when this page opens.

  async function handleAuth(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)

    try {
      const endpoint =
        mode === 'signup' ? '/auth/signup' : '/auth/login'

      const payload =
        mode === 'signup'
          ? authData
          : { email: authData.email, password: authData.password }

      const result = await request(
        endpoint,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        ''
      )

      localStorage.setItem('evently-organizer-token', result.token)
      setToken(result.token)
      setOrganizer(result.organizer)
      setMessage(result.message || 'Welcome to Evently!')
      await loadDashboard(result.token)
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    localStorage.removeItem('evently-organizer-token')
    setToken('')
    setOrganizer(null)
    setEvents([])
    setEventForm(EMPTY_EVENT)
    setEditingId(null)
    setMessage('')
    setError('')
    setMode('login')
  }

  function startEdit(event) {
    setEditingId(event.id)
    setEventForm({
      title: event.title || '',
      description: event.description || '',
      event_date: event.event_date || '',
      schedule: event.schedule || '',
      venue: event.venue || '',
      capacity: String(event.capacity ?? 100),
      category: event.category || 'Technology',
      price: String(event.price ?? 0),
      currency: event.currency || 'INR',
      image_url: event.image_url || '',
      status: event.status || 'draft',
    })
    setMessage('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setEventForm(EMPTY_EVENT)
  }

  async function handleEventSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    try {
      const payload = {
        ...eventForm,
        capacity: Number(eventForm.capacity),
        price: Number(eventForm.price),
      }

      const result = await request(
        editingId ? `/events/${editingId}` : '/events',
        {
          method: editingId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      )

      setMessage(result.message || 'Event saved successfully.')
      cancelEdit()
      await loadDashboard(token)
    } catch (err) {
      setError(err.message || 'Unable to save the event.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(event) {
    const confirmed = window.confirm(
      `Delete "${event.title}"? This action cannot be undone.`
    )

    if (!confirmed) return

    setMessage('')
    setError('')

    try {
      const result = await request(`/events/${event.id}`, {
        method: 'DELETE',
      })

      setMessage(result.message || 'Event deleted successfully.')
      await loadDashboard(token)
    } catch (err) {
      setError(err.message || 'Unable to delete this event.')
    }
  }

  if (!token || !organizer) {
    return (
      <main className="organizer-page">
        <header className="organizer-nav">
          <a className="brand" href="#" onClick={(e) => {
            e.preventDefault()
            onBack()
          }}>
            <span className="brand-icon">E</span>
            Evently
          </a>
          <button className="organizer-back" onClick={onBack}>
            ← Back to events
          </button>
        </header>

        <section className="auth-card">
          <span className="eyebrow">EVENTLY ORGANIZER</span>
          <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
          <p className="auth-description">
            {mode === 'login'
              ? 'Sign in to manage your events.'
              : 'Join Evently and start creating events.'}
          </p>

          {message && <p className="organizer-success">{message}</p>}
          {error && <p className="organizer-error" role="alert">{error}</p>}

          <form onSubmit={handleAuth}>
            {mode === 'signup' && (
              <>
                <label htmlFor="organizer-name">Full name</label>
                <input
                  id="organizer-name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                  value={authData.name}
                  onChange={(e) => setAuthData({
                    ...authData,
                    name: e.target.value,
                  })}
                  placeholder="Your full name"
                />
              </>
            )}

            <label htmlFor="organizer-email">Email address</label>
            <input
              id="organizer-email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={authData.email}
              onChange={(e) => setAuthData({
                ...authData,
                email: e.target.value,
              })}
              placeholder="you@example.com"
            />

            <label htmlFor="organizer-password">Password</label>
            <input
              id="organizer-password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={8}
              maxLength={72}
              value={authData.password}
              onChange={(e) => setAuthData({
                ...authData,
                password: e.target.value,
              })}
              placeholder="At least 8 characters"
            />

            <button className="organizer-primary" type="submit" disabled={loading}>
              {loading
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            {mode === 'login'
              ? "Don't have an account?"
              : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login')
                setError('')
                setMessage('')
              }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="organizer-page">
      <header className="organizer-nav">
        <a className="brand" href="#" onClick={(e) => {
          e.preventDefault()
          onBack()
        }}>
          <span className="brand-icon">E</span>
          Evently
        </a>

        <div className="organizer-nav-actions">
          <span className="organizer-greeting">
            {organizer.name}
          </span>
          <button className="organizer-back" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="dashboard-heading">
          <div>
            <span className="eyebrow">YOUR WORKSPACE</span>
            <h1>Organizer dashboard</h1>
            <p>Create events and manage the ones you own.</p>
          </div>
          <button
            className="organizer-back"
            onClick={onBack}
          >
            View public events
          </button>
        </div>

        {message && <p className="organizer-success">{message}</p>}
        {error && <p className="organizer-error" role="alert">{error}</p>}

        <div className="organizer-stats">
          <div>
            <span>Total events</span>
            <strong>{events.length}</strong>
          </div>
          <div>
            <span>Published</span>
            <strong>{events.filter((item) => item.status === 'published').length}</strong>
          </div>
          <div>
            <span>Drafts</span>
            <strong>{events.filter((item) => item.status === 'draft').length}</strong>
          </div>
        </div>

        <section className="organizer-panel">
          <h2>{editingId ? 'Edit event' : 'Create a new event'}</h2>
          <p className="organizer-panel-description">
            Complete the event details below. Required fields are validated by the server.
          </p>

          <form className="event-editor" onSubmit={handleEventSubmit}>
            <label htmlFor="event-title">Event title</label>
            <input
              id="event-title"
              required
              minLength={3}
              maxLength={150}
              value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              placeholder="e.g. Web Development Workshop"
            />

            <label htmlFor="event-description">Description</label>
            <textarea
              id="event-description"
              required
              minLength={10}
              maxLength={10000}
              rows={4}
              value={eventForm.description}
              onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
              placeholder="Describe what attendees will learn..."
            />

            <div className="event-form-grid">
              <div>
                <label htmlFor="event-date">Event date</label>
                <input
                  id="event-date"
                  type="date"
                  required
                  value={eventForm.event_date}
                  onChange={(e) => setEventForm({ ...eventForm, event_date: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="event-schedule">Schedule</label>
                <input
                  id="event-schedule"
                  required
                  minLength={2}
                  maxLength={100}
                  value={eventForm.schedule}
                  onChange={(e) => setEventForm({ ...eventForm, schedule: e.target.value })}
                  placeholder="10:00 AM - 1:00 PM"
                />
              </div>
              <div>
                <label htmlFor="event-venue">Venue</label>
                <input
                  id="event-venue"
                  required
                  minLength={2}
                  maxLength={200}
                  value={eventForm.venue}
                  onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                  placeholder="Venue or location"
                />
              </div>
              <div>
                <label htmlFor="event-capacity">Capacity</label>
                <input
                  id="event-capacity"
                  type="number"
                  required
                  min="1"
                  max="1000000"
                  step="1"
                  value={eventForm.capacity}
                  onChange={(e) => setEventForm({ ...eventForm, capacity: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="event-category">Category</label>
                <input
                  id="event-category"
                  required
                  minLength={2}
                  maxLength={80}
                  value={eventForm.category}
                  onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}
                  placeholder="Technology"
                />
              </div>
              <div>
                <label htmlFor="event-price">Ticket price</label>
                <input
                  id="event-price"
                  type="number"
                  required
                  min="0"
                  max="100000000"
                  step="0.01"
                  value={eventForm.price}
                  onChange={(e) => setEventForm({ ...eventForm, price: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="event-currency">Currency</label>
                <select
                  id="event-currency"
                  value={eventForm.currency}
                  onChange={(e) => setEventForm({ ...eventForm, currency: e.target.value })}
                >
                  <option value="INR">INR - Indian Rupee</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>
              <div>
                <label htmlFor="event-status">Status</label>
                <select
                  id="event-status"
                  value={eventForm.status}
                  onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            <label htmlFor="event-image">Image URL (optional)</label>
            <input
              id="event-image"
              type="url"
              maxLength={2000}
              value={eventForm.image_url}
              onChange={(e) => setEventForm({ ...eventForm, image_url: e.target.value })}
              placeholder="https://example.com/event-image.jpg"
            />

            <div className="event-editor-actions">
              <button className="organizer-primary" type="submit" disabled={saving}>
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save changes'
                    : 'Create event'}
              </button>
              {editingId && (
                <button
                  className="organizer-back"
                  type="button"
                  onClick={cancelEdit}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="organizer-panel">
          <div className="organizer-list-heading">
            <div>
              <h2>Your events</h2>
              <p className="organizer-panel-description">
                Only events belonging to your account appear here.
              </p>
            </div>
            <button
              className="organizer-back"
              onClick={() => loadDashboard(token)}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {loading && <p className="organizer-panel-description">Loading your events...</p>}

          {!loading && events.length === 0 && (
            <p className="organizer-empty">
              You haven't created any events yet. Use the form above to get started.
            </p>
          )}

          <div className="organizer-event-list">
            {events.map((item) => (
              <article className="organizer-event-item" key={item.id}>
                <div className="organizer-event-info">
                  <span className={`event-status ${item.status}`}>
                    {item.status}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.event_date} · {item.schedule}</p>
                  <p>{item.venue} · {item.registered_count ?? 0} registrations</p>
                </div>
                <div className="organizer-event-actions">
                  <button className="organizer-back" onClick={() => startEdit(item)}>
                    Edit
                  </button>
                  <button className="organizer-delete" onClick={() => deleteEvent(item)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
