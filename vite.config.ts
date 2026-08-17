import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/donpadron/",
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [react()],
});
