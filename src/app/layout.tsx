import '@/styles/svg-controls.css';
import { Metadata } from 'next';
import '../styles/globals.css';
import { StateProvider } from '@/lib/state/context';
import { InteractionProvider } from '@/components/workspace/interaction/context';
import { PreloadState } from './preload-state';

export const metadata: Metadata = {
  title: 'AI Project Planner',
  description: 'AI-powered project planning and task decomposition',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StateProvider>
          <InteractionProvider>
            <PreloadState />
            {children}
          </InteractionProvider>
        </StateProvider>
      </body>
    </html>
  );
}