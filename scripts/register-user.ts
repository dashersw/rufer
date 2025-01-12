import 'dotenv/config'
import axios from 'axios'

const API_URL = process.env.API_URL || 'http://localhost:3000'

async function registerUser(userId: string, displayName: string) {
  try {
    const response = await axios.post(
      `${API_URL}/api/users/register`,
      {
        userId,
        displayName
      },
      {
        headers: {
          'X-Rufer-Secret-Key': process.env.RUFER_SECRET_KEY
        }
      }
    )

    console.log('User registered successfully:', {
      userId: response.data.userId,
      displayName: response.data.displayName,
      token: response.data.token
    })
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Registration failed:', error.response?.data || error.message)
    } else {
      console.error('Registration failed:', error)
    }
    process.exit(1)
  }
}

// Get command line arguments
const userId = process.argv[2]
const displayName = process.argv[3]

if (!userId || !displayName) {
  console.error('Usage: npm run register-user <userId> <displayName>')
  process.exit(1)
}

if (!process.env.RUFER_SECRET_KEY) {
  console.error('RUFER_SECRET_KEY environment variable is required')
  process.exit(1)
}

void registerUser(userId, displayName)
