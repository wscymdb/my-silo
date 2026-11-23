import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7771,
    proxy: {
      "/api": "http://localhost:8989",
      "/f/": "http://localhost:8989",
      "/d/": "http://localhost:8989",
    },
  },
});
