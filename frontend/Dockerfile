FROM public.ecr.aws/docker/library/node:24-alpine AS deps
WORKDIR /app
ARG NPM_CONFIG_STRICT_SSL=false
ENV NPM_CONFIG_STRICT_SSL=${NPM_CONFIG_STRICT_SSL}
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
RUN npm i -g npm@10 && npm ci

FROM public.ecr.aws/docker/library/node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm --workspace frontend run build

FROM public.ecr.aws/docker/library/nginx:1.27-alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
