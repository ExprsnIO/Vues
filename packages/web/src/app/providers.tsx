'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type FC, type PropsWithChildren } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/components/ThemeProvider';

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
        <ThemeProvider>{children}</ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
