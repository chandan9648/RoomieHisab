import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoomieHisab | Shared Expenses",
  description: "Track roommate expenses and settle up fairly in real time.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
