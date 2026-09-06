import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  // Read from root .env directly
  const rootDir = path.resolve(__dirname, "..");
  const env = loadEnv(mode, rootDir, "");

  return {
    envDir: rootDir,
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify(env.FIREBASE_API_KEY || env.VITE_FIREBASE_API_KEY || "AIzaSyAskYJQKnqn5rZ6WGoTzcjUffEaeNU7GrY"),
      "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify(env.FIREBASE_AUTH_DOMAIN || env.VITE_FIREBASE_AUTH_DOMAIN || "mindmirror-app-bae2d.firebaseapp.com"),
      "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify(env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || "mindmirror-app-bae2d"),
      "import.meta.env.VITE_FIREBASE_APP_ID": JSON.stringify(env.FIREBASE_APP_ID || env.VITE_FIREBASE_APP_ID || "1:92992583743:web:e237cc1be19ec844cc608a"),
      "import.meta.env.VITE_GOOGLE_MAPS_CLIENT_KEY": JSON.stringify(env.GOOGLE_MAPS_CLIENT_KEY || env.VITE_GOOGLE_MAPS_CLIENT_KEY || ""),
    },


    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
