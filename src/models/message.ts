import mongoose, { Schema } from 'mongoose'
import type { Document } from 'mongoose'
import { z } from 'zod'
import mongooseAutopopulate from 'mongoose-autopopulate'
import type { UserDocument } from './user'

export const MessageSchema = z.object({
  _id: z.string(),
  sender: z.string(),
  recipient: z.string(),
  content: z.string(),
  deliveredAt: z.date().nullable(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export type Message = z.infer<typeof MessageSchema>

export type MessageDocument = Omit<Message, '_id' | 'sender' | 'recipient'> &
  Omit<Document, '_id'> & { _id: string; sender: UserDocument; recipient: UserDocument }

const messageSchema = new Schema<MessageDocument>(
  {
    sender: { type: String, ref: 'User', required: true, autopopulate: { select: '_id displayName' } },
    recipient: { type: String, ref: 'User', required: true, autopopulate: { select: '_id displayName' } },
    content: { type: String, required: true },
    deliveredAt: { type: Date },
    readAt: { type: Date }
  },
  { timestamps: true }
)

messageSchema.plugin(mongooseAutopopulate)

export const MessageModel = mongoose.model<MessageDocument>('Message', messageSchema)
