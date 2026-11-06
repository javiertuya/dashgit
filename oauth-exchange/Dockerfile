# OAuth token exchange proxy service for DashGit.

# Use this service to exchange authorization code for access token in backend, so that client secret is not exposed to frontend.

# This dockerfile uses Docker Hardened Image, remembe to login to dhi.io to pull the image:
# docker login dhi.io -u <username> -p <password/token>

# Alternatively, you can swap the image names to test with public node images, but it is recommended to use hardened images for better security.

# Build stage
FROM dhi.io/node:24-alpine3.23-dev@sha256:9df89cda122c694157c12ca34b132297268064f879e84716616b46b75e8798ca AS build
#FROM node:24-alpine3.23 AS build

ENV NODE_ENV=production
WORKDIR /usr/src/app
# Copy the lockfile explicitly: if it is missing the build fails instead of silently resolving a different tree
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p node_modules

# Runtime stage
FROM dhi.io/node:24-alpine3.23@sha256:ea44fbd46a8e11a9ffb9b2bd5c6e4722fa507fb86fef0ee8d92a020ce7c850a5 AS runtime
#FROM node:24-alpine3.23 AS runtime

ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY server.js .
COPY package.json package-lock.json ./

EXPOSE 3000
CMD ["node", "server.js"]
