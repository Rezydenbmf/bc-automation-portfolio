import { Locator, Page } from "playwright";
import { FollowActionResult, ProfileInspectionResult } from "../shared/types";

type FollowState = "following" | "not_following" | "unknown";

const CLICKABLE_SELECTOR = [
  "button",
  "a",
  "[role='button']",
  "[aria-label]",
  "[title]",
  "[data-testid*='follow' i]",
  "[class*='follow' i]"
].join(", ");

const FOLLOWING_LABEL = /^(\+\s*)?(following|followed|unfollow|obserwujesz|obserwowany|obserwowana|przestan obserwowac|przesta\u0144 obserwowa\u0107)$/i;
const FOLLOW_LABEL = /^(\+\s*)?(follow|obserwuj|zacznij obserwowac|zacznij obserwowa\u0107)$/i;

export async function inspectOpenedProfile(_page: Page): Promise<ProfileInspectionResult> {
  return {
    kind: "unknown",
    details: "not_implemented"
  };
}

async function isInProfileHeaderArea(page: Page, control: Locator): Promise<boolean> {
  const box = await control.boundingBox().catch(() => null);
  if (!box) {
    return false;
  }

  const viewport = page.viewportSize();
  const maxHeaderY = viewport ? Math.min(viewport.height * 0.6, 700) : 700;
  return box.y <= maxHeaderY;
}

function normalizeControlLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function classifyFollowControlLabel(label: string): FollowState {
  const normalized = normalizeControlLabel(label);

  if (FOLLOWING_LABEL.test(normalized)) {
    return "following";
  }

  if (FOLLOW_LABEL.test(normalized)) {
    return "not_following";
  }

  return "unknown";
}

function classifyFollowControlLabels(labels: string[]): FollowState {
  for (const label of labels) {
    const state = classifyFollowControlLabel(label);
    if (state !== "unknown") {
      return state;
    }
  }

  return "unknown";
}

export function mapFollowStateAfterClick(state: FollowState): FollowActionResult {
  if (state === "following") {
    return {
      result: "followed",
      details: "follow_state=following"
    };
  }

  return {
    result: "follow_failed",
    details: `follow_state=${state};follow_not_confirmed`
  };
}

async function getControlLabels(control: Locator): Promise<string[]> {
  return control.evaluate((element) =>
    [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ].filter((value): value is string => Boolean(value))
  ).catch(() => []);
}

async function findFollowControl(page: Page): Promise<Locator | undefined> {
  const controls = page.locator(CLICKABLE_SELECTOR);
  const count = await controls.count().catch(() => 0);

  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const visible = await control.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    if (!await isInProfileHeaderArea(page, control)) {
      continue;
    }

    const labels = await getControlLabels(control);
    if (classifyFollowControlLabels(labels) !== "unknown") {
      return control;
    }
  }

  return undefined;
}

export async function detectFollowState(page: Page): Promise<FollowState> {
  const followControl = await findFollowControl(page);
  if (!followControl) {
    return "unknown";
  }

  return classifyFollowControlLabels(await getControlLabels(followControl));
}

async function waitForFollowConfirmation(page: Page): Promise<FollowState> {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const followControl = await findFollowControl(page);
    if (followControl) {
      const state = classifyFollowControlLabels(await getControlLabels(followControl));
      if (state === "following") {
        return state;
      }
    }

    await page.waitForTimeout(500);
  }

  return detectFollowState(page);
}

export async function followProfile(page: Page): Promise<FollowActionResult> {
  try {
    const initialState = await detectFollowState(page);

    if (initialState === "following") {
      return {
        result: "already_following",
        details: "follow_state=following"
      };
    }

    if (initialState !== "not_following") {
      return {
        result: "follow_failed",
        details: `follow_state=${initialState};follow_control_not_found`
      };
    }

    const followControl = await findFollowControl(page);
    if (!followControl) {
      return {
        result: "follow_failed",
        details: "follow_control_not_found"
      };
    }

    await followControl.click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    return mapFollowStateAfterClick(await waitForFollowConfirmation(page));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: "follow_failed",
      details: `follow_action_error: ${message}`
    };
  }
}
