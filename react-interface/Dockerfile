# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Configure nginx to listen on port 8080
RUN sed -i 's/listen\s*80;/listen 8080;/g' /etc/nginx/conf.d/default.conf

# Expose port 8080
EXPOSE 8080

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

