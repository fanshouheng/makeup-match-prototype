import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "plus-route-fallback",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (!request.url) return next();
          const url = new URL(request.url, "http://localhost");
          const isPlusRoute = url.pathname === "/report" ||
            url.pathname.startsWith("/report/") ||
            url.pathname === "/account" ||
            url.pathname.startsWith("/account/") ||
            url.pathname === "/subscription" ||
            url.pathname.startsWith("/subscription/") ||
            url.pathname === "/plus" ||
            url.pathname.startsWith("/plus/");
          if (isPlusRoute) request.url = `/plus.html${url.search}`;
          next();
        });
      },
    },
    react(),
  ],
  build: {
    rollupOptions: {
      input: ["index.html", "plus.html"],
    },
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "supabase/functions/_shared/**/*.test.ts",
    ],
  },
});
