<template>
  <div class="chat-container">
    <div class="sidebar">
      <div class="current-user">
        {{ store.currentUser?.displayName || 'Loading...' }}
        <div v-if="isDebugMode" class="debug-info">ID: {{ store.currentUser?._id }}</div>
        <NewChatDialog />
      </div>
      <ChatList
        v-if="store.currentUser"
        :current-user-id="store.currentUser._id"
        :selected-chat="store.selectedChat"
        :chats="store.chats"
        @select-chat="handleSelectChat"
      />
    </div>
    <div class="chat">
      <div v-if="store.selectedChat" class="chat-header">
        <div class="user-info">
          {{ store.selectedChat.displayName }}
          <div v-if="isDebugMode" class="debug-info">ID: {{ store.selectedChat._id }}</div>
          <div class="status">
            <div class="status-dot" :class="{ online: store.selectedChat.isOnline }"></div>
            <span
              v-if="!store.selectedChat.isOnline && store.selectedChat.lastSeen"
              class="last-seen"
            >
              Last seen {{ formatLastSeen(store.selectedChat.lastSeen) }}
            </span>
            <span v-else-if="store.isTyping" class="typing">typing...</span>
          </div>
        </div>
      </div>
      <div v-else class="no-chat-selected">Select a chat to start messaging</div>
      <div v-if="store.selectedChat" class="messages" ref="messagesContainer">
        <ChatMessage
          v-for="message in store.messages"
          :key="message.messageId"
          :message-id="message.messageId"
          :content="message.content"
          :sender-name="
            message.sender._id === store.currentUser?._id ? 'You' : message.sender.displayName
          "
          :created-at="new Date(message.createdAt)"
          :type="
            message.sender._id === 'system'
              ? 'system'
              : message.sender._id === store.currentUser?._id
                ? 'sent'
                : 'received'
          "
          :delivered-at="message.deliveredAt ? new Date(message.deliveredAt) : null"
          :read-at="message.readAt ? new Date(message.readAt) : null"
        >
          <div v-if="isDebugMode && message.sender._id !== 'system'" class="debug-info">
            ID: {{ message.messageId }}
            <br />
            Sender: {{ message.sender._id }}
            <br />
            Recipient: {{ message.recipient._id }}
            <br />
            Status: {{ message.deliveredAt ? 'Delivered' : 'Not delivered' }}
            {{ message.readAt ? '| Read' : '| Not read' }}
            <br />
            {{
              message.deliveredAt
                ? `Delivered: ${new Date(message.deliveredAt).toLocaleString()}`
                : ''
            }}
            <br v-if="message.deliveredAt" />
            {{ message.readAt ? `Read: ${new Date(message.readAt).toLocaleString()}` : '' }}
          </div>
        </ChatMessage>
      </div>
      <ChatInput v-if="store.selectedChat" v-model="messageInput" @send="handleSendMessage" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import ChatList from '@/components/ChatList.vue'
import ChatMessage from '@/components/ChatMessage.vue'
import ChatInput from '@/components/ChatInput.vue'
import NewChatDialog from '@/components/NewChatDialog.vue'

const route = useRoute()
const router = useRouter()
const store = useChatStore()
const messagesContainer = ref<HTMLElement | null>(null)
const messageInput = ref('')

// Add debug mode computed property
const isDebugMode = computed(() => {
  const debug = route.query.debug
  return debug === 'true' || debug === '1'
})

// Get userId and chatId from URL query parameters
const userId = route.query.userId as string
const initialChatId = route.query.chatId as string

onMounted(async () => {
  if (!userId) {
    console.error('No userId provided')
    return
  }

  try {
    await store.initializeSocket(userId)
    await store.fetchCurrentUser(userId)

    if (!store.currentUser) {
      console.error('Failed to fetch current user')
      return
    }

    await store.loadChats(store.currentUser._id)

    // If there's an initial chat ID, select it
    if (initialChatId) {
      const chat = store.chats.find((c) => c._id === initialChatId)
      if (chat) {
        await handleSelectChat(chat)
      }
    }

    // Watch for tab visibility changes
    document.addEventListener('visibilitychange', store.handleVisibilityChange)
  } catch (error) {
    console.error('Error during initialization:', error)
  }
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', store.handleVisibilityChange)
})

// Watch selected chat changes to update URL
watch(
  () => store.selectedChat,
  async () => {
    if (store.selectedChat) {
      await router.replace({
        query: { ...route.query, chatId: store.selectedChat._id },
      })
    }
  },
)

// Scroll to bottom when new messages arrive
watch(
  () => store.messages,
  () => {
    if (messagesContainer.value) {
      setTimeout(() => {
        const container = messagesContainer.value
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      }, 0)
    }
  },
  { deep: true },
)

async function handleSelectChat(chat: { _id: string; displayName: string }) {
  await store.selectChat(chat)
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function handleSendMessage(message: string) {
  await store.sendMessage(message)
}

function formatLastSeen(date: Date | undefined): string {
  if (!date) return 'a while ago'

  const now = new Date()
  const lastSeen = new Date(date)
  const diff = now.getTime() - lastSeen.getTime()

  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}
</script>

<style scoped>
.chat-container {
  display: grid;
  grid-template-columns: minmax(250px, 300px) 1fr;
  height: 100vh;
  background-color: #fff;
}

.sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
}

.current-user {
  padding: 16px;
  font-weight: 500;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.chat-header {
  padding: 16px;
  font-weight: 500;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--light-gray);
  font-weight: normal;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #ccc;
}

.status-dot.online {
  background-color: #4caf50;
}

.no-chat-selected {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--light-gray);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.last-seen {
  font-size: 12px;
  color: var(--light-gray);
  font-weight: normal;
}

.debug-info {
  font-size: 10px;
  color: #666;
  font-family: monospace;
  margin-top: 4px;
  padding: 4px;
  background: #f5f5f5;
  border-radius: 4px;
}

.typing {
  font-size: 12px;
  color: var(--light-gray);
  font-weight: normal;
  font-style: italic;
  animation: ellipsis 1.4s infinite;
}

@keyframes ellipsis {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}
</style>
