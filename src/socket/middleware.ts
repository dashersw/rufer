import type { Socket } from 'socket.io'
import type { SessionTokenDocument } from '../models/session-token'
import { SessionTokenModel } from '../models/session-token'

export const validateSession = async (socket: Socket, next: (err?: Error) => void) => {
  try {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error('Session token required'))
    }

    // Try to find and delete the token in one atomic operation
    const session = await SessionTokenModel.findOneAndDelete({ _id: token }).lean()

    if (!session) {
      console.log('Invalid or expired session token')
      return next(new Error('Invalid or expired session token'))
    }

    // Store userId in socket data for future use
    socket.data.userId = (session as SessionTokenDocument)._id
    next()
  } catch (error) {
    next(error instanceof Error ? error : new Error('Session validation failed'))
  }
}
