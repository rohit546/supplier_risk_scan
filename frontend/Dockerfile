FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Inlined at build time by Vite (set VITE_API_URL in Railway service variables)
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/.output ./.output

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
