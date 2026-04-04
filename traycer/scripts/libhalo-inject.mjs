import { Buffer } from "buffer/";
globalThis.Buffer = Buffer;
globalThis.process = globalThis.process || { env: {}, version: "", browser: true };
