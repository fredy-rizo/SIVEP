import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-unal-background">
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <Header onMenuClick={() => setSidebarOpen(true)} />
      
      <div className="lg:ml-64 pt-16 min-h-screen">
        <main className="p-4 lg:p-6 max-w-[100vw]">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}
    </div>
  );
}