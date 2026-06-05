import type { Metadata } from "next";
import "@/globals.css";

export const metadata: Metadata = {
  title: "ComCenter — Elite Work Command Center",
  description: "Elite Work operational hub for leads, pipeline, and reporting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ComCenter" />
        <meta name="theme-color" content="#0f1117" />
      </head>
      <body>{children}</body>
    </html>
  );
}