require('dotenv').config()
const express = require('express')
const cors = require('cors')
const axios = require('axios')

const app = express()
app.use(cors())
app.use(express.json())

// Rufer server URL
const RUFER_URL = process.env.RUFER_URL || 'http://localhost:3000'

// Create axios instance with base URL
const rufer = axios.create({
  baseURL: RUFER_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-rufer-secret-key': process.env.RUFER_SECRET_KEY || 'your-secret-key'
  }
})

// Test users to register on startup
const TEST_USERS = [
  { userId: 'alice', displayName: 'Alice Smith' },
  { userId: 'bob', displayName: 'Bob Johnson' }
]

// Register test users on startup
async function registerTestUsers() {
  for (const user of TEST_USERS) {
    try {
      await rufer.post('/api/users/register', user)
      console.log(`✓ Registered test user: ${user.displayName} (${user.userId})`)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        console.log(`✓ Test user already exists: ${user.displayName} (${user.userId})`)
      } else {
        console.error(`✗ Failed to register test user: ${user.displayName} (${user.userId})`)
        console.error(error.response?.data?.error || error.message)
      }
    }
  }
}

// Example endpoint to get a session token
app.post('/session-token', async (req, res) => {
  try {
    const { userId } = req.body

    // Get session token from Rufer
    const { data } = await rufer.post('/api/users/session-token', {
      userId
    })

    res.json(data)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      res
        .status(error.response?.status || 500)
        .json({ error: error.response?.data?.error || 'Failed to get session token' })
    } else {
      res.status(500).json({ error: 'Failed to get session token' })
    }
  }
})

const port = process.env.PORT || 4000

// Start server and register test users
app.listen(port, async () => {
  console.log(`Reference backend running on port ${port}`)
  console.log('\nRegistering test users...')
  await registerTestUsers()
  console.log('\nTest users ready! You can use these IDs to test the chat:')
  for (const user of TEST_USERS) {
    console.log(`- ${user.userId} (${user.displayName})`)
  }
})
