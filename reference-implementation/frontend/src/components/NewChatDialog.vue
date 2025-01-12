<template>
  <div class="new-chat-dialog">
    <button @click="showDialog = true" class="new-chat-button">New Chat</button>

    <div v-if="showDialog" class="dialog-overlay">
      <div class="dialog">
        <h2>Start New Chat</h2>
        <input v-model="userId" type="text" placeholder="Enter user ID" @keyup.enter="startChat" />
        <div class="error" v-if="error">{{ error }}</div>
        <div class="buttons">
          <button @click="showDialog = false">Cancel</button>
          <button @click="startChat" :disabled="!userId">Start Chat</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '../stores/chat'

const chatStore = useChatStore()
const showDialog = ref(false)
const userId = ref('')
const error = ref('')

async function startChat() {
  if (!userId.value) return

  try {
    error.value = ''
    await chatStore.startNewChat(userId.value)
    showDialog.value = false
    userId.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to start chat'
  }
}
</script>

<style scoped>
.new-chat-button {
  padding: 8px 16px;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.new-chat-button:hover {
  background-color: #45a049;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  min-width: 300px;
}

.dialog h2 {
  margin-top: 0;
  margin-bottom: 16px;
}

.dialog input {
  width: 100%;
  padding: 8px;
  margin-bottom: 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.error {
  color: red;
  margin-bottom: 16px;
  font-size: 14px;
}

.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.buttons button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.buttons button:first-child {
  background-color: #f5f5f5;
}

.buttons button:last-child {
  background-color: #4caf50;
  color: white;
}

.buttons button:last-child:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.debug-info {
  display: none;
}
</style>
