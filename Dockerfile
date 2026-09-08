FROM node:24.13.0-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/sdk/package.json ./packages/sdk/package.json
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --include=dev --legacy-peer-deps \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN npx playwright install --with-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends gosu tini \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R a+rX /ms-playwright
COPY apps ./apps
COPY packages ./packages
COPY contracts/src ./contracts/src
COPY docs/openapi.json ./docs/openapi.json
COPY scripts/container-entrypoint.sh ./scripts/container-entrypoint.sh
RUN chmod +x scripts/container-entrypoint.sh
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/data
EXPOSE 8787
ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/container-entrypoint.sh"]
CMD ["npm", "start"]
