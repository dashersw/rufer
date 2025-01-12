import { z } from 'zod'
import type { Socket } from 'socket.io'
import mongoose from 'mongoose'

import { MessageModel, type MessageDocument } from '../models/message'
import { UserModel } from '../models/user'
import { ChangeModel } from '../models/change'
import type { Server } from '../types'

type MessageWithId = MessageDocument

// Helper function to get ID from sender/recipient
function getIdString(field: string | { _id: string | mongoose.Types.ObjectId } | mongoose.Types.ObjectId): string {
  if (typeof field === 'string') return field
  if (field instanceof mongoose.Types.ObjectId) return field.toString()
  if ('_id' in field) {
    const id = field._id
    return typeof id === 'string' ? id : id.toString()
  }
  return ''
}

const createMessageSchema = z.object({
  sender: z.object({
    _id: z.string().min(1),
    displayName: z.string().min(1)
  }),
  recipient: z.object({
    _id: z.string().min(1),
    displayName: z.string().min(1)
  }),
  content: z.string().min(1)
})

export function registerMessageHandlers(socket: Socket, io: Server) {
  // Send message handler
  socket.on('send-message', async (message, callback) => {
    try {
      // Validate message data
      const validatedData = createMessageSchema.parse(message)

      console.log('Creating new message:', {
        sender: validatedData.sender._id,
        recipient: validatedData.recipient._id,
        content: validatedData.content
      })

      // Upsert sender and recipient
      await Promise.all([
        UserModel.findByIdAndUpdate(
          validatedData.sender._id,
          { displayName: validatedData.sender.displayName },
          { upsert: true }
        ),
        UserModel.findByIdAndUpdate(
          validatedData.recipient._id,
          { displayName: validatedData.recipient.displayName },
          { upsert: true }
        )
      ])

      // Create message
      const newMessage = (await MessageModel.create({
        sender: validatedData.sender._id,
        recipient: validatedData.recipient._id,
        content: validatedData.content
      })) as MessageWithId

      console.log('Message created:', newMessage)

      // Store message-sent event
      await ChangeModel.create({
        type: 'message-sent',
        data: { messageId: newMessage._id.toString() },
        timestamp: new Date()
      })

      // Check if recipient is online and mark as delivered
      const recipientSockets = await io.in(validatedData.recipient._id).fetchSockets()
      console.log('Recipient sockets:', recipientSockets.length)

      if (recipientSockets.length > 0) {
        console.log(
          `Auto-marking message ${newMessage._id} as delivered since recipient ${validatedData.recipient._id} is online`
        )
        newMessage.deliveredAt = new Date()
        await newMessage.save()

        // Store change and emit delivery status to sender
        await ChangeModel.create({
          type: 'message-delivered',
          data: { messageId: newMessage._id.toString() },
          timestamp: new Date()
        })
      }

      // Return the message data
      const messageData = {
        messageId: newMessage._id.toString(),
        sender: {
          _id: validatedData.sender._id,
          displayName: validatedData.sender.displayName
        },
        recipient: {
          _id: validatedData.recipient._id,
          displayName: validatedData.recipient.displayName
        },
        content: newMessage.content,
        createdAt: newMessage.createdAt,
        deliveredAt: newMessage.deliveredAt,
        readAt: newMessage.readAt
      }

      // Send acknowledgment to sender
      callback?.({ success: true, data: messageData })
    } catch (error) {
      console.error('Message creation failed:', error)
      callback?.({ success: false, error: 'Failed to create message' })
    }
  })

  // Get messages handler
  socket.on('get-messages', async ({ userId, otherUserId }, callback) => {
    try {
      const messages = (await MessageModel.find({
        $or: [
          { sender: userId, recipient: otherUserId },
          { sender: otherUserId, recipient: userId }
        ]
      })
        .sort({ createdAt: 1 })
        .exec()) as MessageWithId[]

      // Mark undelivered messages as delivered if recipient is fetching them
      const undeliveredMessages = messages.filter(msg => {
        const recipientId = getIdString(msg.recipient)
        return recipientId === userId && !msg.deliveredAt
      })

      if (undeliveredMessages.length > 0) {
        console.log(`Found ${undeliveredMessages.length} undelivered messages for user ${userId}`)

        await Promise.all(
          undeliveredMessages.map(async msg => {
            const senderId = getIdString(msg.sender)
            if (!senderId) return

            console.log(
              `Auto-marking message ${msg._id.toString()} as delivered. From: ${senderId}, Content: "${msg.content}"`
            )
            msg.deliveredAt = new Date()
            await msg.save()

            // Store change and notify sender
            await ChangeModel.create({
              type: 'message-delivered',
              data: { messageId: msg._id.toString() },
              timestamp: new Date()
            })
          })
        )
      }

      // Get the updated messages after marking them as delivered
      const updatedMessages = (await MessageModel.find({
        $or: [
          { sender: userId, recipient: otherUserId },
          { sender: otherUserId, recipient: userId }
        ]
      })
        .sort({ createdAt: 1 })
        .exec()) as MessageWithId[]

      callback?.({ success: true, data: updatedMessages })
    } catch (error) {
      console.error('Error getting messages:', error)
      callback?.({ success: false, error: 'Failed to get messages' })
    }
  })

  // Mark message as read handler
  socket.on('mark-message-read', async ({ messageId, userId }, callback) => {
    try {
      const message = (await MessageModel.findById(messageId).exec()) as MessageWithId | null
      if (message === null) {
        return callback?.({ success: false, error: 'Message not found' })
      }

      const recipientId = getIdString(message.recipient)
      if (recipientId !== userId) {
        return callback?.({ success: false, error: 'Not authorized to mark this message as read' })
      }

      if (!message.readAt) {
        const senderId = getIdString(message.sender)
        console.log(
          `Marking message ${message._id.toString()} as read. From: ${senderId}, To: ${recipientId}, Content: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`
        )
        message.readAt = new Date()
        await message.save()

        // Store change and notify sender
        await ChangeModel.create({
          type: 'message-read',
          data: { messageId: message._id.toString() },
          timestamp: new Date()
        })
      }

      callback?.({ success: true })
    } catch (error) {
      console.error('Error marking message as read:', error)
      callback?.({ success: false, error: 'Failed to mark message as read' })
    }
  })

  // Get chats handler
  socket.on('get-chats', async ({ userId }, callback) => {
    try {
      console.log(`[${new Date().toISOString()}] User ${userId} requested their chats`)

      // Mark undelivered messages as delivered since user is online and fetching chats
      const undeliveredMessages = (await MessageModel.find({
        recipient: userId,
        deliveredAt: { $exists: false }
      }).exec()) as MessageWithId[]

      if (undeliveredMessages.length > 0) {
        console.log(`Found ${undeliveredMessages.length} undelivered messages while fetching chats for user ${userId}`)

        await Promise.all(
          undeliveredMessages.map(async msg => {
            const senderId = getIdString(msg.sender)
            if (!senderId) return

            console.log(
              `Auto-marking message ${msg._id.toString()} as delivered. From: ${senderId}, Content: "${msg.content}"`
            )
            msg.deliveredAt = new Date()
            await msg.save()

            // Store change and notify sender that message was delivered
            await ChangeModel.create({
              type: 'message-delivered',
              data: { messageId: msg._id.toString() },
              timestamp: new Date()
            })
          })
        )
      }

      // Use aggregation to get unique chats with last messages
      const chats = await MessageModel.aggregate([
        // Match messages where user is sender or recipient
        {
          $match: {
            $or: [{ sender: userId }, { recipient: userId }]
          }
        },
        // Sort by creation date descending to get latest messages first
        { $sort: { createdAt: -1 } },
        // Group by the other user (sender if recipient is current user, recipient if sender is current user)
        {
          $group: {
            _id: {
              $cond: [{ $eq: ['$recipient', userId] }, '$sender', '$recipient']
            },
            lastMessage: { $first: '$$ROOT' },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [{ $eq: ['$recipient', userId] }, { $not: '$readAt' }]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        // Lookup user details
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        // Unwind the user array
        { $unwind: '$user' },
        // Project final fields
        {
          $project: {
            _id: 1,
            displayName: '$user.displayName',
            lastMessage: 1,
            unreadCount: 1,
            lastSeen: '$user.lastSeen'
          }
        }
      ])

      // Add online status to each chat
      const chatsWithOnlineStatus = await Promise.all(
        chats.map(async chat => {
          // @ts-ignore - chat._id is guaranteed to exist from aggregation
          const chatSockets = await io.in(chat._id).fetchSockets()
          return {
            ...chat,
            isOnline: chatSockets.length > 0
          }
        })
      )

      callback?.({ success: true, data: chatsWithOnlineStatus })
    } catch (error) {
      console.error('Error fetching chats:', error)
      callback?.({ success: false, error: 'Failed to fetch chats' })
    }
  })

  // Get changes handler
  socket.on('get-changes', async ({ sequence, userId }, callback) => {
    try {
      const changes = await ChangeModel.getChangesSince(sequence, userId)
      callback?.({ success: true, data: changes })
    } catch (error) {
      console.error('Error getting changes:', error)
      callback?.({ success: false, error: 'Failed to get changes' })
    }
  })

  // Get user info handler
  socket.on('get-user', async ({ userId }, callback) => {
    try {
      const user = await UserModel.findById(userId)
      if (!user) {
        return callback?.({ success: false, error: 'User not found' })
      }
      callback?.({ success: true, data: user })
    } catch (error) {
      console.error('Error getting user:', error)
      callback?.({ success: false, error: 'Failed to get user' })
    }
  })

  // Check user online status handler
  socket.on('check-online', async ({ userId }, callback) => {
    try {
      const sockets = await io.in(userId).fetchSockets()
      const isOnline = sockets.length > 0
      callback?.({ success: true, data: { userId, isOnline } })
    } catch (error) {
      console.error('Error checking online status:', error)
      callback?.({ success: false, error: 'Failed to check online status' })
    }
  })
}
