"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";

import { auth, firebaseConfigured, googleProvider } from "@/lib/firebase";
import { describeError } from "@/lib/errors";

export type AuthState = {
  user: User | null;
  /** False until Firebase has told us whether a session exists. */
  ready: boolean;
  signingIn: boolean;
  error: string;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) {
      // Without config there is nothing to wait for; the UI shows setup help.
      setReady(true);
      return;
    }
    return onAuthStateChanged(
      auth,
      (next) => {
        setUser(next);
        setReady(true);
      },
      (authError) => {
        setError(describeError(authError));
        setReady(true);
      },
    );
  }, []);

  const signIn = useCallback(async () => {
    if (!auth || !firebaseConfigured) return;
    setSigningIn(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (caught) {
      setError(describeError(caught));
    }
  }, []);

  const clearError = useCallback(() => setError(""), []);

  return { user, ready, signingIn, error, signIn, signOutUser, clearError };
}
