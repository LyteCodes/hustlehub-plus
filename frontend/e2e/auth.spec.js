import { test, expect } from "@playwright/test";

const EMAIL = "jessica@example.com";
const PASSWORD = "Password1!";

async function login(page) {
    await page.goto("/login");
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
}

test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/bookings-income");
    await expect(page).toHaveURL(/\/login/);
});

test("user can log in", async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/\/login/);
});

test("bookings tab loads after login", async ({ page }) => {
    await login(page);
    await page.goto("/bookings-income");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
    await expect(page.locator("text=Incoming bookings")).toBeVisible({ timeout: 10000 });
});

test("income tab loads after login", async ({ page }) => {
    await login(page);
    await page.goto("/bookings-income");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
    await page.getByRole("button", { name: "Income", exact: true }).click();
    await expect(page.locator("text=Total earnings")).toBeVisible({ timeout: 10000 });
});

test("tax tab loads and shows tax year card", async ({ page }) => {
    await login(page);
    await page.goto("/bookings-income");
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
    await page.getByRole("button", { name: "Tax estimate", exact: true }).click();
    await expect(page.locator("text=Tax year")).toBeVisible({ timeout: 10000 });
});