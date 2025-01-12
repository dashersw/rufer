import mongoose from 'mongoose'

export interface UserDocument extends mongoose.Document {
  _id: string
  displayName: string
  lastSeen: Date | null
}

const userSchema = new mongoose.Schema<UserDocument>(
  {
    _id: { type: String, required: true },
    displayName: { type: String, required: true },
    lastSeen: { type: Date, default: null }
  },
  { timestamps: true }
)

export const UserModel = mongoose.model<UserDocument>('User', userSchema)
