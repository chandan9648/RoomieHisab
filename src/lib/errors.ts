import { FirebaseError } from "firebase/app";

/**
 * Turns Firebase error codes into something a roommate can act on. Anything
 * unrecognised keeps its original message rather than being swallowed.
 */
export function describeError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "permission-denied":
        return "You do not have permission for that. You may have been removed from this household.";
      case "unavailable":
      case "deadline-exceeded":
        return "Cannot reach Firestore. Check your internet connection and try again.";
      case "failed-precondition":
        return "That action conflicted with a change someone else just made. Please try again.";
      case "not-found":
        return "That record no longer exists.";
      case "resource-exhausted":
        return "Firestore quota exceeded. Try again in a little while.";
      case "unauthenticated":
        return "Your session expired. Please sign in again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "Sign-in was cancelled.";
      case "auth/popup-blocked":
        return "Your browser blocked the sign-in popup. Allow popups for this site and retry.";
      case "auth/network-request-failed":
        return "Network error during sign-in. Check your connection and try again.";
      case "auth/unauthorized-domain":
        return "This domain is not authorised in Firebase Auth. Add it under Authentication to Settings to Authorised domains.";
      case "auth/operation-not-allowed":
        return "Google sign-in is not enabled for this Firebase project.";

      // --- flows that break on phones, where the cause is never obvious ---

      // The sign-in page could not read back the state it saved before leaving
      // for Google. On a phone this is almost always an in-app browser, or a
      // browser blocking storage for the Firebase auth handler.
      case "auth/missing-initial-state":
        return "Sign-in could not be completed in this browser. Open the site directly in Chrome or Safari — not inside another app — and try again.";
      case "auth/web-storage-unsupported":
        return "This browser is blocking the storage sign-in needs. Turn off private or restricted browsing, or open the site in Chrome or Safari.";
      case "auth/operation-not-supported-in-this-environment":
        return "This browser cannot complete Google sign-in. Open the site in Chrome or Safari and try again.";
      case "auth/redirect-cancelled-by-user":
        return "Sign-in was cancelled.";
      case "auth/redirect-operation-pending":
        return "A sign-in is already in progress. Give it a moment.";
      case "auth/timeout":
        return "Sign-in took too long to respond. Check your connection and try again.";
      case "auth/too-many-requests":
        return "Too many sign-in attempts. Wait a minute and try again.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/account-exists-with-different-credential":
        return "An account already exists with this email using a different sign-in method.";
      case "auth/internal-error":
        return "Google sign-in failed unexpectedly. Please try again.";

      default:
        return error.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

/** The Firebase code behind an error, or "" when it is not a Firebase error. */
export function errorCode(error: unknown): string {
  return error instanceof FirebaseError ? error.code : "";
}

/**
 * Popup failures that mean "this browser will not give you a popup", as
 * opposed to "the user changed their mind". Only these are worth retrying as a
 * full-page redirect; cancelling must stay cancelled.
 */
const REDIRECT_WORTHY_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

export function shouldFallBackToRedirect(code: string): boolean {
  return REDIRECT_WORTHY_CODES.has(code);
}

/**
 * Sign-in failures are reported to the user in plain words, which deliberately
 * drops the detail needed to diagnose them. The console keeps that detail so a
 * phone attached to desktop DevTools shows the actual code.
 */
export function logAuthError(stage: string, error: unknown): void {
  console.error(`[auth] ${stage} failed (${errorCode(error) || "no code"})`, error);
}

/** True for the one error we want to render as a dedicated access screen. */
export function isPermissionDenied(error: unknown): boolean {
  return error instanceof FirebaseError && error.code === "permission-denied";
}

/**
 * Firestore settles a write promise only once the server acknowledges it. When
 * the backend is unreachable — no Cloud Firestore database created for the
 * project, a device offline, an extension blocking the request — the SDK queues
 * the write and retries indefinitely. The promise never settles and never
 * rejects, so a naive `await` leaves a button spinning forever with no error.
 *
 * `withTimeout` puts a ceiling on that wait. It does **not** cancel the write:
 * Firestore still delivers it if the connection recovers, which is why the
 * message says the change was not confirmed rather than that it failed.
 */
export const WRITE_TIMEOUT_MS = 12_000;

export class WriteTimeoutError extends Error {
  constructor(action: string) {
    super(
      `Could not reach Firestore to ${action}. Check your connection, and confirm a Cloud ` +
        `Firestore database exists for this Firebase project (Firebase console to Firestore ` +
        `Database to Create database). If the change went through, it will appear shortly.`,
    );
    this.name = "WriteTimeoutError";
  }
}

export function withTimeout<T>(
  work: Promise<T>,
  action: string,
  ms: number = WRITE_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ceiling = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new WriteTimeoutError(action)), ms);
  });
  return Promise.race([work, ceiling]).finally(() => clearTimeout(timer));
}
