import mongoose, { Schema } from 'mongoose'
import type { Document, Model } from 'mongoose'

export interface ChangeDocument extends Document {
  type:
    | 'new-message'
    | 'message-delivered'
    | 'message-read'
    | 'user-online'
    | 'user-offline'
    | 'user-status'
    | 'message-sent'
  data: Record<string, unknown>
  sequence: number
  timestamp: Date
}

interface ChangeModel extends Model<ChangeDocument> {
  getChangesSince(sequence: number, userId?: string): Promise<ChangeDocument[]>
  getUserIdsChattedWith(userId: string, sequence: number): Promise<string[]>
}

const changeSchema = new Schema<ChangeDocument>(
  {
    type: {
      type: String,
      required: true,
      enum: ['message-sent', 'message-delivered', 'message-read', 'user-online', 'user-offline', 'user-status']
    },
    data: {
      type: Schema.Types.Mixed,
      required: true
    },
    sequence: {
      type: Number,
      unique: true
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  { timestamps: true }
)

// Add index on sequence for efficient querying
changeSchema.index({ sequence: 1 })

// Create a counter collection for sequence numbers
const counterSchema = new Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 }
})

const Counter = mongoose.model('Counter', counterSchema)

// Add middleware to auto-increment sequence
changeSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'changeSequence' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    )
    this.sequence = counter.seq
  }
  next()
})

// Add method to get changes after a sequence number
changeSchema.statics.getChangesSince = function (sequence: number, userId: string) {
  return this.find({
    sequence: { $gt: sequence },
    $or: [
      // Message sent to this user
      { 'data.messageData.recipient._id': userId },
      // Message sent by this user
      { 'data.messageData.sender._id': userId },
      // Message delivery/read status for messages sent by this user
      { type: { $in: ['message-delivered', 'message-read'] }, 'data.messageData.sender._id': userId }
      // User status changes for users this user has chatted with
      // { type: 'user-status', 'data.userId': { $in: userIds } }
    ]
  })
    .sort({ sequence: 1 })
    .exec()
}

export const ChangeModel = mongoose.model<ChangeDocument, ChangeModel>('Change', changeSchema)
