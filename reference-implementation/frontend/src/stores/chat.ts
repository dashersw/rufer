import { defineStore } from 'pinia'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { io, type Socket } from 'socket.io-client'

// Reference backend for session tokens
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const referenceApi = axios.create({
  baseURL: BACKEND_URL,
})

type SocketData = Record<string, unknown>

interface Chat {
  _id: string
  displayName: string
  lastMessage?: {
    content: string
    createdAt: string
  }
  unreadCount: number
  isOnline?: boolean
  lastSeen?: Date | null
}

interface ChatUser {
  _id: string
  displayName: string
  isOnline?: boolean
  lastSeen?: Date | null
}

interface Message {
  messageId: string
  content: string
  sender: {
    _id: string
    displayName: string
  }
  recipient: {
    _id: string
    displayName: string
  }
  createdAt: string
  deliveredAt: Date | null
  readAt: Date | null
}

export const useChatStore = defineStore('chat', () => {
  const socket = ref<Socket | null>(null)
  const currentUser = ref<ChatUser | null>(null)
  const selectedChat = ref<ChatUser | null>(null)
  const rawChats = ref<Chat[]>([])
  const allMessages = ref<Message[]>([])
  const isDebugMode = computed(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const debug = urlParams.get('debug')
    return debug === 'true' || debug === '1'
  })
  const messages = computed(() => {
    if (!selectedChat.value) {
      return []
    }

    // For regular chats, show only chat messages (no system messages)
    return allMessages.value.filter(
      (msg) =>
        (msg.sender._id === selectedChat.value?._id ||
          msg.recipient._id === selectedChat.value?._id) &&
        (msg.sender._id !== 'system' || isDebugMode.value),
    )
  })
  const onlineUsers = ref(new Set<string>())
  const loadedChats = ref(new Set<string>())
  const isTabActive = ref(document.visibilityState === 'visible')
  const isWindowFocused = ref(document.hasFocus())
  const isActive = computed(() => isTabActive.value && isWindowFocused.value)
  const typingUsers = ref(new Map<string, NodeJS.Timeout>())

  // Socket API wrapper
  function socketRequest<T>(event: string, data: SocketData): Promise<T> {
    if (!socket.value) {
      return Promise.reject(new Error('Socket not initialized'))
    }

    return new Promise((resolve, reject) => {
      socket.value.emit(event, data, (response: { success: boolean; error?: string; data?: T }) => {
        if (!response.success) {
          reject(new Error(response.error || 'Unknown error'))
          return
        }
        // For responses that don't require data (like mark-message-read), resolve with response itself
        resolve(response.data ?? (response as unknown as T))
      })
    })
  }

  // Computed property to sort chats by last message date
  const chats = computed(() => {
    // Only filter out system chat if debug mode is off
    const filteredChats = isDebugMode.value
      ? [...rawChats.value]
      : [...rawChats.value].filter((chat) => chat._id !== 'system')

    return filteredChats.sort((a, b) => {
      if (!a.lastMessage) return 1
      if (!b.lastMessage) return -1
      return (
        new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
      )
    })
  })

  // Handle visibility change
  async function handleVisibilityChange() {
    isTabActive.value = document.visibilityState === 'visible'
    if (isActive.value && currentUser.value?._id) {
      console.log('Tab became visible and window is focused, refreshing data...')

      // Refresh current user
      await fetchCurrentUser(currentUser.value._id)

      // Re-emit online status first
      socket.value?.emit('user-online', currentUser.value._id)

      // Refresh chats list
      await loadChats(currentUser.value._id)

      // Clear loaded chats to force reload all messages
      loadedChats.value.clear()

      // Load messages for all chats to check for undelivered ones
      for (const chat of rawChats.value) {
        await loadMessages(currentUser.value._id, chat._id)
      }

      // Request status updates for all chats
      for (const chat of rawChats.value) {
        socket.value?.emit('request-user-status', chat._id)
      }

      // Check and mark messages as read for current chat
      checkAndMarkAsRead()
    } else {
      console.log('handleVisibilityChange inactive isActive.value', isActive.value)
    }
  }

  // Handle window focus change
  async function handleFocusChange() {
    isWindowFocused.value = document.hasFocus()
    // Call handleVisibilityChange to handle the state change
    await handleVisibilityChange()
  }

  // Check and mark messages as read
  async function checkAndMarkAsRead() {
    if (!isActive.value || !currentUser.value || !selectedChat.value) {
      return
    }

    if (isActive.value) {
      console.log('checkAndMarkAsRead isActive.value', isActive.value)
    }

    console.log('checkAndMarkAsRead', currentUser.value, selectedChat.value)

    // Find unread messages where we are the recipient
    const unreadMessages = messages.value.filter(
      (msg) =>
        msg.recipient._id === currentUser.value?._id &&
        msg.sender._id === selectedChat.value?._id &&
        !msg.readAt,
    )

    if (unreadMessages.length === 0) return

    // Update messages in current view immediately
    for (const msg of unreadMessages) {
      const now = new Date()
      const messageIndex = allMessages.value.findIndex((m) => m.messageId === msg.messageId)
      if (messageIndex !== -1) {
        const updatedMessage = { ...allMessages.value[messageIndex], readAt: now }
        allMessages.value = [
          ...allMessages.value.slice(0, messageIndex),
          updatedMessage,
          ...allMessages.value.slice(messageIndex + 1),
        ]
        // Update chat list immediately
        updateChatWithMessage(selectedChat.value._id, updatedMessage, 'read')
      }
    }

    // Then send socket requests
    await Promise.all(
      unreadMessages.map((msg) =>
        socketRequest<{ success: true }>('mark-message-read', {
          messageId: msg.messageId,
          userId: currentUser.value!._id,
        }),
      ),
    )
  }

  async function selectChat(chat: ChatUser) {
    selectedChat.value = chat
    if (currentUser.value) {
      await loadMessages(currentUser.value._id, chat._id)
      checkAndMarkAsRead()
    }
  }

  async function loadMessages(userId: string, otherUserId: string) {
    try {
      // If we've already loaded this chat's messages, just show them
      if (loadedChats.value.has(otherUserId)) {
        return
      }

      console.log('Fetching messages for chat:', otherUserId)

      const data = await socketRequest<Message[]>('get-messages', { userId, otherUserId })
      const newMessages = data.map((msg: any) => ({
        messageId: msg._id,
        content: msg.content,
        sender: {
          _id: typeof msg.sender === 'string' ? msg.sender : msg.sender._id,
          displayName: typeof msg.sender === 'string' ? '' : msg.sender.displayName,
        },
        recipient: {
          _id: typeof msg.recipient === 'string' ? msg.recipient : msg.recipient._id,
          displayName: typeof msg.recipient === 'string' ? '' : msg.recipient.displayName,
        },
        createdAt: msg.createdAt,
        deliveredAt: msg.deliveredAt ? new Date(msg.deliveredAt) : null,
        readAt: msg.readAt ? new Date(msg.readAt) : null,
      }))

      // Keep system messages and remove only messages between these users
      const systemMessages = allMessages.value.filter((msg) => msg.sender._id === 'system')
      const otherMessages = allMessages.value.filter(
        (msg) =>
          !(
            (msg.sender._id === userId && msg.recipient._id === otherUserId) ||
            (msg.sender._id === otherUserId && msg.recipient._id === userId)
          ) && msg.sender._id !== 'system',
      )

      // Add new messages
      allMessages.value = [...systemMessages, ...otherMessages, ...newMessages]

      // Mark this chat as loaded
      loadedChats.value.add(otherUserId)

      // Check for unread messages immediately
      checkAndMarkAsRead()
    } catch (error) {
      console.error('Error loading messages:', error)
    }
  }

  async function fetchCurrentUser(userId: string) {
    try {
      const user = await socketRequest<ChatUser>('get-user', { userId })
      currentUser.value = user
    } catch (error) {
      console.error('Error fetching current user:', error)
      throw error
    }
  }

  async function loadChats(userId: string) {
    try {
      const chats = await socketRequest<Chat[]>('get-chats', { userId })

      // Preserve system chat if it exists
      const systemChat = rawChats.value.find((chat) => chat._id === 'system')
      rawChats.value = systemChat ? [systemChat, ...chats] : chats

      if (chats.length > 0 && !selectedChat.value) {
        selectedChat.value = {
          _id: chats[0]._id,
          displayName: chats[0].displayName,
        }
        await loadMessages(userId, chats[0]._id)
      }
    } catch (error) {
      console.error('Error loading chats:', error)
    }
  }

  async function sendMessage(content: string) {
    if (!currentUser.value || !selectedChat.value) return

    // Stop typing indicator immediately when sending message
    stopTyping()

    try {
      // Create message object
      const tempId = `temp-${Date.now()}`
      const optimisticMessage: Message = {
        messageId: tempId,
        content,
        sender: {
          _id: currentUser.value._id,
          displayName: currentUser.value.displayName,
        },
        recipient: {
          _id: selectedChat.value._id,
          displayName: selectedChat.value.displayName,
        },
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
      }

      // Add message to allMessages immediately
      allMessages.value = [...allMessages.value, optimisticMessage]

      // Update chat list immediately
      updateChatWithMessage(selectedChat.value._id, optimisticMessage)

      // Send to server
      const message = await socketRequest<Message>('send-message', {
        content,
        sender: {
          _id: currentUser.value._id,
          displayName: currentUser.value.displayName,
        },
        recipient: {
          _id: selectedChat.value._id,
          displayName: selectedChat.value.displayName,
        },
      })

      // Replace optimistic message with real one
      const messageIndex = allMessages.value.findIndex((m) => m.messageId === tempId)
      if (messageIndex !== -1) {
        allMessages.value = [
          ...allMessages.value.slice(0, messageIndex),
          message,
          ...allMessages.value.slice(messageIndex + 1),
        ]
      }
    } catch (error) {
      console.error('Error sending message:', error)
      // Remove optimistic message on error
      allMessages.value = allMessages.value.filter((m) => !m.messageId.startsWith('temp-'))
    }
  }

  // Update chat with new message or status change
  function updateChatWithMessage(chatId: string, message: Message, type: 'new' | 'read' = 'new') {
    console.log('updateChatWithMessage', chatId, message, type)
    const chatIndex = rawChats.value.findIndex((chat) => chat._id === chatId)
    if (chatIndex !== -1) {
      const updatedChat = {
        ...rawChats.value[chatIndex],
        lastMessage:
          type === 'new'
            ? {
                content: message.content,
                createdAt: message.createdAt,
              }
            : rawChats.value[chatIndex].lastMessage,
        unreadCount:
          type === 'new'
            ? message.recipient._id === currentUser.value?._id &&
              (!selectedChat.value || selectedChat.value._id !== chatId || !isActive.value)
              ? (rawChats.value[chatIndex].unreadCount || 0) + 1
              : rawChats.value[chatIndex].unreadCount
            : 0, // Reset to 0 when marking as read
      }

      // Find and update existing message if it exists
      const existingMessageIndex = allMessages.value.findIndex(
        (m) =>
          m.messageId === message.messageId ||
          (m.sender._id === message.sender._id &&
            m.recipient._id === message.recipient._id &&
            m.content === message.content),
      )

      if (existingMessageIndex !== -1) {
        // Update existing message
        const updatedMessage = {
          ...allMessages.value[existingMessageIndex],
          readAt: type === 'read' ? message.readAt : allMessages.value[existingMessageIndex].readAt,
          deliveredAt: message.deliveredAt || allMessages.value[existingMessageIndex].deliveredAt,
        }
        allMessages.value = [
          ...allMessages.value.slice(0, existingMessageIndex),
          updatedMessage,
          ...allMessages.value.slice(existingMessageIndex + 1),
        ]
      } else if (type === 'new') {
        // Only add new message if it doesn't exist and type is 'new'
        allMessages.value = [...allMessages.value, message]
      }

      rawChats.value = [
        ...rawChats.value.slice(0, chatIndex),
        updatedChat,
        ...rawChats.value.slice(chatIndex + 1),
      ]
    }
  }

  // Get session token from reference backend
  async function getSessionToken(userId: string): Promise<string> {
    const response = await referenceApi.post('/session-token', { userId })
    return response.data.token
  }

  async function initializeSocket(userId: string) {
    try {
      // Clean up existing socket if any
      if (socket.value) {
        socket.value.removeAllListeners()
        socket.value.disconnect()
      }

      // Get session token first
      const token = await getSessionToken(userId)

      // Initialize socket with token
      socket.value = io('http://localhost:3000', {
        auth: {
          token,
        },
      })

      // Add system message about socket initialization
      const initMessage: Message = {
        messageId: `system-${Date.now()}`,
        content: `Initializing socket connection...`,
        sender: { _id: 'system', displayName: 'System' },
        recipient: { _id: 'system', displayName: 'System' },
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
      }
      allMessages.value = [...allMessages.value, initMessage]

      // Set up visibility change listener
      document.addEventListener('visibilitychange', handleVisibilityChange)

      // Create system chat if it doesn't exist
      const systemChat: Chat = {
        _id: 'system',
        displayName: 'System',
        unreadCount: 0,
        isOnline: true,
        lastSeen: null,
      }
      if (!rawChats.value.some((chat) => chat._id === 'system')) {
        rawChats.value = [systemChat, ...rawChats.value]
      }

      socket.value.on('connect', () => {
        console.log('Socket connected, emitting user-online event')
        socket.value?.emit('user-online', userId)

        // Add system message about connection
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `[DEBUG] Socket connected | User: ${userId} | Socket: ${socket.value?.id}`
            : `Socket connected | User: ${userId} | Socket: ${socket.value?.id}`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]

        // Clear loaded chats to force reload all messages
        loadedChats.value.clear()

        // Add system message about clearing loaded chats
        const clearCacheMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? 'Cleared loaded chats cache to force refresh'
            : 'Cleared loaded chats cache to force refresh',
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, clearCacheMessage]

        // Load messages for all chats to check for undelivered ones
        if (currentUser.value?._id) {
          // First refresh chats list
          loadChats(currentUser.value._id)
            .then(() => {
              const systemMessage: Message = {
                messageId: `system-${Date.now()}`,
                content: isDebugMode.value
                  ? `Refreshed chat list, found ${rawChats.value.length - 1} chats. Loading messages...`
                  : `Refreshed chat list, found ${rawChats.value.length - 1} chats. Loading messages...`, // -1 for system chat
                sender: { _id: 'system', displayName: 'System' },
                recipient: { _id: 'system', displayName: 'System' },
                createdAt: new Date().toISOString(),
                deliveredAt: null,
                readAt: null,
              }
              allMessages.value = [...allMessages.value, systemMessage]

              // Then load messages for each chat
              for (const chat of rawChats.value) {
                if (chat._id === 'system') continue // Skip system chat

                // Add system message about loading messages for this chat
                const loadingMessage: Message = {
                  messageId: `system-${Date.now()}`,
                  content: isDebugMode.value
                    ? `Loading messages for chat with ${chat.displayName}...`
                    : `Loading messages for chat with ${chat.displayName}...`,
                  sender: { _id: 'system', displayName: 'System' },
                  recipient: { _id: 'system', displayName: 'System' },
                  createdAt: new Date().toISOString(),
                  deliveredAt: null,
                  readAt: null,
                }
                allMessages.value = [...allMessages.value, loadingMessage]

                loadMessages(currentUser.value._id, chat._id)
                  .then(() => {
                    // Add success message
                    const successMessage: Message = {
                      messageId: `system-${Date.now()}`,
                      content: isDebugMode.value
                        ? `Successfully loaded messages for chat with ${chat.displayName}`
                        : `Successfully loaded messages for chat with ${chat.displayName}`,
                      sender: { _id: 'system', displayName: 'System' },
                      recipient: { _id: 'system', displayName: 'System' },
                      createdAt: new Date().toISOString(),
                      deliveredAt: null,
                      readAt: null,
                    }
                    allMessages.value = [...allMessages.value, successMessage]
                  })
                  .catch((error) => {
                    const errorMessage: Message = {
                      messageId: `system-${Date.now()}`,
                      content: isDebugMode.value
                        ? `Error loading messages for ${chat.displayName}: ${error.message}`
                        : `Error loading messages for ${chat.displayName}: ${error.message}`,
                      sender: { _id: 'system', displayName: 'System' },
                      recipient: { _id: 'system', displayName: 'System' },
                      createdAt: new Date().toISOString(),
                      deliveredAt: null,
                      readAt: null,
                    }
                    allMessages.value = [...allMessages.value, errorMessage]
                  })
              }
            })
            .catch((error) => {
              const errorMessage: Message = {
                messageId: `system-${Date.now()}`,
                content: isDebugMode.value
                  ? `Error refreshing chats: ${error.message}`
                  : `Error refreshing chats: ${error.message}`,
                sender: { _id: 'system', displayName: 'System' },
                recipient: { _id: 'system', displayName: 'System' },
                createdAt: new Date().toISOString(),
                deliveredAt: null,
                readAt: null,
              }
              allMessages.value = [...allMessages.value, errorMessage]
            })
        } else {
          const systemMessage: Message = {
            messageId: `system-${Date.now()}`,
            content: isDebugMode.value
              ? 'No current user found, skipping message refresh'
              : 'No current user found, skipping message refresh',
            sender: { _id: 'system', displayName: 'System' },
            recipient: { _id: 'system', displayName: 'System' },
            createdAt: new Date().toISOString(),
            deliveredAt: null,
            readAt: null,
          }
          allMessages.value = [...allMessages.value, systemMessage]
        }
      })

      socket.value.on('connect_error', (error) => {
        console.error('Socket connection error:', error)
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `Connection error: ${error.message}`
            : `Connection error: ${error.message}`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]
      })

      // Add retry function with exponential backoff
      async function retryWithBackoff(
        fn: () => Promise<string>,
        maxAttempts = 5,
        baseDelay = 1000,
      ): Promise<string> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            return await fn()
          } catch (error) {
            if (attempt === maxAttempts) throw error

            const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 30000) // Cap at 30 seconds
            const jitter = Math.random() * 1000 // Add random jitter up to 1 second

            const systemMessage: Message = {
              messageId: `system-${Date.now()}`,
              content: `Attempt ${attempt} failed. Retrying in ${Math.round((delay + jitter) / 1000)} seconds...`,
              sender: { _id: 'system', displayName: 'System' },
              recipient: { _id: 'system', displayName: 'System' },
              createdAt: new Date().toISOString(),
              deliveredAt: null,
              readAt: null,
            }
            allMessages.value = [...allMessages.value, systemMessage]

            await new Promise((resolve) => setTimeout(resolve, delay + jitter))
          }
        }
        throw new Error('Should not reach here')
      }

      socket.value.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason)
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `Disconnected from server. Reason: ${reason}`
            : `Disconnected from server. Reason: ${reason}`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]

        // Get new session token and reconnect if the disconnect wasn't intentional
        if (reason !== 'io client disconnect' && currentUser.value?._id) {
          const reconnectMessage: Message = {
            messageId: `system-${Date.now()}`,
            content: 'Getting new session token and attempting to reconnect...',
            sender: { _id: 'system', displayName: 'System' },
            recipient: { _id: 'system', displayName: 'System' },
            createdAt: new Date().toISOString(),
            deliveredAt: null,
            readAt: null,
          }
          allMessages.value = [...allMessages.value, reconnectMessage]

          // Get new token with retry and reconnect
          const userId = currentUser.value._id
          retryWithBackoff(() => getSessionToken(userId))
            .then((token) => {
              if (socket.value) {
                socket.value.auth = { token }
                socket.value.connect()
              }
            })
            .catch((error) => {
              const errorMessage: Message = {
                messageId: `system-${Date.now()}`,
                content: `Failed to get new session token after multiple attempts: ${error.message}`,
                sender: { _id: 'system', displayName: 'System' },
                recipient: { _id: 'system', displayName: 'System' },
                createdAt: new Date().toISOString(),
                deliveredAt: null,
                readAt: null,
              }
              allMessages.value = [...allMessages.value, errorMessage]
            })
        }
      })

      socket.value.on('user-online', (userId: string) => {
        console.log('User online:', userId)
        onlineUsers.value.add(userId)

        // Add system message if it's the current user or someone we're chatting with
        if (
          currentUser.value?._id === userId ||
          rawChats.value.some((chat) => chat._id === userId)
        ) {
          const systemMessage: Message = {
            messageId: `system-${Date.now()}`,
            content: 'You are now online. Checking for undelivered messages...',
            sender: { _id: 'system', displayName: 'System' },
            recipient: { _id: 'system', displayName: 'System' },
            createdAt: new Date().toISOString(),
            deliveredAt: null,
            readAt: null,
          }
          allMessages.value = [...allMessages.value, systemMessage]
        }
      })

      socket.value.on('user-offline', (userId: string) => {
        console.log('User offline:', userId)
        onlineUsers.value.delete(userId)

        // Add system message if it's someone we're chatting with
        const otherUser = rawChats.value.find((chat) => chat._id === userId)
        if (otherUser) {
          const systemMessage: Message = {
            messageId: `system-${Date.now()}`,
            content: `${otherUser.displayName} went offline`,
            sender: { _id: 'system', displayName: 'System' },
            recipient: { _id: 'system', displayName: 'System' },
            createdAt: new Date().toISOString(),
            deliveredAt: null,
            readAt: null,
          }
          allMessages.value = [...allMessages.value, systemMessage]
        }
      })

      socket.value.on('new-message', async (message: Message) => {
        console.log('New message received:', message)

        if (!currentUser.value?._id) return

        // Add system message about receiving a new message
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `[DEBUG] Message received | ID: ${message.messageId} | From: ${message.sender._id} | To: ${message.recipient._id}`
            : `New message from ${message.sender.displayName}`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]

        // Skip if this is our own message (we already have it)
        if (message.sender._id === currentUser.value._id) {
          return
        }

        // If we're the recipient, the message is delivered since we're receiving it
        if (message.recipient._id === currentUser.value._id) {
          message.deliveredAt = new Date()
          // If we're in the chat with the sender and both tab is active and window is focused, mark as read immediately
          if (selectedChat.value?._id === message.sender._id && isActive.value) {
            console.log('marking message as read', isActive.value)
            message.readAt = new Date()
            try {
              await socketRequest('mark-message-read', {
                messageId: message.messageId,
                userId: currentUser.value._id,
              })
            } catch (error) {
              console.error('Error marking message as read:', error)
            }
          }
        }

        // Update chat list
        const chatId =
          message.sender._id === currentUser.value._id ? message.recipient._id : message.sender._id
        const chatExists = rawChats.value.some((chat) => chat._id === chatId)

        if (!chatExists) {
          // Create new chat entry for unknown sender
          const otherUser =
            message.sender._id === currentUser.value._id ? message.recipient : message.sender

          const newChat: Chat = {
            _id: otherUser._id,
            displayName: otherUser.displayName,
            lastMessage: {
              content: message.content,
              createdAt: message.createdAt,
            },
            unreadCount: message.recipient._id === currentUser.value._id ? 1 : 0,
            isOnline: true,
            lastSeen: null,
          }
          rawChats.value = [...rawChats.value, newChat]
        }

        // Update the chat with the message
        if (message.sender._id !== currentUser.value._id) {
          updateChatWithMessage(chatId, message)
        }
      })

      socket.value.on('message-delivered', ({ messageId, deliveredAt }) => {
        console.log('Message delivered:', messageId, 'at', deliveredAt)

        // Add system message about delivery status
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `[DEBUG] Message delivered | ID: ${messageId} | Time: ${new Date(deliveredAt).toISOString()}`
            : `Message delivered at ${new Date(deliveredAt).toLocaleTimeString()}`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]

        // Find and update message in allMessages
        const messageIndex = allMessages.value.findIndex((m) => m.messageId === messageId)
        if (messageIndex !== -1) {
          const message = allMessages.value[messageIndex]
          const updatedMessage = {
            ...message,
            deliveredAt: new Date(deliveredAt),
          }
          allMessages.value = [
            ...allMessages.value.slice(0, messageIndex),
            updatedMessage,
            ...allMessages.value.slice(messageIndex + 1),
          ]

          // Add system message
          const systemMessage: Message = {
            messageId: `system-${Date.now()}`,
            content: isDebugMode.value
              ? `Message "${message.content.substring(0, 20)}${message.content.length > 20 ? '...' : ''}" was delivered`
              : `Message "${message.content.substring(0, 20)}${message.content.length > 20 ? '...' : ''}" was delivered`,
            sender: { _id: 'system', displayName: 'System' },
            recipient: { _id: 'system', displayName: 'System' },
            createdAt: new Date().toISOString(),
            deliveredAt: null,
            readAt: null,
          }
          allMessages.value = [...allMessages.value, systemMessage]
        }
      })

      socket.value.on('message-read', ({ messageId, readAt }) => {
        console.log('Message read:', messageId, 'at', readAt)

        // Add system message about read status
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `[DEBUG] Message read | ID: ${messageId} | Time: ${new Date(readAt).toISOString()}`
            : `Message read at ${new Date(readAt).toLocaleTimeString()}`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]

        // Find and update message in allMessages
        const messageIndex = allMessages.value.findIndex((m) => m.messageId === messageId)
        if (messageIndex !== -1) {
          const message = allMessages.value[messageIndex]
          const updatedMessage = {
            ...message,
            readAt: new Date(readAt),
          }
          allMessages.value = [
            ...allMessages.value.slice(0, messageIndex),
            updatedMessage,
            ...allMessages.value.slice(messageIndex + 1),
          ]

          // Add system message
          const systemMessage: Message = {
            messageId: `system-${Date.now()}`,
            content: isDebugMode.value
              ? `Message "${message.content.substring(0, 20)}${message.content.length > 20 ? '...' : ''}" was read`
              : `Message "${message.content.substring(0, 20)}${message.content.length > 20 ? '...' : ''}" was read`,
            sender: { _id: 'system', displayName: 'System' },
            recipient: { _id: 'system', displayName: 'System' },
            createdAt: new Date().toISOString(),
            deliveredAt: null,
            readAt: null,
          }
          allMessages.value = [...allMessages.value, systemMessage]

          // Update unread count in chat list
          const senderId = updatedMessage.sender._id
          const chatIndex = rawChats.value.findIndex((chat) => chat._id === senderId)
          if (chatIndex !== -1) {
            const updatedChat = {
              ...rawChats.value[chatIndex],
              unreadCount: Math.max(0, (rawChats.value[chatIndex].unreadCount || 0) - 1),
            }
            rawChats.value = [
              ...rawChats.value.slice(0, chatIndex),
              updatedChat,
              ...rawChats.value.slice(chatIndex + 1),
            ]
          }
        }
      })

      socket.value.on('user-status', ({ userId, status, lastSeen }) => {
        console.log('User status update:', { userId, status, lastSeen })

        const getStatusMessage = () => {
          if (isDebugMode.value) {
            return `[DEBUG] User status | ID: ${userId} | Status: ${status} | LastSeen: ${lastSeen ? new Date(lastSeen).toISOString() : 'N/A'}`
          }
          if (status === 'online') {
            return `User ${userId} is now online`
          }
          return `User was last seen at ${lastSeen ? new Date(lastSeen).toLocaleTimeString() : 'N/A'}`
        }

        // Add system message about user status
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: getStatusMessage(),
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]

        // Update selected chat if it's the user whose status changed
        if (selectedChat.value && selectedChat.value._id === userId) {
          selectedChat.value = {
            ...selectedChat.value,
            isOnline: status === 'online',
            lastSeen: status === 'online' ? null : lastSeen,
          }
        }

        // Update chat in rawChats if it exists
        const chatIndex = rawChats.value.findIndex((chat) => chat._id === userId)
        if (chatIndex !== -1) {
          const updatedChat = {
            ...rawChats.value[chatIndex],
            isOnline: status === 'online',
            lastSeen: status === 'online' ? null : lastSeen,
          }
          rawChats.value = [
            ...rawChats.value.slice(0, chatIndex),
            updatedChat,
            ...rawChats.value.slice(chatIndex + 1),
          ]
        }
      })

      socket.value.on('reconnect_attempt', (attempt) => {
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `Attempting to reconnect (attempt ${attempt})...`
            : `Attempting to reconnect (attempt ${attempt})...`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]
      })

      socket.value.on('reconnecting', (attempt) => {
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `Reconnecting (attempt ${attempt})...`
            : `Reconnecting (attempt ${attempt})...`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]
      })

      socket.value.on('reconnect', (attempt) => {
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `Reconnected after ${attempt} attempts`
            : `Reconnected after ${attempt} attempts`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]
      })

      socket.value.on('reconnect_error', (error) => {
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `Reconnection error: ${error.message}`
            : `Reconnection error: ${error.message}`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]
      })

      socket.value.on('reconnect_failed', () => {
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? 'Failed to reconnect after all attempts'
            : 'Failed to reconnect after all attempts',
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]
      })

      socket.value.on('ping', () => {
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value ? 'Ping sent to server' : 'Ping sent to server',
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]
      })

      socket.value.on('pong', (latency) => {
        const systemMessage: Message = {
          messageId: `system-${Date.now()}`,
          content: isDebugMode.value
            ? `Pong received from server (latency: ${latency}ms)`
            : `Pong received from server (latency: ${latency}ms)`,
          sender: { _id: 'system', displayName: 'System' },
          recipient: { _id: 'system', displayName: 'System' },
          createdAt: new Date().toISOString(),
          deliveredAt: null,
          readAt: null,
        }
        allMessages.value = [...allMessages.value, systemMessage]
      })

      socket.value.on('typing-start', ({ userId, recipientId }) => {
        console.log('User typing:', userId, 'to', recipientId)

        // Clear existing timeout if any
        const existingTimeout = typingUsers.value.get(userId)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        // Set new timeout to automatically clear typing status after 3 seconds
        const timeout = setTimeout(() => {
          typingUsers.value.delete(userId)
        }, 3000)

        typingUsers.value.set(userId, timeout)
      })

      socket.value.on('typing-stop', ({ userId }) => {
        console.log('User stopped typing:', userId)

        // Clear timeout and remove user from typing list
        const existingTimeout = typingUsers.value.get(userId)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }
        typingUsers.value.delete(userId)
      })
    } catch (error) {
      console.error('Error initializing socket:', error)
      throw error
    }
  }

  async function startNewChat(userId: string) {
    try {
      // First, get the user info
      const user = await socketRequest<User>('get-user', { userId })

      // Check if chat already exists
      const existingChat = rawChats.value.find((chat) => chat._id === userId)
      if (existingChat) {
        selectedChat.value = {
          _id: existingChat._id,
          displayName: existingChat.displayName,
          isOnline: existingChat.isOnline,
          lastSeen: existingChat.lastSeen,
        }
        if (currentUser.value?._id) {
          await loadMessages(currentUser.value._id, userId)
        }
        return
      }

      // Create new chat entry
      const newChat: Chat = {
        _id: user._id,
        displayName: user.displayName,
        unreadCount: 0,
        isOnline: true,
        lastSeen: null,
      }

      // Add to chats list
      rawChats.value = [...rawChats.value, newChat]

      // Select the new chat
      selectedChat.value = {
        _id: user._id,
        displayName: user.displayName,
        isOnline: true,
        lastSeen: null,
      }

      // Request ongoing status updates
      socket.value?.emit('request-user-status', userId)

      return newChat
    } catch (error) {
      console.error('Error starting new chat:', error)
      throw new Error('User not found')
    }
  }

  // Add typing indicator functions
  function startTyping() {
    if (!socket.value || !currentUser.value || !selectedChat.value) return
    socket.value.emit('typing-start', selectedChat.value._id)
  }

  function stopTyping() {
    if (!socket.value || !currentUser.value || !selectedChat.value) return
    socket.value.emit('typing-stop', selectedChat.value._id)
  }

  // Add debounced version of startTyping
  const debouncedStartTyping = debounce(startTyping, 300)

  // Add isTyping computed property
  const isTyping = computed(() => {
    if (!selectedChat.value) return false
    return typingUsers.value.has(selectedChat.value._id)
  })

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocusChange)
    window.addEventListener('blur', handleFocusChange)
    handleVisibilityChange() // Initial check
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('focus', handleFocusChange)
    window.removeEventListener('blur', handleFocusChange)
  })

  return {
    currentUser,
    selectedChat,
    chats,
    messages,
    onlineUsers,
    isDebugMode,
    isTyping,
    fetchCurrentUser,
    loadChats,
    selectChat,
    sendMessage,
    initializeSocket,
    startNewChat,
    handleVisibilityChange,
    startTyping: debouncedStartTyping,
    stopTyping,
  }
})

// Add debounce utility function
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timeoutId: NodeJS.Timeout | null = null
  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  } as T
}
