FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG VITE_FIREBASE_API_KEY=synthetic-staging-build-key
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
COPY firebase-applet-config.synthetic.json ./firebase-applet-config.json
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    DOCUMENT_FORMATTING_V1_RELEASE_APPROVED=false
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
USER node
# Pinned server.ts uses const PORT = 3000, not process.env.PORT.
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
