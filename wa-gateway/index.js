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

  sock.ev.on("connection.update", (update) => {
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
      console.log(`[wa] koneksi tertutup (code=${code}), reconnect=${!loggedOut}`);
      if (!loggedOut) {
        setTimeout(() => startSock().catch((e) => console.error("[wa] reconnect", e)), 2000);
      } else {
        console.log("[wa] logged out — hapus folder auth lalu scan ulang");
      }
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

app.get("/qr", async (req, res) => {
  if (API_KEY && req.query.key !== API_KEY) {
    return res.status(401).send("unauthorized");
  }
  if (connected) return res.send("<h2>WhatsApp sudah terhubung ✅</h2>");
  if (!currentQR) {
    return res.send(
      "<html><body style='font-family:sans-serif;text-align:center;padding:24px'>" +
        "<h2>Belum ada QR…</h2><p>Tunggu beberapa detik lalu refresh.</p>" +
        "<script>setTimeout(()=>location.reload(),5000)</script></body></html>"
    );
  }
  const dataUrl = await QRCode.toDataURL(currentQR, { width: 320 });
  res.send(
    "<html><body style='font-family:sans-serif;text-align:center;padding:24px'>" +
      "<h2>Scan untuk tautkan WhatsApp</h2>" +
      "<p>WhatsApp → <b>Perangkat Tertaut</b> → <b>Tautkan Perangkat</b></p>" +
      `<img alt='qr' src='${dataUrl}'/>` +
      "<p style='color:#888'>Halaman auto-refresh tiap 8 dtk.</p>" +
      "<script>setTimeout(()=>location.reload(),8000)</script></body></html>"
  );
});

app.post("/send", async (req, res) => {
  if (API_KEY && req.get("x-api-key") !== API_KEY) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
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
