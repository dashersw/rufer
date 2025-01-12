# Rufer Reference Implementation

This is a reference implementation for integrating with the Rufer chat service. It demonstrates how to:

- Get session tokens
- Connect to the socket server
- Handle connection status and errors
- Manage real-time message updates

## Dependencies

This reference implementation requires the main Rufer server to be running. The easiest way to run the complete system is to use the main project's docker-compose setup, which includes:

- Main Rufer server (port 3000)
- Reference backend (port 4000)
- Reference frontend (port 5173)

See the root `docker-compose.yml` for the complete setup.

## Manual Setup (Alternative)

If you want to run the reference implementation separately, follow these steps:

1. First, ensure the main Rufer server is running on port 3000

2. Copy the `.env.example` files:

   ```bash
   # In the backend directory
   cp .env.example .env

   # In the frontend directory
   cp .env.example .env
   ```

3. Edit the `.env` files:

   - Backend `.env`: Set your `RUFER_SECRET_KEY` (must match main server) and optionally adjust the `RUFER_URL`
   - Frontend `.env`: Adjust `VITE_RUFER_URL` and `VITE_BACKEND_URL` if needed

4. Install dependencies:

   ```bash
   # In the backend directory
   npm install

   # In the frontend directory
   npm install
   ```

5. Start the services:

   ```bash
   # Start the backend
   cd backend
   npm run dev

   # In another terminal, start the frontend
   cd frontend
   npm run dev
   ```

## Usage

1. Open the frontend in your browser with a user ID:

   ```
   http://localhost:5173?userId=alice
   ```

   Two test users are available by default:

   - `alice` (Alice Smith)
   - `bob` (Bob Johnson)

   For debug mode, add `&debug=true`:

   ```
   http://localhost:5173?userId=alice&debug=true
   ```

2. The application will automatically:
   - Connect to the reference backend
   - Get a session token
   - Establish Socket.IO connection
   - Show connection status in debug mode

## Architecture

### Backend Proxy

The backend proxy provides one main endpoint:

- `/session-token`: Gets a session token for a registered user

### Frontend

The frontend demonstrates:

- Socket.IO connection with session token
- Connection status display
- Error handling
- Real-time message updates

## Security Notes

- Never expose your Rufer secret key in the frontend
- Session tokens are short-lived and should be refreshed as needed
- Always use HTTPS in production
