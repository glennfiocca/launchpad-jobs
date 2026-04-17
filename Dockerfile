FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
COPY prisma/ ./prisma/
# Increment CACHE_BUST to force a fresh npm ci layer when DO's kaniko cache is corrupted
ARG CACHE_BUST=2
RUN npm ci

# Install Chromium browser + all required system libraries into the image
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.cache/ms-playwright
RUN npx playwright install --with-deps chromium

# Expose NEXT_PUBLIC_* build args so next build embeds correct values in the client bundle
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_LOGO_DEV_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_LOGO_DEV_KEY=$NEXT_PUBLIC_LOGO_DEV_KEY

COPY . .
RUN npm run build

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
