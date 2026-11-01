# OAuth token exchange proxy service for DashGit.

# Use this service to exchange authorization code for access token in backend, so that client secret is not exposed to frontend.

# This dockerfile uses Docker Hardened Image, remembe to login to dhi.io to pull the image:
# docker login dhi.io -u <username> -p <password/token>

# Alternatively, you can swap the image names to test with public node images, but it is recommended to use hardened images for better security.

# Build stage
FROM dhi.io/node:24-alpine3.23-dev@sha256:10a336fd6d5af64aeea722da2f1cd3ffcf2ed66b8823c87bf6c712e886ab300e AS build
#FROM node:24-alpine3.23 AS build

ENV NODE_ENV=production
WORKDIR /usr/src/app
# Copy the lockfile explicitly: if it is missing the build fails instead of silently resolving a different tree
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p node_modules

# Runtime stage
FROM dhi.io/node:24-alpine3.23@sha256:c3f482eaef84ffb3a934ef097f1cfeb2a108b306573ac5d54bcc117ed34ac6a6 AS runtime
#FROM node:24-alpine3.23 AS runtime

ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY server.js .
COPY package.json package-lock.json ./

EXPOSE 3000
CMD ["node", "server.js"]
