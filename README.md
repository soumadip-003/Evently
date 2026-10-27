# Evently — Event Registration Platform

Discover. Connect. Experience.

Evently is a modern event registration platform designed to help people discover events and register for experiences. The project is being developed with a focus on a clean user interface, reliable event management, and a responsive experience across devices.

## Features

- Browse available events
- View event details, schedules, venues, and capacity
- Register for events using attendee information
- Validate registration data on the server
- Prevent duplicate registrations for the same event
- Track registrations and available seats
- SQLite database for persistent data storage
- Responsive frontend interface

### Planned Features

- Organizer accounts and secure authentication
- Admin dashboard for creating and managing events
- Free and paid event options
- Event image uploads using Cloudinary
- Event management tools for organizers

## Tech Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS

**Backend**
- Node.js
- Express.js
- REST API

**Database**
- SQLite
- better-sqlite3

**Additional Tools**
- Git and GitHub
- JWT and bcryptjs for planned authentication
- Cloudinary for planned image storage

## Project Structure

```text
event-registration-platform/
├── client/          # React + Vite frontend
├── server/          # Express backend
│   ├── database/    # SQLite database files and setup
│   └── routes/      # API routes
├── README.md
└── .gitignore
```

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/soumadip-003/Evently.git
cd Evently
```

### 2. Install Frontend Dependencies

```bash
cd client
npm install
```

Start the frontend:

```bash
npm run dev -- --port 3001
```

### 3. Install Backend Dependencies

Open a second terminal from the project root:

```bash
cd server
npm install
```

Start the backend:

```bash
npm run dev
```

The frontend is intended to run at `http://localhost:3001`, and the backend API is intended to run at `http://localhost:4001`.

Check the actual port configuration in your local `server.js` before running the API.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/events` | Retrieve available events |
| GET | `/api/events/:id` | Retrieve event details |
| POST | `/api/events/:id/register` | Register an attendee |

## Environment Variables

If environment variables are required, create a `.env` file in the appropriate folder and configure the values expected by the application.

Never commit passwords, JWT secrets, Cloudinary credentials, or other sensitive information to GitHub.

## Project Goals

Evently aims to provide a convenient platform for event discovery and registration, with organizer tools and event management capabilities planned for future development.

## Author

**Soumadip Sikder**

GitHub: [@soumadip-003](https://github.com/soumadip-003)

## License

A license has not yet been selected for this project.
