import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => {
  const isBuild = command === "build";

  return {
    base: isBuild ? "/practice/" : "/",
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
    },
  };
});
