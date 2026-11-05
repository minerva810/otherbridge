import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Other Bridge",
  description: "NFT 자산 유틸리티 통합과 Otherside 온보딩",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
