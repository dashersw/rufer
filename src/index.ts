import 'dotenv/config'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import cors from 'cors'
import { createAdapter } from '@socket.io/mongo-adapter'
import { MongoClient } from 'mongodb'
import mongoose from 'mongoose'

import userRoutes from './routes/user-routes'
import { config } from './config'
import type { Socket, ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from './types.js'
import './models/user'
import { UserModel } from './models/user'
import { initializeChangeStream } from './services/change-stream'
import { validateSession } from './socket/middleware'
import { registerMessageHandlers } from './socket/message-handlers'

const app = express()
const PORT = config.PORT

const server = createServer(app)
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type']
  }
})

io.use(validateSession)

app.use(
  cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type']
  })
)

app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Routes
app.use('/api/users', userRoutes)

const mongoClient = new MongoClient(config.DATABASE_URL)

async function main() {
  try {
    // Connect to MongoDB with Mongoose
    await mongoose.connect(config.DATABASE_URL)
    console.log('Mongoose connected successfully')

    // Connect MongoDB client for Socket.IO adapter
    await mongoClient.connect()
    const db = mongoClient.db()
    const collection = db.collection('socket.io-adapter-events')

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`)
    })

    io.adapter(createAdapter(collection))

    // Make io instance available to other modules
    app.set('io', io)

    // Initialize change stream
    initializeChangeStream(io)

    io.on('connection', (socket: Socket) => {
      console.log('A user connected:', socket.id)

      // Register message handlers
      registerMessageHandlers(socket, io)

      socket.on('user-online', async (userId: string) => {
        console.log(`User ${userId} is online with socket ${socket.id}`)
        // Join a room with the user's ID
        await socket.join(userId)
        socket.data.userId = userId

        // Log rooms after joining
        const socketRooms = Array.from(socket.rooms)
        console.log(`Socket ${socket.id} is in rooms:`, socketRooms)

        // Update user's online status
        await UserModel.findByIdAndUpdate(userId, { lastSeen: new Date() })

        // Broadcast online status to all users
        io.emit('user-status', { userId, status: 'online', lastSeen: new Date() })

        // Log all sockets in this user's room
        const roomSockets = await io.in(userId).fetchSockets()
        console.log(`Number of sockets in room ${userId}:`, roomSockets.length)
      })

      socket.on('request-user-status', async (userId: string) => {
        console.log(`Status requested for user ${userId}`)
        const sockets = await io.in(userId).fetchSockets()
        const isOnline = sockets.length > 0
        const user = await UserModel.findById(userId)
        const lastSeen = user?.lastSeen || null

        // Send status only to the requesting socket
        socket.emit('user-status', {
          userId,
          status: isOnline ? 'online' : 'offline',
          lastSeen: isOnline ? null : lastSeen
        })
      })

      // Handle typing events
      socket.on('typing-start', (recipientId: string) => {
        console.log(`User ${socket.data.userId} started typing to ${recipientId}`)
        if (socket.data.userId) {
          io.to(recipientId).emit('typing-start', {
            userId: socket.data.userId,
            recipientId
          })
        }
      })

      socket.on('typing-stop', (recipientId: string) => {
        console.log(`User ${socket.data.userId} stopped typing to ${recipientId}`)
        if (socket.data.userId) {
          io.to(recipientId).emit('typing-stop', {
            userId: socket.data.userId,
            recipientId
          })
        }
      })

      socket.on('disconnect', async () => {
        console.log('A user disconnected:', socket.id)
        const userId = socket.data.userId
        if (typeof userId === 'string') {
          console.log(`User ${userId} disconnecting from socket ${socket.id}`)
          await socket.leave(userId)

          // Update last seen time
          await UserModel.findByIdAndUpdate(userId, { lastSeen: new Date() })

          // Check if user has other active connections
          const userSockets = await io.in(userId).fetchSockets()
          console.log(`Remaining sockets for user ${userId}:`, userSockets.length)
          if (userSockets.length === 0) {
            // Broadcast offline status only if no other connections
            io.emit('user-status', { userId, status: 'offline', lastSeen: new Date() })
          }
        }
      })
    })

    // Endpoint to check if a user is online
    app.get('/api/users/:userId/online', async (req, res) => {
      const { userId } = req.params
      const sockets = await io.in(userId).fetchSockets()
      const isOnline = sockets.length > 0
      res.json({ userId, isOnline })
    })
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

// Handle Mongoose connection errors
mongoose.connection.on('error', err => {
  console.error('Mongoose connection error:', err)
})

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected')
})

process.on('SIGINT', async () => {
  await mongoose.connection.close()
  await mongoClient.close()
  process.exit(0)
})
void main()
