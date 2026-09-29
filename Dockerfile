FROM node:24-alpine

WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data/keys /app/storage/evidence && chown -R node:node /app/data /app/storage

USER node
ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
