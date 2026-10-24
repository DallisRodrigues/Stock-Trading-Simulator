import { test, expect, WEB } from "./fixtures";

const PAGES = [
  { path: "/", heading: "Invest in everything" },
  { path: "/about", heading: /pioneered the discount broking model/ },
  { path: "/product", heading: "Technology" },
  { path: "/pricing", heading: "Pricing" },
  { path: "/support", heading: /Search for an answer/ },
  { path: "/signup", heading: "Open a demo account" },
  { path: "/login", heading: "Login to Kite" },
];

test.describe("landing site", () => {
  for (const { path, heading } of PAGES) {
    test(`renders ${path} with all images loaded`, async ({ page, errors }) => {
      await page.goto(WEB + path);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const broken = await page.$$eval("img", (imgs) => imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
      expect(broken).toEqual([]);
      void errors;
    });
  }

  test("navbar links reach every primary page", async ({ page, errors }) => {
    await page.goto(WEB);
    for (const [label, path] of [
      ["About", "/about"],
      ["Products", "/product"],
      ["Pricing", "/pricing"],
      ["Support", "/support"],
      ["Signup", "/signup"],
      ["Login", "/login"],
    ]) {
      await page.getByRole("navigation").getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(WEB + path);
      await expect(page.getByText("404 Not Found")).toHaveCount(0);
    }
    await page.getByRole("link", { name: "Zerodha clone home" }).click();
    await expect(page).toHaveURL(WEB + "/");
    void errors;
  });

  test("every internal link on every page resolves to a real route", async ({ page, errors }) => {
    const internal = new Set();
    for (const { path } of PAGES) {
      await page.goto(WEB + path);
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
      for (const h of hrefs) {
        expect(h, `empty href on ${path}`).not.toBe("");
        if (h.startsWith("/")) internal.add(h);
      }
    }
    for (const href of internal) {
      await page.goto(WEB + href);
      await expect(page.getByText("404 Not Found"), href).toHaveCount(0);
    }
    void errors;
  });

  test("unknown routes show the 404 page with a way home", async ({ page, errors }) => {
    await page.goto(WEB + "/does-not-exist");
    await expect(page.getByText("404 Not Found")).toBeVisible();
    await page.getByRole("link", { name: "Go back home" }).click();
    await expect(page).toHaveURL(WEB + "/");
    void errors;
  });

  test("support search filters help topics", async ({ page, errors }) => {
    await page.goto(WEB + "/support");
    await page.getByLabel("Search help topics").fill("withdraw");
    await expect(page.getByRole("link", { name: "Withdraw money" })).toBeVisible();
    await expect(page.getByRole("link", { name: "NRI Account Opening" })).toHaveCount(0);
    await page.getByLabel("Search help topics").fill("zzzz-nothing");
    await expect(page.getByText(/No help topics match/)).toBeVisible();
    void errors;
  });

  test("CTA buttons lead to signup", async ({ page, errors }) => {
    await page.goto(WEB);
    await page.getByRole("link", { name: "Signup Now" }).click();
    await expect(page).toHaveURL(WEB + "/signup");
    void errors;
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("pages do not scroll horizontally and the menu toggles", async ({ page, errors }) => {
      for (const { path } of PAGES) {
        await page.goto(WEB + path);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, path).toBeLessThanOrEqual(1);
      }
      await page.goto(WEB);
      const nav = page.getByRole("navigation");
      await expect(nav.getByRole("link", { name: "Pricing" })).toBeHidden();
      await page.getByRole("button", { name: "Toggle navigation" }).click();
      await nav.getByRole("link", { name: "Pricing" }).click();
      await expect(page).toHaveURL(WEB + "/pricing");
      void errors;
    });
  });
});
