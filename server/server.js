require('dotenv').config();

const Razorpay = require('razorpay');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./database/database');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const app = express();
const PORT = Number(process.env.PORT) || 4001;
const JWT_SECRET = process.env.JWT_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3001';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Error: Set a strong JWT_SECRET (at least 32 characters) in server/.env');
  process.exit(1);
}

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '10kb' }));

// -------------------- Helpers --------------------

function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function createToken(organizer) {
  return jwt.sign(
    { id: organizer.id, email: organizer.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authenticateOrganizer(req, res, next) {
  const authorization = req.headers.authorization || '';
  const [scheme, token] = authorization.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return sendError(res, 401, 'Please log in to continue.');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizer = db.prepare(
      'SELECT id, name, email FROM organizers WHERE id = ?'
    ).get(decoded.id);

    if (!organizer) {
      return sendError(res, 401, 'Organizer account not found.');
    }

    req.organizer = organizer;
    next();
  } catch {
    return sendError(res, 401, 'Your session is invalid or expired. Please log in again.');
  }
}

function validEventInput(body) {
  const {
    title, description, event_date, schedule, venue,
    capacity, category, price, currency, image_url, status
  } = body || {};

  if (
    typeof title !== 'string' || title.trim().length < 3 ||
    title.trim().length > 150
  ) {
    return 'Title must be between 3 and 150 characters.';
  }

  if (
    typeof description !== 'string' ||
    description.trim().length < 10 ||
    description.trim().length > 10000
  ) {
    return 'Description must be between 10 and 10000 characters.';
  }

  if (
    typeof event_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(event_date) ||
    !Number.isFinite(Date.parse(`${event_date}T00:00:00Z`)) ||
    new Date(`${event_date}T00:00:00Z`).toISOString().slice(0, 10) !== event_date
  ) {
    return 'Please provide a valid event date (YYYY-MM-DD).';
  }

  if (
    typeof schedule !== 'string' ||
    schedule.trim().length < 2 || schedule.trim().length > 100
  ) {
    return 'Please provide a valid event schedule.';
  }

  if (
    typeof venue !== 'string' ||
    venue.trim().length < 2 || venue.trim().length > 200
  ) {
    return 'Venue must be between 2 and 200 characters.';
  }

  if (
    !Number.isSafeInteger(Number(capacity)) ||
    Number(capacity) < 1 ||
    Number(capacity) > 1000000
  ) {
    return 'Capacity must be a whole number between 1 and 1000000.';
  }

  if (
    typeof category !== 'string' ||
    category.trim().length < 2 || category.trim().length > 80
  ) {
    return 'Category must be between 2 and 80 characters.';
  }

  if (
    price === undefined || price === null || price === '' ||
    !Number.isFinite(Number(price)) ||
    Number(price) < 0 || Number(price) > 100000000
  ) {
    return 'Price must be a valid non-negative amount.';
  }

  if (
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    return 'Currency must be a 3-letter uppercase code, such as INR.';
  }

  if (
    image_url !== undefined &&
    (typeof image_url !== 'string' || image_url.length > 2000)
  ) {
    return 'Image URL is invalid.';
  }

  if (!['draft', 'published'].includes(status)) {
    return 'Status must be draft or published.';
  }

  return null;
}

function eventValues(body) {
  return [
    body.title.trim(),
    body.description.trim(),
    body.event_date,
    body.schedule.trim(),
    body.venue.trim(),
    Number(body.capacity),
    body.category.trim(),
    Number(body.price),
    body.currency,
    (body.image_url || '').trim(),
    body.status
  ];
}

function validateAttendee(body) {
  const { name, email, organization, interests } = body || {};

  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof organization !== 'string'
  ) {
    return { error: 'Name, email and organization are required.' };
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanOrganization = organization.trim();

  if (
    cleanName.length < 2 ||
    cleanName.length > 100 ||
    cleanEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
    cleanOrganization.length < 2 ||
    cleanOrganization.length > 150
  ) {
    return { error: 'Please provide valid name, email and organization.' };
  }

  if (
    !Array.isArray(interests) ||
    interests.length < 1 ||
    interests.length > 10 ||
    !interests.every(item =>
      typeof item === 'string' &&
      item.trim().length > 0 &&
      item.trim().length <= 50
    )
  ) {
    return { error: 'Choose between 1 and 10 valid domain interests.' };
  }

  return {
    attendee: {
      name: cleanName,
      email: cleanEmail,
      organization: cleanOrganization,
      interests: interests.map(item => item.trim())
    }
  };
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !process.env.RAZORPAY_KEY_SECRET
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest();

  const supplied = Buffer.from(signature, 'hex');

  return supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected);
}

const eventSelect = `
  SELECT e.*,
    COUNT(
      CASE
        WHEN r.status IN ('registered', 'attended')
        THEN 1
      END
    ) AS registered_count,
    e.capacity - COUNT(
      CASE
        WHEN r.status IN ('registered', 'attended')
        THEN 1
      END
    ) AS available_seats
  FROM events e
  LEFT JOIN registrations r ON r.event_id = e.id
`;


// -------------------- Organizer Signup --------------------

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body || {};

  if (
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    name.trim().length > 100
  ) {
    return sendError(res, 400, 'Name must be between 2 and 100 characters.');
  }

  if (
    typeof email !== 'string' ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return sendError(res, 400, 'Please provide a valid email address.');
  }

  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 72
  ) {
    return sendError(res, 400, 'Password must be between 8 and 72 characters.');
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const existing = db.prepare(
      'SELECT id FROM organizers WHERE email = ?'
    ).get(cleanEmail);

    if (existing) {
      return sendError(res, 409, 'An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO organizers (name, email, password_hash)
      VALUES (?, ?, ?)
    `).run(name.trim(), cleanEmail, passwordHash);

    const organizer = {
      id: Number(result.lastInsertRowid),
      name: name.trim(),
      email: cleanEmail
    };

    return res.status(201).json({
      success: true,
      message: 'Organizer account created successfully.',
      token: createToken(organizer),
      organizer
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendError(res, 409, 'An account with this email already exists.');
    }

    console.error('Signup error:', error.message);
    return sendError(res, 500, 'Unable to create account right now.');
  }
});

// -------------------- Organizer Login --------------------

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    email.trim().length > 254 ||
    password.length > 72
  ) {
    return sendError(res, 400, 'Please provide a valid email and password.');
  }

  try {
    const organizer = db.prepare(`
      SELECT id, name, email, password_hash
      FROM organizers
      WHERE email = ?
    `).get(email.trim().toLowerCase());

    if (!organizer || !(await bcrypt.compare(password, organizer.password_hash))) {
      return sendError(res, 401, 'Incorrect email or password.');
    }

    return res.json({
      success: true,
      message: 'Login successful.',
      token: createToken(organizer),
      organizer: {
        id: organizer.id,
        name: organizer.name,
        email: organizer.email
      }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return sendError(res, 500, 'Unable to log in right now.');
  }
});

// -------------------- Get Current Organizer --------------------

app.get('/api/auth/me', authenticateOrganizer, (req, res) => {
  res.json({ success: true, organizer: req.organizer });
});

// -------------------- Public: Get Published Events --------------------

app.get('/api/events', (req, res) => {
  try {
    const events = db.prepare(`
      ${eventSelect}
      WHERE e.status = 'published'
      GROUP BY e.id
      ORDER BY e.event_date ASC, e.id DESC
    `).all();

    res.json({ success: true, events });
  } catch (error) {
    console.error('Load events error:', error);
    return sendError(res, 500, 'Unable to load events.');
  }
});

// -------------------- Organizer: Get Own Events --------------------

app.get('/api/organizer/events', authenticateOrganizer, (req, res) => {
  try {
    const events = db.prepare(`
      ${eventSelect}
      WHERE e.organizer_id = ?
      GROUP BY e.id
      ORDER BY e.created_at DESC, e.id DESC
    `).all(req.organizer.id);

    res.json({ success: true, events });
  } catch (error) {
    console.error('Organizer events error:', error.message);
    return sendError(res, 500, 'Unable to load your events.');
  }
});

// -------------------- Organizer: Create Event --------------------

app.post('/api/events', authenticateOrganizer, (req, res) => {
  const validationError = validEventInput(req.body);

  if (validationError) {
    return sendError(res, 400, validationError);
  }

  try {
    const values = eventValues(req.body);

    const result = db.prepare(`
      INSERT INTO events (
        title, description, event_date, schedule, venue, capacity,
        organizer_id, category, price, currency, image_url, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ...values.slice(0, 6),
      req.organizer.id,
      ...values.slice(6)
    );

    const event = db.prepare(
      'SELECT * FROM events WHERE id = ?'
    ).get(Number(result.lastInsertRowid));

    return res.status(201).json({
      success: true,
      message: 'Event created successfully.',
      event
    });
  } catch (error) {
    console.error('Create event error:', error.message);
    return sendError(res, 500, 'Unable to create event.');
  }
});

// -------------------- Public: Get One Published Event --------------------

app.get('/api/events/:id', (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return sendError(res, 400, 'Invalid event ID.');
  }

  try {
    const event = db.prepare(`
      ${eventSelect}
      WHERE e.id = ? AND e.status = 'published'
      GROUP BY e.id
    `).get(id);

    if (!event) {
      return sendError(res, 404, 'Event not found.');
    }

    res.json({ success: true, event });
  } catch (error) {
    console.error('Load event error:', error.message);
    return sendError(res, 500, 'Unable to load event.');
  }
});

// -------------------- Organizer: Update Own Event --------------------

app.put('/api/events/:id', authenticateOrganizer, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return sendError(res, 400, 'Invalid event ID.');
  }

  const validationError = validEventInput(req.body);

  if (validationError) {
    return sendError(res, 400, validationError);
  }

  try {
    const existing = db.prepare(`
      SELECT id FROM events
      WHERE id = ? AND organizer_id = ?
    `).get(id, req.organizer.id);

    if (!existing) {
      return sendError(res, 404, 'Event not found or you do not own this event.');
    }

    const values = eventValues(req.body);

    db.prepare(`
      UPDATE events
      SET title = ?, description = ?, event_date = ?, schedule = ?,
          venue = ?, capacity = ?, category = ?, price = ?, currency = ?,
          image_url = ?, status = ?
      WHERE id = ? AND organizer_id = ?
    `).run(
      ...values,
      id,
      req.organizer.id
    );

    const event = db.prepare(
      'SELECT * FROM events WHERE id = ?'
    ).get(id);

    return res.json({
      success: true,
      message: 'Event updated successfully.',
      event
    });
  } catch (error) {
    console.error('Update event error:', error.message);
    return sendError(res, 500, 'Unable to update event.');
  }
});

// -------------------- Organizer: Delete Own Event --------------------

app.delete('/api/events/:id', authenticateOrganizer, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return sendError(res, 400, 'Invalid event ID.');
  }

  try {
    const event = db.prepare(`
      SELECT id FROM events
      WHERE id = ? AND organizer_id = ?
    `).get(id, req.organizer.id);

    if (!event) {
      return sendError(res, 404, 'Event not found or you do not own this event.');
    }

    const registrationCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM registrations
      WHERE event_id = ?
    `).get(id).count;

    if (registrationCount > 0) {
      return sendError(
        res,
        409,
        'This event has registrations and cannot be deleted. You can change its status instead.'
      );
    }

    db.prepare(`
      DELETE FROM events
      WHERE id = ? AND organizer_id = ?
    `).run(id, req.organizer.id);

    return res.json({
      success: true,
      message: 'Event deleted successfully.'
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return sendError(
        res,
        409,
        'This event has related payment records and cannot be deleted.'
      );
    }

    console.error('Delete event error:', error.message);
    return sendError(res, 500, 'Unable to delete event.');
  }
});

// -------------------- Public: Register for a Free Event --------------------

app.post('/api/events/:id/register', (req, res) => {
  const eventId = Number(req.params.id);
  const validated = validateAttendee(req.body);

  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    return sendError(res, 400, 'Invalid event ID.');
  }

  if (validated.error) {
    return sendError(res, 400, validated.error);
  }

  const attendee = validated.attendee;

  try {
    const result = db.transaction(() => {
      const event = db.prepare(`
        SELECT id, capacity, price
        FROM events
        WHERE id = ? AND status = 'published'
      `).get(eventId);

      if (!event) return { error: 'NOT_FOUND' };

      // This endpoint is only for free events.
      if (Number(event.price) !== 0) {
        return { error: 'PAID_EVENT' };
      }

      const duplicate = db.prepare(`
        SELECT id FROM registrations
        WHERE event_id = ? AND email = ?
      `).get(eventId, attendee.email);

      if (duplicate) return { error: 'DUPLICATE' };

      const count = db.prepare(`
        SELECT COUNT(*) AS total
        FROM registrations
        WHERE event_id = ?
          AND status IN ('registered', 'attended')
      `).get(eventId).total;

      if (count >= event.capacity) {
        return { error: 'FULL' };
      }

      const insert = db.prepare(`
        INSERT INTO registrations
          (event_id, name, email, organization, interests)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        eventId,
        attendee.name,
        attendee.email,
        attendee.organization,
        JSON.stringify(attendee.interests)
      );

      return {
        registrationId: Number(insert.lastInsertRowid)
      };
    })();

    if (result.error === 'NOT_FOUND') {
      return sendError(res, 404, 'Published event not found.');
    }

    if (result.error === 'PAID_EVENT') {
      return sendError(res, 400, 'This event requires online payment.');
    }

    if (result.error === 'DUPLICATE') {
      return sendError(
        res, 409,
        'This email is already registered for this event.'
      );
    }

    if (result.error === 'FULL') {
      return sendError(res, 409, 'This event has no available seats.');
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful!',
      registrationId: result.registrationId
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendError(
        res, 409,
        'This email is already registered for this event.'
      );
    }

    console.error('Free registration error:', error.message);
    return sendError(res, 500, 'Registration failed. Please try again.');
  }
});

// -------------------- Create Razorpay Order --------------------

app.post('/api/payments/create-order', async (req, res) => {
  console.log('CREATE-ORDER ROUTE HIT');
  const eventId = Number(req.body?.eventId);
  const validated = validateAttendee(req.body);

  if (!Number.isSafeInteger(eventId) || eventId < 1) {
    return sendError(res, 400, 'Invalid event ID.');
  }

  if (validated.error) {
    return sendError(res, 400, validated.error);
  }

  try {
    const event = db.prepare(`
      SELECT id, title, capacity, price, currency, status
      FROM events
      WHERE id = ? AND status = 'published'
    `).get(eventId);

    if (!event) {
      return sendError(res, 404, 'Published event not found.');
    }

    if (!Number.isFinite(event.price) || event.price <= 0) {
      return sendError(res, 400, 'This event does not require online payment.');
    }

    const attendee = validated.attendee;

    const existingRegistration = db.prepare(`
      SELECT id FROM registrations
      WHERE event_id = ? AND email = ?
    `).get(eventId, attendee.email);

    if (existingRegistration) {
      return sendError(res, 409, 'This email is already registered for this event.');
    }

    const activeCount = db.prepare(`
      SELECT COUNT(*) AS total
      FROM registrations
      WHERE event_id = ?
        AND status IN ('registered', 'attended')
    `).get(eventId).total;

    if (activeCount >= event.capacity) {
      return sendError(res, 409, 'This event has no available seats.');
    }

    const amountPaise = Math.round(event.price * 100);

    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
      return sendError(res, 400, 'Event price is invalid for Razorpay payment.');
    }

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: event.currency,
      receipt: `event_${event.id}_${Date.now()}`
    });

    db.prepare(`
      INSERT INTO payment_orders (
  event_id,
  razorpay_order_id,
  amount_paise,
  currency,
  attendee_name,
  attendee_email,
  organization,
  interests,
  status
)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'created')
    `).run(
      event.id,
      order.id,
      amountPaise,
      event.currency,
      attendee.name,
      attendee.email,
      attendee.organization,
      JSON.stringify(attendee.interests)
    );

    return res.status(201).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      event: {
        id: event.id,
        title: event.title
      }
    });
  } catch (error) {
    console.error('Create payment order error:', error.message);
    return sendError(res, 500, 'Unable to create payment order.');
  }
});

// -------------------- Verify Razorpay Payment --------------------

app.post('/api/payments/verify', async (req, res) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature
  } = req.body || {};

  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string'
  ) {
    return sendError(res, 400, 'Payment verification details are incomplete.');
  }

  if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
    return sendError(res, 400, 'Payment signature verification failed.');
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);

    if (
      payment.order_id !== orderId ||
      payment.status !== 'captured'
    ) {
      return sendError(res, 400, 'Payment has not been captured successfully.');
    }

    const result = db.transaction(() => {
      const paymentOrder = db.prepare(`
        SELECT * FROM payment_orders
        WHERE razorpay_order_id = ?
      `).get(orderId);

      if (!paymentOrder) {
        return { error: 'ORDER_NOT_FOUND' };
      }

      if (
        payment.amount !== paymentOrder.amount_paise ||
        payment.currency !== paymentOrder.currency
      ) {
        return { error: 'AMOUNT_MISMATCH' };
      }

      
if (paymentOrder.status === 'paid') {
  if (paymentOrder.razorpay_payment_id !== paymentId) {
    return { error: 'ALREADY_PAID' };
  }

  const existingRegistration = db.prepare(`
    SELECT id
    FROM registrations
    WHERE event_id = ? AND email = ?
  `).get(
    paymentOrder.event_id,
    paymentOrder.attendee_email
  );

  if (!existingRegistration) {
    return { error: 'REGISTRATION_NOT_FOUND' };
  }

  return {
    alreadyPaid: true,
    registrationId: Number(existingRegistration.id)
  };
}

      if (paymentOrder.status !== 'created') {
        return { error: 'INVALID_ORDER_STATUS' };
      }

      const event = db.prepare(`
        SELECT id, capacity, status
        FROM events
        WHERE id = ?
      `).get(paymentOrder.event_id);

      if (!event || event.status !== 'published') {
        return { error: 'EVENT_UNAVAILABLE' };
      }

      const duplicate = db.prepare(`
        SELECT id FROM registrations
        WHERE event_id = ? AND email = ?
      `).get(paymentOrder.event_id, paymentOrder.attendee_email);

      if (duplicate) {
        return { error: 'DUPLICATE_REGISTRATION' };
      }

      const activeCount = db.prepare(`
        SELECT COUNT(*) AS total
        FROM registrations
        WHERE event_id = ?
          AND status IN ('registered', 'attended')
      `).get(paymentOrder.event_id).total;

      if (activeCount >= event.capacity) {
        return { error: 'EVENT_FULL' };
      }

      const registration = db.prepare(`
        INSERT INTO registrations (
          event_id, name, email, organization, interests, status
        )
        VALUES (?, ?, ?, ?, ?, 'registered')
      `).run(
        paymentOrder.event_id,
        paymentOrder.attendee_name,
        paymentOrder.attendee_email,
        paymentOrder.organization,
        paymentOrder.interests
      );

      
const paymentUpdate = db.prepare(`
  UPDATE payment_orders
  SET status = 'paid',
      razorpay_payment_id = ?,
      verified_at = datetime('now')
  WHERE razorpay_order_id = ?
    AND status = 'created'
`);

const updateResult = paymentUpdate.run(paymentId, orderId);

if (updateResult.changes !== 1) {
  throw new Error('PAYMENT_ORDER_UPDATE_FAILED');
}

      return {
        registrationId: Number(registration.lastInsertRowid)
      };
    })();

    const errorMessages = {
      ORDER_NOT_FOUND: 'Payment order not found.',
      AMOUNT_MISMATCH: 'Payment amount or currency does not match.',
      ALREADY_PAID: 'This order has already been paid.',
      REGISTRATION_NOT_FOUND: 'Payment was verified, but the registration record was not found. Please contact support.',
      INVALID_ORDER_STATUS: 'This payment order is no longer valid.',
      EVENT_UNAVAILABLE: 'This event is no longer available.',
      DUPLICATE_REGISTRATION: 'This email is already registered for this event.',
      EVENT_FULL: 'Payment succeeded, but the event has no available seats. Contact support for assistance.'
    };

    if (result.error) {
      const status = result.error === 'ORDER_NOT_FOUND' ? 404 : 409;
      return sendError(res, status, errorMessages[result.error]);
    }

    return res.json({
      success: true,
      message: result.alreadyPaid
        ? 'Payment was already verified.'
        : 'Payment verified and registration completed.',
      ...(result.registrationId
        ? { registrationId: result.registrationId }
        : {})
    });
  } catch (error) {
    console.error('Payment verification error:', error.message);
    return sendError(res, 500, 'Unable to verify payment. Please contact support if money was deducted.');
  }
});
// -------------------- Start Server --------------------

// console.log(
//   'Payment routes loaded:',
//   app._router?.stack
//     ?.filter((layer) => layer.route)
//     .map((layer) => ({
//       path: layer.route.path,
//       methods: Object.keys(layer.route.methods),
//     }))
// )

console.log('RUNNING SERVER FILE:', __filename)

console.log(
  'REGISTERED ROUTES:',
  app.router?.stack
    ?.filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }))
)


app.listen(PORT, () => {
  console.log(`Event Registration API running at http://localhost:${PORT}`);
});