import type { Metadata, Viewport } from "next";
import { Inter, Host_Grotesk, Azeret_Mono } from "next/font/google";
import "./globals.css";
import QueryProvider from "./providers/QueryProvider";
import { Toaster } from "@/components/Toast";

// Same fonts as twenty.com: Inter for the app UI, Host Grotesk for headings, Azeret Mono for code/numbers
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
});

const azeretMono = Azeret_Mono({
  variable: "--font-azeret-mono",
  subsets: ["latin"],
});

const appName = "Flash";
const description =
  "Manage leads, deals and your sales team in one workspace. Track every activity and close more deals.";

export const metadata: Metadata = {
  // Link previews need the full address of the share image (opengraph-image.tsx)
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  // Pages set just their own name ("Leads"), the template turns it into "Leads · Flash"
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description,
  applicationName: appName,
  openGraph: {
    title: appName,
    description,
    siteName: appName,
    type: "website",
  },
  // X shows the share image large instead of as a small square
  twitter: { card: "summary_large_image" },
  // Every page is a private workspace behind login, so keep it out of search engines
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#fcfcfc",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${hostGrotesk.variable} ${azeretMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
