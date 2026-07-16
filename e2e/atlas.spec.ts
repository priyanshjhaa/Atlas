import { expect, test } from "@playwright/test";

test("moves from the landing page into the workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Understand what changes/ })).toBeVisible();
  await page.getByRole("link", { name: /Open workspace/ }).click();
  await expect(page.getByRole("heading", { name: /Good morning/ })).toBeVisible();
});

test("runs the mock impact-analysis journey", async ({ page }) => {
  await page.goto("/app/impact/new");
  await expect(page.getByRole("heading", { name: "Analyze a change" })).toBeVisible();
  await page.getByRole("button", { name: /Analyze impact/ }).click();
  await expect(page).toHaveURL(/\/app\/impact\/demo/);
  await expect(page.getByText("Executive summary")).toBeVisible();
  await expect(page.getByText("Confirmed direct impact")).toBeVisible();
});

test("opens graph and connector surfaces", async ({ page }) => {
  await page.goto("/app/graph");
  await expect(page.getByRole("heading", { name: "Explore every relationship" })).toBeVisible();
  await page.goto("/app/sources");
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(page.getByText("GitHub", { exact: true })).toBeVisible();
  await expect(page.getByText("Notion", { exact: true })).toBeVisible();
});
