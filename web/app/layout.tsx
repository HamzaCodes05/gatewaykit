import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GatewayKit: LLM gateway',
  description: 'API keys, rate limits, budgets, caching and cost analytics for LLM traffic.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
