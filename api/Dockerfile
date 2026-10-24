# PropIQ API. Build:  docker build -t propiq-api ./api      Run:  docker run -p 4000:4000 --env-file api/.env propiq-api
# Works on Render, Fly.io, Railway or any host that runs a container. The host supplies the environment variables
# (see docs/GO_LIVE.md); no .env file is baked into the image.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY db ./db
ENV NODE_ENV=production
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/server.ts"]
