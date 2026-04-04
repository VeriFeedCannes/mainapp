import type { TrayAnalysis, ConsumptionState } from "./analyzer";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

// ── Records ──

export interface UserRecord {
  wallet: string;
  username: string;
  total_score: number;
  total_returns: number;
  current_streak: number;
  best_streak: number;
  badges: string[];
  iris_enrolled: boolean;
  world_id_nullifier: string | null;
  world_id_verified_at: number | null;
  world_id_level: "device" | "orb" | null;
  last_return_day: string | null;
  created_at: number;
}

export interface DepositRecord {
  id: string;
  wallet: string;
  nfc_uid: string;
  photo_stored: boolean;
  photo_base64?: string;
  analysis: TrayAnalysis | null;
  score: number;
  created_at: number;
}

export interface CommunityStats {
  trays_today: number;
  trays_total: number;
  goal_today: number;
  last_reset_day: string;
}

export interface ClaimRecord {
  id: string;
  wallet: string;
  reward_type: string;
  nullifier_hash: string;
  verification_level: "device" | "orb";
  points_spent: number;
  created_at: number;
}

// ── In-memory state ──

const users = new Map<string, UserRecord>();
const deposits: DepositRecord[] = [];
const claims: ClaimRecord[] = [];
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
  claims: ClaimRecord[];
  community: CommunityStats;
}

function persistToFile(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    const snapshot: StoreSnapshot = {
      users: Array.from(users.values()),
      deposits: deposits.map(({ photo_base64: _, ...rest }) => rest),
      claims: [...claims],
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
    for (const u of data.users) {
      // Ensure new fields exist on old records
      u.world_id_nullifier ??= null;
      u.world_id_verified_at ??= null;
      u.world_id_level ??= null;
      users.set(u.wallet, u);
    }

    deposits.length = 0;
    for (const d of data.deposits) deposits.push(d as DepositRecord);

    claims.length = 0;
    if (data.claims) {
      for (const c of data.claims) claims.push(c);
    }

    if (data.community) {
      community = data.community;
    }

    console.log(`[STORE] Loaded ${users.size} users, ${deposits.length} deposits from disk`);
  } catch (e) {
    console.error("[STORE] Load error:", e);
  }
}

loadFromFile();

// ── Helpers ──

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

// ── Badges ──

export const BADGE_DEFS = [
  { id: "first-return", icon: "🍽️", title: "First Return", description: "Return your first tray", condition: (u: UserRecord) => u.total_returns >= 1 },
  { id: "regular-3", icon: "🔄", title: "Regular (x3)", description: "Return 3 trays", condition: (u: UserRecord) => u.total_returns >= 3 },
  { id: "committed-7", icon: "💪", title: "Committed (x7)", description: "Return 7 trays", condition: (u: UserRecord) => u.total_returns >= 7 },
  { id: "streak-3", icon: "🔥", title: "3-Day Streak", description: "3 consecutive days", condition: (u: UserRecord) => u.best_streak >= 3 },
  { id: "streak-7", icon: "⚡", title: "7-Day Streak", description: "7 consecutive days", condition: (u: UserRecord) => u.best_streak >= 7 },
  { id: "community-goal", icon: "🌍", title: "Community Goal", description: "Help reach today's collective goal", condition: () => false },
] as const;

// ── User CRUD ──

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
      world_id_nullifier: null,
      world_id_verified_at: null,
      world_id_level: null,
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

// ── Deposit ──

export function recordDeposit(
  wallet: string,
  nfc_uid: string,
  analysis: TrayAnalysis | null,
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
  if (user.last_return_day !== today) {
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

  // Award badges
  for (const def of BADGE_DEFS) {
    if (!user.badges.includes(def.id) && def.condition(user)) {
      user.badges.push(def.id);
    }
  }

  // Community goal
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

// ── Leaderboard ──

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

// ── Claims ──

function generateClaimId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "clm_";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function hasNullifierClaimed(nullifier_hash: string, reward_type: string): boolean {
  return claims.some(
    (c) => c.nullifier_hash === nullifier_hash && c.reward_type === reward_type,
  );
}

export function getClaimsByWallet(wallet: string): ClaimRecord[] {
  return claims.filter((c) => c.wallet === wallet).sort((a, b) => b.created_at - a.created_at);
}

export function recordClaim(
  wallet: string,
  reward_type: string,
  nullifier_hash: string,
  verification_level: "device" | "orb",
  points_spent: number,
): ClaimRecord {
  const user = getUser(wallet);
  if (!user) throw new Error("User not found");
  if (user.total_score < points_spent) throw new Error("Not enough points");

  if (hasNullifierClaimed(nullifier_hash, reward_type)) {
    throw new Error("Already claimed by this identity");
  }

  user.total_score -= points_spent;
  user.world_id_nullifier = nullifier_hash;
  user.world_id_verified_at = Date.now();
  user.world_id_level = verification_level;

  const claim: ClaimRecord = {
    id: generateClaimId(),
    wallet,
    reward_type,
    nullifier_hash,
    verification_level,
    points_spent,
    created_at: Date.now(),
  };
  claims.push(claim);

  persistToFile();
  return claim;
}

// ── Item-level analytics ──

export interface ItemAggregate {
  name: string;
  category: string;
  course: string;
  total_seen: number;
  avg_percent_left: number;
  state_distribution: Record<ConsumptionState, number>;
}

export interface DailyStats {
  date: string;
  total_returns: number;
  unique_users: number;
  items: ItemAggregate[];
  top_wasted: string[];
  top_consumed: string[];
}

function aggregateItems(filteredDeposits: DepositRecord[]): ItemAggregate[] {
  const agg = new Map<string, {
    category: string;
    course: string;
    total_seen: number;
    sum_percent_left: number;
    states: Record<string, number>;
  }>();

  for (const dep of filteredDeposits) {
    if (!dep.analysis) continue;
    for (const item of dep.analysis.items) {
      const key = item.name.toLowerCase();
      let entry = agg.get(key);
      if (!entry) {
        entry = {
          category: item.category,
          course: item.course,
          total_seen: 0,
          sum_percent_left: 0,
          states: {},
        };
        agg.set(key, entry);
      }
      entry.total_seen += 1;
      entry.sum_percent_left += item.estimated_percent_left;
      entry.states[item.consumption_state] = (entry.states[item.consumption_state] || 0) + 1;
    }
  }

  return Array.from(agg.entries()).map(([name, data]) => ({
    name,
    category: data.category,
    course: data.course,
    total_seen: data.total_seen,
    avg_percent_left: Math.round(data.sum_percent_left / data.total_seen),
    state_distribution: data.states as Record<ConsumptionState, number>,
  }));
}

export function getItemStats(daysBack = 7): ItemAggregate[] {
  const cutoff = Date.now() - daysBack * 86_400_000;
  const filtered = deposits.filter((d) => d.created_at >= cutoff);
  return aggregateItems(filtered)
    .sort((a, b) => b.total_seen - a.total_seen);
}

export function getDailyStats(date?: string): DailyStats {
  const targetDate = date || todayStr();
  const dayStart = new Date(targetDate + "T00:00:00Z").getTime();
  const dayEnd = dayStart + 86_400_000;

  const dayDeposits = deposits.filter(
    (d) => d.created_at >= dayStart && d.created_at < dayEnd,
  );

  const uniqueWallets = new Set(dayDeposits.map((d) => d.wallet));
  const items = aggregateItems(dayDeposits);

  const sorted = [...items].sort((a, b) => b.avg_percent_left - a.avg_percent_left);
  const topWasted = sorted.slice(0, 3).map((i) => i.name);
  const topConsumed = sorted
    .slice()
    .sort((a, b) => a.avg_percent_left - b.avg_percent_left)
    .slice(0, 3)
    .map((i) => i.name);

  return {
    date: targetDate,
    total_returns: dayDeposits.length,
    unique_users: uniqueWallets.size,
    items,
    top_wasted: topWasted,
    top_consumed: topConsumed,
  };
}
