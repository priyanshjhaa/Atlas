import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const screenshotStyles = path.join(
  process.cwd(),
  "e2e/visual-regression.css",
);

// The illustrated hero uses layered gradients and a low-opacity texture.
// Chromium's Linux compositor can vary a handful of edge pixels between
// otherwise identical runs. Keep the allowance far below a visible change.
const landingHeroMaxDiffPixels = 50;

async function settlePage(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
}

test.describe("visual regression", () => {
  test("keeps the landing hero visually stable", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Know what a change touches/ }),
    ).toBeVisible();
    await settlePage(page);

    await expect(page).toHaveScreenshot("landing-hero.png", {
      animations: "disabled",
      caret: "hide",
      maxDiffPixels: landingHeroMaxDiffPixels,
      scale: "css",
      stylePath: screenshotStyles,
    });
  });

  test("keeps the sign-in experience visually stable", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(
      page.getByRole("button", { name: /Continue with GitHub/ }),
    ).toBeVisible();
    await settlePage(page);

    await expect(page).toHaveScreenshot("sign-in.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      stylePath: screenshotStyles,
    });
  });
});
