FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including devDependencies
RUN npm install

# Copy app source
COPY src ./src

# Expose port
EXPOSE 4000

# Start the app with npm run dev
CMD ["npm", "run", "dev"] 
