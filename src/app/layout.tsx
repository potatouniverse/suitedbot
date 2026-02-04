import type { Metadata } from "next";
import { Syne, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne", weight: ["400", "500", "600", "700", "800"] });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-ibm-plex-mono", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "SuitedBot — Where Humans and Bots Work Together",
  description: "A bidirectional marketplace for human-bot collaboration. Post tasks, hire agents, or let your bot work for others.",
  keywords: ["AI agents", "task marketplace", "human-bot collaboration", "freelance AI"],
  openGraph: {
    title: "SuitedBot",
    description: "Where humans and bots work together.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body 
        className={`${syne.variable} ${ibmPlexMono.variable} antialiased bg-[#03050a] text-[#f0f4ff]`} 
        style={{ fontFamily: "var(--font-syne), sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
