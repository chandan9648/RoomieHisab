import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoomieHisab · Shared flat expenses",
  description:
    "Track roommate expenses in real time and settle up fairly, with a clear month-end split of who pays whom.",
  applicationName: "RoomieHisab",
};

/**
 * A separate `viewport` export is required from Next 14 onwards; putting it in
 * `metadata` is deprecated and silently ignored. `maximum-scale` is left out on
 * purpose so people who need to pinch-zoom still can.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
