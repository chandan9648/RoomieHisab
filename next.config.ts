import type { NextConfig } from "next";

/**
 * Firebase serves its OAuth handler from `https://<project>.firebaseapp.com/__/auth/*`.
 * When that host differs from the one the app runs on — the default, since the
 * app lives on Vercel — the handler is third-party to the app, and browsers
 * that partition third-party storage (Safari, Firefox, Chrome in strict mode)
 * can break a redirect sign-in with `auth/missing-initial-state`.
 *
 * Proxying the handler onto this origin removes that difference. It is inert
 * until `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is pointed at this app's own domain:
 * nothing requests `/__/auth/*` here before then, and the sign-in flow keeps
 * using the popup. See `.env.example` for how to switch it on.
 */
const authHandlerHost =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_HANDLER_HOST ||
  (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    ? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`
    : "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!authHandlerHost) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${authHandlerHost}/__/auth/:path*`,
      },
      {
        // The handler page fetches its own config from this path.
        source: "/__/firebase/:path*",
        destination: `https://${authHandlerHost}/__/firebase/:path*`,
      },
    ];
  },
};

export default nextConfig;
