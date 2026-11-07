import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3210",
      DATABASE_URL: "pglite://memory",
      NEAR_NETWORK: "mainnet",
      NEAR_RPC_URLS: "https://rpc.mainnet.fastnear.com",
      ANSWER_PEPPER: "test-pepper-test-pepper-test-pepper-0123",
      ANSWER_ENCRYPTION_KEY: "0".repeat(63) + "1",
      IP_HASH_SALT: "test-salt-test-salt",
    },
  },
});
