# TRAYCER — Plan complet du projet

> *A World Mini App that rewards verified humans for sustainable food disposal, using NFC sensing and AI waste analysis.*

## Concept

Chaque personne a un tag NFC collé sous son assiette/plateau.
Quand elle dépose son plateau sur la borne :
1. Le lecteur NFC (PN532) identifie QUI
2. La caméra RPi prend une photo
3. L'IA analyse le gaspillage
4. L'utilisateur reçoit un score + rewards dans la Mini App

---

## Prizes visés (ETHGlobal Cannes, 3-5 avril 2026)

| Track | Prize | Comment on qualifie |
|-------|-------|---------------------|
| **Best use of AgentKit** | $8,000 | L'IA waste agent est enregistrée dans AgentBook, API `/api/analyze` protégée par middleware AgentKit x402 |
| **Best use of World ID 4.0** | $8,000 | World ID comme contrainte anti-sybil sur les rewards (1 humain = 1 compte). Validation preuve **côté backend** (exigence du track). |
| **Best use of MiniKit 2.0** | $4,000 | Mini App dans World App avec Wallet Auth, Verify, Send Transaction. Contrats sur **World Chain mainnet**. |

---

## Points importants (corrections)

- **Pas de testnet pour les Mini Apps** : la doc World dit explicitement "mini apps must be developed on mainnet". Gas sponsorisé pour les users vérifiés (500 tx/jour gratuites).
- **MiniKit ne marche QUE dans World App** sur téléphone. Pour le dev, on utilise ngrok + World App.
- **World ID se teste avec le Simulateur** (simulator.worldcoin.org) dans Chrome.
- **Le RPi n'est PAS le serveur** : il envoie les données au backend (Vercel). C'est un capteur.
- **90% du projet est off-chain** : seuls les badges NFT et claims de rewards vont on-chain.

---

## Stack technique

| Couche | Techno | Pourquoi |
|--------|--------|---------|
| **Frontend + Backend** | Next.js 16 (App Router) | Template officiel World |
| **Mini App SDK** | MiniKit 2.0 (`@worldcoin/minikit-js` v1.11) | Wallet Auth, Verify, Send Transaction |
| **World ID** | IDKit (`@worldcoin/idkit` v4.0) | Vérification World ID 4.0 |
| **AgentKit** | `@worldcoin/agentkit` + x402 | Protection API IA, anti-farming |
| **Smart Contract** | Solidity + Foundry | Déployé sur **World Chain mainnet** |
| **Base de données** | Supabase | Users, deposits, scores, rewards |
| **IA (analyse déchets)** | GPT-4o Vision (dev) + LISA/UFO sur Vast.ai (démo) | Segmentation + classification des déchets |
| **Raspberry Pi** | Python 3 (pn532 + picamera2) | Lit NFC, prend photo, envoie au backend |
| **Déploiement** | Vercel | Mini App accessible via QR code dans World App |
| **Thème** | Tailwind CSS + next-themes | Dark/light mode |

---

## Hardware

### Ce qu'on a
- Raspberry Pi 4 (USB-C)
- Raspberry Pi Camera Module (nouvelle + nouveau câble)
- Carte microSD 16 Go (RPi OS Lite)
- Laptop (Windows, Node.js v20)
- Téléphone (World App installé)

### Ce qu'on a acheté (~23€)
- **OFFCUP NFC NTAG215** (20 pcs, 25mm autocollants) — 6,45€
- **Ulegqin PN532 NFC** (lot de 2, câble 4 broches inclus) — 12,99€
- **AZDelivery câble flex CSI 50cm** — ~4€

### NFC : PN532 détecté ✅
```
i2cdetect -y 1 → adresse 0x24 détecté
```

### Câblage PN532 → RPi 4 (I2C)
```
PN532          RPi 4
─────          ────────
SDA    ───→    Pin 3  (GPIO 2)
SCL    ───→    Pin 5  (GPIO 3)
VCC    ───→    Pin 4  (5V)
GND    ───→    Pin 6  (GND)

Switches sur le module : SEL0 = ON, SEL1 = OFF
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│         World App (téléphone)                        │
│  ┌─────────┐  ┌──────────────────┐                  │
│  │Wallet   │  │ World ID 4.0     │                  │
│  │Auth     │  │ Verify (unique)  │                  │
│  └────┬────┘  └────────┬─────────┘                  │
│  ┌────▼────────────────▼─────────┐                  │
│  │  Mini App UI (Traycer)        │                  │
│  │  - Score / Streak / Badges    │                  │
│  │  - Résultat dépôt             │                  │
│  │  - Leaderboard                │                  │
│  └────────────┬──────────────────┘                  │
└───────────────┼─────────────────────────────────────┘
                │ HTTPS
┌───────────────▼──────────────────────────────────────┐
│   Backend (Next.js sur Vercel)                        │
│                                                      │
│  /api/deposit     ← reçoit NFC UID + photo du RPi   │
│  /api/verify      ← vérifie preuve World ID          │
│  /api/rewards     ← gère les claims on-chain         │
│  /api/analyze     ← IA waste analysis (AgentKit)     │
└──────────────────┬───────────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
 Supabase    GPT-4o/LISA    World Chain
 (BDD)       (IA)           (on-chain)
```

---

## Structure de fichiers (créé ✅)

```
traycer/
├── src/
│   ├── app/
│   │   ├── layout.tsx              ← MiniKitProvider + ThemeProvider + BottomNav
│   │   ├── globals.css             ← Thème green dark/light
│   │   ├── page.tsx                ← Home (dashboard: score, streak, historique)
│   │   ├── onboarding/page.tsx     ← Connect + Verify + NFC bind (3 étapes)
│   │   ├── deposit/page.tsx        ← Résultat après dépôt (analyse IA)
│   │   ├── rewards/page.tsx        ← Badges + leaderboard + claim
│   │   └── api/
│   │       ├── deposit/route.ts    ← Reçoit scan NFC + photo
│   │       ├── analyze/route.ts    ← IA waste analysis (AgentKit TODO)
│   │       ├── verify/route.ts     ← World ID proof verification
│   │       └── rewards/route.ts    ← Claim rewards
│   ├── components/
│   │   ├── bottom-nav.tsx          ← Navigation bas de page
│   │   ├── theme-toggle.tsx        ← Bouton dark/light
│   │   ├── card.tsx                ← Composant Card réutilisable
│   │   ├── score-ring.tsx          ← Anneau de score animé
│   │   └── badge-item.tsx          ← Item badge (locked/unlocked)
│   └── lib/
│       ├── minikit-provider.tsx    ← MiniKit.install()
│       └── theme-provider.tsx      ← next-themes wrapper
├── .env.local                      ← APP_ID, API keys (jamais commit)
├── package.json
└── PLAN.md (ce fichier)
```

---

## Flow NFC — 2 moments différents

### Moment 1 — Onboarding (téléphone lit le tag)
```
📱 Téléphone → lit le tag NFC (NFC natif du tel)
Mini App → envoie { wallet, nfc_uid } au backend
Backend → stocke dans Supabase
→ Pas de blockchain, juste un appel HTTP
```

### Moment 2 — Dépôt quotidien (RPi lit le tag)
```
🍽️ Assiette posée sur la borne
📡 PN532 lit le tag automatiquement → UID
📷 Caméra prend la photo → image
🖥️ RPi envoie { nfc_uid, photo } au backend via WiFi
🤖 Backend → IA analyse → score calculé
📱 Mini App notifie l'user du résultat
```

---

## Ce qui est on-chain vs off-chain

| Off-chain (HTTP + Supabase) | On-chain (World Chain mainnet) |
|-----------------------------|-------------------------------|
| Wallet Auth (connexion) | Claim d'un reward |
| Scanner le tag NFC | Mint d'un badge NFT |
| Associer tag ↔ wallet | Score agrégé (optionnel) |
| Prendre la photo | |
| Analyser avec l'IA | |
| Calculer le score | |
| Leaderboard | |
| World ID Verify | |
| Notifications | |

90% off-chain. Gas sponsorisé = gratuit pour l'user. 500 tx/jour par user.

---

## Tables Supabase

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  wallet_address text unique not null,
  nfc_uid text unique,
  world_id_nullifier text unique,
  username text,
  total_score int default 0,
  streak int default 0,
  created_at timestamptz default now()
);

create table deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  nfc_uid text not null,
  photo_url text,
  waste_type text,
  waste_percent int,
  score int,
  ai_analysis jsonb,
  created_at timestamptz default now()
);

create table rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  type text not null,
  claimed boolean default false,
  tx_hash text,
  created_at timestamptz default now()
);
```

---

## Comment tester

### En développement (PC)
```
1. pnpm dev → localhost:3000
2. Chrome → tester l'UI
3. Simulateur World ID → tester Verify
4. ngrok http 3000 → exposer pour tester dans World App
```

### Sur téléphone (World App)
```
1. World App installé
2. Developer Portal → App ID → QR code
3. Scanner le QR → Mini App s'ouvre dans World App
4. Tester Wallet Auth, Verify, etc.
5. Pas besoin de publication/review pour tester
```

### Smart contracts
```
→ Déployer sur World Chain MAINNET (pas de testnet pour Mini Apps)
→ Gas ~$0.01 pour le déploiement
→ Gas $0 pour les users (sponsorisé)
→ Déployer d'abord des contrats "test", puis redéployer "prod"
```

---

## Planning

### Avant le hackathon (maintenant → 2 avril)
1. ✅ Commander le hardware
2. ✅ Installer RPi OS Lite
3. ✅ Tester le PN532 (i2cdetect OK)
4. ⏳ Tester la nouvelle caméra
5. ⏳ Écrire le script Python RPi (NFC + photo + envoi HTTP)
6. ✅ Créer compte World Developer Portal
7. ✅ Générer le projet Next.js + UI
8. ⏳ Tester Wallet Auth + Verify avec simulateur
9. ⏳ Setup Supabase

### Au hackathon (3-5 avril, 48h)
| Heures | Tâche |
|--------|-------|
| 0-4 | Setup Supabase, connecter les API routes |
| 4-8 | Wallet Auth + World ID Verify fonctionnels |
| 8-12 | IA analyse (GPT-4o) + AgentKit middleware |
| 12-16 | Smart contract, déployer sur World Chain |
| 16-20 | UI polish, animations, tester flow complet |
| 20-24 | Brancher le RPi, intégrer hardware |
| 24-30 | Fix bugs, dashboard stats live |
| 30-36 | Pitch + démo, soumettre sur ETHGlobal |

---

## Liens utiles
- [World Developer Portal](https://developer.worldcoin.org)
- [World Docs](https://docs.world.org/)
- [Mini App Docs](https://docs.world.org/mini-apps)
- [Mini App Testing](https://docs.world.org/mini-apps/quick-start/testing)
- [Mini App FAQ](https://docs.world.org/mini-apps/more/faq)
- [World ID Docs](https://docs.world.org/world-id/overview)
- [AgentKit Docs](https://docs.world.org/agents/agent-kit/integrate)
- [World Chain Deploy](https://docs.world.org/world-chain/developers/deploy)
- [Simulateur World ID](https://simulator.worldcoin.org/)
- [open-iris GitHub](https://github.com/worldcoin/open-iris)
- [LISA ReasonSeg GitHub](https://github.com/dvlab-research/LISA)
- [Vast.ai](https://vast.ai/)
- [ETHGlobal Cannes Prizes](https://ethglobal.com/events/cannes2026/prizes)
