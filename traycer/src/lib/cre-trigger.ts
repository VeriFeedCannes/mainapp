import { spawn } from "child_process";
import path from "path";

/**
 * Spawns `cre workflow simulate badge-workflow --broadcast --target staging-settings`
 * as a detached background process. Fire-and-forget: the HTTP response is NOT blocked.
 *
 * Only runs in non-production (dev / hackathon). In production the CRE cron handles it.
 *
 * Debounced: if a simulation is already running, the call is skipped.
 */

let running = false;
let pendingRetry = false;

export function triggerCreSimulation(): void {
  if (process.env.NODE_ENV === "production") return;
  if (running) {
    pendingRetry = true;
    console.log("[CRE-TRIGGER] Already running — will retry when done");
    return;
  }

  spawnCre();
}

function spawnCre(): void {
  const creDir = path.resolve(process.cwd(), "chainlink");

  running = true;
  pendingRetry = false;
  console.log("[CRE-TRIGGER] Spawning cre workflow simulate…");

  const child = spawn(
    "cre",
    [
      "workflow",
      "simulate",
      "badge-workflow",
      "--broadcast",
      "--target",
      "staging-settings",
      "--non-interactive",
      "--trigger-index",
      "0",
    ],
    {
      cwd: creDir,
      stdio: "pipe",
      shell: true,
      detached: false,
      env: { ...process.env },
    },
  );

  child.stdout.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log("[CRE-OUT]", line);
  });

  child.stderr.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log("[CRE-ERR]", line);
  });

  child.on("close", (code) => {
    running = false;
    console.log(`[CRE-TRIGGER] Process exited with code ${code}`);
    if (pendingRetry) {
      console.log("[CRE-TRIGGER] Retrying pending claim…");
      spawnCre();
    }
  });

  child.on("error", (err) => {
    running = false;
    pendingRetry = false;
    console.error("[CRE-TRIGGER] Spawn error:", err.message);
  });
}
