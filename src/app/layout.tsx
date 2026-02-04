import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI 產文系統',
  description: '通用 AI 文章產生系統',
  robots: { index: false, follow: false },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}