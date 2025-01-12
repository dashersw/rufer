import { Router } from 'express'
import { z } from 'zod'
import { UserModel } from '../models/user'
import { SessionTokenModel } from '../models/session-token'
import { validate } from '../middlewares/validate'

const router = Router()

// Validation schemas
const secretHeaderSchema = z.object({
  'x-rufer-secret-key': z.string().refine(val => val === process.env.RUFER_SECRET_KEY, {
    message: 'Invalid registration secret'
  })
})

const registerUserSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1)
})

const sessionTokenSchema = z.object({
  userId: z.string().min(1)
})

// Register/update a user
router.post(
  '/register',
  validate({
    headers: secretHeaderSchema,
    body: registerUserSchema
  }),
  async (req, res, next) => {
    try {
      const { userId, displayName } = req.body

      // Use findOneAndUpdate with upsert for atomic operation
      const user = await UserModel.findOneAndUpdate(
        { _id: userId },
        { $set: { displayName } },
        {
          new: true,
          upsert: true,
          runValidators: true
        }
      )

      if (!user) {
        return res.status(500).json({ error: 'Failed to create/update user' })
      }

      return res.status(201).json({
        userId: user._id,
        displayName: user.displayName
      })
    } catch (error) {
      return next(error)
    }
  }
)

// Get a session token
router.post(
  '/session-token',
  validate({
    headers: secretHeaderSchema,
    body: sessionTokenSchema
  }),
  async (req, res, next) => {
    try {
      const { userId } = req.body

      // Verify user exists
      const user = await UserModel.findById(userId)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Create session token
      const sessionToken = await SessionTokenModel.create({
        userId: user._id
      })

      return res.json({
        token: sessionToken._id
      })
    } catch (error) {
      return next(error)
    }
  }
)

export default router
