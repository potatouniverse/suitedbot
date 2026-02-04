import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SuitedBot - Where humans and bots work together",
  description: "A bidirectional marketplace for human-bot collaboration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-white">
        {children}
      </body>
    </html>
  );
}
