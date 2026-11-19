FROM node:22-slim

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy server source cleanly with non-root ownership
COPY --chown=node:node server ./server

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

USER node

EXPOSE 8080

CMD ["node", "server/index.js"]
