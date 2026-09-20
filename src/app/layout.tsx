import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clash of Clans | Clan Performance & Master Score Dashboard",
  description: "Automated Clan Management & Performance Dashboard using Supercell API and Gemini Vision OCR",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-surface text-on-surface">
        {children}
      </body>
    </html>
  );
}
