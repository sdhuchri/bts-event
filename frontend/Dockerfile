FROM node:22-alpine

WORKDIR /app

# Dependency layer (cache-friendly).
COPY package.json ./
RUN npm install

# Source.
COPY . .

# NEXT_PUBLIC_* di-bake saat build. Railway meneruskan service variable
# sebagai build arg (set NEXT_PUBLIC_API_BASE_URL = URL backend Railway).
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm run build

EXPOSE 3002

# Railway menyuntik $PORT; start script bind ke $PORT (default 3002).
CMD ["npm", "run", "start"]
