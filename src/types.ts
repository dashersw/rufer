import type { Socket as BaseSocket, Server as BaseServer } from 'socket.io'
import type { UserDocument } from './models/user'
import type { MessageDocument } from './models/message'

// Message type for responses
export interface MessageResponse {
  messageId: string
  sender: { _id: string; displayName: string }
  recipient: { _id: string; displayName: string }
  content: string
  createdAt: Date
  deliveredAt: Date | null
  readAt: Date | null
}

// Chat type for responses
export interface ChatResponse {
  _id: string
  displayName: string
  lastMessage: {
    content: string
    createdAt: Date
  }
  unreadCount: number
  isOnline: boolean
  lastSeen: Date | null
}

// Change type for responses
export interface ChangeResponse {
  type: string
  data: Record<string, unknown>
  timestamp: Date
  sequence: number
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: UserDocument
    }
  }
}

export interface MessageEvents {
  'new-message': (message: {
    messageId: string
    sender: { _id: string; displayName: string }
    recipient: { _id: string; displayName: string }
    content: string
    createdAt: Date
    deliveredAt: Date | null
    readAt: Date | null
  }) => void
  'message-delivered': (message: { messageId: string; deliveredAt: Date }) => void
  'message-read': (message: { messageId: string; readAt: Date }) => void
  'message-sent': (message: {
    messageId: string
    sender: { _id: string; displayName: string }
    recipient: { _id: string; displayName: string }
    content: string
    createdAt: Date
  }) => void
  'typing-start': (data: { userId: string; recipientId: string }) => void
  'typing-stop': (data: { userId: string; recipientId: string }) => void
}

export interface TwoWayUserEvents {
  'user-online': (userId: string) => void
  'user-offline': (userId: string) => void
  'user-status': (data: { userId: string; status: 'online' | 'offline'; lastSeen: Date | null }) => void
}

export interface ServerToClientUserEvents extends TwoWayUserEvents {}

export interface ClientToServerUserEvents extends TwoWayUserEvents {
  'request-user-status': (userId: string) => void
  'typing-start': (recipientId: string) => void
  'typing-stop': (recipientId: string) => void
}

export interface ClientToServerMessageEvents {
  'send-message': (
    message: {
      sender: { _id: string; displayName: string }
      recipient: { _id: string; displayName: string }
      content: string
    },
    callback?: (response: { success: boolean; message?: MessageResponse; error?: string }) => void
  ) => void
  'get-messages': (
    data: { userId: string; otherUserId: string },
    callback?: (response: { success: boolean; messages?: MessageResponse[]; error?: string }) => void
  ) => void
  'mark-message-read': (
    data: { messageId: string; userId: string },
    callback?: (response: { success: boolean; error?: string }) => void
  ) => void
  'get-chats': (
    data: { userId: string },
    callback?: (response: { success: boolean; chats?: ChatResponse[]; error?: string }) => void
  ) => void
  'get-changes': (
    data: { sequence: number; userId: string },
    callback?: (response: { success: boolean; changes?: ChangeResponse[]; error?: string }) => void
  ) => void
}

export interface ServerToClientEvents extends MessageEvents, ServerToClientUserEvents {}

export interface ClientToServerEvents extends ClientToServerUserEvents, ClientToServerMessageEvents {}

export interface InterServerEvents {
  ping: () => void
}

export interface SocketData {
  userId: string | undefined
}

export type Socket = BaseSocket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
export type Server = BaseServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
