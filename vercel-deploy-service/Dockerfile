# Use an official Node.js image as a base
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy only the package.json and package-lock.json files to leverage Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files (after ignoring unnecessary ones with .dockerignore)
COPY . .

# Expose a port (if your application serves requests over HTTP, e.g., 3000)
# EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
