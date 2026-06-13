import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // "server-only" throws at import time in Next.js to prevent accidental
      // client-side use. In Vitest (Node environment) it is a no-op — the
      // guard doesn't apply here and would break every test that imports a
      // server module directly.
      "server-only": fileURLToPath(new URL("./vitest.server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "schemas/**/*.test.ts"],
  },
});
