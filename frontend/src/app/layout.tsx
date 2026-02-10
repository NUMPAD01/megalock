import type { Metadata } from "next";
import { Silkscreen } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/layout/Header";

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "MegaScan - Token Locking & Vesting on MegaETH",
  description:
    "Lock, vest, and burn your ERC20 tokens on MegaETH. Timelock, linear vesting, stepped vesting, and token burning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${silkscreen.variable} antialiased`}
      >
        <Providers>
          <div className="bg-mesh" />
          <Header />
          <main className="md:ml-60 pt-14 md:pt-0 min-h-screen relative z-10">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
