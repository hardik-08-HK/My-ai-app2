import React, { useState, useEffect } from 'react';
import { User, AppConfig } from '../types';
import { db } from '../services/db';
import { GeminiService } from '../services/gemini';

interface AdminDashboardProps {
  currentUser: User;
  config: AppConfig;
  onConfigUpdate: (config: AppConfig) => void;
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, config, onConfigUpdate, onClose }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'builder'>('users'); // Default to users to show list immediately as requested
  const [users, setUsers] = useState<User[]>([]);
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  
  // AI Builder State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiMessage, setAiMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    setUsers(db.getUsers());
  }, []);

  const handleConfigChange = (key: keyof AppConfig, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const saveConfiguration = async () => {
    setSaveStatus('saving');
    db.saveConfig(localConfig);
    onConfigUpdate(localConfig);
    await new Promise(r => setTimeout(r, 800));
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleBanUser = (email: string) => {
    if (confirm(`Are you sure you want to ban ${email}?`)) {
      db.banUser(email);
      setUsers(db.getUsers());
    }
  };

  const handleAiBuilderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsProcessingAI(true);
    setAiMessage(null);

    try {
      const updates = await GeminiService.parseAdminCommand(localConfig, aiPrompt);
      
      if (Object.keys(updates).length === 0) {
        setAiMessage({ type: 'error', text: 'Could not understand the command or no changes were needed.' });
      } else {
        const newConfig = { ...localConfig, ...updates };
        setLocalConfig(newConfig);
        setAiMessage({ type: 'success', text: `AI successfully updated: ${Object.keys(updates).join(', ')}. Review and Save.` });
        setAiPrompt('');
      }
    } catch (error) {
      setAiMessage({ type: 'error', text: 'Failed to process AI command.' });
    } finally {
      setIsProcessingAI(false);
    }
  };

  if (currentUser.role !== 'ADMIN') return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 w-full max-w-4xl rounded-xl border border-gray-700 shadow-2xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Admin Console</h2>
              <p className="text-sm text-gray-400">Secure System Access</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 bg-gray-900/50">
           <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'users' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            User List & Security
          </button>
          <button
            onClick={() => setActiveTab('builder')}
            className={`flex-1 py-4 text-sm font-medium transition-colors ${activeTab === 'builder' ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-900/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            AI Builder & Configuration
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-950">
          {activeTab === 'builder' ? (
            <div className="space-y-8 max-w-3xl mx-auto">
              
              {/* AI Builder Prompt Section */}
              <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
                  <h3 className="text-lg font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                    AI Builder Command Center
                  </h3>
                </div>
                <p className="text-sm text-gray-400 mb-4">
                  Describe what you want to change about the website. The AI will interpret your request and configure the settings automatically.
                </p>
                
                <form onSubmit={handleAiBuilderSubmit} className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder='e.g., "Change the theme to red and make the AI talk like a pirate" or "Disable image generation"'
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-4 pr-12 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button 
                      type="submit"
                      disabled={isProcessingAI || !aiPrompt.trim()}
                      className="absolute right-2 top-2 p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {isProcessingAI ? (
                         <span className="block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {aiMessage && (
                    <div className={`text-sm p-3 rounded-lg border ${aiMessage.type === 'success' ? 'bg-green-900/20 border-green-500/30 text-green-400' : 'bg-red-900/20 border-red-500/30 text-red-400'}`}>
                      {aiMessage.text}
                    </div>
                  )}
                </form>
              </div>

              {/* Manual Controls */}
              <div className="opacity-80 hover:opacity-100 transition-opacity">
                <h4 className="text-xs uppercase font-bold text-gray-500 mb-4 tracking-wider">Manual Configuration</h4>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Site Name</label>
                      <input
                        type="text"
                        value={localConfig.siteName}
                        onChange={(e) => handleConfigChange('siteName', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Theme Color (Hex)</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={localConfig.themeColor}
                          onChange={(e) => handleConfigChange('themeColor', e.target.value)}
                          className="h-10 w-20 rounded bg-transparent border border-gray-700 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={localConfig.themeColor}
                          onChange={(e) => handleConfigChange('themeColor', e.target.value)}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">System Instruction (Prompt)</label>
                    <textarea
                      rows={4}
                      value={localConfig.systemInstruction}
                      onChange={(e) => handleConfigChange('systemInstruction', e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-white">Image Generation</h4>
                        <p className="text-xs text-gray-500">Allow users to generate images.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localConfig.enableImageGeneration}
                          onChange={(e) => handleConfigChange('enableImageGeneration', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-white">Code Assistant</h4>
                        <p className="text-xs text-gray-500">Optimize responses for coding.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localConfig.enableCodeAssistant}
                          onChange={(e) => handleConfigChange('enableCodeAssistant', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={saveConfiguration}
                  disabled={saveStatus === 'saving'}
                  className={`px-6 py-2 rounded-lg font-bold text-white transition-all transform ${saveStatus === 'saved' ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700 hover:scale-105'} flex items-center gap-2`}
                >
                  {saveStatus === 'saving' && <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>}
                  {saveStatus === 'saved' ? 'Saved Successfully' : 'Save Changes'}
                </button>
              </div>

            </div>
          ) : (
            <div className="max-w-5xl mx-auto">
              <div className="mb-6 flex justify-between items-center">
                <div>
                   <h3 className="text-lg font-semibold text-white">All Registered Accounts</h3>
                   <p className="text-sm text-gray-500">List of all users signed up via Google</p>
                </div>
                <span className="bg-gray-800 text-gray-300 px-3 py-1 rounded-full text-xs border border-gray-700">Total Users: {users.length}</span>
              </div>
              
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-left text-sm text-gray-400">
                  <thead className="bg-gray-800/50 text-xs uppercase font-semibold text-gray-300">
                    <tr>
                      <th className="px-6 py-4">User Details</th>
                      <th className="px-6 py-4">Role</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Last Active</th>
                      <th className="px-6 py-4 text-right">Security Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {users.map(user => (
                      <tr key={user.email} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
                                {user.photoUrl ? <img src={user.photoUrl} alt="" /> : <div className="w-full h-full bg-blue-900" />}
                            </div>
                            <div>
                              <div className="font-medium text-white">{user.name}</div>
                              <div className="text-xs text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-full text-xs border ${user.role === 'ADMIN' ? 'bg-purple-900/30 border-purple-500 text-purple-200' : 'bg-blue-900/30 border-blue-500 text-blue-200'}`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                           <span className={`px-2 py-1 rounded-full text-xs flex w-fit items-center gap-1 ${user.isBanned ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${user.isBanned ? 'bg-red-500' : 'bg-green-500'}`}></span>
                            {user.isBanned ? 'Banned' : 'Active'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">
                           {user.lastLogin 
                              ? new Date(user.lastLogin).toLocaleString() 
                              : <span className="text-gray-600">Unknown</span>}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {user.role !== 'ADMIN' && !user.isBanned && (
                            <button
                              onClick={() => handleBanUser(user.email)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-900/20 px-3 py-1.5 rounded transition-colors text-xs font-medium border border-transparent hover:border-red-900"
                            >
                              Ban User Account
                            </button>
                          )}
                          {user.isBanned && (
                            <span className="text-gray-600 text-xs italic">Account Banned</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};