# Verifeed

**Every meal counts.** Verifeed turns everyday meals into real impact — from your campus cafeteria to a relief camp.

## What is Verifeed?

Verifeed is a platform that tracks and rewards food-related actions using NFC hardware, AI vision, and blockchain identity.

**In a cafeteria:** grab a tray, eat, return it. A station reads the NFC tag, takes a photo, and an AI analyzes what's left. You earn points and on-chain achievement badges.

**In a disaster zone or food bank:** people who've lost everything still have their identity. With World ID, they prove they're a real person — anonymously — and access food distribution. No paperwork, no fraud, no stigma.

## How it works

```
User                    Station (RPi)              Backend                    Blockchain
 │                         │                          │                          │
 ├── Scan QR ──────────────┤                          │                          │
 │                         ├── NFC tag read ──────────┤                          │
 │                         │                          ├── Link tray to wallet    │
 │                         │                          │                          │
 │   ... eat ...           │                          │                          │
 │                         │                          │                          │
 ├── "Return tray" ────────┤                          │                          │
 │                         ├── NFC detected ──────────┤                          │
 │                         ├── Photo captured ────────┤                          │
 │                         │                          ├── VLM analysis (Gemini)  │
 │                         │                          ├── Score computed         │
 │                         │                          ├── Badge eligible? ──────►│
 │                         │                          │   Chainlink CRE ────────►├── ERC-1155 mint
 │                         │                          │                          │   (World Chain)
 │◄── Points + NFT badge ──┤                          │                          │
```

## Tech stack

| Layer | Technology | Role |
|-------|-----------|------|
| **Identity** | World ID (MiniKit) | Proof of humanity, anonymous verification, sybil resistance |
| **On-chain** | World Chain + ERC-1155 | Gasless NFT badge minting |
| **Oracle** | Chainlink CRE | Trustless off-chain computation → on-chain mint |
| **AI** | Google Gemini (VLM) | Tray photo analysis — food items, waste estimation |
| **Backend** | Next.js 16 (App Router) | API routes, session management, data store |
| **Hardware** | Raspberry Pi + PN532 NFC + Camera | Physical station — QR scanning, NFC reading, photo capture |
| **Frontend** | React 19, Tailwind CSS 4 | Mini app UI inside World App |

## Badge system

| ID | Badge | Condition |
|----|-------|-----------|
| 1 | **First Return** | 1st tray returned |
| 2 | **Regular** | 3+ returns |
| 3 | **Committed** | 7+ returns |
| 4 | **Premium** | World ID Orb verified |

Badges are ERC-1155 tokens minted on **World Chain** via **Chainlink CRE**. The backend cannot fake eligibility — CRE independently verifies the claim and triggers the mint.

**Contract:** [`TraycerBadges1155.sol`](chainlink/contracts/TraycerBadges1155.sol) — deployed at `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1`

## VLM analysis

When a tray is returned, the station captures a photo. Gemini analyzes it and returns structured JSON:

```json
{
  "items": [
    {
      "name": "grilled chicken",
      "category": "protein",
      "estimated_percent_left": 15,
      "consumption_state": "mostly_eaten",
      "confidence": 0.91
    }
  ],
  "tray_completeness": "partial",
  "overall_confidence": 0.88,
  "notes": "Main dish mostly eaten, side salad untouched."
}
```

The model is instructed to ignore negligible leftovers (crumbs, sauce traces, isolated grains). Only meaningful food items are reported.

## Project structure

```
traycer/
├── src/
│   ├── app/              # Next.js pages + API routes
│   ├── components/       # React components (modals, cards, nav)
│   └── lib/              # Core logic (analyzer, sessions, store, auth)
├── chainlink/
│   ├── contracts/        # TraycerBadges1155.sol (ERC-1155)
│   └── badge-workflow/   # CRE workflow (TypeScript)
├── rpi/                  # Raspberry Pi station (Python)
├── vlm-service/          # Optional standalone VLM service (FastAPI)
└── data/                 # Persisted store (auto-generated)
```

## Quick start

### 1. Backend (Next.js)

```bash
cd traycer
npm install
cp .env.example .env.local   # fill in your keys
npm run dev                   # http://localhost:3000
```

**Required environment variables:**

| Variable | Description |
|----------|-------------|
| `APP_ID` | World ID app ID (`app_...`) |
| `NEXT_PUBLIC_APP_ID` | Same, exposed to frontend |
| `STATION_SECRET` | Shared secret with RPi station |
| `ANALYZER_PROVIDER` | `gemini` (default) / `vlm` / `mock` |
| `GEMINI_API_KEY` | Google Gemini API key |
| `GEMINI_MODEL` | Model name (default: `gemini-3-pro-preview`) |

### 2. Station (Raspberry Pi)

```bash
cd traycer/rpi
pip install -r requirements.txt
python main.py --qr camera
```

Requires: PN532 NFC reader (I2C), Pi Camera Module, Python 3.11+

### 3. Chainlink CRE (optional)

```bash
cd traycer/chainlink/badge-workflow
npm install
cre workflow simulate --config config.staging.json
```

See [`chainlink/README.md`](chainlink/README.md) for full CRE setup.

## World ID integration

Verifeed uses World ID in two ways:

- **Authentication**: SIWE (Sign-In with Ethereum) via MiniKit `walletAuth` — every user is a verified World App user
- **Premium badge**: Orb-level verification proves unique humanity — one premium badge per person, enforced by nullifier hash

The app runs as a **Mini App inside World App**, accessible to all World App users.

## Chainlink CRE integration

Chainlink Compute Runtime Environment handles the bridge between off-chain data and on-chain minting:

1. Backend queues a claim when a user hits a badge milestone
2. CRE workflow fetches the next pending claim from the backend
3. CRE verifies eligibility independently
4. CRE calls `onReport()` on the ERC-1155 contract → badge is minted
5. Backend receives the txHash via callback and marks the claim as minted

This ensures **no single party controls badge issuance** — even if the backend is compromised, CRE validates the data before minting.

## Use cases

### Campus cafeteria
Gamified food tracking — students earn points and NFT badges for returning trays. AI analyzes food waste patterns. Community goals drive engagement.

### Food bank
Verified distribution — World ID ensures each person accesses their share without paperwork. Zero-knowledge proof means anonymity is preserved. No one needs to prove their situation with documents.

### Disaster relief
When people have lost everything, their identity opens doors. World ID provides access to food aid without requiring physical documents, phones, or bank accounts.

## Team

Built at [ETH Cannes 2026](https://ethcannes.com/).

## License

MIT
