FROM node:22-alpine

WORKDIR /app

# Dependency layer (cache-friendly).
COPY package.json ./
RUN npm install

# Source.
COPY . .

EXPOSE 3002

CMD ["npm", "run", "dev"]
