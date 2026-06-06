/**
 * wa-gateway — service kecil pengirim pesan WhatsApp via Baileys (UNOFFICIAL).
 *
 * ⚠️  Memakai protokol WhatsApp Web tidak resmi. Risiko nomor diban.
 *     Hanya untuk DEMO / prototype event, bukan produksi.
 *
 * Endpoint:
 *   GET  /health            -> { status, connected }
 *   GET  /qr?key=API_KEY    -> halaman QR untuk tautkan perangkat
 *   POST /send  (x-api-key) -> { to, message }  kirim pesan teks
 */
const fs = require("fs");
const express = require("express");
const QRCode = require("qrcode");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.WA_API_KEY || "";
const AUTH_DIR = process.env.WA_AUTH_DIR || "./auth";

const logger = pino({ level: "warn" });

let sock = null;
let currentQR = null;
let connected = false;

/** Hapus credential basi (dipakai saat logout/device_removed) agar bisa scan ulang.
 *  Hapus ISI folder, bukan foldernya — /app/auth adalah mount point volume (EBUSY). */
async function clearAuth() {
  try {
    const entries = await fs.promises.readdir(AUTH_DIR);
    await Promise.all(
      entries.map((f) =>
        fs.promises.rm(`${AUTH_DIR}/${f}`, { recursive: true, force: true })
      )
    );
  } catch (e) {
    if (e?.code !== "ENOENT") console.error("[wa] gagal hapus auth:", e?.message || e);
  }
}

/** Tunggu sebentar kalau lagi reconnect, sebelum menyerah. */
async function waitConnected(ms) {
  const start = Date.now();
  while (!connected && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 300));
  }
  return connected;
}

/** Reset paksa: putuskan sesi lama, hapus credential, mulai ulang -> QR baru. */
async function relink() {
  try {
    await sock?.logout();
  } catch {
    /* abaikan: mungkin sudah tidak terhubung */
  }
  try {
    sock?.end?.(undefined);
  } catch {
    /* abaikan */
  }
  connected = false;
  currentQR = null;
  await clearAuth();
  await startSock();
}

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    /* pakai versi bawaan Baileys bila gagal fetch */
  }

  sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["BTS Event", "Chrome", "1.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      currentQR = qr;
      connected = false;
      console.log("[wa] QR baru tersedia — buka /qr untuk scan");
    }
    if (connection === "open") {
      connected = true;
      currentQR = null;
      console.log("[wa] WhatsApp terhubung ✅");
    }
    if (connection === "close") {
      connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`[wa] koneksi tertutup (code=${code}), loggedOut=${loggedOut}`);
      if (loggedOut) {
        // Session mati permanen (device removed / ban). Bersihkan credential
        // basi & mulai ulang -> otomatis muncul QR baru untuk scan.
        console.log("[wa] logout — hapus credential lama & generate QR baru");
        await clearAuth();
        currentQR = null;
      }
      setTimeout(
        () => startSock().catch((e) => console.error("[wa] reconnect:", e?.message || e)),
        loggedOut ? 1000 : 2000
      );
    }
  });

  return sock;
}

/** +6281234.. / 0812.. / 0812 -> 6281234..@s.whatsapp.net */
function toJid(phone) {
  let d = String(phone).replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (!d.startsWith("62")) d = "62" + d;
  return d + "@s.whatsapp.net";
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", connected }));

function relinkButton(key) {
  const q = key ? `?key=${encodeURIComponent(key)}` : "";
  return (
    `<form method='POST' action='/relink${q}' style='margin-top:16px'>` +
    "<button type='submit' style='padding:10px 18px;border:0;border-radius:10px;" +
    "background:#dc2626;color:#fff;font-size:14px;cursor:pointer'>" +
    "Reset &amp; buat QR baru</button></form>"
  );
}

app.get("/qr", async (req, res) => {
  if (API_KEY && req.query.key !== API_KEY) {
    return res.status(401).send("unauthorized");
  }
  const btn = relinkButton(req.query.key);
  const wrap = (inner, refreshMs) =>
    "<html><body style='font-family:sans-serif;text-align:center;padding:24px'>" +
    inner +
    btn +
    (refreshMs ? `<script>setTimeout(()=>location.reload(),${refreshMs})</script>` : "") +
    "</body></html>";

  if (connected) {
    return res.send(
      wrap(
        "<h2>WhatsApp sudah terhubung ✅</h2>" +
          "<p style='color:#888'>Klik di bawah kalau mau ganti nomor.</p>"
      )
    );
  }
  if (!currentQR) {
    return res.send(
      wrap("<h2>Belum ada QR…</h2><p>Tunggu beberapa detik lalu refresh.</p>", 5000)
    );
  }
  const dataUrl = await QRCode.toDataURL(currentQR, { width: 320 });
  res.send(
    wrap(
      "<h2>Scan untuk tautkan WhatsApp</h2>" +
        "<p>WhatsApp → <b>Perangkat Tertaut</b> → <b>Tautkan Perangkat</b></p>" +
        `<img alt='qr' src='${dataUrl}'/>` +
        "<p style='color:#888'>Halaman auto-refresh tiap 8 dtk.</p>",
      8000
    )
  );
});

// Reset paksa & buat QR baru (GET untuk klik dari browser, POST dari tombol).
app.all("/relink", async (req, res) => {
  if (API_KEY && req.query.key !== API_KEY) {
    return res.status(401).send("unauthorized");
  }
  console.log("[wa] /relink dipanggil — reset sesi & buat QR baru");
  relink().catch((e) => console.error("[wa] relink:", e?.message || e));
  const q = req.query.key ? `?key=${encodeURIComponent(req.query.key)}` : "";
  res.send(
    "<html><body style='font-family:sans-serif;text-align:center;padding:24px'>" +
      "<h2>Sesi di-reset 🔄</h2><p>QR baru sedang dibuat…</p>" +
      `<script>setTimeout(()=>location.href='/qr${q}',3000)</script></body></html>`
  );
});

app.post("/send", async (req, res) => {
  if (API_KEY && req.get("x-api-key") !== API_KEY) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  if (!connected) await waitConnected(5000); // toleransi reconnect sesaat
  if (!connected || !sock) {
    return res.status(503).json({ success: false, error: "wa_not_connected" });
  }
  const { to, message } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ success: false, error: "missing_to_or_message" });
  }
  try {
    await sock.sendMessage(toJid(to), { text: String(message) });
    res.json({ success: true });
  } catch (e) {
    console.error("[wa] gagal kirim:", e?.message || e);
    res.status(500).json({ success: false, error: "send_failed" });
  }
});

startSock().catch((e) => console.error("[wa] startSock gagal:", e));
app.listen(PORT, () => console.log(`[wa] gateway listening on :${PORT}`));
