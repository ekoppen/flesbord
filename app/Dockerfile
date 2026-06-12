# De Fles — bar-dashboard. Klein image, geen dependencies.
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=8420

WORKDIR /srv/defles
COPY package.json server.js ./
COPY public ./public

# Gedeelde state + geüploade foto's; wordt als volume gemount
RUN mkdir -p data
VOLUME /srv/defles/data

EXPOSE 8420
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8420/health >/dev/null || exit 1

CMD ["node", "server.js"]
