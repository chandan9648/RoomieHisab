"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
  type UserCredential,
} from "firebase/auth";

import { auth, authDomain, firebaseConfigured, googleProvider } from "@/lib/firebase";
import { describeError, errorCode, logAuthError, shouldFallBackToRedirect } from "@/lib/errors";
import {
  EMBEDDED_BROWSER_MESSAGE,
  chooseSignInStrategy,
  readSignInEnvironment,
  type SignInStrategy,
} from "@/lib/browser";

export type AuthState = {
  user: User | null;
  /** False until Firebase has told us whether a session exists. */
  ready: boolean;
  signingIn: boolean;
  error: string;
  /** True in an app's in-app browser, where Google refuses to sign anyone in. */
  embeddedBrowser: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
};

/**
 * `signInWithRedirect` leaves the page, so the attempt has to be remembered
 * across the reload: on the way back it keeps the button busy until
 * `getRedirectResult` settles, instead of flashing a fresh sign-in screen that
 * invites a second tap. Session storage is the right scope — it is this tab's
 * attempt, and it must not outlive the tab.
 */
const REDIRECT_FLAG = "roomiehisab:auth:redirect-pending";

function markRedirectPending(): void {
  try {
    sessionStorage.setItem(REDIRECT_FLAG, String(Date.now()));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The redirect
    // itself is still worth attempting; we just lose the busy state.
  }
}

function clearRedirectPending(): void {
  try {
    sessionStorage.removeItem(REDIRECT_FLAG);
  } catch {
    /* nothing to clean up if storage is unreadable */
  }
}

function redirectPending(): boolean {
  try {
    return sessionStorage.getItem(REDIRECT_FLAG) !== null;
  } catch {
    return false;
  }
}

/**
 * A redirect result can be consumed exactly once per page load, so this is
 * memoised: React's development double-invoke, or any future second caller,
 * must not race for the same credential.
 */
let pendingRedirectResult: Promise<UserCredential | null> | null = null;

function consumeRedirectResult(instance: Auth): Promise<UserCredential | null> {
  pendingRedirectResult ??= getRedirectResult(instance);
  return pendingRedirectResult;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [authKnown, setAuthKnown] = useState(false);
  // Starts false so the server and the first client render agree; the mount
  // effect below corrects it before anything but the loading screen is shown.
  const [resolvingRedirect, setResolvingRedirect] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [embeddedBrowser, setEmbeddedBrowser] = useState(false);

  // Guards against a second attempt being started while one is in flight, and
  // against the busy state being dropped while the browser navigates away.
  const attemptInFlight = useRef(false);
  const leavingForRedirect = useRef(false);

  // Completes a redirect sign-in. Run on every load, not only when our own
  // flag survived: some browsers clear session storage across the round trip,
  // and the credential still has to be collected and its failure reported.
  useEffect(() => {
    if (!auth) return;

    let cancelled = false;
    const wasPending = redirectPending();
    if (wasPending) {
      setResolvingRedirect(true);
      setSigningIn(true);
    }

    consumeRedirectResult(auth)
      .catch((caught: unknown) => {
        logAuthError("redirect-result", caught);
        if (!cancelled) setError(describeError(caught));
        return null;
      })
      .then(() => {
        clearRedirectPending();
        if (cancelled) return;
        setResolvingRedirect(false);
        setSigningIn(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setEmbeddedBrowser(readSignInEnvironment(authDomain).embedded);
  }, []);

  useEffect(() => {
    if (!auth) {
      // Without config there is nothing to wait for; the UI shows setup help.
      setAuthKnown(true);
      return;
    }
    return onAuthStateChanged(
      auth,
      (next) => {
        setUser(next);
        setAuthKnown(true);
        if (next) {
          // However the session arrived — popup, redirect, or restored from a
          // previous visit — the attempt is over.
          leavingForRedirect.current = false;
          attemptInFlight.current = false;
          setSigningIn(false);
          setError("");
        }
      },
      (authError) => {
        logAuthError("auth-state", authError);
        setError(describeError(authError));
        setAuthKnown(true);
      },
    );
  }, []);

  const signIn = useCallback(async () => {
    if (!auth || !firebaseConfigured) return;
    if (attemptInFlight.current) return;

    const environment = readSignInEnvironment(authDomain);
    const strategy: SignInStrategy = chooseSignInStrategy(environment);

    if (strategy === "blocked") {
      setEmbeddedBrowser(true);
      setError(EMBEDDED_BROWSER_MESSAGE);
      return;
    }

    attemptInFlight.current = true;
    setSigningIn(true);
    setError("");

    try {
      if (strategy === "redirect") {
        leavingForRedirect.current = true;
        markRedirectPending();
        await signInWithRedirect(auth, googleProvider);
        return; // The browser is on its way to Google; this page is leaving.
      }
      await signInWithPopup(auth, googleProvider);
    } catch (caught) {
      logAuthError(strategy, caught);
      // The redirect never happened, so the page is staying: release the busy
      // state the redirect branch claimed above.
      leavingForRedirect.current = false;
      clearRedirectPending();

      // A browser that refused the popup can still do a full-page redirect.
      // A user who closed the popup, by contrast, meant to stop.
      if (strategy === "popup" && shouldFallBackToRedirect(errorCode(caught))) {
        try {
          leavingForRedirect.current = true;
          markRedirectPending();
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (secondary) {
          leavingForRedirect.current = false;
          clearRedirectPending();
          logAuthError("redirect", secondary);
          setError(describeError(secondary));
        }
      } else {
        setError(describeError(caught));
      }
    } finally {
      // While a redirect is under way the attempt is still live, so the button
      // stays busy until the page actually unloads.
      if (!leavingForRedirect.current) {
        attemptInFlight.current = false;
        setSigningIn(false);
      }
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    try {
      clearRedirectPending();
      await signOut(auth);
    } catch (caught) {
      logAuthError("sign-out", caught);
      setError(describeError(caught));
    }
  }, []);

  const clearError = useCallback(() => setError(""), []);

  return {
    user,
    ready: authKnown && !resolvingRedirect,
    signingIn,
    error,
    embeddedBrowser,
    signIn,
    signOutUser,
    clearError,
  };
}
