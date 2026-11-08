import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const useMock = env.VITE_USE_MOCK === "true";

    return {
        plugins: [react()],
        server: useMock ? {} : {
            proxy: {
                "/api": {
                    target: "http://localhost:3000",
                    changeOrigin: true,
                }
            }
        }
    };
});
