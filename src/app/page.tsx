"use client";

/**
 * Routes between the five states the app can be in: unconfigured, checking the
 * session, signed out, without a household, and the dashboard itself.
 */

import { Loader2 } from "lucide-react";

import { firebaseConfigured } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useHousehold } from "@/hooks/useHousehold";

import { AccessDeniedScreen } from "@/components/AccessDeniedScreen";
import { Dashboard } from "@/components/Dashboard";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { SetupRequired } from "@/components/SetupRequired";
import { SignInScreen } from "@/components/SignInScreen";

function FullScreen({ label }: { label: string }) {
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div role="status" className="flex items-center gap-3 text-slate-500">
        <Loader2 size={20} className="animate-spin" aria-hidden />
        <span className="text-sm font-medium">{label}…</span>
      </div>
    </main>
  );
}

export default function Page() {
  const auth = useAuth();
  const state = useHousehold(auth.user);

  if (!firebaseConfigured) return <SetupRequired />;

  if (!auth.ready) return <FullScreen label="Starting RoomieHisab" />;

  if (!auth.user) {
    return (
      <SignInScreen
        onSignIn={() => void auth.signIn()}
        signingIn={auth.signingIn}
        error={auth.error}
        onDismissError={auth.clearError}
      />
    );
  }

  if (state.accessDenied) {
    return (
      <AccessDeniedScreen
        uid={auth.user.uid}
        message={state.error}
        onSignOut={() => void auth.signOutUser()}
      />
    );
  }

  if (state.loading) return <FullScreen label="Loading your household" />;

  if (!state.household) {
    return (
      <OnboardingScreen
        user={auth.user}
        profile={state.profile}
        loadError={state.error}
        onSignOut={() => void auth.signOutUser()}
      />
    );
  }

  return (
    <Dashboard
      user={auth.user}
      state={{ ...state, household: state.household }}
      onSignOut={() => void auth.signOutUser()}
    />
  );
}
