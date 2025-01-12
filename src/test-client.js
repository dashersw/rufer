/* eslint-disable */
const { io } = require('socket.io-client')
const axios = require('axios')

const API_URL = 'http://localhost:3000'
const api = axios.create({ baseURL: API_URL })

// Example users
const users = [
  { _id: 'user1', displayName: 'Alice' },
  { _id: 'user2', displayName: 'Bob' },
  { _id: 'user6', displayName: 'George' }
]

async function createSocket(userId) {
  return new Promise(resolve => {
    const socket = io(API_URL)

    socket.on('connect', () => {
      console.log(`${userId} connected with socket ${socket.id}`)
      socket.emit('user-online', userId)
      resolve(socket)
    })
  })
}

async function main() {
  try {
    // Create socket connections for all users
    const [aliceSocket, bobSocket, clementineSocket] = await Promise.all([
      createSocket(users[0]._id),
      createSocket(users[1]._id),
      createSocket(users[2]._id)
    ])

    // Set up message listeners for all users
    bobSocket.on('new-message', message => {
      console.log(`${users[1].displayName} received message:`, {
        from: message.sender.displayName,
        content: message.content,
        at: message.createdAt
      })
    })

    aliceSocket.on('new-message', message => {
      console.log(`${users[0].displayName} received message:`, {
        from: message.sender.displayName,
        content: message.content,
        at: message.createdAt
      })
    })

    // Clementine sends messages to both Alice and Bob
    await api.post('/api/messages', {
      sender: users[2],
      recipient: users[0],
      content: 'Hey Alice, how are you doing?'
    })

    await new Promise(resolve => setTimeout(resolve, 1000))

    await api.post('/api/messages', {
      sender: users[2],
      recipient: users[1],
      content: 'Hi Bob, nice to meet you!'
    })

    // Wait a bit and fetch messages for all users
    setTimeout(async () => {
      console.log('\nFetching messages for Alice:')
      const { data: aliceMessages } = await api.get(`/api/messages/${users[0]._id}?otherUserId=${users[2]._id}`)
      console.log(aliceMessages)

      console.log('\nFetching messages for Bob:')
      const { data: bobMessages } = await api.get(`/api/messages/${users[1]._id}?otherUserId=${users[2]._id}`)
      console.log(bobMessages)

      // Clean up
      aliceSocket.disconnect()
      bobSocket.disconnect()
      clementineSocket.disconnect()
    }, 2000)
  } catch (error) {
    console.error('Error:', error)
  }
}

main() 
