<!-- ChatInput.vue -->
<template>
  <form @submit.prevent="sendMessage" class="message-form">
    <input
      type="text"
      :value="messageInput"
      @input="handleInput"
      @blur="handleBlur"
      placeholder="Type a message..."
      required
      class="message-input"
    />
    <button type="submit" class="send-button">Send</button>
  </form>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: [message: string]
}>()

const store = useChatStore()
const messageInput = ref(props.modelValue)

watch(
  () => props.modelValue,
  (newValue) => {
    messageInput.value = newValue
  },
)

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', value)
  store.startTyping()
}

function handleBlur() {
  store.stopTyping()
}

function sendMessage() {
  const message = messageInput.value.trim()
  if (message) {
    emit('send', message)
    emit('update:modelValue', '')
    store.stopTyping()
  }
}
</script>

<style scoped>
.message-form {
  display: flex;
  gap: 10px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.message-input {
  flex-grow: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.send-button {
  padding: 8px 16px;
  background-color: #4fc3f7;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.send-button:hover {
  background-color: #3bb1e8;
}
</style>
