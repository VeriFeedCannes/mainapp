# Traycer — Guide technique & préparation soutenance

> Document technique, pédagogique et orienté soutenance hackathon.
> Basé sur le code réel du projet au 3 avril 2026.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Structure du code](#2-structure-du-code)
3. [Flow principal détaillé](#3-flow-principal-détaillé)
4. [Explication technique World](#4-explication-technique-world)
5. [Explication technique Chainlink](#5-explication-technique-chainlink)
6. [Explication smart contract / Solidity](#6-explication-smart-contract--solidity)
7. [Commandes utiles](#7-commandes-utiles)
8. [Variables d'environnement](#8-variables-denvironnement)
9. [Sécurité / hygiène technique](#9-sécurité--hygiène-technique)
10. [Démo hackathon](#10-démo-hackathon)
11. [Préparation jury / Q&A](#11-préparation-jury--qa)
12. [Justification des choix technos](#12-justification-des-choix-technos)
13. [Ce qu'il faut améliorer ensuite](#13-ce-quil-faut-améliorer-ensuite)
14. [Pitchs rapides](#14-pitchs-rapides)

---

## 1. Vue d'ensemble

### But produit

Traycer est une Mini App World qui incite les étudiants à rendre leur plateau-repas au restaurant universitaire. L'utilisateur rend son plateau → une photo est prise et analysée → il gagne des points et des badges on-chain (ERC-1155 sur World Chain) → il peut échanger un badge contre un coupon café.

### Flow utilisateur principal

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ World App   │────▶│  Borne RPi   │────▶│  Backend Next.js │
│ (Mini App)  │ QR  │  NFC + Cam   │ API │  (store.json)    │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                  │ trigger
                                         ┌───────▼────────┐
                                         │  Chainlink CRE │
                                         │  (simulate)    │
                                         └───────┬────────┘
                                                 │ writeReport
                                         ┌───────▼────────┐
                                         │  World Chain   │
                                         │  ERC-1155      │
                                         │  (mainnet 480) │
                                         └────────────────┘
```

### Les briques du système

| Brique | Rôle | Techno |
|--------|------|--------|
| **Mini App World** | Interface utilisateur dans World App | Next.js + MiniKit |
| **Backend Next.js** | API REST, logique métier, store | Next.js API routes |
| **Store local** | Persistance JSON fichier | `data/store.json` |
| **Borne Raspberry Pi** | Station physique (QR + NFC + caméra) | Python + libcamera + PN532 |
| **Sessions QR** | Authentification borne ↔ app | Sessions in-memory (globalThis) |
| **NFC** | Identification physique du plateau | PN532 sur RPi |
| **Analyse image** | Détection des aliments sur le plateau | Mock provider (futur : VLM Qwen) |
| **Chainlink CRE** | Orchestration off-chain → on-chain | CRE SDK TypeScript |
| **Smart contract** | Badges ERC-1155 (mint/burn) | Solidity 0.8.26, World Chain mainnet |

### Flow off-chain vs on-chain

**Off-chain (backend + borne) :**
- Connexion wallet (SIWE via MiniKit)
- Session QR → scan borne → NFC plateau
- Photo + analyse (mock ou VLM)
- Score, badges app, streaks, leaderboard
- Création d'un `OnchainClaim` quand un palier est atteint (1, 3, 7 retours)

**On-chain (CRE + World Chain) :**
- CRE lit `next-claim` → encode les données → signe un report → `writeReport`
- Le Forwarder Chainlink appelle `onReport` sur le contrat ERC-1155
- Le contrat mint 1 badge SFT au wallet de l'utilisateur
- CRE confirme au backend via `confirm-mint`
- L'utilisateur peut `redeemBadge(1)` via `sendTransaction` (burn on-chain)

---

## 2. Structure du code

### Pages (`src/app/`)

| Fichier | Rôle |
|---------|------|
| `page.tsx` | **Accueil** : landing (Connect with World), dashboard (score, streak, "Grab a tray", "Return tray"), community stats |
| `rewards/page.tsx` | **Rewards** : hero card "First Return" avec redeem Coffee Coupon, liste badges (off-chain + on-chain), leaderboard, Premium claim World ID |
| `deposit/page.tsx` | **Détail retour** : photo, score ring, analyse item-par-item, historique |
| `iris/page.tsx` | **Iris** : stub pour future inscription iris (non fonctionnel) |
| `layout.tsx` | Layout global : Geist font, ThemeProvider, MiniKitProvider, AuthProvider, BottomNav |

### Endpoints API (`src/app/api/`)

#### Auth & sessions
| Route | Méthode | Rôle |
|-------|---------|------|
| `/api/nonce` | GET | Génère un nonce SIWE, stocke en cookie httpOnly |
| `/api/auth/complete-siwe` | POST | Vérifie la signature SIWE de MiniKit contre le nonce |
| `/api/session/create` | POST | Crée une session QR pickup/enroll/claim |
| `/api/session/status` | GET | Polling : session active + plate pour un wallet |
| `/api/session/validate` | POST | La borne valide le QR scanné (→ status `scanned`) |
| `/api/session/complete` | POST | La borne complète la session (→ association NFC plateau) |

#### Dépôt & retour
| Route | Méthode | Rôle |
|-------|---------|------|
| `/api/deposit` | POST | Callback borne : analyse photo, score, enregistre retour, peut trigger CRE |
| `/api/deposit/photo` | GET | Sert la photo du plateau (base64 → JPEG) |
| `/api/return/signal` | GET/POST | Coordonne le flow retour entre borne et app (ready/capture/done) |
| `/api/plate/check` | GET | La borne vérifie si un tag NFC est associé |
| `/api/analyze` | POST | Analyse d'image seule (sans enregistrer de dépôt) |

#### Données utilisateur
| Route | Méthode | Rôle |
|-------|---------|------|
| `/api/user` | GET | User complet + dernier dépôt + community + leaderboard |
| `/api/user/deposits` | GET | Historique des dépôts d'un wallet |

#### Chainlink / On-chain
| Route | Méthode | Rôle |
|-------|---------|------|
| `/api/chainlink/next-claim` | GET | Prochain claim on-chain non minté (appelé par CRE) |
| `/api/chainlink/confirm-mint` | POST | CRE confirme qu'un badge a été minté (txHash) |
| `/api/chainlink/pending` | GET | Claims en attente de mint pour un wallet |
| `/api/chainlink/verify` | GET | Legacy : éligibilité par nombre de retours |
| `/api/chainlink/premium-claim` | POST | Claim badge #4 avec World ID (ou bypass démo) |
| `/api/chainlink/reset-claims` | POST | DEV : reset les claims mintés |

#### Badges & coupons
| Route | Méthode | Rôle |
|-------|---------|------|
| `/api/badges/onchain` | GET | Badges on-chain mintés pour un wallet |
| `/api/badges/redeem` | POST | Enregistre un redeem (coupon café) après burn on-chain |
| `/api/badges/redemptions` | GET | Historique des redemptions d'un wallet |
| `/api/badges/reset-redemptions` | POST | DEV : reset les redemptions |

#### Dev / Reset
| Route | Méthode | Rôle |
|-------|---------|------|
| `/api/dev/reset-demo` | POST | Reset complet pour un wallet (user + claims + sessions + plates) |

### Librairies (`src/lib/`)

| Fichier | Rôle |
|---------|------|
| `store.ts` | **Cœur du backend** : toutes les données (users, deposits, claims, onchainClaims, redemptions, community), persistance JSON, logique badges/scores/streaks, ONCHAIN_BADGE_MAP |
| `sessions.ts` | Sessions QR, associations plateau NFC, signaux retour. Survit aux hot-reloads via `globalThis` |
| `analyzer.ts` | Analyse d'image plateau : provider mock (données fixes) ou Qwen (VLM réel). Score = 10 pts fixe |
| `auth-context.tsx` | Contexte React auth côté client : wallet, username, plate. Persisté en localStorage |
| `minikit-provider.tsx` | Initialisation MiniKit (`MiniKit.install`), expose `isReady` |
| `theme-provider.tsx` | Wrapper `next-themes` (dark/light/system) |
| `cre-trigger.ts` | Spawn `cre workflow simulate` en background. Debounce + retry. Non-prod uniquement |

### Composants (`src/components/`)

| Composant | Rôle |
|-----------|------|
| `pickup-modal.tsx` | Modal "Grab a tray" : QR → scan station → NFC → done. Recrée la session si elle disparaît |
| `return-modal.tsx` | Modal "Return tray" : signal borne → capture photo → score → confettis → statut on-chain |
| `badge-item.tsx` | Ligne de badge avec "Earned" (lien tx si on-chain) ou "🔒" |
| `qr-display.tsx` | Affiche un QR code SVG à partir d'un payload JSON |
| `bottom-nav.tsx` | Navigation fixe en bas : Home, Rewards, Iris, Profile |
| `card.tsx` | Composant Card réutilisable (Card, CardTitle, etc.) |
| `score-ring.tsx` | Anneau circulaire SVG pour le score |
| `theme-toggle.tsx` | Bouton soleil/lune pour changer de thème |

### Chainlink (`chainlink/`)

| Fichier | Rôle |
|---------|------|
| `badge-workflow/main.ts` | **Workflow CRE** : cron → fetch next-claim → encode → report → writeReport → confirm-mint |
| `badge-workflow/workflow.yaml` | Configuration CRE : nom du workflow, chemins des fichiers |
| `badge-workflow/config.staging.json` | Config staging : schedule, apiBaseUrl (ngrok), consumerAddress, chainName, gasLimit |
| `badge-workflow/abi/TraycerBadges1155.ts` | ABI TypeScript du contrat (onReport, balanceOf, redeemBadge, events) |
| `contracts/TraycerBadges1155.sol` | **Contrat Solidity** : ERC-1155 + CRE consumer + redeem + resetWallet |
| `.env` | `CRE_ETH_PRIVATE_KEY` (clé privée du wallet déployeur) |
| `project.yaml` | Configuration RPC pour CRE (World Chain via Alchemy) |

---

## 3. Flow principal détaillé

### Version développeur (étape par étape)

**Étape 1 — Connexion**
- L'utilisateur ouvre Traycer dans World App
- `MiniKit.install()` s'initialise
- Clic "Connect with World" → `MiniKit.commandsAsync.walletAuth()` → SIWE
- Le backend vérifie la signature (`/api/auth/complete-siwe`)
- Le wallet est stocké dans `localStorage` (clé `traycer_auth`)
- En dev hors World App : "Dev Connect" crée un wallet fictif `0xDEV1234...`

**Étape 2 — Grab a tray (pickup)**
- L'utilisateur clique "Grab a tray" → modal pickup s'ouvre
- Le frontend POST `/api/session/create` → crée une session `active` avec un ID unique
- Un QR code est affiché (contient `{ s: session_id, t: station_id, a: "pickup", e: expiry }`)
- Le frontend poll `/api/session/status` toutes les 1.5s

**Étape 3 — Borne scanne le QR**
- Le script Python sur le RPi détecte le QR via la caméra
- Il appelle POST `/api/session/validate` avec `x-station-secret`
- La session passe en status `scanned`
- Le frontend détecte le changement → affiche "QR confirmed, place tray on NFC reader"

**Étape 4 — NFC**
- L'utilisateur pose son plateau sur le lecteur NFC (PN532)
- Le RPi lit le tag UID (ex: `04:51:9D:60:46:02:89`)
- Il appelle POST `/api/session/complete` avec `nfc_uid`
- Le backend crée une `PlateAssociation` (tag ↔ wallet)
- Le frontend détecte `plate` dans le polling → affiche "Tray linked!"

**Étape 5 — Retour du plateau**
- L'utilisateur a maintenant un plateau associé
- Le dashboard affiche "Return tray" au lieu de "Grab a tray"
- Clic → modal return s'ouvre
- Le RPi détecte le tag NFC → POST `/api/return/signal` action `ready`
- Le frontend poll le signal → affiche "Place tray, taking photo..."

**Étape 6 — Photo + analyse + dépôt**
- Le RPi prend une photo du plateau
- Il POST `/api/deposit` avec `nfc_uid` + `photo_base64`
- Le backend :
  1. Retrouve le wallet via l'association NFC
  2. Lance `analyzeImage()` (mock ou VLM)
  3. Calcule le score (fixe : 10 pts)
  4. Appelle `recordDeposit()` qui :
     - Met à jour user (score, returns, streaks, badges)
     - Vérifie les paliers `ONCHAIN_BADGE_MAP` (1, 3, 7 retours)
     - Si un palier est atteint → crée un `OnchainClaim`
  5. Si un claim pending existe → `triggerCreSimulation()`
  6. Supprime l'association NFC (le plateau est libre)

**Étape 7 — Mint badge via CRE**
- `triggerCreSimulation()` spawn `cre workflow simulate ... --broadcast`
- Le workflow CRE :
  1. GET `/api/chainlink/next-claim` → récupère le prochain claim non minté
  2. Encode `(wallet, badgeId, totalReturns)` en ABI
  3. `runtime.report()` → signe le report
  4. `evmClient.writeReport()` → envoie au Forwarder → `onReport()` sur le contrat
  5. Le contrat mint 1 badge ERC-1155 au wallet
  6. POST `/api/chainlink/confirm-mint` → marque le claim comme `minted` avec le txHash
- Le frontend poll `/api/badges/onchain` → détecte le nouveau badge minté

**Étape 8 — Redeem (Coffee Coupon)**
- Le badge #1 "First Return" est affiché dans la hero card
- L'utilisateur clique "Redeem for Coffee Coupon"
- `MiniKit.commandsAsync.sendTransaction()` appelle `redeemBadge(1)` sur le contrat
- Le contrat vérifie `balanceOf(sender, 1) > 0` puis `_burn`
- Le frontend POST `/api/badges/redeem` pour enregistrer la redemption
- L'UI affiche "Coffee coupon claimed" avec un code promo aléatoire

### Version jury (résumé)

> L'utilisateur se connecte avec World App, prend un plateau à la borne (QR + NFC), mange, repose son plateau. La borne prend une photo, le backend analyse le contenu et enregistre le retour. Quand un palier est atteint, Chainlink CRE orchestre automatiquement le mint d'un badge ERC-1155 sur World Chain. L'utilisateur peut ensuite échanger ce badge contre un coupon café via une transaction on-chain initiée depuis World App.

---

## 4. Explication technique World

### Pourquoi World ?

World fournit trois choses distinctes que Traycer utilise :

**1. Wallet Auth (connexion)**
- `walletAuth()` via MiniKit : l'utilisateur se connecte avec son wallet World
- Le backend vérifie la signature SIWE
- C'est le flow recommandé par World pour l'authentification dans les Mini Apps
- Avantage : pas besoin de gérer des comptes email/password, l'identité est le wallet

**2. World ID (unicité / proof-of-human)**
- Utilisé pour le **premium claim** (badge #4)
- `MiniKit.commandsAsync.verify()` avec niveau Orb
- Le backend vérifie via `verifyCloudProof`
- Le `nullifier_hash` empêche un même humain de claim deux fois
- En mode démo : bypass configurable via `WORLD_ID_DEMO_BYPASS=true`

**3. sendTransaction (action on-chain côté user)**
- Utilisé pour le **redeem** (burn du badge → coupon café)
- `MiniKit.commandsAsync.sendTransaction()` appelle directement le contrat
- Gas sponsorisé par World App (Account Abstraction)
- L'utilisateur n'a pas besoin d'ETH
- Le contrat doit être whitelisté dans le Developer Portal ("Contract Entrypoints")

### Ce que World apporte vs ne apporte pas

| World apporte | World n'apporte pas |
|---------------|---------------------|
| Identité wallet sécurisée | La vérité des données backend |
| Proof-of-human (World ID) | L'orchestration on-chain (c'est CRE) |
| Transaction sponsorisée (AA) | La logique métier (c'est le backend) |
| Distribution via World App | Le VLM / analyse d'image |

### Conformité tracks World

- **MiniKit** : Mini App complète avec walletAuth, verify, sendTransaction
- **World ID 4.0** : utilisé pour le premium claim avec nullifier_hash
- **World Chain** : contrat déployé sur World Chain mainnet (chain ID 480)
- **Meaningful integration** : chaque commande MiniKit a un rôle produit réel

### Déjà implémenté vs démo vs futur

| Feature | Statut |
|---------|--------|
| walletAuth | ✅ Implémenté + fonctionnel en prod |
| World ID verify (premium claim) | ✅ Implémenté, bypass démo disponible |
| sendTransaction (redeem) | ✅ Implémenté, fonctionnel avec Contract Entrypoints |
| Dev mode hors World App | ✅ Simule wallet + bypass verify |

---

## 5. Explication technique Chainlink

### Qu'est-ce que CRE dans ce projet ?

CRE (Chainlink Runtime Environment) est la couche d'orchestration off-chain → on-chain. Dans Traycer, CRE :
1. Lit les données du backend (quel badge minter, pour quel wallet)
2. Encode les données dans un format signé (report)
3. Écrit le report on-chain via le Forwarder Chainlink
4. Confirme au backend que le mint est fait

CRE sert de **pont de confiance** entre le backend centralisé et la blockchain. En production, il tournerait sur un réseau décentralisé d'oracles (DON).

### `simulate --broadcast` vs workflow déployé

| | Simulate | Déployé |
|---|---|---|
| Exécution | Sur ta machine locale | Sur le DON Chainlink |
| Transaction | Vraie tx on-chain (avec `--broadcast`) | Vraie tx on-chain |
| Forwarder | MockForwarder (`0x6E9E...`) | KeystoneForwarder (prod) |
| Sécurité | Ta clé privée locale | Clés gérées par le DON |
| Trigger | Manuel ou spawn depuis le serveur | Cron automatique |

**Pour le hackathon** : on reste en `simulate --broadcast` ce qui est explicitement accepté par Chainlink ("Demonstrate a successful simulation via the CRE CLI").

### Que fait le Forwarder ?

Le Forwarder est un contrat Chainlink intermédiaire. CRE envoie le report signé au Forwarder, qui le relaie au contrat consommateur (`TraycerBadges1155.onReport`). En mode simulation, c'est le MockForwarder (`0x6E9E...`). Le contrat vérifie que `msg.sender == s_forwarderAddress` (ou accepte tout si `address(0)`).

### Ce que CRE sécurise vs ne sécurise pas

| CRE sécurise | CRE ne sécurise pas |
|--------------|---------------------|
| L'intégrité du report (données signées) | La vérité des données sources (le backend pourrait mentir) |
| Le consensus entre nœuds (en prod) | La qualité de l'analyse VLM |
| L'écriture on-chain vérifiable | Les données hors-chaîne |
| L'orchestration automatique | Le contenu du store.json |

### Honnêteté : ce qu'on montre au hackathon

- On montre une **simulation CRE qui écrit réellement on-chain** via `--broadcast`
- Le workflow est **complet** : fetch → report → write → confirm
- Le report est **réellement signé** par le SDK CRE
- La transaction **se retrouve réellement** sur Worldscan
- Ce qui manque pour la prod : déploiement sur le DON (pas d'accès deploy pendant le hackathon, mais Chainlink propose de le faire pour les équipes)

---

## 6. Explication smart contract / Solidity

### Pourquoi ERC-1155 ?

ERC-1155 permet de gérer **plusieurs types de badges** dans un seul contrat. Chaque `badgeId` est un type de badge différent. C'est plus efficace qu'un ERC-721 par badge et plus flexible qu'un ERC-20.

### Badge IDs

| ID | Nom | Condition | Source |
|----|-----|-----------|--------|
| 1 | First Return | 1er retour de plateau | CRE auto-mint |
| 2 | Regular | ≥ 3 retours | CRE auto-mint |
| 3 | Committed | ≥ 7 retours | CRE auto-mint |
| 4 | Premium | World ID Orb vérifié | CRE via premium-claim |

### Fonctions du contrat

**`onReport(bytes metadata, bytes report)`**
- Point d'entrée CRE. Appelé par le Forwarder.
- Vérifie que `msg.sender == s_forwarderAddress` (sauf si `address(0)`)
- Décode le report : `(wallet, badgeId, totalReturns)`
- Mint 1 exemplaire du badge au wallet
- Émet `BadgeMinted`

**`redeemBadge(uint256 badgeId)`**
- Appelé par l'utilisateur via `sendTransaction`
- Vérifie que `balanceOf(msg.sender, badgeId) > 0`
- Burn 1 exemplaire du badge
- Émet `BadgeRedeemed`
- C'est le mécanisme "badge → coupon café"

**`adminMint(address to, uint256 badgeId, uint256 amount)`**
- Owner only. Pour tests manuels.

**`resetWallet(address wallet)`**
- Owner only. Burn tous les badges (1-4) d'un wallet.
- Utile pour reseter la démo.

**`setForwarderAddress(address)`**
- Owner only. Change l'adresse du Forwarder autorisé.

### Pourquoi le contrat est volontairement simple

Pas d'anti-double-mint on-chain (on veut pouvoir retester facilement), pas de logique métier complexe. Le contrat est un **récepteur passif** : il fait confiance au report CRE pour les données. La vérification métier est côté backend + CRE.

---

## 7. Commandes utiles

### Dev normal

```bash
# Lancer le frontend + backend
cd traycer
npm run dev

# Lancer ngrok (expose le serveur pour la borne + CRE)
ngrok http 3000

# Mettre à jour l'URL ngrok dans config.staging.json → apiBaseUrl
```

### Démo

```bash
# Reset complet un wallet (backend)
curl -X POST http://localhost:3000/api/dev/reset-demo \
  -H "Content-Type: application/json" \
  -d '{"wallet":"0xa52817565072b10eb84ba0e6f49ac167dfdb0dd1"}'

# Reset on-chain (dans Remix sur le contrat)
# Appeler resetWallet(0xa52817565072b10eb84ba0e6f49ac167dfdb0dd1)

# Lancer la borne RPi
cd ~/rpi && python main.py
```

### Chainlink CRE

```bash
# Lancer un workflow manuellement
cd traycer/chainlink
cre workflow simulate badge-workflow --broadcast --target staging-settings

# Avec mode non-interactif (ce que fait le serveur)
cre workflow simulate badge-workflow --broadcast --target staging-settings --non-interactive --trigger-index 0

# Vérifier la compilation seule
cre workflow simulate badge-workflow --target staging-settings
```

### Debug

```bash
# Vérifier les claims en attente
curl http://localhost:3000/api/chainlink/next-claim

# Vérifier les badges mintés d'un wallet
curl "http://localhost:3000/api/badges/onchain?wallet=0xa528..."

# Vérifier les redemptions
curl "http://localhost:3000/api/badges/redemptions?wallet=0xa528..."

# Vérifier le user complet
curl "http://localhost:3000/api/user?wallet=0xa528..."

# Reset seulement les claims (sans toucher au user)
curl -X POST http://localhost:3000/api/chainlink/reset-claims \
  -H "Content-Type: application/json" -d '{"wallet":"0xa528..."}'
```

### Vérifier on-chain

- **Worldscan** : `https://worldscan.org/address/<wallet>`
- **Balance badge** : Sur le contrat → Read → `balanceOf(wallet, badgeId)`
- **Transactions** : `https://worldscan.org/tx/<txHash>`

---

## 8. Variables d'environnement

### Frontend / Backend (`traycer/.env.local`)

| Variable | Rôle | Sensible ? | Optionnel ? |
|----------|------|------------|-------------|
| `NEXT_PUBLIC_APP_ID` | ID de l'app World (Developer Portal) | Non | Non |
| `APP_ID` | Même ID, côté serveur pour `verifyCloudProof` | Non | Non |
| `NEXT_PUBLIC_BADGE_CONTRACT` | Adresse du contrat ERC-1155 déployé | Non | Oui (fallback hardcodé) |
| `STATION_SECRET` | Secret partagé avec la borne RPi | **Oui** | Non (default: `dev-station-secret`) |
| `ANALYZER_PROVIDER` | `mock` ou `qwen` | Non | Oui (default: `mock`) |
| `VLM_SERVICE_URL` | URL du service VLM (si `qwen`) | Non | Oui |
| `CRE_WEBHOOK_SECRET` | Secret pour `confirm-mint` (header `x-cre-secret`) | **Oui** | Oui (vide = pas de vérification) |
| `WORLD_ID_DEMO_BYPASS` | `true` pour bypasser World ID en dev | Non | Oui |

### Chainlink CRE (`traycer/chainlink/.env`)

| Variable | Rôle | Sensible ? |
|----------|------|------------|
| `CRE_ETH_PRIVATE_KEY` | Clé privée du wallet qui signe les tx CRE | **TRÈS SENSIBLE** — ne jamais commit |

### Config CRE (`config.staging.json`)

| Champ | Rôle |
|-------|------|
| `schedule` | Fréquence du cron CRE |
| `apiBaseUrl` | URL ngrok du backend |
| `consumerAddress` | Adresse du contrat ERC-1155 sur World Chain |
| `chainName` | `ethereum-mainnet-worldchain-1` |
| `gasLimit` | Limite de gas pour writeReport |
| `creWebhookSecret` | Secret partagé pour confirm-mint |

---

## 9. Sécurité / hygiène technique

### Acceptable pour un hackathon

- Store JSON local (pas de BDD)
- Sessions in-memory (survit aux hot-reloads mais pas aux redémarrages)
- Pas d'anti-double-mint on-chain (pour faciliter les tests)
- `STATION_SECRET` en dur (`dev-station-secret`)
- Endpoints de reset sans auth (protégés uniquement par `NODE_ENV`)
- Clé privée CRE dans `.env` local

### Pas acceptable en production

- **Clé privée** dans le repo → doit être dans un vault
- **Store JSON** → doit être une BDD (Supabase, Postgres)
- **Sessions in-memory** → doit être Redis ou similaire
- **Endpoints reset** → doivent être supprimés
- **`/api/badges/redeem`** accepte n'importe quel wallet dans le body → doit vérifier la signature
- **`/api/chainlink/next-claim`** sans auth → CRE devrait s'authentifier

### Le nullifier World ID

Le `nullifier_hash` est un identifiant unique dérivé de l'identité World ID de l'utilisateur + l'action. Un même humain ne peut pas générer deux nullifiers différents pour la même action. C'est ce qui empêche le double-claim du premium badge. Le backend stocke les nullifiers déjà utilisés et refuse les doublons.

### Hypothèses de confiance

1. **Le backend est de confiance** : CRE lit les données du backend et les écrit on-chain. Si le backend ment (ex: dit que l'utilisateur a 7 retours alors qu'il en a 0), CRE mintera quand même le badge.
2. **Le VLM mock ne vérifie rien** : le score est toujours 10 pts, l'analyse est fixe. En production, un vrai VLM analyserait réellement la photo.
3. **Le Forwarder simulation accepte tout** : en prod, seul le DON Chainlink pourrait envoyer des reports.
4. **La borne est de confiance** : le `STATION_SECRET` protège les endpoints borne, mais en hackathon c'est un secret trivial.

---

## 10. Démo hackathon

### Flow recommandé (3 minutes)

**Pré-requis :** serveur lancé + ngrok + borne RPi prête.

1. **Reset** (avant la démo)
   - `resetWallet(wallet)` sur le contrat via Remix
   - `POST /api/dev/reset-demo` avec le wallet
   - Se déconnecter de l'app

2. **Connexion** (30s)

   - Ouvrir Traycer dans World App
   - "Connect with World" → wallet connecté
   - Montrer le dashboard vide

3. **Grab a tray** (30s)
   - Clic "Grab a tray" → QR code affiché
   - Scanner le QR avec la borne → "QR confirmed!"
   - Poser le plateau sur le NFC → "Tray linked!"

4. **Return tray** (45s)
   - Le dashboard affiche "Return tray"
   - Clic → modal return
   - Poser le plateau → photo prise → analyse → "+10 pts, 5 items detected"
   - Montrer les confettis

5. **Badge minté** (30s)
   - Aller dans Rewards
   - Montrer "First Return — Minting on World Chain..."
   - Attendre ~10s → "Minted" avec lien "See transaction ↗"
   - Cliquer le lien → montrer la tx sur Worldscan

6. **Redeem Coffee Coupon** (30s)
   - Cliquer "Redeem for Coffee Coupon"
   - World App demande confirmation → approuver
   - "Coffee coupon claimed" avec code promo affiché
   - Expliquer : le badge a été burn on-chain

### Si CRE est lent ou plante

- Montrer le badge "Minting..." et expliquer que CRE est en train d'orchestrer
- Ouvrir les logs serveur et montrer `[CRE-OUT]` en direct
- En dernier recours : `adminMint(wallet, 1, 1)` sur Remix pour simuler le mint

### Si le réseau est lent

- Le flow off-chain (QR → NFC → photo → score) fonctionne en quelques secondes, indépendamment du réseau
- Seul le mint on-chain dépend de World Chain (généralement ~3s)

---

## 11. Préparation jury / Q&A

### Questions World

**Q: Pourquoi utiliser World App plutôt qu'un wallet classique ?**
> Réponse courte : World App donne wallet + identité vérifiée + gas sponsorisé dans un seul package.
> Technique : walletAuth pour la connexion, World ID pour la preuve d'unicité sur les claims premium, sendTransaction avec gas sponsorisé via Account Abstraction pour le redeem.
> Honnête : un wallet classique pourrait faire la connexion, mais pas la preuve d'humanité ni le gas sponsorisé.

**Q: Comment World ID empêche le double-claim ?**
> Le nullifier_hash est déterministe : un même humain + une même action = toujours le même nullifier. Le backend le stocke et refuse les doublons.
> Ce n'est pas nous qui vérifions l'identité — World le fait via le protocole Semaphore.

**Q: Est-ce que sendTransaction est vraiment nécessaire ?**
> Pour le redeem oui : c'est l'utilisateur qui initie le burn de son badge, pas le backend. Ça prouve que l'action vient bien du détenteur du badge.
> On ne l'utilise pas pour le mint (c'est CRE qui orchestre le mint côté serveur).

**Q: C'est quoi le mode démo ?**
> Hors World App (navigateur classique), on simule walletAuth avec un wallet dev et on bypass World ID verify. Le flow on-chain reste réel.

### Questions Chainlink

**Q: Pourquoi CRE et pas un simple script backend ?**
> Réponse courte : CRE sépare la logique de décision (backend) de l'exécution on-chain (CRE). En production, CRE tourne sur un réseau décentralisé d'oracles — le backend ne détient pas la clé privée.
> Technique : CRE signe le report avec un consensus multi-nœuds, le Forwarder vérifie la signature, le contrat fait confiance au Forwarder.
> Honnête : en hackathon avec `simulate`, CRE tourne localement. Mais l'architecture est prête pour un déploiement réel sur le DON.

**Q: Le backend pourrait mentir sur les données — CRE ne vérifie pas ?**
> Exact. CRE orchestre mais ne vérifie pas la source. En production, on pourrait ajouter un Confidential HTTP pour que CRE vérifie directement auprès d'une source de confiance (ex: le VLM certifié). C'est une extension naturelle.

**Q: Que fait `simulate --broadcast` concrètement ?**
> Compile le workflow en WASM, exécute la logique localement, et si il y a un `writeReport`, envoie une vraie transaction on-chain. La simulation est locale mais la transaction est réelle.

**Q: Pourquoi pas un déploiement CRE réel ?**
> Il faut un "deploy access" que Chainlink accorde aux équipes pendant le hackathon. La doc dit explicitement qu'une simulation réussie suffit pour les prix, et que Chainlink peut déployer le workflow pour nous.

### Questions architecture

**Q: Pourquoi un store JSON et pas une vraie BDD ?**
> Hackathon : simplicité et rapidité. Le store est un fichier JSON avec persistance. Pour la prod : Supabase ou Postgres.

**Q: Pourquoi le RPi ?**
> C'est la borne physique qui simule un point de collecte en cantine. QR pour identifier l'utilisateur, NFC pour identifier le plateau, caméra pour la photo.

**Q: Ça scale comment ?**
> Tel quel : un seul serveur, un seul store JSON. Pour scaler : BDD, queue de messages, CRE déployé sur le DON (multi-claims en parallèle).

### Questions sécurité

**Q: La clé privée est où ?**
> Dans `chainlink/.env` localement. En production elle serait dans un vault (ex: AWS Secrets Manager) et gérée par le DON Chainlink.

**Q: Quelqu'un peut-il tricher ?**
> Avec le mock VLM : oui, n'importe quelle photo donne 10 pts. Avec un vrai VLM : plus difficile. Le NFC physique empêche le retour à distance. World ID empêche les comptes multiples pour le premium claim.

### Questions VLM

**Q: C'est un vrai VLM ?**
> En mode démo : non, c'est un provider mock qui retourne des données fixes. Le vrai VLM (Qwen 2.5 VL) est intégré mais nécessite un GPU. L'architecture est prête : il suffit de changer `ANALYZER_PROVIDER=qwen` et de lancer le service VLM.

**Q: Qu'est-ce que le VLM analyse exactement ?**
> Chaque aliment sur le plateau : nom, catégorie (protein/starch/vegetable/fruit/dairy/drink/bread/dessert), plat du repas (starter/main/side/dessert/drink), pourcentage restant, état de consommation (fully_eaten/mostly_eaten/half_eaten/barely_touched/untouched).

### Questions UX

**Q: Pourquoi pas de sendTransaction pour le mint ?**
> Le mint est automatique (CRE). L'utilisateur n'a rien à faire. sendTransaction est réservé au redeem parce que c'est une action volontaire de l'utilisateur.

**Q: Pourquoi le flow est en anglais ?**
> C'est un hackathon international. En production on localiserait en français pour les cantines françaises.

---

## 12. Justification des choix technos

| Techno | Pourquoi | Ce qu'elle aide à faire | Ce qu'elle ne résout pas | Limites hackathon |
|--------|----------|------------------------|--------------------------|-------------------|
| **Next.js** | Full-stack JS, API routes intégrées, SSR | Backend + frontend en un seul projet | Pas de BDD intégrée | Parfait pour un hackathon |
| **World Mini App** | Distribution via World App, 10M+ utilisateurs | Accès à walletAuth, World ID, sendTransaction | Ne gère pas la logique métier | Nécessite World App pour tester en vrai |
| **Wallet Auth** | Auth décentralisée sans email/password | Connexion sécurisée, wallet = identité | Pas de proof-of-human | SIWE standard |
| **World ID** | Preuve d'unicité (1 humain = 1 claim) | Empêche le sybil attack | Ne vérifie pas que l'humain a vraiment rendu un plateau | Niveau Orb = physique |
| **Chainlink CRE** | Orchestration off-chain → on-chain | Séparation des responsabilités, audit trail | Ne vérifie pas la source de données | Simulation locale |
| **ERC-1155** | Multi-token en un seul contrat | Badges multiples, mint/burn efficient | Pas de métadonnées riches | Simple et suffisant |
| **Store JSON** | Zéro config, persistant, lisible | Prototypage rapide | Pas concurrent, pas scalable | Good enough for hackathon |
| **VLM mock** | Pas besoin de GPU pour la démo | Permet de tester tout le flow sans GPU | Ne prouve rien sur le contenu du plateau | Architecture prête pour le vrai VLM |
| **NFC + QR + RPi** | Interaction physique réelle | Prouve que l'utilisateur est devant la borne | Coûteux à déployer à grande échelle | Un seul exemplaire |

---

## 13. Ce qu'il faut améliorer ensuite

### Priorité 1 — Sécurité
- Migrer le store JSON → Supabase avec RLS
- Sessions dans Redis
- Vérifier la signature wallet côté `/api/badges/redeem`
- Supprimer tous les endpoints de reset
- Vault pour les clés privées

### Priorité 2 — VLM réel
- Déployer Qwen 2.5 VL sur GPU (ou API cloud)
- Scoring basé sur le gaspillage réel (pas fixe 10 pts)
- Stocker les analyses pour audit

### Priorité 3 — CRE production
- Obtenir le deploy access Chainlink
- Déployer le workflow sur le DON
- Utiliser le vrai KeystoneForwarder au lieu du MockForwarder
- Sécuriser l'adresse du Forwarder dans le contrat

### Priorité 4 — UX
- Notifications push quand un badge est minté
- Métadonnées ERC-1155 (images, descriptions) via URI
- Localisation français
- Historique des coupons utilisés
- QR code du coupon scannable par le caissier

### Priorité 5 — Scale
- Multi-bornes (plusieurs RPi, plusieurs stations)
- Queue de claims (au lieu du debounce simple)
- Dashboard admin pour les gestionnaires de cantine
- Analytics gaspillage alimentaire pour la cantine

---

## 14. Pitchs rapides

### Pitch technique — 60 secondes

> Traycer est une Mini App World qui connecte le monde physique (cantine) au on-chain (World Chain). L'utilisateur rend son plateau à une borne NFC. Une photo est analysée par IA. Quand il atteint un palier, Chainlink CRE orchestre automatiquement le mint d'un badge ERC-1155 sur World Chain. L'utilisateur peut ensuite burn ce badge via sendTransaction dans World App pour obtenir un coupon café. Tout le flow — de la borne physique au smart contract — est fonctionnel et vérifié sur Worldscan.

### Pitch sponsor World — 30 secondes

> Traycer utilise les trois piliers MiniKit : walletAuth pour la connexion, World ID pour l'unicité des claims premium avec nullifier, et sendTransaction pour le redeem on-chain avec gas sponsorisé. Chaque intégration a un rôle produit réel — ce n'est pas décoratif. Le tout tourne sur World Chain mainnet.

### Pitch sponsor Chainlink — 30 secondes

> Traycer utilise CRE comme couche d'orchestration entre un backend off-chain et un contrat ERC-1155 sur World Chain. Le workflow lit les claims en attente via HTTP, génère un report signé, écrit on-chain via writeReport, puis confirme au backend. C'est un vrai use case : transformer des actions physiques mesurées en actifs on-chain vérifiables, orchestré par CRE.
