import type { Metadata } from "next";
import "./globals.css";
import { AnalyticsTracker } from "./analytics-tracker";

export const metadata: Metadata = {
  metadataBase: new URL("https://mcpsecurity.cloud"),
  title: { default: "mcpSecurity.cloud — MCP security intelligence and assessments", template: "%s · mcpSecurity.cloud" },
  description: "Independent MCP security assessments, exact-version testing, and continuous enterprise monitoring.",
  openGraph: { title: "Security intelligence for every MCP server and every version.", description: "Independent MCP verification, package history, endpoint health, affected versions, fixes, and security ratings.", url: "https://mcpsecurity.cloud", siteName: "mcpSecurity.cloud", type: "website", images: [{ url: "/og.png", width: 1672, height: 941, alt: "mcpSecurity.cloud version intelligence graph" }] },
  twitter: { card: "summary_large_image", title: "mcpSecurity.cloud", description: "Security intelligence for every MCP server and every version.", images: ["/og.png"] },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const gaId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

  return (
    <html lang="en">
      <body>
        {children}
        {gaId ? <AnalyticsTracker /> : null}
        {gaId ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
            <script dangerouslySetInnerHTML={{ __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');` }} />
          </>
        ) : null}
      </body>
    </html>
  );
}
