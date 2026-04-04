interface ExecHaloCmdWebOptions {
  name: string;
  keyNo?: number;
  message?: string;
  digest?: string;
  typedData?: unknown;
  format?: string;
  legacySignCommand?: boolean;
}

interface HaloSignResult {
  etherAddress: string;
  signature: { ether: string; der: string; raw: { r: string; s: string; v: number } };
  input: { keyNo: number; digest: string; message: string };
}

interface HaloCommandResult {
  [key: string]: unknown;
}

declare interface Window {
  execHaloCmdWeb: (
    command: ExecHaloCmdWebOptions,
    options?: { statusCallback?: (status: string) => void },
  ) => Promise<HaloSignResult & HaloCommandResult>;
  haloGetDefaultMethod: () => string;
}
