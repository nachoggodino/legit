import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legit",
  description: "Git-backed documentation workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
