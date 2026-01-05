import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    server: {
      middlewareMode: false,
    },
    plugins: [
      react(),
      {
        name: "local-api",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url || !req.url.startsWith("/api/")) return next();

            try {
              if (req.method && ["POST", "PUT", "PATCH"].includes(req.method)) {
                let body = "";
                for await (const chunk of req) {
                  body += chunk;
                }
                // @ts-expect-error dev-only body shim for Vercel-style handlers
                req.body = body;
              }

              const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
              const path = url.pathname.replace(/^\/api\/?/, "");
              const search = url.search ? `&${url.search.slice(1)}` : "";
              // @ts-expect-error dev-only query shim for Vercel-style handlers
              req.query = Object.fromEntries(url.searchParams.entries());
              req.url = `/api/index?path=${encodeURIComponent(path)}${search}`;

              // @ts-expect-error dev-only JS handler without types
              const { default: handler } = await import("./api/index.js");
              await handler(req, res);
            } catch (err) {
              next(err);
            }
          });
        },
      },
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "Recipe App",
          short_name: "RecipeApp",
          description: "Recipe tracker with photos",
          theme_color: "#111827",
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
        },
        workbox: {
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
  };
});
