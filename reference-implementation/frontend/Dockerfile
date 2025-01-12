# Development stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies including devDependencies
RUN npm install

# Copy source code (this will be overridden by volume mount in development)
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"] 
