import type { Server } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from '../types'
import { ChangeModel } from '../models/change'
import { MessageModel, type MessageDocument } from '../models/message'
import type { ChangeDocument } from '../models/change'
import type { ChangeStreamInsertDocument } from 'mongodb'

export function initializeChangeStream(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
) {
  const changeStream = ChangeModel.watch<ChangeDocument>()

  changeStream.on('change', async (change: ChangeStreamInsertDocument<ChangeDocument>) => {
    if (change.operationType !== 'insert') return

    const { type, data } = change.fullDocument

    if (type === 'message-sent') {
      const message = await MessageModel.findById<MessageDocument>(data.messageId).populate('sender recipient')
      if (!message) return

      const messageData = {
        messageId: message._id.toString(),
        content: message.content,
        sender: {
          _id: typeof message.sender === 'string' ? message.sender : message.sender._id.toString(),
          displayName: typeof message.sender === 'string' ? '' : message.sender.displayName
        },
        recipient: {
          _id: typeof message.recipient === 'string' ? message.recipient : message.recipient._id.toString(),
          displayName: typeof message.recipient === 'string' ? '' : message.recipient.displayName
        },
        createdAt: message.createdAt,
        deliveredAt: message.deliveredAt,
        readAt: message.readAt
      }

      // Emit to both sender's and recipient's rooms
      const recipientId = typeof message.recipient === 'string' ? message.recipient : message.recipient._id.toString()
      const senderId = typeof message.sender === 'string' ? message.sender : message.sender._id.toString()

      console.log('Emitting new-message to rooms:', recipientId, senderId)
      io.to(recipientId).to(senderId).emit('new-message', messageData)
      return
    }

    const message = await MessageModel.findById<MessageDocument>(data.messageId)
    if (!message) return

    const senderId = typeof message.sender === 'string' ? message.sender : message.sender._id?.toString()
    if (!senderId) return

    if (type === 'message-delivered') {
      io.to(senderId).emit('message-delivered', {
        messageId: message._id.toString(),
        deliveredAt: message.deliveredAt || new Date()
      })
    } else if (type === 'message-read') {
      const recipientId = typeof message.recipient === 'string' ? message.recipient : message.recipient._id?.toString()
      if (!recipientId) return

      io.to(senderId)
        .to(recipientId)
        .emit('message-read', {
          messageId: message._id.toString(),
          readAt: message.readAt || new Date()
        })
    }
  })

  return changeStream
}
