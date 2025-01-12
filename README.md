# Rufer

A modern, headless WebSocket API for building real-time chat applications. Rufer provides a robust backend infrastructure with built-in support for message delivery status, typing indicators, user presence, and more.

Includes a complete reference implementation built with Vue.js to demonstrate integration patterns and best practices.

## Features

- 🚀 WebSocket-based real-time messaging API
- 👥 Built-in user presence detection
- ✍️ Typing indicators
- ✅ Message delivery status (delivered/read)
- 🕒 Last seen timestamps
- 💾 Message persistence with MongoDB
- 📡 MongoDB Change Streams for real-time updates
- 🔄 Automatic reconnection handling with exponential backoff
- 🔐 Session-based authentication with auto-expiring tokens
- 🔍 Debug mode for development
- 🔄 Automatic message delivery on reconnection
- 📊 Unread message counter per chat
- 🔄 Optimistic message updates
- 🔌 Automatic session refresh on disconnection
- 🎯 Complete reference implementation included
- 🌐 Separate backend service for token management

## Tech Stack

- **Frontend:**

  - Vue 3 with Composition API
  - Pinia for state management
  - Socket.IO client
  - TypeScript

- **Backend:**
  - Express.js
  - Socket.IO server
  - MongoDB with Change Streams
  - Mongoose
  - TypeScript

## Prerequisites

- Docker and Docker Compose

## Quick Start

1. Clone the repository:

   ```bash
   git clone https://github.com/dashersw/rufer.git
   cd rufer
   ```

2. Create environment files:

   ```bash
   # Main backend
   cp .env.example .env

   # Reference implementation backend
   cd reference-implementation/backend
   cp .env.example .env

   # Reference implementation frontend
   cd ../frontend
   cp .env.example .env
   cd ../..
   ```

   Edit the `.env` files:

   - Main backend `.env`: Set your `RUFER_SECRET_KEY` and other variables
   - Reference backend `.env`: Set the same `RUFER_SECRET_KEY` and optionally adjust `RUFER_URL`
   - Reference frontend `.env`: Adjust `VITE_RUFER_URL` and `VITE_BACKEND_URL` if needed

3. Start the application:

   ```bash
   docker compose up
   ```

   The reference backend will automatically register two test users:

   - `alice` (Alice Smith)
   - `bob` (Bob Johnson)

4. Open two browser windows to test the chat:

   ```
   Window 1: http://localhost:5173?userId=alice
   Window 2: http://localhost:5173?userId=bob
   ```

   For debug mode, add `&debug=true` to see system messages and detailed message status:

   ```
   http://localhost:5173?userId=alice&debug=true
   ```

   The debug mode is particularly useful to see:

   - Message delivery status
   - Typing indicators
   - Connection events
   - Online/offline status changes

## Development

The application uses Docker volumes for development, which means:

- Source code changes are reflected immediately
- No need to rebuild containers for code changes
- Frontend hot module replacement (HMR) works out of the box
- Backend automatically restarts on changes

### Docker Services

- `api`: Backend service running on port 3000
- `frontend`: Frontend service running on port 5173
- MongoDB: Cloud-hosted database (no local setup required)

### Manual Setup (Alternative)

If you prefer to run the services without Docker:

1. Install dependencies:

   ```bash
   # Install backend dependencies
   npm install

   # Install frontend dependencies
   cd frontend
   npm install
   ```

2. Create a `.env` file in the root directory:

   ```env
   PORT=3000
   DATABASE_URL=mongodb://localhost:27017/chat-app
   ```

3. Start the development servers:

   ```bash
   # Start backend (from root directory)
   npm run dev

   # Start frontend (from frontend directory)
   cd frontend
   npm run dev
   ```

## Project Structure

```
├── src/                    # Backend source code
│   ├── models/            # Mongoose models
│   ├── routes/            # Express routes
│   ├── services/          # Business logic
│   └── types.ts           # TypeScript types
├── frontend/              # Frontend source code
│   ├── src/
│   │   ├── components/    # Vue components
│   │   ├── stores/        # Pinia stores
│   │   └── views/         # Vue views
│   └── public/            # Static assets
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile            # Backend Dockerfile
└── package.json          # Project configuration
```

## Features in Detail

### Real-time Messaging

- Messages are delivered instantly using Socket.IO
- Persistent storage in MongoDB
- Message status tracking (delivered/read)
- Change Streams for reliable real-time updates

### User Presence

- Real-time online/offline status
- Last seen timestamps
- Automatic status updates

### Typing Indicators

- Real-time typing status
- Debounced typing events
- Automatic timeout after 3 seconds

### Message Status

- Delivered status when recipient receives message
- Read status when recipient opens the chat
- Visual indicators for message status

### Debug Mode

- Enable with `?debug=true` in URL
- Shows detailed message information
- System messages for events
- Connection status updates

### Database Architecture

- MongoDB Change Streams for real-time data synchronization
- Separate collections for messages, users, and change events
- Change events track message delivery and read status
- Reliable event ordering and delivery through Change Streams
- No polling required - pure event-driven architecture

### Advanced Features

#### Session Management

- Session tokens expire after 15 minutes
- Automatic token refresh on reconnection
- Secure session validation middleware
- Single-use tokens for enhanced security

#### Optimistic Updates

- Instant message display before server confirmation
- Temporary message IDs for tracking
- Automatic update with server-assigned IDs
- Graceful error handling for failed messages

#### Reference Implementation

- Complete reference frontend implementation
- Separate token management backend service
- Example of secure token handling
- Production-ready authentication flow

#### System Messages

- Detailed connection status updates
- Socket lifecycle events
- Message delivery confirmations
- Typing indicator events
- User presence updates

#### Reconnection Handling

- Exponential backoff strategy
- Random jitter for distributed load
- Automatic session refresh
- State recovery after reconnection
- Maximum retry limit with configurable attempts

#### Chat Management

- Unread message counter per conversation
- Automatic counter reset on chat focus
- Last message preview in chat list
- Real-time chat list updates
- Optimistic chat list sorting

### Security

- User registration requires a secret key (`RUFER_SECRET_KEY`)
- Each user gets a unique session token for Socket.IO connections
- The reference backend service manages token generation and validation
- The main backend service uses single-use session tokens for Socket.IO connections
- Environment variables control security settings
- MongoDB connection string and secret key must be kept secure

### Authentication Flow

1. **User Registration**:

   ```bash
   npm run register-user alice "Alice Smith"
   ```

   This will:

   - Register/update the user in the main backend using the `RUFER_SECRET_KEY`
   - The user is stored in MongoDB with their ID and display name

2. **Socket.IO Connection Flow**:

   The reference implementation demonstrates a secure connection flow:

   1. Frontend requests a temporary session token from reference backend
   2. Reference backend uses `RUFER_SECRET_KEY` to request session token from main backend
   3. Main backend generates a single-use session token (15-minute expiry)
   4. Frontend uses session token to establish Socket.IO connection

   ```typescript
   // Request session token from reference backend
   const response = await referenceApi.post('/session-token', { userId })
   const sessionToken = response.data.token

   // Use session token for Socket.IO connection
   const socket = io('http://localhost:3000', {
     auth: { token: sessionToken }
   })
   ```

3. **Token Security Features**:

   - Session tokens:
     - Single-use: Invalidated after first Socket.IO connection
     - Short-lived: Expire after 15 minutes
     - Automatically refreshed on reconnection
     - Tied to specific user and socket connection

4. **Production Considerations**:
   - Implement secure token storage
   - Use environment-specific token generation
   - Consider implementing token rotation
   - Add rate limiting for token requests
   - Monitor token usage for security anomalies

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
