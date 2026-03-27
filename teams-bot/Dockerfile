FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install -D typescript ts-node @types/node @types/restify && npx tsc && npm prune --production
EXPOSE 3978
CMD ["node", "dist/index.js"]
