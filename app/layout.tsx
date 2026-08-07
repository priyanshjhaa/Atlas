import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://atlas.engineering"),
  title: { default: "Atlas — A living map of your engineering system", template: "%s · Atlas" },
  description: "Synchronize GitHub code and history with selected Notion knowledge, explore a source-backed engineering graph, and analyze change impact with verifiable evidence.",
  openGraph: {
    title: "Atlas — A living map of your engineering system",
    description: "Explore architecture, search indexed context, and analyze planned changes or pull requests with source-backed evidence.",
    type: "website",
    images: [{ url: "/atlas-valley.png", width: 1821, height: 864, alt: "A warm illustrated valley connected by paths of light" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Atlas — A living map of your engineering system",
    description: "Explore architecture, search indexed context, and analyze planned changes or pull requests with source-backed evidence.",
    images: ["/atlas-valley.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
