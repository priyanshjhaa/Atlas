import { expect, test } from "@playwright/test";

test("moves from the landing page to GitHub sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Understand what changes/ })).toBeVisible();
  await page.getByRole("link", { name: /Open workspace/ }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: /Continue with GitHub/ })).toBeVisible();
});

test("protects direct workspace routes", async ({ page }) => {
  await page.goto("/app/impact/new");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(/profile and email only/i)).toBeVisible();
});
