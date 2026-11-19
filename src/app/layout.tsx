import type { Metadata } from "next";
import { Libre_Caslon_Text, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./tailwind.css";
const serif = Libre_Caslon_Text({ subsets: ["latin"], weight: ["400", "700"], display: "swap", fallback: ["Georgia", "serif"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
export const metadata: Metadata = {
  title: "ORYX | Your money, clearly",
  description: "Private money records for Demo User.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className={`${serif.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
