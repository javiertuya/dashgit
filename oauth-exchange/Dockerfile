# OAuth token exchange proxy service for DashGit.

# Use this service to exchange authorization code for access token in backend, so that client secret is not exposed to frontend.

# This dockerfile uses Docker Hardened Image, remembe to login to dhi.io to pull the image:
# docker login dhi.io -u <username> -p <password/token>

# Alternatively, you can swap the image names to test with public node images, but it is recommended to use hardened images for better security.

# Build stage
FROM dhi.io/node:24-alpine3.23-dev AS build
#FROM node:24-alpine3.23 AS build

ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev && mkdir -p node_modules

# Runtime stage
FROM dhi.io/node:24-alpine3.23 AS runtime
#FROM node:24-alpine3.23 AS runtime

ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY server.js .
COPY package*.json .

EXPOSE 3000
CMD ["node", "server.js"]
