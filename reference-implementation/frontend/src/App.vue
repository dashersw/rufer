<template>
  <div class="app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
// No setup needed at root level
</script>

<style>
.app {
  height: 100vh;
  width: 100vw;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
    'Open Sans', 'Helvetica Neue', sans-serif;
}

/* Reset default styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Global styles for chat application */
:root {
  --primary-color: #4fc3f7;
  --secondary-color: #e3f2fd;
  --text-color: #333;
  --light-gray: #999;
  --border-color: #ddd;
  --online-color: #4caf50;
  --sent-message-bg: #e3f2fd;
  --received-message-bg: #fff;
}

body {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-color);
  background-color: #f5f5f5;
}

/* Message status ticks */
.ticks {
  display: inline-block;
  margin-left: 4px;
  color: var(--light-gray);
}

.ticks.delivered {
  color: var(--light-gray);
}

.ticks.read {
  color: var(--primary-color);
}

/* Status dot */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--light-gray);
  display: inline-block;
  margin-left: 4px;
}

.status-dot.online {
  background-color: var(--online-color);
}

/* Debug info */
.debug-info {
  font-size: 10px;
  color: var(--light-gray);
  margin-top: 2px;
}
</style>
