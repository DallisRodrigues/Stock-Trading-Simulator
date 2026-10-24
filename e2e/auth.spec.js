import { test, expect, WEB, DASH, uniqueEmail, signupViaApi } from "./fixtures";

const expected4xx = [/status of 40[19]/];

test.describe("authentication", () => {
  test.use({ allowConsole: expected4xx });

  test("client-side validation explains every invalid field", async ({ page, errors }) => {
    await page.goto(WEB + "/signup");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByText("Name must be at least 2 characters.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Password must be at least 8 characters.")).toBeVisible();
    await expect(page).toHaveURL(WEB + "/signup");
    void errors;
  });

  test("sign up lands on the dashboard and the session survives a reload", async ({ page, errors }) => {
    await page.goto(WEB + "/signup");
    await page.getByLabel("Full name").fill("Ada Lovelace");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(DASH + "/");
    await expect(page.getByRole("heading", { name: "Hi, Ada!" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText("Ada Lovelace");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Hi, Ada!" })).toBeVisible();
    void errors;
  });

  test("duplicate email is reported by the server", async ({ page, errors }) => {
    const user = await signupViaApi(page);
    await page.context().clearCookies();
    await page.goto(WEB + "/signup");
    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page.getByRole("alert")).toHaveText("An account with this email already exists.");
    void errors;
  });

  test("login rejects bad credentials and accepts good ones", async ({ page, errors }) => {
    const user = await signupViaApi(page);
    await page.context().clearCookies();
    await page.goto(WEB + "/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page).toHaveURL(DASH + "/");
    void errors;
  });

  test("the dashboard is protected and redirects to login", async ({ page, errors }) => {
    await page.goto(DASH + "/holdings");
    await expect(page).toHaveURL(/5183\/login\?expired=1/);
    await expect(page.getByText("Your session has ended. Please log in again.")).toBeVisible();
    void errors;
  });

  test("logout ends the session", async ({ page, errors }) => {
    await signupViaApi(page);
    await page.goto(DASH);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/5183\/login\?loggedOut=1/);
    await expect(page.getByText("You have been logged out.")).toBeVisible();
    await page.goto(DASH);
    await expect(page).toHaveURL(/5183\/login/);
    void errors;
  });

  test("an already logged-in visitor is offered the dashboard", async ({ page, errors }) => {
    const user = await signupViaApi(page);
    await page.goto(WEB + "/login");
    await expect(page.getByText(`Logged in as ${user.email}`)).toBeVisible();
    await page.getByRole("link", { name: "Go to dashboard" }).click();
    await expect(page).toHaveURL(DASH + "/");
    void errors;
  });
});
