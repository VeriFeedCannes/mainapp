import type { AnalysisResult } from "./analyzer";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

export interface UserRecord {
  wallet: string;
  username: string;
  total_score: number;
  total_returns: number;
  current_streak: number;
  best_streak: number;
  badges: string[];
  iris_enrolled: boolean;
  last_return_day: string | null;
  created_at: number;
}

export interface DepositRecord {
  id: string;
  wallet: string;
  nfc_uid: string;
  photo_stored: boolean;
  photo_base64?: string;
  analysis: AnalysisResult | null;
  score: number;
  created_at: number;
}

export interface CommunityStats {
  trays_today: number;
  trays_total: number;
  goal_today: number;
  last_reset_day: string;
}

const users = new Map<string, UserRecord>();
const deposits: DepositRecord[] = [];
let community: CommunityStats = {
  trays_today: 0,
  trays_total: 0,
  goal_today: 50,
  last_reset_day: todayStr(),
};

// ── Persistence ──

interface StoreSnapshot {
  users: UserRecord[];
  deposits: Array<Omit<DepositRecord, "photo_base64">>;
  community: CommunityStats;
}

function persistToFile(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const snapshot: StoreSnapshot = {
      users: Array.from(users.values()),
      deposits: deposits.map(({ photo_base64: _, ...rest }) => rest),
      community,
    };

    fs.writeFileSync(STORE_FILE, JSON.stringify(snapshot, null, 2));
  } catch (e) {
    console.error("[STORE] Persist error:", e);
  }
}

function loadFromFile(): void {
  try {
    if (!fs.existsSync(STORE_FILE)) return;

    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const data: StoreSnapshot = JSON.parse(raw);

    users.clear();
    for (const u of data.users) users.set(u.wallet, u);

    deposits.length = 0;
    for (const d of data.deposits) deposits.push(d as DepositRecord);

    if (data.community) {
      community = data.community;
    }

    console.log(`[STORE] Loaded ${users.size} users, ${deposits.length} deposits from disk`);
  } catch (e) {
    console.error("[STORE] Load error:", e);
  }
}

loadFromFile();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "dep_";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function resetDayIfNeeded() {
  const today = todayStr();
  if (community.last_reset_day !== today) {
    community.trays_today = 0;
    community.last_reset_day = today;
  }
}

// --- Badge definitions ---

export const BADGE_DEFS = [
  { id: "first-return", icon: "🍽️", title: "First Return", description: "Return your first tray", condition: (u: UserRecord) => u.total_returns >= 1 },
  { id: "regular-3", icon: "🔄", title: "Regular (x3)", description: "Return 3 trays", condition: (u: UserRecord) => u.total_returns >= 3 },
  { id: "committed-7", icon: "💪", title: "Committed (x7)", description: "Return 7 trays", condition: (u: UserRecord) => u.total_returns >= 7 },
  { id: "streak-3", icon: "🔥", title: "3-Day Streak", description: "3 consecutive days", condition: (u: UserRecord) => u.best_streak >= 3 },
  { id: "streak-7", icon: "⚡", title: "7-Day Streak", description: "7 consecutive days", condition: (u: UserRecord) => u.best_streak >= 7 },
  { id: "clean-return", icon: "✨", title: "Clean Return", description: "Return a perfectly clean tray", condition: (_u: UserRecord, _d?: DepositRecord) => _d?.analysis?.clean_return === true },
  { id: "sorting-pro", icon: "♻️", title: "Sorting Pro", description: "5 correct sorts in a row", condition: (u: UserRecord) => u.total_returns >= 5 },
  { id: "community-goal", icon: "🌍", title: "Community Goal", description: "Help reach today's collective goal", condition: () => false },
  { id: "premium-unlocked", icon: "👁️", title: "Premium Claim", description: "Complete iris enrollment", condition: (u: UserRecord) => u.iris_enrolled },
] as const;

// --- User CRUD ---

export function getOrCreateUser(wallet: string, username?: string): UserRecord {
  let user = users.get(wallet);
  if (!user) {
    user = {
      wallet,
      username: username || wallet.slice(0, 6) + "..." + wallet.slice(-4),
      total_score: 0,
      total_returns: 0,
      current_streak: 0,
      best_streak: 0,
      badges: [],
      iris_enrolled: false,
      last_return_day: null,
      created_at: Date.now(),
    };
    users.set(wallet, user);
    persistToFile();
  }
  if (username && user.username !== username) {
    user.username = username;
    persistToFile();
  }
  return user;
}

export function getUser(wallet: string): UserRecord | null {
  return users.get(wallet) ?? null;
}

// --- Deposit ---

export function recordDeposit(
  wallet: string,
  nfc_uid: string,
  analysis: AnalysisResult | null,
  score: number,
  hasPhoto: boolean,
  photoBase64?: string,
): DepositRecord {
  resetDayIfNeeded();

  const deposit: DepositRecord = {
    id: generateId(),
    wallet,
    nfc_uid,
    photo_stored: hasPhoto,
    photo_base64: photoBase64,
    analysis,
    score,
    created_at: Date.now(),
  };
  deposits.push(deposit);

  const user = getOrCreateUser(wallet);
  user.total_score += score;
  user.total_returns += 1;

  const today = todayStr();
  if (user.last_return_day === today) {
    // same day, streak unchanged
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (user.last_return_day === yesterday) {
      user.current_streak += 1;
    } else {
      user.current_streak = 1;
    }
    user.last_return_day = today;
  }
  if (user.current_streak > user.best_streak) {
    user.best_streak = user.current_streak;
  }

  // Check and award badges
  for (const def of BADGE_DEFS) {
    if (!user.badges.includes(def.id) && def.condition(user, deposit)) {
      user.badges.push(def.id);
    }
  }

  // Community goal check
  community.trays_today += 1;
  community.trays_total += 1;
  if (community.trays_today >= community.goal_today && !user.badges.includes("community-goal")) {
    user.badges.push("community-goal");
  }

  persistToFile();
  return deposit;
}

export function getDeposit(id: string): DepositRecord | null {
  return deposits.find((d) => d.id === id) ?? null;
}

export function getDepositsByWallet(wallet: string): DepositRecord[] {
  return deposits.filter((d) => d.wallet === wallet).sort((a, b) => b.created_at - a.created_at);
}

export function getLastDeposit(wallet: string): DepositRecord | null {
  const userDeposits = getDepositsByWallet(wallet);
  return userDeposits[0] ?? null;
}

export function getCommunityStats(): CommunityStats {
  resetDayIfNeeded();
  return { ...community };
}

// --- Leaderboard ---

export function getLeaderboard(limit = 10): Array<{ wallet: string; username: string; score: number; returns: number }> {
  return Array.from(users.values())
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, limit)
    .map((u) => ({
      wallet: u.wallet,
      username: u.username,
      score: u.total_score,
      returns: u.total_returns,
    }));
}
