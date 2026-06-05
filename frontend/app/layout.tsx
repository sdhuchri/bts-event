import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OCR KTP — Event BTS",
  description: "Scan & ekstrak data KTP via AWS Bedrock",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-dvh bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
