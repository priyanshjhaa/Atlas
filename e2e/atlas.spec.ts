import { expect, test } from "@playwright/test";

test("moves from the landing page to GitHub sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Know what a change touches/ })).toBeVisible();

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

test("keeps the landing hierarchy separated at every supported viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Know what a change touches/ })).toBeVisible();

  const layout = await page.evaluate(() => {
    const rectangle = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
      };
    };
    const overlaps = (
      first: ReturnType<typeof rectangle>,
      second: ReturnType<typeof rectangle>,
    ) =>
      Boolean(
        first &&
          second &&
          first.left < second.right &&
          first.right > second.left &&
          first.top < second.bottom &&
          first.bottom > second.top,
      );

    const actions = Array.from(
      document.querySelectorAll(".hero-actions a"),
      (element) => {
        const bounds = element.getBoundingClientRect();
        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
        };
      },
    );
    const preview = rectangle(".hero-console");
    const ribbon = rectangle(".intelligence-marquee");

    return {
      noHorizontalOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
      actionsClearPreview: actions.every(
        (action) => !overlaps(action, preview),
      ),
      previewClearRibbon: !overlaps(preview, ribbon),
    };
  });

  expect(layout.noHorizontalOverflow).toBe(true);
  expect(layout.actionsClearPreview).toBe(true);
  expect(layout.previewClearRibbon).toBe(true);
});

test("keeps GitHub sign-in inside the viewport", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: /Continue with GitHub/ })).toBeVisible();

  const layout = await page.evaluate(() => {
    const card = document.querySelector(".sign-in-card")?.getBoundingClientRect();
    return {
      noHorizontalOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
      cardInsideViewport: Boolean(
        card &&
          card.left >= 0 &&
          card.right <= document.documentElement.clientWidth &&
          card.top >= 0,
      ),
    };
  });

  expect(layout.noHorizontalOverflow).toBe(true);
  expect(layout.cardInsideViewport).toBe(true);
});
