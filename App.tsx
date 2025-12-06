import React, { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { ChatInterface } from './components/ChatInterface';
import { AdminDashboard } from './components/AdminDashboard';
import { db } from './services/db';
import { User, AppConfig } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [config, setConfig] = useState<AppConfig>(db.getConfig());

  useEffect(() => {
    const init = async () => {
      try {
        const storedUser = db.getCurrentUser();
        if (storedUser) {
           if (storedUser.isBanned) {
             db.logout();
             setUser(null);
           } else {
             setUser(storedUser);
           }
        }
      } catch (e) {
        console.error("Auth check failed", e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    db.logout();
    setUser(null);
    setShowAdmin(false);
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading OmniMind...</div>;
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <>
      <ChatInterface 
        user={user} 
        config={config} 
        onLogout={handleLogout} 
        onOpenAdmin={() => setShowAdmin(true)} 
      />
      
      {showAdmin && user.role === 'ADMIN' && (
        <AdminDashboard 
          currentUser={user} 
          config={config} 
          onConfigUpdate={setConfig}
          onClose={() => setShowAdmin(false)} 
        />
      )}
    </>
  );
}