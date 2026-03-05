FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm --workspace frontend run build

FROM nginx:1.27-alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
