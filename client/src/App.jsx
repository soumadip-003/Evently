import { useEffect, useState } from 'react'
import './App.css'
import Organizer from './Organizer'

const API_URL = 'http://localhost:4001/api/events'

const INTEREST_CATEGORIES = [
  {
    title: 'Technology & Development',
    options: [
      'Web Development',
      'App Development',
      'Software Engineering',
      'AI & Machine Learning',
      'Data Science',
      'Data Analytics',
      'Cybersecurity',
      'Cloud Computing',
      'Blockchain',
      'DevOps',
      'Game Development',
      'Robotics & IoT',
      'AR/VR',
      'Database Management',
      'Open Source',
    ],
  },
  {
    title: 'Design & Creativity',
    options: [
      'UI/UX Design',
      'Graphic Design',
      'Product Design',
      'Web Design',
      'Animation',
      'Photography',
      'Video Editing',
      'Content Creation',
      'Creative Writing',
      'Digital Art',
    ],
  },
  {
    title: 'Business & Entrepreneurship',
    options: [
      'Business',
      'Entrepreneurship',
      'Startups & Innovation',
      'Business Management',
      'Product Management',
      'Project Management',
      'Leadership',
      'Finance',
      'Investing',
      'E-commerce',
      'Sales',
      'Marketing & Branding',
      'Digital Marketing',
    ],
  },
  {
    title: 'Career & Networking',
    options: [
      'Networking',
      'Career Development',
      'Job Opportunities',
      'Freelancing',
      'Personal Branding',
      'Public Speaking',
      'Communication Skills',
      'Professional Growth',
      'Mentorship',
      'Teamwork',
    ],
  },
  {
    title: 'Education & Emerging Fields',
    options: [
      'Research & Education',
      'EdTech',
      'HealthTech',
      'FinTech',
      'Sustainability & Green Tech',
      'Environmental Science',
      'Scientific Research',
      'Psychology',
      'Personal Development',
      'Innovation',
    ],
  },
]

function App() {
  const [showOrganizer, setShowOrganizer] = useState(false)

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedEvent, setSelectedEvent] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    organization: '',
    interests: [],
  })

  const [registering, setRegistering] = useState(false)
  const [registrationMessage, setRegistrationMessage] = useState('')
  const [registrationError, setRegistrationError] = useState(false)

  useEffect(() => {
    async function loadEvents() {
      try {
        const response = await fetch(API_URL)

        if (!response.ok) {
          throw new Error('Unable to load events.')
        }

        const data = await response.json()
        setEvents(data.events || [])
        setError('')
      } catch {
        setError(
          'Could not connect to the server. Please check that the backend is running on port 4001.'
        )
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [])

  function handleInterestChange(interest) {
    setFormData((previous) => ({
      ...previous,
      interests: previous.interests.includes(interest)
        ? previous.interests.filter((item) => item !== interest)
        : [...previous.interests, interest],
    }))
  }

  function resetRegistrationForm() {
    setFormData({
      name: '',
      email: '',
      organization: '',
      interests: [],
    })
  }


  async function handleRegistrationSubmit(event) {
    event.preventDefault()

    if (!selectedEvent) return

    setRegistrationMessage('')
    setRegistrationError(false)

    if (
      !formData.name.trim() ||
      !formData.email.trim() ||
      !formData.organization.trim() ||
      formData.interests.length === 0
    ) {
      setRegistrationError(true)
      setRegistrationMessage(
        'Please complete all fields and select at least one interest.'
      )
      return
    }

    if (formData.interests.length > 10) {
      setRegistrationError(true)
      setRegistrationMessage(
        'Please select no more than 10 interests.'
      )
      return
    }

    setRegistering(true)

    try {
      const attendee = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        organization: formData.organization.trim(),
        interests: formData.interests,
      }

      // FREE EVENT: register without Razorpay.
      if (Number(selectedEvent.price) === 0) {
        try {
          const response = await fetch(
            `${API_URL}/${selectedEvent.id}/register`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(attendee),
            }
          )

          const data = await response.json()

          if (!response.ok || !data.success) {
            throw new Error(data.message || 'Registration failed.')
          }

          setRegistrationError(false)
          setRegistrationMessage(
            data.message || 'Registration successful!'
          )

          resetRegistrationForm()

          const eventsResponse = await fetch(API_URL)

          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json()
            setEvents(eventsData.events || [])
          }
        } finally {
          setRegistering(false)
        }

        return
      }

      // PAID EVENT: load Razorpay Checkout when needed.
      function loadRazorpayScript() {
        return new Promise((resolve, reject) => {
          if (window.Razorpay) {
            resolve(true)
            return
          }

          const existingScript = document.querySelector(
            'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
          )

          if (existingScript) {
            existingScript.addEventListener(
              'load',
              () => resolve(true),
              { once: true }
            )
            existingScript.addEventListener(
              'error',
              () => reject(new Error('Unable to load Razorpay Checkout.')),
              { once: true }
            )
            return
          }

          const script = document.createElement('script')
          script.src = 'https://checkout.razorpay.com/v1/checkout.js'
          script.async = true
          script.onload = () => resolve(true)
          script.onerror = () =>
            reject(new Error('Unable to load Razorpay Checkout.'))

          document.body.appendChild(script)
        })
      }

      await loadRazorpayScript()


      // Free events: register directly without Razorpay.
      if (Number(selectedEvent.price) === 0) {
        try {
          const response = await fetch(
            `http://localhost:4001/api/events/${selectedEvent.id}/register`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(attendee),
            }
          )

          const data = await response.json()

          if (!response.ok || !data.success) {
            throw new Error(
              data.message || 'Unable to complete registration.'
            )
          }

          setRegistrationError(false)
          setRegistrationMessage(
            data.message || 'Registration completed successfully!'
          )

          resetRegistrationForm()

          const eventsResponse = await fetch(API_URL)

          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json()
            setEvents(eventsData.events || [])
          }
        } catch (err) {
          setRegistrationError(true)
          setRegistrationMessage(
            err.message || 'Unable to register. Please try again.'
          )
        } finally {
          setRegistering(false)
        }

        return
      }

      // Paid events continue to the existing Razorpay flow.


      // Ask the backend to create the payment order.
      const orderResponse = await fetch(
        'http://localhost:4001/api/payments/create-order',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            eventId: selectedEvent.id,
            ...attendee,
          }),
        }
      )

      const orderData = await orderResponse.json()

      if (!orderResponse.ok) {
        throw new Error(
          orderData.message || 'Unable to create payment order.'
        )
      }

      if (!orderData.keyId || !orderData.orderId) {
        throw new Error('Payment configuration is incomplete.')
      }

      const razorpay = new window.Razorpay({
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Evently',
        description: orderData.event?.title || selectedEvent.title,
        order_id: orderData.orderId,

        handler: async function (paymentResponse) {
          try {
            const verifyResponse = await fetch(
              'http://localhost:4001/api/payments/verify',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  razorpay_order_id: paymentResponse.razorpay_order_id,
                  razorpay_payment_id: paymentResponse.razorpay_payment_id,
                  razorpay_signature: paymentResponse.razorpay_signature,
                }),
              }
            )

            const verifyData = await verifyResponse.json()

            if (!verifyResponse.ok || !verifyData.success) {
              throw new Error(
                verifyData.message ||
                'Payment verification failed. Please contact support if money was deducted.'
              )
            }

            setRegistrationError(false)
            setRegistrationMessage(
              verifyData.message ||
              'Payment verified and registration completed!'
            )

            resetRegistrationForm()

            const eventsResponse = await fetch(API_URL)

            if (eventsResponse.ok) {
              const eventsData = await eventsResponse.json()
              setEvents(eventsData.events || [])
            }
          } catch (verifyError) {
            setRegistrationError(true)
            setRegistrationMessage(
              verifyError.message ||
              'Unable to verify payment. Please contact support if money was deducted.'
            )
          } finally {
            setRegistering(false)
          }
        },

        modal: {
          ondismiss: function () {
            setRegistering(false)
            setRegistrationError(false)
            setRegistrationMessage(
              'Payment window closed. Your registration is not confirmed.'
            )
          },
        },

        theme: {
          color: '#7657f6',
        },
      })

      razorpay.on('payment.failed', function (failure) {
        setRegistering(false)
        setRegistrationError(true)
        setRegistrationMessage(
          failure.error?.description ||
          'Payment failed. Please try again.'
        )
      })

      razorpay.open()
    } catch (err) {
      setRegistrationError(true)
      setRegistrationMessage(
        err.message || 'Unable to register. Please try again.'
      )
      setRegistering(false)
    }
  }
  function openRegistration(event) {
    setSelectedEvent(event)
    setRegistrationMessage('')
    setRegistrationError(false)
    resetRegistrationForm()

    window.setTimeout(() => {
      document
        .getElementById('registration')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function closeRegistration() {
    setSelectedEvent(null)
    setRegistrationMessage('')
    setRegistrationError(false)
    resetRegistrationForm()
  }

  // Keep the organizer page separate from the public homepage.
  if (showOrganizer) {
    return (
      <Organizer
        onBack={() => setShowOrganizer(false)}
      />
    )
  }

  return (
    <div className="app">
      <header className="navbar">
        <a
          className="brand"
          href="#home"
          onClick={() => closeRegistration()}
        >
          <span className="brand-icon">E</span>
          Evently
        </a>

        <div className="navbar-actions">
          <a className="nav-link" href="#events">
            Explore Events
          </a>

          <button
            className="nav-link organizer-nav-button"
            type="button"
            onClick={() => setShowOrganizer(true)}
          >
            Organizer <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <main id="home">
        <section className="hero">
          <span className="eyebrow">DISCOVER · CONNECT · GROW</span>

          <h1>
            Great events.
            <br />
            <span>Meaningful connections.</span>
          </h1>

          <p>
            Discover inspiring workshops, technology seminars and meetups.
            Find your next opportunity to learn and connect.
          </p>

          <a className="primary-button" href="#events">
            Explore upcoming events <span aria-hidden="true">→</span>
          </a>

          <div className="hero-stats">
            <div>
              <strong>{events.length.toString().padStart(2, '0')}</strong>
              <span>Upcoming events</span>
            </div>

            <div>
              <strong>01</strong>
              <span>Place to connect</span>
            </div>

            <div>
              <strong>∞</strong>
              <span>Possibilities</span>
            </div>
          </div>
        </section>

        <section className="events-section" id="events">
          <div className="section-heading">
            <div>
              <span className="eyebrow">WHAT'S HAPPENING</span>
              <h2>Upcoming events</h2>
              <p>Find something that inspires you.</p>
            </div>

            <span className="event-count">
              {events.length} {events.length === 1 ? 'EVENT' : 'EVENTS'}
            </span>
          </div>

          {loading && (
            <p className="message">Loading events...</p>
          )}

          {!loading && error && (
            <div className="error-message" role="alert">
              {error}

              <button
                className="retry-button"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <p className="message">
              No upcoming events are available right now.
            </p>
          )}

          {!loading && !error && events.length > 0 && (
            <div className="events-grid">
              {events.map((event, index) => (
                <article className="event-card" key={event.id}>
                  <div className={`event-art art-${index % 3}`}>
                    <span className="art-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <span className="art-symbol" aria-hidden="true">
                      {['✳', '⌘', '↗'][index % 3]}
                    </span>

                    <span className="art-label">EVENTLY / LIVE</span>
                  </div>

                  <div className="event-content">
                    <div className="event-date">
                      <span aria-hidden="true">◷</span>{' '}
                      {event.event_date}
                    </div>


                    <h3>{event.title}</h3>

                    <div className="event-price">
                      {event.price === 0
                        ? 'Free'
                        : new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: event.currency || 'INR',
                          maximumFractionDigits: 2,
                        }).format(event.price)}
                    </div>

                    <p className="event-description">
                      {event.description}
                    </p>

                    <div className="event-details">
                      <p>
                        <span aria-hidden="true">⌖</span>
                        {event.venue}
                      </p>

                      <p>
                        <span aria-hidden="true">◷</span>
                        {event.schedule}
                      </p>
                    </div>

                    <div className="event-footer">
                      <span className="seats">
                        {event.available_seats} seats available
                      </span>

                      <button
                        className="register-button"
                        type="button"
                        onClick={() => openRegistration(event)}
                      >
                        Register now <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {selectedEvent && (
          <section className="registration-section" id="registration">
            <div className="registration-card">
              <span className="eyebrow">SAVE YOUR SPOT</span>

              <h2>Register for an event</h2>

              <p className="registration-subtitle">
                {selectedEvent.title}
              </p>

              <div className="registration-price">
                {selectedEvent.price === 0
                  ? 'Free Event'
                  : new Intl.NumberFormat('en-IN', {
                    style: 'currency',
                    currency: selectedEvent.currency || 'INR',
                    maximumFractionDigits: 2,
                  }).format(selectedEvent.price)}
              </div>

              <form onSubmit={handleRegistrationSubmit}>
                <label htmlFor="reg-name">Full name</label>

                <input
                  id="reg-name"
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      name: e.target.value,
                    })
                  }
                  placeholder="Enter your full name"
                  required
                />

                <label htmlFor="reg-email">Email address</label>

                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      email: e.target.value,
                    })
                  }
                  placeholder="you@example.com"
                  required
                />

                <label htmlFor="reg-organization">Organization</label>

                <input
                  id="reg-organization"
                  type="text"
                  autoComplete="organization"
                  maxLength={150}
                  value={formData.organization}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      organization: e.target.value,
                    })
                  }
                  placeholder="Company, college or organization"
                  required
                />

                <fieldset className="interest-options">
                  <legend>Choose your interests</legend>

                  <p className="interest-hint">
                    Select 1 to 10 interests that match your preferences.
                  </p>

                  {INTEREST_CATEGORIES.map((category) => (
                    <div
                      className="interest-category"
                      key={category.title}
                    >
                      <h4 className="interest-category-title">
                        {category.title}
                      </h4>

                      <div className="interest-category-options">
                        {category.options.map((interest) => {
                          const isSelected =
                            formData.interests.includes(interest)

                          const limitReached =
                            formData.interests.length >= 10 && !isSelected

                          return (
                            <label
                              key={interest}
                              className={`interest-option${isSelected ? ' selected' : ''}${limitReached ? ' disabled' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={limitReached || registering}
                                onChange={() =>
                                  handleInterestChange(interest)
                                }
                              />

                              <span>{interest}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  <p className="interest-selection-count">
                    {formData.interests.length} of 10 selected
                  </p>
                </fieldset>

                {registrationMessage && (
                  <p
                    className={
                      registrationError
                        ? 'registration-feedback error'
                        : 'registration-feedback success'
                    }
                    role="status"
                    aria-live="polite"
                  >
                    {registrationMessage}
                  </p>
                )}

                <button
                  className="submit-registration"
                  type="submit"
                  disabled={registering}
                >
                  {registering
                    ? 'Registering...'
                    : 'Confirm registration'}
                </button>

                <button
                  className="cancel-registration"
                  type="button"
                  onClick={closeRegistration}
                  disabled={registering}
                >
                  Cancel
                </button>
              </form>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <a className="brand" href="#home">
          <span className="brand-icon">E</span>
          Evently
        </a>

        <p>Bringing people and ideas together.</p>

        <span>© {new Date().getFullYear()} Evently</span>
      </footer>
    </div>
  )
}

export default App
