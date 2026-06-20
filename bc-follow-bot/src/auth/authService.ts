import { BrowserContext, Page } from "playwright";
import { AccountRow } from "../shared/types";

export interface AuthContext {
  context: BrowserContext;
  page: Page;
}

const LOGIN_URL = process.env.PORTAL_LOGIN_URL ?? "https://example.internal.portal/login";
const LOGIN_SUCCESS_MESSAGE = "Zalogowano pomyślnie";
const LOGIN_FAILURE_MESSAGE = "Nie udało się zalogować";
const LOGIN_EMAIL_SELECTORS =
  'input[type="email"][placeholder="Email Address"]';
const LOGIN_PASSWORD_SELECTORS =
  'input[type="password"], input[placeholder="Password"]';
const LOGIN_SUBMIT_SELECTOR = 'button[type="submit"]';

export type LoginResult =
  | "login_success"
  | "login_failed"
  | "portal_unavailable";

export interface LoginActionResult {
  result: LoginResult;
  details?: string;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyLoginOutcomeFromText(text: string): LoginActionResult | null {
  if (text.includes(LOGIN_SUCCESS_MESSAGE)) {
    return { result: "login_success" };
  }

  if (text.includes(LOGIN_FAILURE_MESSAGE)) {
    return { result: "login_failed", details: LOGIN_FAILURE_MESSAGE };
  }

  return null;
}

async function waitForLoginOutcome(page: Page): Promise<LoginActionResult> {
  try {
    await page.waitForFunction(
      ({ successMessage, failureMessage }) => {
        const text = document.body?.innerText ?? "";
        return text.includes(successMessage) || text.includes(failureMessage);
      },
      {
        successMessage: LOGIN_SUCCESS_MESSAGE,
        failureMessage: LOGIN_FAILURE_MESSAGE,
      },
    );
  } catch (error) {
    return {
      result: "login_failed",
      details: `Login result toast not detected: ${toMessage(error)}`,
    };
  }

  const bodyText = await page.locator("body").innerText();
  return (
    classifyLoginOutcomeFromText(bodyText) ?? {
      result: "login_failed",
      details: "Login result toast not detected.",
    }
  );
}

async function fillEmailField(
  page: Page,
  value: string,
): Promise<LoginActionResult | null> {
  const field = page.locator(LOGIN_EMAIL_SELECTORS).first();

  try {
    await field.waitFor({ state: "attached" });
    await field.waitFor({ state: "visible" });

    if (!(await field.isEditable())) {
      return {
        result: "login_failed",
        details: `Email field is not editable (${LOGIN_EMAIL_SELECTORS}).`,
      };
    }

    const isEmailInput = await field.evaluate((element) => {
      return element instanceof HTMLInputElement && element.type === "email";
    });
    if (!isEmailInput) {
      return {
        result: "login_failed",
        details: `Email locator did not resolve to input[type=email] (${LOGIN_EMAIL_SELECTORS}).`,
      };
    }

    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.click();
    await field.fill("");
    await field.fill(value);
    await page.waitForTimeout(50);

    let actualValue = await field.inputValue();
    if (actualValue !== value) {
      await field.evaluate((element, nextValue) => {
        const input = element as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;

        if (!setter) {
          throw new Error("HTMLInputElement value setter not available.");
        }

        input.focus();
        setter.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));

        setter.call(input, nextValue);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);

      actualValue = await field.inputValue();
      if (actualValue !== value) {
        return {
          result: "login_failed",
          details: `Email field did not contain the expected value after fill attempt (${LOGIN_EMAIL_SELECTORS}).`,
        };
      }
    }

    await page.waitForTimeout(1500);
  } catch (error) {
    return {
      result: "login_failed",
      details: `Email field interaction failed (${LOGIN_EMAIL_SELECTORS}): ${toMessage(error)}`,
    };
  }

  return null;
}

async function readEmailFieldValue(page: Page): Promise<string> {
  return await page.locator(LOGIN_EMAIL_SELECTORS).first().inputValue();
}

async function fillPasswordField(
  page: Page,
  value: string,
): Promise<LoginActionResult | null> {
  const field = page.locator(LOGIN_PASSWORD_SELECTORS).first();

  try {
    await field.waitFor({ state: "attached" });
    await field.waitFor({ state: "visible" });

    if (!(await field.isEditable())) {
      return {
        result: "login_failed",
        details: `Password field is not editable (${LOGIN_PASSWORD_SELECTORS}).`,
      };
    }

    await field.scrollIntoViewIfNeeded().catch(() => {});
    await field.focus().catch(() => {});
    await page.waitForTimeout(50);
    await field.click();
    await field.clear();
    await field.pressSequentially(value, { delay: 80 });

    const actualValue = await field.inputValue();
    if (actualValue !== value) {
      return {
        result: "login_failed",
        details: `Password field did not contain the expected value after fill attempt (${LOGIN_PASSWORD_SELECTORS}).`,
      };
    }

    await page.waitForTimeout(2000);
  } catch (error) {
    return {
      result: "login_failed",
      details: `Password field interaction failed (${LOGIN_PASSWORD_SELECTORS}): ${toMessage(error)}`,
    };
  }

  return null;
}

export async function loginAccount(
  auth: AuthContext,
  account: AccountRow,
): Promise<LoginActionResult> {
  const { page } = auth;

  try {
    await page.goto(LOGIN_URL, {
      waitUntil: "domcontentloaded",
    });
  } catch (error) {
    return {
      result: "portal_unavailable",
      details: `Could not load login page: ${toMessage(error)}`,
    };
  }

  const emailFieldError = await fillEmailField(page, account.email);
  if (emailFieldError) {
    return emailFieldError;
  }

  await page.waitForTimeout(150);

  const passwordFieldError = await fillPasswordField(page, account.password);
  if (passwordFieldError) {
    return passwordFieldError;
  }

  let currentEmailValue = await readEmailFieldValue(page);
  if (currentEmailValue !== account.email) {
    const retryEmailError = await fillEmailField(page, account.email);
    if (retryEmailError) {
      return retryEmailError;
    }

    await page.waitForTimeout(400);
    currentEmailValue = await readEmailFieldValue(page);
  }

  if (currentEmailValue !== account.email) {
    return {
      result: "login_failed",
      details: `Email lost before submit after one retry (${LOGIN_EMAIL_SELECTORS}). got="${currentEmailValue}"`,
    };
  }

  const submitButton = page.locator(LOGIN_SUBMIT_SELECTOR).first();

  try {
    await submitButton.waitFor({ state: "visible" });

    if (!(await submitButton.isEnabled())) {
      return {
        result: "login_failed",
        details: `Login submit button is disabled (${LOGIN_SUBMIT_SELECTOR}).`,
      };
    }
  } catch (error) {
    return {
      result: "login_failed",
      details: `Login submit button not ready (${LOGIN_SUBMIT_SELECTOR}): ${toMessage(error)}`,
    };
  }

  const outcomePromise = waitForLoginOutcome(page);
  await submitButton.click();
  return await outcomePromise;
}

export { classifyLoginOutcomeFromText };
