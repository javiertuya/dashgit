# OAuth token exchange proxy service for DashGit.

# Use this service to exchange authorization code for access token in backend, so that client secret is not exposed to frontend.

# This dockerfile uses Docker Hardened Image, remembe to login to dhi.io to pull the image:
# docker login dhi.io -u <username> -p <password/token>

# Alternatively, you can swap the image names to test with public node images, but it is recommended to use hardened images for better security.

# Build stage
FROM dhi.io/node:24-alpine3.23-dev@sha256:aae243bddd13a7449c9a458b31936fb86c2fbb377c155ec01890562ebc2e333a AS build
#FROM node:24-alpine3.23 AS build

ENV NODE_ENV=production
WORKDIR /usr/src/app
# Copy the lockfile explicitly: if it is missing the build fails instead of silently resolving a different tree
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p node_modules

# Runtime stage
FROM dhi.io/node:24-alpine3.23@sha256:056085462c7ee6d47db4e10ab26a9ff63c6cb4c1b88473096ec9c3660345cb54 AS runtime
#FROM node:24-alpine3.23 AS runtime

ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY server.js .
COPY package.json package-lock.json ./

EXPOSE 3000
CMD ["node", "server.js"]
