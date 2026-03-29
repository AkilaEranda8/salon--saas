FROM node:18-alpine

# IANA timezones for node-cron (Asia/Colombo, etc.)
RUN apk add --no-cache tzdata
ENV TZ=Asia/Colombo

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p uploads

EXPOSE 5000

CMD ["node", "server.js"]
