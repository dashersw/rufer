<!-- ChatMessage.vue -->
<template>
  <div class="message" :class="props.type">
    <div v-if="props.type === 'system'" class="system-message">
      {{ props.content }}
      <div class="timestamp">{{ formatDate(props.createdAt) }}</div>
    </div>
    <div v-else>
      <div class="sender">{{ props.senderName }}</div>
      <div class="content">{{ props.content }}</div>
      <div class="timestamp">
        {{ formatDate(props.createdAt) }}
        <span v-if="props.type === 'sent'" class="ticks" :class="{ read: props.readAt }">
          {{ props.deliveredAt ? '✓✓' : '✓' }}
        </span>
      </div>
      <slot v-if="props.type === 'sent' || props.type === 'received'"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  messageId: string
  content: string
  senderName: string
  createdAt: Date
  type: 'sent' | 'received' | 'system'
  deliveredAt?: Date | null
  readAt?: Date | null
}>()

function formatDate(date: Date) {
  return date.toLocaleTimeString()
}
</script>

<style scoped>
.message {
  margin: 10px;
  padding: 10px;
  border-radius: 8px;
  max-width: 70%;
}

.sent {
  margin-left: auto;
  background-color: #dcf8c6;
}

.received {
  margin-right: auto;
  background-color: #fff;
}

.system {
  margin: 10px auto;
  max-width: 90%;
  text-align: center;
}

.system-message {
  color: #666;
  font-style: italic;
  font-size: 0.9em;
}

.sender {
  font-weight: bold;
  margin-bottom: 5px;
}

.timestamp {
  font-size: 0.8em;
  color: #666;
  text-align: right;
  margin-top: 5px;
}

.ticks {
  margin-left: 5px;
  color: #888;
}

.ticks.delivered {
  color: #4fc3f7;
}

.ticks.read {
  color: #4caf50;
}
</style>
