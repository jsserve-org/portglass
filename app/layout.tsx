import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Portglass - Network Intelligence',
  description: 'Authorized network port scanner and intelligence dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
