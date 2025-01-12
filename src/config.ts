import { z } from 'zod'

// Define the schema for environment variables
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.string().transform(Number),
  DATABASE_URL: z.string().url()
  // Add more environment variables as needed
})

// Parse and validate the environment variables
const env = envSchema.safeParse(process.env)

if (!env.success) {
  console.error('Invalid environment variables:', env.error.format())
  process.exit(1)
}

// Export the validated and typed environment variables
export const config = env.data
