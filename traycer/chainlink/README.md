# Traycer — Chainlink CRE × World Chain

POC : retour d'assiette → backend API → Chainlink CRE → mint ERC-1155 on-chain sur **World Chain mainnet**.

## Architecture

```
User ramène un plateau
    ↓
Backend enregistre le retour → crée un OnchainClaim si palier (1 / 3 / 7 retours)
    ↓
CRE cron trigger (pas automatique au moment du retour en dev)
    ↓
Workflow fetch GET /api/chainlink/next-claim
    ↓  { hasClaim, claimId, wallet, badgeId, totalReturns }
    ↓
encodeAbiParameters(wallet, badgeId, totalReturns)
    ↓
runtime.report() → signed report
    ↓
evmClient.writeReport() → KeystoneForwarder (World Chain)
    ↓
TraycerBadges1155.onReport() → _mint(wallet, badgeId, 1, "")
    ↓
BadgeMinted event + ERC-1155 SFT on-chain
    ↓
POST /api/chainlink/confirm-mint (marque le claim minté)
```

### Mint immédiat au retour d’assiette ?

**Non.** Le mint on-chain n’est pas déclenché par la Mini App ni par le seul `recordDeposit`. Il faut qu’une exécution **CRE** consomme la file `next-claim` :

| Environnement | Comment le mint part |
|---------------|----------------------|
| **Hackathon / dev** | Tu lances manuellement `cre workflow simulate … --broadcast` (ou un script / tâche planifiée qui le répète). |
| **Production** | Workflow CRE déployé sur le réseau Chainlink → **cron** déclenche le workflow automatiquement. |

La Mini App affiche après le retour : file d’attente NFT + message d’attente CRE ; dès que `confirm-mint` a tourné, le modal peut afficher le lien **Worldscan** (polling sur `/api/badges/onchain`).

## Badges ERC-1155

| Token ID | Nom | Condition |
|---|---|---|
| 1 | first_return | ≥1 retour |
| 2 | regular | ≥3 retours |
| 3 | committed | ≥7 retours |
| 4 | premium_claim | World ID Orb vérifié |

## Réseau

| | Valeur |
|---|---|
| Chain | **World Chain mainnet** |
| Chain name CRE | `ethereum-mainnet-worldchain-1` |
| Chain ID | 480 |
| MockForwarder (simulation) | `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` |
| KeystoneForwarder (production) | `0x98B8335d29Aca40840Ed8426dA1A0aAa8677d8D1` |
| Explorer | [worldscan.org](https://worldscan.org) |
| RPC public | `https://worldchain-mainnet.g.alchemy.com/public` |

## Fichiers

```
chainlink/
├── .env                              # Clé privée (JAMAIS commiter)
├── .gitignore
├── project.yaml                      # RPC World Chain
├── contracts/
│   └── TraycerBadges1155.sol         # ERC-1155 + CRE consumer
├── badge-workflow/
│   ├── main.ts                       # Workflow CRE
│   ├── abi/
│   │   └── TraycerBadges1155.ts      # ABI TypeScript (dans rootDir)
│   ├── config.staging.json           # Config runtime
│   ├── workflow.yaml                 # Config CRE
│   ├── tsconfig.json
│   └── package.json
└── README.md
```

## Prérequis

1. **CRE CLI** ≥ v1.0.11 — `cre version`
2. **Bun** ≥ 1.2.21 — `bun --version`
3. **Wallet EOA fundé en ETH sur World Chain mainnet**

## Setup

### 1. Installer CRE CLI + login

```bash
curl -sSfL https://smartcontract.codes/cre | bash
cre version
cre login
```

### 2. Déployer TraycerBadges1155

Ouvrir `contracts/TraycerBadges1155.sol` dans [Remix](https://remix.ethereum.org).

- Compilateur : Solidity ^0.8.26
- Réseau MetaMask : World Chain mainnet (RPC: `https://worldchain-mainnet.g.alchemy.com/public`, Chain ID: 480)
- Constructor `_forwarderAddress` :

| Environnement | Adresse |
|---|---|
| Simulation (`cre workflow simulate`) | `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` |
| Production (`cre workflow deploy`) | `0x98B8335d29Aca40840Ed8426dA1A0aAa8677d8D1` |

Pour la démo : déployer avec **MockForwarder**, puis `setForwarderAddress()` plus tard si besoin.

### 3. Configurer

**`.env`** (à la racine de `chainlink/`) :
```
CRE_ETH_PRIVATE_KEY=0xTA_CLE_PRIVEE_FUNDED_WORLDCHAIN
```

**`badge-workflow/config.staging.json`** :
```json
{
  "schedule": "*/60 * * * * *",
  "apiBaseUrl": "https://ton-ngrok.ngrok-free.dev",
  "walletToCheck": "0xTON_WALLET",
  "consumerAddress": "0xADRESSE_CONTRAT_DEPLOYE",
  "chainName": "ethereum-mainnet-worldchain-1",
  "gasLimit": "500000"
}
```

### 4. Installer les deps

```bash
bun install --cwd ./badge-workflow
```

### 5. Simuler

```bash
cre workflow simulate badge-workflow --broadcast --target staging-settings
```

Sélectionner `cron-trigger`.

Résultat attendu :
```
[USER LOG] Fetching next mintable claim...
[USER LOG] Claim oc_xxxx: wallet=0x... badgeId=3 returns=10
[USER LOG] Generating signed report...
[USER LOG] Writing report to 0x... on World Chain...
[USER LOG] Badge #3 minted! tx: 0xabc...
[USER LOG] https://worldscan.org/tx/0xabc...
[USER LOG] Confirming mint on backend...
[USER LOG] Claim oc_xxxx confirmed as minted
```

### 6. Vérifier on-chain

Sur [worldscan.org](https://worldscan.org) :
1. Chercher le txHash
2. Event `BadgeMinted(wallet, badgeId, totalReturns)`
3. Contrat → Read → `balanceOf(wallet, 2)` → doit retourner ≥ 1

### 7. Re-tester (reset des claims)

Pour relancer une simulation avec la même adresse sans redéployer :

```bash
curl -X POST https://ton-ngrok.ngrok-free.dev/api/chainlink/reset-claims \
  -H "Content-Type: application/json" \
  -d '{"wallet": "0xa52817565072b10eb84ba0e6f49ac167dfdb0dd1"}'
```

Ou sans `wallet` pour reset tous les claims :

```bash
curl -X POST https://ton-ngrok.ngrok-free.dev/api/chainlink/reset-claims
```

Puis relancer `cre workflow simulate ...` normalement.

> **Note :** `reset-claims` est désactivé en `NODE_ENV=production`.

## Comportement des badges on-chain

- Un badge on-chain **n'est PAS minté à chaque retour d'assiette**.
- Un `OnchainClaim` est créé **uniquement** quand l'utilisateur franchit un seuil :
  - **1 retour** → badge #1 (first_return)
  - **3 retours** → badge #2 (regular)
  - **7 retours** → badge #3 (committed)
  - **World ID Orb** → badge #4 (premium_claim) — voir ci-dessous
- CRE consomme les claims en attente un par un via `next-claim` → `mint on-chain` → `confirm-mint`.
- Après confirmation, le claim est marqué `minted=true` et n'est plus reproposé.
- L'anti-double-mint on-chain (contrat) n'est **pas encore actif** — seul le backend empêche de reproposer un claim déjà minté.

### Badge #4 — Premium Claim (World ID)

Le badge #4 est réservé aux utilisateurs **vérifiés World ID Orb**. Le claim se fait via `/api/chainlink/premium-claim`.

**Production :**
1. L'utilisateur clique "Claim" → MiniKit `verify` (Orb) → preuve envoyée au backend
2. Backend vérifie via `verifyCloudProof` + vérifie le `nullifier_hash` (anti-doublon)
3. Un `OnchainClaim` badge #4 est créé → CRE le mint on-chain

**Demo mode** (`WORLD_ID_DEMO_BYPASS=true` dans `.env.local`) :
1. L'utilisateur clique "Claim" → **pas de preuve World ID réelle**
2. Backend crée un nullifier synthétique + vérifie que le wallet n'a pas déjà claimé
3. Un `OnchainClaim` badge #4 est créé → CRE le mint on-chain
4. Le résultat est identique côté chaîne

**Guards de sécurité :**
- `WORLD_ID_DEMO_BYPASS` est **ignoré** si `NODE_ENV === "production"`
- En production sans ce flag, un proof World ID valide est **obligatoire**
- Un wallet ne peut claim badge #4 **qu'une seule fois** (même en demo)
- Le code de demo est clairement identifié dans les logs (`[PREMIUM-CLAIM] (DEMO)`)

**Variables d'environnement :**
```bash
# .env.local (jamais commité)
WORLD_ID_DEMO_BYPASS=true   # Activer le bypass demo (dev/hackathon uniquement)
APP_ID=app_xxx               # World ID App ID (requis en prod)
```

## Endpoints backend

### GET /api/chainlink/next-claim

Retourne le prochain claim on-chain non-minté (tous wallets confondus).

```json
{
  "hasClaim": true,
  "claimId": "oc_abc12345",
  "wallet": "0x...",
  "eligible": true,
  "badgeId": 3,
  "totalReturns": 10
}
```

### POST /api/chainlink/confirm-mint

Marque un claim comme minté après un mint on-chain réussi.

Headers : `x-cre-secret` (si `CRE_WEBHOOK_SECRET` est configuré côté backend).

```json
// Request body
{ "claimId": "oc_abc12345", "txHash": "0x..." }

// Response
{ "success": true, "claimId": "oc_abc12345", "txHash": "0x..." }
```

### POST /api/chainlink/premium-claim

Crée un `OnchainClaim` pour badge #4 (premium World ID).

```json
// Request body
{ "wallet": "0x...", "proof": { /* ISuccessResult ou omis en demo */ } }

// Response
{ "success": true, "claimId": "oc_xxx", "badgeId": 4, "demo": true }
```

### POST /api/chainlink/reset-claims (dev only)

Reset les claims mintés pour permettre de retester.

```json
// Request body (optionnel)
{ "wallet": "0x..." }

// Response
{ "success": true, "resetCount": 3 }
```

### GET /api/badges/onchain?wallet=0x...

Retourne les badges on-chain mintés pour un wallet (affiché dans `/rewards`).

```json
{
  "badges": [
    {
      "id": "oc_abc12345",
      "badgeId": 3,
      "claimType": "committed_badge",
      "txHash": "0x...",
      "mintedAt": 1743559691000,
      "source": "committed"
    }
  ]
}
```

### GET /api/chainlink/verify?wallet=0x... (legacy)

Endpoint d'éligibilité directe (non utilisé par le nouveau workflow, conservé pour debug).

## Ce qui n'est PAS touché

- La Mini App fonctionne normalement (Wallet Auth, Verify, pickup/return)
- Pas de `sendTransaction` dans la Mini App
- Le VLM n'est pas branché
- Le mint passe uniquement par CRE
- Pas d'anti-double-mint on-chain (prévu plus tard)
