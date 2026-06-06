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

// ── UI (light — samakan dgn page OCR KTP) ───────────────────────────
const WA_ICON =
  "<svg width='20' height='20' viewBox='0 0 24 24' fill='#ffffff'><path d='M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-5.6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.1-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.5-1.1.1-.2 0-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.8.8-.8 2 0 3.2a9 9 0 0 0 3.6 3.2c1.3.6 1.9.6 2.6.5.4 0 1.3-.5 1.5-1 .2-.5.2-.9.1-1z'/></svg>";

const CSS =
  "*{box-sizing:border-box}" +
  "body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;color:#0f172a;-webkit-font-smoothing:antialiased}" +
  ".wrap{max-width:448px;margin:0 auto;padding:24px 16px 48px}" +
  ".brand{display:flex;align-items:center;gap:11px;margin-bottom:20px}" +
  ".logo{width:36px;height:36px;border-radius:10px;background:#059669;display:grid;place-items:center}" +
  "h1{font-size:20px;margin:0;font-weight:700;letter-spacing:-.01em}h2{font-size:18px;margin:6px 0;font-weight:700}" +
  ".sub{color:#64748b;font-size:13px;margin:2px 0 0}" +
  ".card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:13px 15px;margin-bottom:11px;display:flex;align-items:center;gap:11px;flex-wrap:wrap;box-shadow:0 1px 2px rgba(15,23,42,.04)}" +
  ".name{font-weight:600;font-size:15px;min-width:42px}" +
  ".pill{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;padding:5px 11px;border-radius:999px}" +
  ".pill.on{background:#d1fae5;color:#047857}.pill.off{background:#f1f5f9;color:#64748b}" +
  ".dot{width:8px;height:8px;border-radius:50%}.dot.on{background:#059669;animation:pulse 1.8s infinite}.dot.off{background:#94a3b8}" +
  "@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(5,150,105,.5)}70%{box-shadow:0 0 0 7px rgba(5,150,105,0)}100%{box-shadow:0 0 0 0 rgba(5,150,105,0)}}" +
  ".spacer{flex:1 1 auto}" +
  ".btn{border:0;border-radius:12px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block;font-family:inherit}" +
  ".btn-scan{background:#0f172a;color:#fff}.btn-scan:hover{background:#1e293b}" +
  ".btn-reset{background:#fff;border:1px solid #fecaca;color:#dc2626}.btn-reset:hover{background:#fef2f2}" +
  ".center{text-align:center}.qrbox{background:#fff;border:1px solid #e2e8f0;padding:16px;border-radius:16px;display:inline-block;margin:10px 0 16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}" +
  ".muted{color:#94a3b8;font-size:12px;margin-top:20px}.hint{color:#64748b;font-size:13.5px;margin:4px 0 0}" +
  ".back{color:#64748b;font-size:13px;text-decoration:none;display:inline-block;margin-bottom:8px}.back:hover{color:#0f172a}";

function layout(title, inner, refreshMs) {
  return (
    "<!doctype html><html lang='id'><head><meta charset='utf-8'>" +
    "<meta name='viewport' content='width=device-width,initial-scale=1'>" +
    `<title>${title}</title><style>${CSS}</style></head><body><div class='wrap'>` +
    inner +
    (refreshMs ? `<script>setTimeout(()=>location.reload(),${refreshMs})</script>` : "") +
    "</div></body></html>"
  );
}

function brand(subtitle) {
  return (
    `<div class='brand'><div class='logo'>${WA_ICON}</div>` +
    `<div><h1>WhatsApp Sender</h1><div class='sub'>${subtitle}</div></div></div>`
  );
}

function keyQ(key, extra) {
  const parts = [];
  if (extra) parts.push(extra);
  if (key) parts.push(`key=${encodeURIComponent(key)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function relinkButton(id, key) {
  return (
    `<form method='POST' action='/relink${keyQ(key, `session=${encodeURIComponent(id)}`)}' style='display:inline'>` +
    "<button class='btn btn-reset'>Reset &amp; QR baru</button></form>"
  );
}

app.get("/qr", async (req, res) => {
  if (!requireKey(req, res)) return;
  const key = req.query.key;
  const id = req.query.session;

  // Tanpa session -> halaman daftar semua nomor.
  if (!id) {
    const cards = SESSION_IDS.map((sid) => {
      const on = !!sessions.get(sid)?.connected;
      const pill = on
        ? "<span class='pill on'><span class='dot on'></span>Terhubung</span>"
        : "<span class='pill off'><span class='dot off'></span>Belum</span>";
      const scanUrl = `/qr${keyQ(key, `session=${encodeURIComponent(sid)}`)}`;
      return (
        "<div class='card'>" +
        `<span class='name'>${sid}</span>${pill}<span class='spacer'></span>` +
        `<a class='btn btn-scan' href='${scanUrl}'>${on ? "Lihat" : "Scan"}</a>` +
        relinkButton(sid, key) +
        "</div>"
      );
    }).join("");
    const ok = connectedIds().length;
    return res.send(
      layout(
        "WhatsApp Sender",
        brand(`Gateway · ${ok}/${SESSION_IDS.length} nomor aktif`) +
          cards +
          "<p class='muted'>Auto-refresh tiap 8 detik.</p>",
        8000
      )
    );
  }

  if (!SESSION_IDS.includes(id)) return res.status(404).send("session tidak dikenal");
  const s = sessions.get(id);
  const back = `<a class='back' href='/qr${keyQ(key)}'>← Semua nomor</a>`;

  if (s?.connected) {
    return res.send(
      layout(
        `${id} terhubung`,
        back +
          "<div class='center'>" +
          `<div class='logo' style='width:54px;height:54px;border-radius:16px;margin:14px auto'>${WA_ICON}</div>` +
          `<h2>${id} terhubung ✅</h2>` +
          "<p class='hint'>Siap mengirim OTP. Klik di bawah untuk ganti nomor.</p>" +
          `<div style='margin-top:16px'>${relinkButton(id, key)}</div></div>`
      )
    );
  }
  if (!s?.qr) {
    return res.send(
      layout(
        `${id} · menyiapkan QR`,
        back +
          `<div class='center'><h2>${id}: menyiapkan QR…</h2>` +
          "<p class='hint'>Tunggu beberapa detik, halaman refresh sendiri.</p></div>",
        4000
      )
    );
  }
  const dataUrl = await QRCode.toDataURL(s.qr, { width: 300, margin: 1 });
  res.send(
    layout(
      `Scan ${id}`,
      back +
        "<div class='center'>" +
        `<h2>Tautkan nomor <span style='color:#25d366'>${id}</span></h2>` +
        "<p class='hint'>WhatsApp → Perangkat Tertaut → Tautkan Perangkat</p>" +
        `<div class='qrbox'><img alt='qr' width='260' height='260' src='${dataUrl}'/></div><br>` +
        relinkButton(id, key) +
        "</div>",
      8000
    )
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
  const q = keyQ(req.query.key, `session=${encodeURIComponent(id)}`);
  res.send(
    layout(
      `${id} di-reset`,
      "<div class='center'>" +
        `<div class='logo' style='width:54px;height:54px;border-radius:16px;margin:14px auto'>${WA_ICON}</div>` +
        `<h2>${id} di-reset 🔄</h2><p class='hint'>QR baru sedang dibuat…</p>` +
        `<script>setTimeout(()=>location.href='/qr${q}',3000)</script></div>`
    )
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
