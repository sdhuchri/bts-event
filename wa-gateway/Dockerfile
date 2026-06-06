FROM node:22-slim

WORKDIR /app

# Baileys menarik sebagian dependency via git (mis. libsignal) dgn URL ssh.
# Pasang git + paksa GitHub lewat HTTPS supaya tak perlu SSH key.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

COPY package.json ./
# --omit=optional: lewati native optional deps (mis. sharp) yg tak dipakai utk teks.
RUN npm install --omit=optional

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
