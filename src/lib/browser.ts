/**
 * Which Google sign-in flow can actually work in the browser we are running in.
 *
 * Two environment facts decide this, and getting either wrong is what makes
 * "Continue with Google" fail intermittently on phones:
 *
 *  - **Embedded browsers.** Google blocks OAuth inside app webviews (the
 *    in-app browser of WhatsApp, Instagram, Facebook and friends) and answers
 *    with `disallowed_useragent`. Neither popup nor redirect can succeed there,
 *    so the only honest thing to do is say so before the attempt.
 *  - **Where the Firebase auth handler lives.** `signInWithRedirect` needs the
 *    handler on `authDomain` to share storage with the app. When `authDomain`
 *    is `<project>.firebaseapp.com` and the app is on another host, browsers
 *    that partition third-party storage (Safari, Firefox, Chrome in strict
 *    mode) break that flow — Firebase's own guidance is to keep using the
 *    popup until the handler is proxied onto the app's own origin. So redirect
 *    is chosen only once that proxy is actually in place, never blindly.
 *
 * The detectors take their inputs as arguments so the decision stays pure and
 * testable; `readSignInEnvironment` is the one place that touches `window`.
 */

/** In-app webviews that identify themselves in the user agent string. */
const EMBEDDED_APP_UA =
  /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|LinkedInApp|Twitter|TwitterAndroid|Snapchat|Pinterest|MicroMessenger|WhatsApp|GSA\/|KAKAOTALK|Discord/i;

/** Real iOS browsers, which carry no `Safari` token but are not webviews. */
const IOS_REAL_BROWSER_UA = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave/i;

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Windows Phone/i;

export const EMBEDDED_BROWSER_MESSAGE =
  "Google sign-in is blocked inside this app's built-in browser. Open roomie-hisab in Chrome or Safari — use the ⋯ menu and choose “Open in browser” — then tap Continue with Google again.";

/**
 * True for an app's in-app browser rather than a real one.
 *
 * Android webviews always carry the `wv` token. iOS webviews are recognised by
 * the absence of `Safari` on an iOS user agent, once the real third-party
 * browsers — which also drop that token — have been excluded.
 */
export function isEmbeddedBrowser(userAgent: string): boolean {
  if (!userAgent) return false;
  if (EMBEDDED_APP_UA.test(userAgent)) return true;
  if (/Android/i.test(userAgent) && /;\s*wv[;)]/i.test(userAgent)) return true;
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return !/Safari/i.test(userAgent) && !IOS_REAL_BROWSER_UA.test(userAgent);
  }
  return false;
}

/** True on phones and tablets, including iPads that claim to be a Mac. */
export function isMobileBrowser(userAgent: string, maxTouchPoints = 0): boolean {
  if (!userAgent) return false;
  if (MOBILE_UA.test(userAgent)) return true;
  // iPadOS 13+ sends a desktop user agent; the touch points give it away.
  return maxTouchPoints > 1 && /Macintosh/i.test(userAgent);
}

/**
 * True when Firebase's `/__/auth/*` handler is served from the same origin as
 * the app, which is what makes `signInWithRedirect` dependable. Compared
 * against `host` so a port is taken into account.
 */
export function authHandlerIsSameOrigin(authDomain: string | undefined, host: string): boolean {
  if (!authDomain || !host) return false;
  return authDomain.trim().toLowerCase() === host.trim().toLowerCase();
}

export type SignInEnvironment = {
  embedded: boolean;
  mobile: boolean;
  sameOriginAuthHandler: boolean;
};

export type SignInStrategy = "popup" | "redirect" | "blocked";

/**
 * Popup is the default because it is the flow Firebase supports when the auth
 * handler sits on another origin. Redirect — which survives the tab-switching
 * and popup blocking that make phones flaky — is used on mobile only once the
 * handler is same-origin and the flow is therefore reliable.
 */
export function chooseSignInStrategy(env: SignInEnvironment): SignInStrategy {
  if (env.embedded) return "blocked";
  if (env.mobile && env.sameOriginAuthHandler) return "redirect";
  return "popup";
}

/** Reads the live environment. Returns a desktop-shaped answer on the server. */
export function readSignInEnvironment(authDomain: string | undefined): SignInEnvironment {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { embedded: false, mobile: false, sameOriginAuthHandler: false };
  }
  const ua = navigator.userAgent ?? "";
  return {
    embedded: isEmbeddedBrowser(ua),
    mobile: isMobileBrowser(ua, navigator.maxTouchPoints ?? 0),
    sameOriginAuthHandler: authHandlerIsSameOrigin(authDomain, window.location.host),
  };
}
