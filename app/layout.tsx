import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://atlas.engineering"),
  title: { default: "Atlas — Engineering intelligence for every change", template: "%s · Atlas" },
  description: "Atlas connects GitHub code and change history with Notion decisions to explain the impact of every proposed change.",
  openGraph: {
    title: "Atlas — Engineering intelligence",
    description: "Connect GitHub code and Notion context. Understand every change with verifiable evidence.",
    type: "website",
    images: [{ url: "/atlas-valley.png", width: 1821, height: 864, alt: "A warm illustrated valley connected by paths of light" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Atlas — Engineering intelligence",
    description: "Connect GitHub code and Notion context. Understand every change with verifiable evidence.",
    images: ["/atlas-valley.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body>{children}</body></html>;
}
