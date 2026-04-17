FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm ci

# Install Chromium browser + all required system libraries into the image
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
