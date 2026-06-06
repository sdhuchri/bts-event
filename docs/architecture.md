# Architecture — KTP OCR + WhatsApp OTP (Event BTS)

Overview of components, flow, and processing order. Diagrams use **Mermaid**
(rendered automatically on GitHub).

> Related docs: [Public API for mobile](public-api.md) ·
> [WhatsApp provider alternatives](whatsapp-alternatives.md)

---

## Components

| Component | Tech | Role |
|---|---|---|
| **frontend** | Next.js 16 | Staff app: camera/scan KTP + form (NIK, Name, Phone), send OTP |
| **backend** | FastAPI | System core: OCR, OTP logic, persistence, **+ public API `/api/v1/ext`** |
| **AWS Bedrock** | Vision LLM | OCR: KTP photo → structured JSON (17 fields) |
| **wa service** | Node + Baileys | WhatsApp message sender. **Multi-number pool** (`WA_SESSIONS`) with round-robin + failover when a number is down/restricted |
| **customer WhatsApp** | WhatsApp | The customer's WhatsApp that receives the OTP |
| **db** | PostgreSQL | `ktp_records` (participant data) + `otp_codes` (OTP codes) |
| **bsya (mobile app)** | Native mobile | External consumer: verify & resend OTP via the public API |

---

## Component diagram

```mermaid
flowchart LR
    FE["frontend<br/>(staff)"]
    BE["backend — FastAPI<br/>+ public API /api/v1/ext"]
    AI["AWS Bedrock<br/>AI Model"]
    WA["wa service<br/>(Baileys)"]
    WN["customer WhatsApp"]
    DB[("db<br/>bts_event")]
    MB["bsya<br/>(mobile app)"]

    FE -->|"1. KTP photo"| BE
    BE -->|"4. OCR result → form"| FE
    BE <-->|"2–3. OCR (vision)"| AI
    BE -->|"6/11. store & check"| DB
    BE -->|"7. send OTP"| WA
    WA -->|"8. OTP"| WN
    MB <-->|"10/13. verify + resend<br/>X-API-Key"| BE

    classDef ext fill:#f5f5f5,stroke:#999,stroke-dasharray:4 3;
    class AI,WA,WN,MB ext;
```

> **Important:** `bsya` (mobile) **does not access `db` directly**. The mobile app
> calls the **public API on the backend** (`/api/v1/ext/*` + `X-API-Key`), and the
> **backend** queries `db`. So the path is `bsya → backend (public API) → db` — for
> security (API key, validation, rate limiting).

---

## Process order (sequence)

```mermaid
sequenceDiagram
    actor P as Staff
    participant FE as frontend
    participant BE as backend
    participant AI as AWS Bedrock
    participant DB as db
    participant WA as wa service
    participant WN as customer WhatsApp
    actor N as Customer
    participant MB as bsya (mobile)

    Note over P,WN: PHASE 1 — Register participant + send OTP (staff)
    P->>FE: scan / upload KTP
    FE->>BE: 1. POST KTP photo
    BE->>AI: 2. send image (OCR)
    AI-->>BE: 3. JSON result (17 fields)
    BE-->>FE: 4. OCR data → form
    P->>FE: correct NIK/Name + enter Phone + "Send OTP"
    FE->>BE: 5. POST send OTP + save
    BE->>DB: 6. save record + save OTP
    BE->>WA: 7. request send OTP
    WA->>WN: 8. send OTP (WhatsApp)
    WN-->>N: receives OTP code

    Note over N,DB: PHASE 2 — Verify OTP (customer, via bsya)
    N->>MB: 9. enter OTP code
    MB->>BE: 10. verify OTP (/api/v1/ext + X-API-Key)
    BE->>DB: 11. check code (hash / expiry / attempts)
    DB-->>BE: 12. valid / invalid
    BE-->>MB: 13. verified ✅
```

### Short version
**Phase 1 (staff):** `frontend → backend → Bedrock → (form) → backend → db (save) → wa service → customer WhatsApp`

**Phase 2 (customer/bsya):** `bsya → backend (public API) → db (check) → verified ✅`

---

## Security per path

| Path | Protection |
|---|---|
| frontend → backend | CORS allowlist (frontend origin) |
| backend → wa service | internal `x-api-key` (`WA_GATEWAY_API_KEY`) + private network |
| **bsya → backend** (`/ext`) | **`X-API-Key`** (`EXT_API_KEYS`) + HTTPS |
| OTP | code hashed, 5-min expiry, 60s resend cooldown, max 5 attempts |

---

## Deployment (Railway)

| Service | Root dir | Notes |
|---|---|---|
| frontend | `frontend` | `NEXT_PUBLIC_API_BASE_URL` → backend |
| backend | `backend` | env: AWS, `DATABASE_URL`, CORS, `WA_*`, `EXT_API_KEYS` |
| wa service | `wa-gateway` | **Volume `/app/auth`** (WA session), scan QR at `/qr` |
| Postgres | — | `${{Postgres.DATABASE_URL}}` |

backend ↔ wa service over **private networking** (`*.railway.internal:3000`);
public traffic (frontend & bsya) over **HTTPS**.
