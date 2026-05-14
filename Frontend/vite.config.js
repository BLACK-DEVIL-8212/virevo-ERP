import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5173
    }
  },

  build: {
    chunkSizeWarningLimit: 1000, // remove 500kb warning

    rollupOptions: {
      output: {
        manualChunks: {
          reactVendor: ["react", "react-dom"],
          firebaseVendor: [
            "firebase/app",
            "firebase/auth",
            "firebase/database"
          ],
          chartVendor: ["chart.js", "react-chartjs-2"],
          qrVendor: ["qrcode.react"]
        }
      }
    }
  }
});