/**
 * wa-gateway — pengirim pesan WhatsApp via Baileys (UNOFFICIAL), MULTI-SESI.
 *
 * ⚠️  WhatsApp Web tidak resmi. Risiko nomor diban. Hanya untuk DEMO/prototype.
 *
 * Beberapa nomor pengirim dikonfigurasi via env WA_SESSIONS (mis. "wa1,wa2,wa3").
 * Tiap sesi punya auth sendiri di {WA_AUTH_DIR}/{id}. Saat /send, gateway memilih
 * sesi yang CONNECTED secara round-robin, dan failover ke sesi lain bila gagal.
 *
 * Endpoint:
 *   GET  /health                     -> { status, connected, sessions[] }
 *   GET  /sessions?key=              -> daftar sesi + status
 *   GET  /qr?key=                    -> halaman daftar sesi (link scan tiap nomor)
 *   GET  /qr?session=<id>&key=       -> QR untuk sesi tertentu
 *   POST /send  (x-api-key)          -> { to, message } (pilih sesi + failover)
 *   ALL  /relink?session=<id>&key=   -> reset 1 sesi -> QR baru
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
const SESSION_IDS = (process.env.WA_SESSIONS || "wa1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const logger = pino({ level: "warn" });

/** id -> { sock, qr, connected } */
const sessions = new Map();
let rr = 0; // pointer round-robin

async function clearAuth(dir) {
  try {
    const entries = await fs.promises.readdir(dir);
    await Promise.all(
      entries.map((f) => fs.promises.rm(`${dir}/${f}`, { recursive: true, force: true }))
    );
  } catch (e) {
    if (e?.code !== "ENOENT") console.error(`[wa] gagal hapus auth ${dir}:`, e?.message || e);
  }
}

async function startSession(id) {
  const dir = `${AUTH_DIR}/${id}`;
  const { state, saveCreds } = await useMultiFileAuthState(dir);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    /* pakai versi bawaan */
  }

  const sock = makeWASocket({
    ...(version ? { version } : {}),
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: [`BTS ${id}`, "Chrome", "1.0"],
  });

  const s = sessions.get(id) || {};
  s.sock = sock;
  s.connected = false;
  sessions.set(id, s);

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      s.qr = qr;
      s.connected = false;
      console.log(`[wa:${id}] QR baru — /qr?session=${id}`);
    }
    if (connection === "open") {
      s.connected = true;
      s.qr = null;
      console.log(`[wa:${id}] terhubung ✅`);
    }
    if (connection === "close") {
      s.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`[wa:${id}] tertutup code=${code} loggedOut=${loggedOut}`);
      if (loggedOut) {
        await clearAuth(dir);
        s.qr = null;
      }
      setTimeout(
        () => startSession(id).catch((e) => console.error(`[wa:${id}] reconnect:`, e?.message || e)),
        loggedOut ? 1000 : 2000
      );
    }
  });
}

function connectedIds() {
  return SESSION_IDS.filter((id) => sessions.get(id)?.connected);
}

async function waitAnyConnected(ms) {
  const start = Date.now();
  while (connectedIds().length === 0 && Date.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 300));
  }
  return connectedIds().length > 0;
}

/** +6281234.. / 0812.. -> 6281234..@s.whatsapp.net */
function toJid(phone) {
  let d = String(phone).replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  if (!d.startsWith("62")) d = "62" + d;
  return d + "@s.whatsapp.net";
}

/** Kirim dgn round-robin + failover ke sesi connected. */
async function sendWithFailover(to, message) {
  const ids = connectedIds();
  if (ids.length === 0) return { ok: false, status: 503, error: "wa_not_connected" };

  // Urutan round-robin mulai dari pointer rr.
  const ordered = ids.map((_, i) => ids[(rr + i) % ids.length]);
  rr = (rr + 1) % ids.length;

  let lastErr = "send_failed";
  for (const id of ordered) {
    const s = sessions.get(id);
    if (!s?.connected || !s.sock) continue;
    try {
      await s.sock.sendMessage(toJid(to), { text: String(message) });
      return { ok: true, via: id };
    } catch (e) {
      lastErr = e?.message || "send_failed";
      console.error(`[wa:${id}] gagal kirim, coba sesi lain:`, lastErr);
    }
  }
  return { ok: false, status: 502, error: lastErr };
}

// ── HTTP ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

function requireKey(req, res) {
  if (API_KEY && req.query.key !== API_KEY) {
    res.status(401).send("unauthorized");
    return false;
  }
  return true;
}

app.get("/health", (_req, res) => {
  const list = SESSION_IDS.map((id) => ({ id, connected: !!sessions.get(id)?.connected }));
  res.json({
    status: "ok",
    connected: connectedIds().length > 0,
    connected_count: connectedIds().length,
    total: SESSION_IDS.length,
    sessions: list,
  });
});

app.get("/sessions", (req, res) => {
  if (!requireKey(req, res)) return;
  res.json(SESSION_IDS.map((id) => ({ id, connected: !!sessions.get(id)?.connected })));
});

function relinkButton(id, key) {
  const q = `?session=${encodeURIComponent(id)}${key ? `&key=${encodeURIComponent(key)}` : ""}`;
  return (
    `<form method='POST' action='/relink${q}' style='display:inline'>` +
    "<button style='padding:6px 12px;border:0;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer'>" +
    "Reset & QR baru</button></form>"
  );
}

app.get("/qr", async (req, res) => {
  if (!requireKey(req, res)) return;
  const key = req.query.key;
  const id = req.query.session;

  // Tanpa session -> halaman daftar semua nomor.
  if (!id) {
    const rows = SESSION_IDS.map((sid) => {
      const st = sessions.get(sid)?.connected ? "✅ terhubung" : "⚪ belum";
      const q = `?session=${encodeURIComponent(sid)}${key ? `&key=${encodeURIComponent(key)}` : ""}`;
      return (
        `<tr><td style='padding:8px 16px'><b>${sid}</b></td>` +
        `<td style='padding:8px 16px'>${st}</td>` +
        `<td style='padding:8px 16px'><a href='/qr${q}'>Scan</a></td>` +
        `<td style='padding:8px 16px'>${relinkButton(sid, key)}</td></tr>`
      );
    }).join("");
    return res.send(
      "<html><body style='font-family:sans-serif;padding:24px'>" +
        "<h2>Nomor pengirim WhatsApp</h2><table>" +
        "<tr><th style='text-align:left;padding:8px 16px'>Sesi</th>" +
        "<th style='text-align:left;padding:8px 16px'>Status</th><th></th><th></th></tr>" +
        rows +
        "</table><p style='color:#888'>Auto-refresh 8 dtk.</p>" +
        "<script>setTimeout(()=>location.reload(),8000)</script></body></html>"
    );
  }

  if (!SESSION_IDS.includes(id)) return res.status(404).send("session tidak dikenal");
  const s = sessions.get(id);
  const back = `<p><a href='/qr${key ? `?key=${encodeURIComponent(key)}` : ""}'>← semua nomor</a></p>`;
  if (s?.connected) {
    return res.send(
      `<html><body style='font-family:sans-serif;text-align:center;padding:24px'>${back}` +
        `<h2>${id}: terhubung ✅</h2>${relinkButton(id, key)}</body></html>`
    );
  }
  if (!s?.qr) {
    return res.send(
      `<html><body style='font-family:sans-serif;text-align:center;padding:24px'>${back}` +
        `<h2>${id}: belum ada QR…</h2><p>Tunggu beberapa detik & refresh.</p>` +
        "<script>setTimeout(()=>location.reload(),5000)</script></body></html>"
    );
  }
  const dataUrl = await QRCode.toDataURL(s.qr, { width: 300 });
  res.send(
    `<html><body style='font-family:sans-serif;text-align:center;padding:24px'>${back}` +
      `<h2>Scan untuk ${id}</h2><p>WhatsApp → Perangkat Tertaut → Tautkan Perangkat</p>` +
      `<img alt='qr' src='${dataUrl}'/>${relinkButton(id, key)}` +
      "<script>setTimeout(()=>location.reload(),8000)</script></body></html>"
  );
});

app.all("/relink", async (req, res) => {
  if (!requireKey(req, res)) return;
  const id = req.query.session;
  if (!id || !SESSION_IDS.includes(id)) return res.status(400).send("session tidak valid");
  console.log(`[wa:${id}] /relink — reset sesi`);
  (async () => {
    const s = sessions.get(id);
    try {
      await s?.sock?.logout();
    } catch {
      /* ignore */
    }
    try {
      s?.sock?.end?.(undefined);
    } catch {
      /* ignore */
    }
    if (s) {
      s.connected = false;
      s.qr = null;
    }
    await clearAuth(`${AUTH_DIR}/${id}`);
    await startSession(id);
  })().catch((e) => console.error(`[wa:${id}] relink:`, e?.message || e));
  const q = `?session=${encodeURIComponent(id)}${req.query.key ? `&key=${encodeURIComponent(req.query.key)}` : ""}`;
  res.send(
    "<html><body style='font-family:sans-serif;text-align:center;padding:24px'>" +
      `<h2>${id} di-reset 🔄</h2><p>QR baru sedang dibuat…</p>` +
      `<script>setTimeout(()=>location.href='/qr${q}',3000)</script></body></html>`
  );
});

app.post("/send", async (req, res) => {
  if (API_KEY && req.get("x-api-key") !== API_KEY) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  if (connectedIds().length === 0) await waitAnyConnected(5000);
  const { to, message } = req.body || {};
  if (!to || !message) {
    return res.status(400).json({ success: false, error: "missing_to_or_message" });
  }
  const result = await sendWithFailover(to, message);
  if (result.ok) return res.json({ success: true, via: result.via });
  return res.status(result.status).json({ success: false, error: result.error });
});

// Mulai semua sesi.
for (const id of SESSION_IDS) {
  startSession(id).catch((e) => console.error(`[wa:${id}] startSession gagal:`, e?.message || e));
}
app.listen(PORT, () => console.log(`[wa] gateway listening on :${PORT} — sesi: ${SESSION_IDS.join(", ")}`));
