import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ComCenter — Sales Pipeline Dashboard",
  description: "Modern CRM dashboard for managing leads, appointments, and revenue.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
