import { useCallback } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { useIdleTimeout } from '@/hooks/use-idle-timeout';
import { IdleTimeoutWarning } from '@/components/shared/IdleTimeoutWarning';
import type { AppRole } from '@/types';

interface AppLayoutProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function AppLayout({ children, allowedRoles }: AppLayoutProps) {
  const { user, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const handleTimeout = useCallback(async () => {
    await signOut();
    navigate('/login', { replace: true });
  }, [signOut, navigate]);

  const { showWarning, remainingSeconds, dismissWarning } = useIdleTimeout({
    onTimeout: handleTimeout,
    enabled: !!user,
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
            <SidebarTrigger />
          </header>
          <main className="flex-1 p-4 lg:p-6 animate-fade-in">
            {children}
          </main>
        </div>
      </div>
      <IdleTimeoutWarning
        open={showWarning}
        remainingSeconds={remainingSeconds}
        onDismiss={dismissWarning}
      />
    </SidebarProvider>
  );
}
