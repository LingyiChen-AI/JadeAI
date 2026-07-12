import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const appName = process.env.APP_NAME || '小逆offer';

export const metadata: Metadata = {
  title: `${appName} - AI Resume Builder`,
  description: 'AI-powered intelligent resume builder with drag-and-drop editor',
  icons: {
    icon: '/favicon-offer.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var b=localStorage.getItem('jadeai-brand');if(b==='boss'){b='mint';localStorage.setItem('jadeai-brand','mint');}else if(b==='jade'){b='blue';localStorage.setItem('jadeai-brand','blue');}if(b==='blue'||b==='pink'){document.documentElement.setAttribute('data-brand',b);}}catch(e){}})();`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
