import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const DESCRIPTION =
  "An AI agent that watches the world for evidence that strengthens or weakens your investment thesis.";

export const metadata: Metadata = {
  metadataBase: new URL("https://investor-thesis.vercel.app"),
  title: "Thesis Tracker",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Thesis Tracker",
    title: "Thesis Tracker",
    description: DESCRIPTION,
    url: "https://investor-thesis.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Thesis Tracker",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <body className="font-sans antialiased">
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
