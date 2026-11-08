import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    timeout: 30000,
    use: {
        baseURL: "http://localhost:5173",
        headless: true,
    },
    webServer: {
        command: "npx vite --mode test",
        url: "http://localhost:5173",
        reuseExistingServer: false,
        timeout: 60000,
    },
});