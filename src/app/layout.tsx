import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TableLabels } from '@/components/table-labels';

export const metadata: Metadata = {
  title: { default: 'Fluxa — tudo que a sua clínica precisa, num lugar só', template: '%s · Fluxa' },
  description: 'CRM, agenda, criativos e anúncios com IA, e automações de WhatsApp para clínicas odontológicas e de estética.',
};

export const viewport: Viewport = { themeColor: '#0A0F1C', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}<TableLabels /></body>
    </html>
  );
}
