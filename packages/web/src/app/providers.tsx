'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type FC, type PropsWithChildren } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/components/ThemeProvider';
import { SidebarProvider, MobileHeader, MobileBottomNav } from '@/components/Sidebar';
import { LoginModalProvider } from '@/components/LoginModal';
import { MessagingProvider } from '@/components/messaging/MessagingProvider';
import { Toaster } from 'react-hot-toast';

export const Providers: FC<PropsWithChildren> = ({ children }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <SidebarProvider>
            <LoginModalProvider>
              <MessagingProvider>
                <MobileHeader />
                {children}
                <MobileBottomNav />
                <Toaster
                  position="bottom-center"
                  toastOptions={{
                    className: 'bg-surface text-text-primary border border-border',
                    duration: 3000,
                  }}
                />
              </MessagingProvider>
            </LoginModalProvider>
          </SidebarProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
