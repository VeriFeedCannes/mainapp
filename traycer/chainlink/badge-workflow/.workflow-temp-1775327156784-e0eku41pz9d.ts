/**
 * Traycer CRE Workflow — Badge Mint on World Chain
 *
 * Flow:
 *   1. CRON trigger fires
 *   2. Fetch next mintable claim from backend (GET /api/chainlink/next-claim)
 *   3. If claim exists: encode (wallet, badgeId, totalReturns)
 *   4. runtime.report() → signed report
 *   5. evmClient.writeReport() → KeystoneForwarder → TraycerBadges1155.onReport()
 *   6. Confirm mint via backend (POST /api/chainlink/confirm-mint)
 *
 * Badge minting logic:
 *   - A badge is NOT minted on every tray return.
 *   - An OnchainClaim is created only when a user crosses a milestone (1, 3, 7 returns).
 *   - CRE consumes pending claims one at a time via next-claim → mint → confirm-mint.
 *
 * Target: World Chain mainnet (ethereum-mainnet-worldchain-1)
 */

import {
  CronCapability,
  HTTPClient,
  EVMClient,
  handler,
  Runner,
  type Runtime,
  type NodeRuntime,
  getNetwork,
  bytesToHex,
  hexToBase64,
  consensusIdenticalAggregation, sendErrorResponse,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";

// ── Config (loaded from config.staging.json) ──

type Config = {
  schedule: string;
  apiBaseUrl: string;
  consumerAddress: string;
  chainName: string;
  gasLimit: string;
  creWebhookSecret: string;
};

// ── Result type ──

type BadgeResult = {
  eligible: boolean;
  badgeId: bigint;
  txHash: string;
};

// ── Response from /api/chainlink/next-claim ──

type NextClaimResponse = {
  hasClaim: boolean;
  claimId: string;
  wallet: string;
  eligible: boolean;
  badgeId: number;
  totalReturns: number;
};

// ── Response from /api/chainlink/confirm-mint ──

type ConfirmMintResponse = {
  success: boolean;
  claimId: string;
  txHash: string;
};

// ── Init: register cron trigger ──

const initWorkflow = (config: Config) => {
  const cron = new CronCapability();
  return [handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
};

// ── Main handler ──

const onCronTrigger = (runtime: Runtime<Config>): BadgeResult => {
  const { apiBaseUrl, consumerAddress, chainName, gasLimit, creWebhookSecret } =
    runtime.config;

  runtime.log("Fetching next mintable claim...");

  const claim = runtime.runInNodeMode(
    fetchNextClaim,
    consensusIdenticalAggregation<NextClaimResponse>(),
  )(apiBaseUrl).result();

  if (!claim.hasClaim || !claim.eligible || claim.badgeId === 0) {
    runtime.log("No pending claim — skipping");
    return { eligible: false, badgeId: 0n, txHash: "" };
  }

  runtime.log(
    `Claim ${claim.claimId}: wallet=${claim.wallet} badgeId=${claim.badgeId} returns=${claim.totalReturns}`,
  );

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chainName,
  });
  if (!network) throw new Error(`Unknown chain: ${chainName}`);

  const evmClient = new EVMClient(network.chainSelector.selector);

  const reportData = encodeAbiParameters(
    parseAbiParameters("address wallet, uint256 badgeId, uint256 totalReturns"),
    [
      claim.wallet as `0x${string}`,
      BigInt(claim.badgeId),
      BigInt(claim.totalReturns),
    ],
  );

  runtime.log("Generating signed report...");
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  runtime.log(`Writing report to ${consumerAddress} on World Chain...`);
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: consumerAddress,
      report: reportResponse,
      gasConfig: { gasLimit },
    })
    .result();

  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
  runtime.log(`Badge #${claim.badgeId} minted! tx: ${txHash}`);
  runtime.log(`https://worldscan.org/tx/${txHash}`);

  runtime.log("Confirming mint on backend...");
  runtime.runInNodeMode(
    confirmMint,
    consensusIdenticalAggregation<ConfirmMintResponse>(),
  )(apiBaseUrl, claim.claimId, txHash, creWebhookSecret).result();

  runtime.log(`Claim ${claim.claimId} confirmed as minted`);

  return {
    eligible: true,
    badgeId: BigInt(claim.badgeId),
    txHash,
  };
};

// ── Node-mode: fetch next claim ──

const fetchNextClaim = (
  nodeRuntime: NodeRuntime<Config>,
  apiBaseUrl: string,
): NextClaimResponse => {
  const httpClient = new HTTPClient();

  const resp = httpClient
    .sendRequest(nodeRuntime, {
      url: `${apiBaseUrl}/api/chainlink/next-claim`,
      method: "GET" as const,
    })
    .result();

  const bodyText = new TextDecoder().decode(resp.body);
  return JSON.parse(bodyText) as NextClaimResponse;
};

// ── Node-mode: confirm mint (POST) ──

const confirmMint = (
  nodeRuntime: NodeRuntime<Config>,
  apiBaseUrl: string,
  claimId: string,
  txHash: string,
  creWebhookSecret: string,
): ConfirmMintResponse => {
  const httpClient = new HTTPClient();

  const payload = JSON.stringify({ claimId, txHash });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (creWebhookSecret) {
    headers["x-cre-secret"] = creWebhookSecret;
  }

  const resp = httpClient
    .sendRequest(nodeRuntime, {
      url: `${apiBaseUrl}/api/chainlink/confirm-mint`,
      method: "POST" as const,
      body: Buffer.from(payload),
      headers,
    })
    .result();

  const bodyText = new TextDecoder().decode(resp.body);
  return JSON.parse(bodyText) as ConfirmMintResponse;
};

// ── Entry point ──

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main().catch(sendErrorResponse)
