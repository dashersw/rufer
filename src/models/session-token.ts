import mongoose from 'mongoose'
import crypto from 'node:crypto'

export interface SessionTokenDocument extends mongoose.Document {
  _id: string // the token itself
  userId: string
  createdAt: Date
}

const sessionTokenSchema = new mongoose.Schema<SessionTokenDocument>(
  {
    _id: { type: String, default: () => crypto.randomBytes(32).toString('hex') },
    userId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 15 * 60 } // 15 minutes TTL
  },
  { _id: false } // Disable auto _id since we're using token as _id
)

export const SessionTokenModel = mongoose.model<SessionTokenDocument>('SessionToken', sessionTokenSchema)
