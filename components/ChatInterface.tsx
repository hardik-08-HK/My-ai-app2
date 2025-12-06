import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Message, ChatSession, AppConfig } from '../types';
import { db } from '../services/db';
import { GeminiService } from '../services/gemini';

interface ChatInterfaceProps {
  user: User;
  config: AppConfig;
  onLogout: () => void;
  onOpenAdmin: () => void;
}

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"];
const IMAGE_STYLES = [
  "None", "Photorealistic", "Cartoon", "Anime", "Cyberpunk", 
  "Oil Painting", "Watercolor", "3D Render", "Sketch", "Abstract"
];

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ user, config, onLogout, onOpenAdmin }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  
  // Image Generation Options
  const [showImageSettings, setShowImageSettings] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState('1:1');
  const [imageStyle, setImageStyle] = useState('None');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSessions();
  }, [user.email]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const loadSessions = () => {
    const loaded = db.getSessions(user.email);
    setSessions(loaded);
    if (loaded.length > 0 && !currentSessionId) {
      selectSession(loaded[0].id);
    } else if (loaded.length === 0) {
      createNewSession();
    }
  };

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.saveSession(user.email, newSession);
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
    setShowHistory(false);
  };

  const selectSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(id);
      setMessages(session.messages);
      setShowHistory(false);
    }
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    db.deleteSession(user.email, id);
    const remaining = sessions.filter(s => s.id !== id);
    setSessions(remaining);
    if (currentSessionId === id) {
      if (remaining.length > 0) selectSession(remaining[0].id);
      else createNewSession();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallBtn(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback if PWA prompt isn't directly available (e.g. already installed or iOS)
      alert("To install the app:\n\nAndroid: Tap the menu (⋮) -> 'Install App' or 'Add to Home Screen'\n\niOS: Tap Share -> 'Add to Home Screen'");
    }
  };

  // --- Security Logic ---
  const checkSecurity = (text: string) => {
    const threats = ['hack', 'sql injection', 'system override', 'drop table', 'ignore previous instructions'];
    const lower = text.toLowerCase();
    if (threats.some(t => lower.includes(t)) && user.role !== 'ADMIN') {
      db.banUser(user.email);
      window.location.reload(); // Force logout/ban screen
      throw new Error("SECURITY_VIOLATION");
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && !selectedImage) || isTyping) return;

    try {
      checkSecurity(input);
    } catch {
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
      image: selectedImage || undefined
    };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInput('');
    const tempImage = selectedImage;
    setSelectedImage(null);
    setIsTyping(true);

    // Update Session Immediately
    if (currentSessionId) {
      const session = sessions.find(s => s.id === currentSessionId);
      if (session) {
        // Update title if it's the first message
        const title = session.messages.length === 0 ? input.slice(0, 30) || 'Image Chat' : session.title;
        db.saveSession(user.email, {
          ...session,
          messages: updatedMessages,
          title,
          updatedAt: Date.now()
        });
        loadSessions(); // Refresh list titles
      }
    }

    try {
      let responseText = '';
      let responseSources: { title: string; uri: string }[] | undefined = undefined;
      
      // Determine mode: Image Generation vs Text/Vision
      const isImageGenRequest = config.enableImageGeneration && (input.toLowerCase().startsWith('/image') || input.toLowerCase().includes('generate an image') || showImageSettings);
      
      if (isImageGenRequest && !tempImage) {
        let prompt = input;
        if (input.toLowerCase().startsWith('/image')) {
            prompt = input.replace('/image', '').trim();
        }

        const imageUrl = await GeminiService.generateImage(prompt, {
            aspectRatio: imageAspectRatio,
            style: imageStyle
        });

        if (imageUrl) {
          responseText = `Here is the ${imageStyle !== 'None' ? imageStyle + ' ' : ''}image you requested.`;
          // Add AI Message with generated image
           const aiMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'model',
            text: responseText,
            timestamp: Date.now(),
            image: imageUrl
          };
          finalizeMessage(aiMessage, updatedMessages);
          return;
        } else {
          responseText = "I tried to generate an image but something went wrong.";
        }
      } 
      // Image Editing / Vision
      else if (tempImage && (input.toLowerCase().includes('edit') || input.toLowerCase().includes('change'))) {
          // Attempt edit
          const editedImage = await GeminiService.editImage(tempImage, input);
           if (editedImage) {
            responseText = "I've edited the image as requested.";
            const aiMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: 'model',
              text: responseText,
              timestamp: Date.now(),
              image: editedImage
            };
            finalizeMessage(aiMessage, updatedMessages);
            return;
           } else {
             // Fallback to text analysis if edit fails or isn't supported purely
             const analysis = await GeminiService.generateText(input, [], config.systemInstruction, tempImage);
             responseText = analysis.text;
             responseSources = analysis.sources;
           }
      }
      else {
        // Standard Text / Vision with Search Grounding
        const historyForApi = messages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }] 
        }));

        const response = await GeminiService.generateText(input, historyForApi, config.systemInstruction, tempImage || undefined);
        responseText = response.text;
        responseSources = response.sources;
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now(),
        sources: responseSources
      };
      
      finalizeMessage(aiMessage, updatedMessages);

    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "I encountered an error processing your request. Please try again.",
        timestamp: Date.now(),
        isError: true
      };
      finalizeMessage(errorMessage, updatedMessages);
    }
  };

  const finalizeMessage = (aiMessage: Message, currentMsgs: Message[]) => {
    const finalMsgs = [...currentMsgs, aiMessage];
    setMessages(finalMsgs);
    setIsTyping(false);
    if (currentSessionId) {
      const session = sessions.find(s => s.id === currentSessionId);
      if (session) {
         db.saveSession(user.email, {
          ...session,
          messages: finalMsgs,
          updatedAt: Date.now()
        });
      }
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden" style={{ '--primary': config.themeColor } as React.CSSProperties}>
      
      {/* Sidebar for Desktop / Mobile Drawer */}
      <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-gray-900 border-r border-gray-800 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${showHistory ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-800">
             <button onClick={createNewSession} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-3 flex items-center justify-center gap-2 transition-colors font-medium">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Chat
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">History</h3>
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${currentSessionId === session.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                   <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                   </svg>
                   <span className="truncate text-sm">{session.title}</span>
                </div>
                <button 
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/30 text-red-400 rounded"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-gray-800 bg-gray-900">
             <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                  {user.name[0]}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium text-white truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
             </div>
             
             {user.role === 'ADMIN' && (
               <button onClick={onOpenAdmin} className="w-full mb-2 text-left px-3 py-2 text-sm text-purple-400 hover:bg-purple-900/20 rounded-lg transition-colors flex items-center gap-2">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                 AI Builder & Admin
               </button>
             )}

             <button onClick={handleInstallApp} className="w-full mb-2 text-left px-3 py-2 text-sm text-green-400 hover:bg-green-900/20 rounded-lg transition-colors flex items-center gap-2">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
               Download App
             </button>

             <button onClick={onLogout} className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Sign Out
             </button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
        {/* Header (Mobile Only for history toggle) */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-30">
          <button onClick={() => setShowHistory(!showHistory)} className="p-2 text-gray-400">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="font-bold text-white">{config.siteName}</span>
          <div className="w-10"></div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
           {messages.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4">
                <div className="w-20 h-20 bg-gray-900 rounded-2xl flex items-center justify-center mb-4 border border-gray-800">
                  <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white">{config.siteName}</h2>
                <p className="max-w-md">I'm your intelligent assistant. You can ask me to write code, generate text, or analyze images.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-lg w-full mt-8">
                   <button onClick={() => setInput("Write a React component for a Navbar")} className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-sm hover:border-blue-500 hover:text-blue-400 transition-all text-left">Write a React Navbar</button>
                   <button onClick={() => setInput("/image A futuristic city with neon lights")} className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-sm hover:border-blue-500 hover:text-blue-400 transition-all text-left">/image Futuristic City</button>
                   <button onClick={() => setInput("Explain Quantum Computing")} className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-sm hover:border-blue-500 hover:text-blue-400 transition-all text-left">Explain Quantum Computing</button>
                   <button onClick={() => document.getElementById('image-upload-btn')?.click()} className="p-3 bg-gray-900 border border-gray-800 rounded-lg text-sm hover:border-blue-500 hover:text-blue-400 transition-all text-left">Analyze an Image</button>
                </div>
             </div>
           ) : (
             messages.map((msg, idx) => (
               <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[85%] md:max-w-[70%] space-y-2`}>
                    {/* Image Attachment in Bubble */}
                    {msg.image && (
                      <div className={`p-2 rounded-xl border ${msg.role === 'user' ? 'bg-blue-900/20 border-blue-800' : 'bg-gray-800 border-gray-700'}`}>
                         <img src={msg.image} alt="Attachment" className="rounded-lg max-h-64 object-cover" />
                      </div>
                    )}
                    {/* Text Bubble */}
                    <div className={`p-4 rounded-2xl shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : msg.isError 
                          ? 'bg-red-900/50 border border-red-500 text-red-200 rounded-bl-none'
                          : 'bg-gray-800 text-gray-100 border border-gray-700 rounded-bl-none'
                    }`}>
                      {msg.role === 'model' ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                           <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      )}
                      
                      {/* Source Citations */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-700/50">
                          <p className="text-xs text-gray-400 mb-2 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                            Sources & Citations
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {msg.sources.map((source, idx) => (
                              <a 
                                key={idx} 
                                href={source.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs bg-gray-900/50 hover:bg-gray-700 text-blue-400 px-3 py-1.5 rounded-full border border-gray-700 truncate max-w-[200px] transition-colors"
                              >
                                {source.title || new URL(source.uri).hostname}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                 </div>
               </div>
             ))
           )}
           {isTyping && (
             <div className="flex justify-start">
               <div className="bg-gray-800 border border-gray-700 p-4 rounded-2xl rounded-bl-none flex items-center gap-2">
                 <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                 <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100"></span>
                 <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200"></span>
               </div>
             </div>
           )}
           <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-800 bg-gray-900 relative">
           
           {/* Image Generation Settings Popup */}
           {showImageSettings && (
             <div className="absolute bottom-full left-4 mb-2 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 w-72 z-50 animate-fade-in">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-bold text-white">Image Options</h4>
                  <button onClick={() => setShowImageSettings(false)} className="text-gray-400 hover:text-white">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Aspect Ratio</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ASPECT_RATIOS.map(ratio => (
                        <button
                          key={ratio}
                          onClick={() => setImageAspectRatio(ratio)}
                          className={`px-2 py-1 text-xs rounded border ${imageAspectRatio === ratio ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Art Style</label>
                    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                      {IMAGE_STYLES.map(style => (
                        <button
                          key={style}
                          onClick={() => setImageStyle(style)}
                          className={`px-2 py-1 text-xs rounded border text-left truncate ${imageStyle === style ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
             </div>
           )}

           <div className="max-w-4xl mx-auto">
             {selectedImage && (
               <div className="mb-4 relative inline-block">
                 <img src={selectedImage} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-gray-700" />
                 <button 
                   onClick={() => setSelectedImage(null)}
                   className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-1 border border-gray-600 hover:bg-red-600 hover:border-red-600 transition-colors"
                 >
                   <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
               </div>
             )}
             
             <div className="flex gap-2 bg-gray-800 p-2 rounded-xl border border-gray-700 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all">
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                />
                <button 
                  id="image-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-colors"
                  title="Upload Image for Vision/Editing"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>

                <button 
                  onClick={() => setShowImageSettings(!showImageSettings)}
                  className={`p-3 rounded-lg transition-colors ${showImageSettings || imageStyle !== 'None' ? 'text-blue-400 bg-blue-900/20' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'}`}
                  title="Image Generation Options (Ratio & Style)"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </button>
                
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={selectedImage ? "Ask about or edit this image..." : "Ask me anything... (Type /image [prompt] to generate)"}
                  className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none min-w-0"
                />
                
                <button 
                  onClick={sendMessage}
                  disabled={!input.trim() && !selectedImage}
                  className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
             </div>
             <p className="text-center text-xs text-gray-600 mt-2">
               AI can make mistakes. Please verify important information.
             </p>
           </div>
        </div>
      </div>
    </div>
  );
};