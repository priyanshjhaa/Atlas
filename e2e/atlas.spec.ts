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
