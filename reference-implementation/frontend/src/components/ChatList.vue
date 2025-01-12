<!-- ChatList.vue -->
<template>
  <div class="chat-list">
    <div
      v-for="chat in props.chats"
      :key="chat._id"
      class="chat-item"
      :class="{ active: selectedChat?._id === chat._id }"
      @click="selectChat(chat)"
    >
      <div class="name">
        {{ chat.displayName }}{{ chat.unreadCount > 0 ? ` (${chat.unreadCount})` : '' }}
        <div class="status-dot" :class="{ online: chat.isOnline }"></div>
        <span v-if="!chat.isOnline && chat.lastSeen" class="last-seen"
          >Last seen {{ formatLastSeen(chat.lastSeen) }}</span
        >
      </div>
      <div class="last-message">{{ chat.lastMessage?.content || '' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
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

const props = defineProps<{
  currentUserId: string
  selectedChat: {
    _id: string
    displayName: string
    isOnline?: boolean
    lastSeen?: Date | null
  } | null
  chats: Chat[]
}>()

const emit = defineEmits<{
  'select-chat': [
    chat: { _id: string; displayName: string; isOnline?: boolean; lastSeen?: Date | null },
  ]
}>()

function formatLastSeen(date: Date | string) {
  const now = new Date()
  const lastSeen = new Date(date)
  const diff = now.getTime() - lastSeen.getTime()

  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return lastSeen.toLocaleDateString()
}

function selectChat(chat: Chat) {
  emit('select-chat', {
    _id: chat._id,
    displayName: chat.displayName,
    isOnline: chat.isOnline,
    lastSeen: chat.lastSeen,
  })
}
</script>

<style scoped>
.chat-list {
  border: 1px solid #ccc;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.chat-item {
  padding: 10px;
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.chat-item:hover {
  background-color: #f8f9fa;
}

.chat-item.active {
  background-color: #e9ecef;
}

.chat-item .name {
  font-weight: 500;
  margin-bottom: 5px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.chat-item .last-message {
  font-size: 0.8em;
  color: #666;
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

.last-seen {
  font-size: 0.7em;
  color: #666;
  margin-left: auto;
}
</style>
