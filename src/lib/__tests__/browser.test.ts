import { describe, expect, it } from "vitest";

import {
  authHandlerIsSameOrigin,
  chooseSignInStrategy,
  isEmbeddedBrowser,
  isMobileBrowser,
} from "../browser";

const UA = {
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 329.0.0.41.93",
  facebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0]",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148",
  iosWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  iPadOS:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

describe("isEmbeddedBrowser", () => {
  it("spots the in-app browsers that Google refuses to sign in", () => {
    expect(isEmbeddedBrowser(UA.instagram)).toBe(true);
    expect(isEmbeddedBrowser(UA.facebook)).toBe(true);
    expect(isEmbeddedBrowser(UA.androidWebView)).toBe(true);
    // An iOS webview is an iOS UA with no Safari token.
    expect(isEmbeddedBrowser(UA.iosWebView)).toBe(true);
  });

  it("leaves real browsers alone, including iOS browsers without a Safari token", () => {
    expect(isEmbeddedBrowser(UA.iosSafari)).toBe(false);
    expect(isEmbeddedBrowser(UA.iosChrome)).toBe(false);
    expect(isEmbeddedBrowser(UA.androidChrome)).toBe(false);
    expect(isEmbeddedBrowser(UA.desktopChrome)).toBe(false);
  });
});

describe("isMobileBrowser", () => {
  it("recognises phones and tablets", () => {
    expect(isMobileBrowser(UA.androidChrome)).toBe(true);
    expect(isMobileBrowser(UA.iosSafari)).toBe(true);
  });

  it("recognises an iPad claiming to be a Mac, by its touch points", () => {
    expect(isMobileBrowser(UA.iPadOS, 5)).toBe(true);
    expect(isMobileBrowser(UA.iPadOS, 0)).toBe(false);
  });

  it("leaves the desktop on the desktop flow", () => {
    expect(isMobileBrowser(UA.desktopChrome, 0)).toBe(false);
  });
});

describe("authHandlerIsSameOrigin", () => {
  it("is true only when authDomain is the host the app is served from", () => {
    expect(authHandlerIsSameOrigin("roomie-hisab.vercel.app", "roomie-hisab.vercel.app")).toBe(true);
    expect(authHandlerIsSameOrigin("roomiehisab.firebaseapp.com", "roomie-hisab.vercel.app")).toBe(
      false,
    );
  });

  it("ignores case and treats a missing value as cross-origin", () => {
    expect(authHandlerIsSameOrigin("Roomie-Hisab.Vercel.App", "roomie-hisab.vercel.app")).toBe(true);
    expect(authHandlerIsSameOrigin(undefined, "roomie-hisab.vercel.app")).toBe(false);
  });

  it("distinguishes ports, so a dev server is not mistaken for the handler", () => {
    expect(authHandlerIsSameOrigin("localhost", "localhost:3000")).toBe(false);
  });
});

describe("chooseSignInStrategy", () => {
  it("refuses to start a sign-in inside an app's browser", () => {
    expect(
      chooseSignInStrategy({ embedded: true, mobile: true, sameOriginAuthHandler: true }),
    ).toBe("blocked");
  });

  it("redirects on mobile once the auth handler shares this origin", () => {
    expect(
      chooseSignInStrategy({ embedded: false, mobile: true, sameOriginAuthHandler: true }),
    ).toBe("redirect");
  });

  it("keeps the popup on mobile while the handler is a third-party origin", () => {
    // Cross-origin redirect is the flow browsers break; popup is what Firebase
    // supports until the handler is proxied.
    expect(
      chooseSignInStrategy({ embedded: false, mobile: true, sameOriginAuthHandler: false }),
    ).toBe("popup");
  });

  it("keeps the desktop on the popup either way", () => {
    expect(
      chooseSignInStrategy({ embedded: false, mobile: false, sameOriginAuthHandler: true }),
    ).toBe("popup");
    expect(
      chooseSignInStrategy({ embedded: false, mobile: false, sameOriginAuthHandler: false }),
    ).toBe("popup");
  });
});
