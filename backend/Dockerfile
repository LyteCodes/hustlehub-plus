FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY src ./src

ENV NODE_ENV=production

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "const http=require('http'); const r=http.get('http://127.0.0.1:3000/health',res=>process.exit(res.statusCode===200?0:1)); r.on('error',()=>process.exit(1)); r.setTimeout(4000,()=>{r.destroy();process.exit(1)})"

CMD ["node", "src/server.js"]
