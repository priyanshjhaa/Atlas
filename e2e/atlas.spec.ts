import { expect, test } from "@playwright/test";

test("moves from the landing page to GitHub sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /See your whole system/ })).toBeVisible();

  const workspaceLink = page.locator("a:visible").filter({ hasText: "Open workspace" });
  if (!(await workspaceLink.isVisible())) {
    await page.getByRole("button", { name: /Open navigation/ }).click();
  }
  await workspaceLink.click();

  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: /Continue with GitHub/ })).toBeVisible();
  await expect(page.getByText("Optional decisions and docs")).toBeVisible();
});

test("protects direct workspace routes", async ({ page }) => {
  await page.goto("/app/impact/new");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText(/profile and email only/i)).toBeVisible();
});

test("protects the workspace onboarding route", async ({ page }) => {
  await page.goto("/app/onboarding");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByText(/Repository and Notion access are connected explicitly/i),
  ).toBeVisible();
});

test("keeps the landing hierarchy separated at every supported viewport", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /See your whole system/ })).toBeVisible();
  await expect(
    page.getByText(/Edited by Maya Chen.*editor observed at sync/i),
  ).toBeVisible();

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

test("keeps the hero balanced on a short 13-inch landscape viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1466, height: 829 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /See your whole system/ }),
  ).toBeVisible();

  const layout = await page.evaluate(() => {
    const heading = document.querySelector(".hero h1");
    const actions = document.querySelector(".hero-actions");
    const preview = document.querySelector(".hero-console");
    const ribbon = document.querySelector(".intelligence-marquee");
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const actionsBounds = actions?.getBoundingClientRect();
    const previewBounds = preview?.getBoundingClientRect();
    const ribbonBounds = ribbon?.getBoundingClientRect();

    return {
      headingSize: headingStyle ? Number.parseFloat(headingStyle.fontSize) : 0,
      actionsClearPreview: Boolean(
        actionsBounds &&
          previewBounds &&
          (actionsBounds.right <= previewBounds.left ||
            actionsBounds.bottom <= previewBounds.top),
      ),
      previewClearRibbon: Boolean(
        previewBounds &&
          ribbonBounds &&
          previewBounds.bottom <= ribbonBounds.top,
      ),
      noHorizontalOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    };
  });

  expect(layout.headingSize).toBeLessThanOrEqual(80);
  expect(layout.actionsClearPreview).toBe(true);
  expect(layout.previewClearRibbon).toBe(true);
  expect(layout.noHorizontalOverflow).toBe(true);
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
      cardBottomInsideViewport: Boolean(
        card && card.bottom <= document.documentElement.clientHeight,
      ),
    };
  });

  expect(layout.noHorizontalOverflow).toBe(true);
  expect(layout.cardInsideViewport).toBe(true);
  expect(layout.cardBottomInsideViewport).toBe(true);
});

test("shows a strong focus indicator during keyboard navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Atlas home" })
    .focus();

  const focusedElement = page.locator(":focus");
  await expect(focusedElement).toBeVisible();
  await expect(focusedElement).toHaveCSS("outline-style", "solid");
  await expect(focusedElement).toHaveCSS("outline-width", "3px");
});

test("honors reduced motion without duplicating marquee content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const duplicateMarqueeGroup = page.locator(
    '.intelligence-marquee__group[aria-hidden="true"]',
  );
  await expect(duplicateMarqueeGroup).toBeHidden();

  const animatedTrack = page.locator(".intelligence-marquee__track");
  await expect(animatedTrack).toHaveCSS("animation-name", "none");
});

test("closes the mobile navigation with Escape and restores focus", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/");

  const menuButton = page.getByRole("button", { name: "Open navigation" });
  await menuButton.click();
  await page.getByRole("link", { name: "Product" }).focus();
  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "Product" })).toBeHidden();
});
