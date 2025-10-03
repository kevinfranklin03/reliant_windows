import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // anything starting with /api will be proxied to the backend
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        // keep the /api prefix (because your Express mounts app.use("/api", router))
        // if your backend did NOT have the /api prefix, you'd use: rewrite: (p) => p.replace(/^\/api/, "")
      },
    },
  },
});
