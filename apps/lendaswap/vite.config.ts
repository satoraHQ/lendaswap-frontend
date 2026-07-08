/// <reference types='vitest' />

import { createRequire } from "node:module";
import * as path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

// The frontend's own version, read at config time (Node-side, not bundled).
// This is the canonical frontend version — git tags in this monorepo are
// per-component, so a `git tag` lookup would surface a backend tag instead.
const appVersion = createRequire(import.meta.url)("./package.json").version;

export default defineConfig({
  envDir: "../../../",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
  },
  server: {
    port: 4205,
    host: "0.0.0.0",
    cors: true,
    fs: {
      // Allow serving files from the client-sdk directory (outside frontend/)
      allow: ["../..", "../../../client-sdk"],
    },
  },

  preview: {
    port: 4305,
    host: "localhost",
  },

  plugins: [
    react(),
    svgr({
      svgrOptions: {
        exportType: "named",
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: "**/*.svg",
    }),
  ],

  resolve: {
    dedupe: ["viem", "@zerodev/sdk", "@zerodev/ecdsa-validator"],
    alias: {
      "#/components": path.resolve(
        __dirname,
        "../../packages/shadcn/src/components",
      ),
      "#/lib/utils": path.resolve(
        __dirname,
        "../../packages/shadcn/src/lib/utils.ts",
      ),
      "#/lib": path.resolve(__dirname, "../../packages/shadcn/src/lib"),
      "#/hooks": path.resolve(__dirname, "../../packages/shadcn/src/hooks"),
    },
  },

  build: {
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      // Don't bundle Node.js-only native addon
      external: ["@lendasat/lendaswap-sdk-native"],
    },
  },

  optimizeDeps: {
    // Exclude Node.js-only native addon from pre-bundling
    exclude: ["@lendasat/lendaswap-sdk-native"],
  },
});
