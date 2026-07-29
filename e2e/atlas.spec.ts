import { expect, test } from "@playwright/test";

test("moves from the landing page to GitHub sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Understand what changes/ })).toBeVisible();

  const workspaceLink = page.locator("a:visible").filter({ hasText: "Open workspace" });
  if (!(await workspaceLink.isVisible())) {
    await page.getByRole("button", { name: /Open navigation/ }).click();
  }
  await workspaceLink.click();

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: /Continue with GitHub/ })).toBeVisible();
});

test("protects direct workspace routes", async ({ page }) => {
  await page.goto("/app/impact/new");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(/profile and email only/i)).toBeVisible();
});
