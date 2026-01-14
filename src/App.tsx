import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Config from "./pages/Config";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";

import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { slotsAPI } from './api/slotsAPI';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutos - dados considerados "frescos"
      gcTime: 30 * 60 * 1000,   // 30 minutos - tempo no cache após não usado
      refetchOnWindowFocus: false, // Não refetch ao focar janela
      retry: 2, // Tentar 2x em caso de erro
    },
  },
});

// Persister para salvar cache no localStorage
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'sana-calendar-cache',
});

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedAuth = localStorage.getItem('calendar_auth');
    if (storedAuth === 'true') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);

    const handleUnauthorized = () => {
      localStorage.removeItem('calendar_auth');
      setIsAuthenticated(false);
    };

    window.addEventListener('unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized);
    };
  }, []);

  const handleLogin = async (password: string) => {
    const isValid = await slotsAPI.verifyPassword(password);
    if (isValid) {
      localStorage.setItem('calendar_auth', 'true');
      setIsAuthenticated(true);
    }
    return isValid;
  };

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider 
        client={queryClient} 
        persistOptions={{ persister, maxAge: 30 * 60 * 1000 }} // 30 min
      >
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/config" element={<Config />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
