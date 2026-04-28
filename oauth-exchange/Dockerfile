FROM node:24-alpine3.23

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY server.js .

EXPOSE 3000
CMD ["node", "server.js"]
