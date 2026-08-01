import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://atlas.engineering"),
  title: { default: "Atlas — Engineering intelligence for every change", template: "%s · Atlas" },
  description: "Understand what changes before you change it. Atlas connects code, architecture, history, and decisions.",
  openGraph: {
    title: "Atlas — Engineering intelligence",
    description: "Understand what changes before you change it.",
    type: "website",
    images: [{ url: "/atlas-valley.png", width: 1821, height: 864, alt: "A warm illustrated valley connected by paths of light" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Atlas — Engineering intelligence",
    description: "Understand what changes before you change it.",
    images: ["/atlas-valley.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
