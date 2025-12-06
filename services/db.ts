import { User, ChatSession, AppConfig, UserRole, ADMIN_EMAIL } from '../types';

const KEYS = {
  USERS: 'omnimind_users',
  SESSIONS: 'omnimind_sessions',
  CONFIG: 'omnimind_config',
  CURRENT_USER: 'omnimind_current_user',
};

// Default Configuration
const DEFAULT_CONFIG: AppConfig = {
  themeColor: '#3B82F6',
  systemInstruction: 'You are OFFICIAL HK AI, a helpful and intelligent AI assistant. You can write code, analyze images, and generate creative content.',
  enableImageGeneration: true,
  enableCodeAssistant: true,
  siteName: 'OFFICIAL HK AI',
};

// Helper to simulate delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const db = {
  // --- User Management ---
  login: async (email: string, name: string): Promise<User> => {
    await delay(500); // Simulate network
    const users = db.getUsers();
    let user = users.find(u => u.email === email);
    const now = Date.now();

    if (!user) {
      user = {
        email,
        name,
        photoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
        role: email === ADMIN_EMAIL ? UserRole.ADMIN : UserRole.USER,
        isBanned: false,
        joinedAt: now,
        lastLogin: now,
      };
      users.push(user);
    } else {
      // Update existing user
      user.lastLogin = now;
      // Ensure role is correct if it was manually changed or if logic changes
      if (email === ADMIN_EMAIL && user.role !== UserRole.ADMIN) {
        user.role = UserRole.ADMIN;
      }
      // Update the user in the array
      const index = users.findIndex(u => u.email === email);
      if (index !== -1) users[index] = user;
    }

    localStorage.setItem(KEYS.USERS, JSON.stringify(users));

    if (user.isBanned) {
      throw new Error("ACCOUNT_BANNED");
    }

    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
    return user;
  },

  logout: () => {
    localStorage.removeItem(KEYS.CURRENT_USER);
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(KEYS.CURRENT_USER);
    return stored ? JSON.parse(stored) : null;
  },

  getUsers: (): User[] => {
    const stored = localStorage.getItem(KEYS.USERS);
    return stored ? JSON.parse(stored) : [];
  },

  banUser: (email: string) => {
    const users = db.getUsers();
    const updatedUsers = users.map(u => u.email === email ? { ...u, isBanned: true } : u);
    localStorage.setItem(KEYS.USERS, JSON.stringify(updatedUsers));
    
    // If the banned user is currently logged in, we need to handle that in the UI
    const currentUser = db.getCurrentUser();
    if (currentUser && currentUser.email === email) {
      const bannedUser = { ...currentUser, isBanned: true };
      localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(bannedUser));
    }
  },

  // --- Chat History ---
  getSessions: (userEmail: string): ChatSession[] => {
    const allSessions: Record<string, ChatSession[]> = JSON.parse(localStorage.getItem(KEYS.SESSIONS) || '{}');
    return (allSessions[userEmail] || []).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  saveSession: (userEmail: string, session: ChatSession) => {
    const allSessions: Record<string, ChatSession[]> = JSON.parse(localStorage.getItem(KEYS.SESSIONS) || '{}');
    const userSessions = allSessions[userEmail] || [];
    
    const existingIndex = userSessions.findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
      userSessions[existingIndex] = session;
    } else {
      userSessions.push(session);
    }
    
    allSessions[userEmail] = userSessions;
    localStorage.setItem(KEYS.SESSIONS, JSON.stringify(allSessions));
  },

  deleteSession: (userEmail: string, sessionId: string) => {
    const allSessions: Record<string, ChatSession[]> = JSON.parse(localStorage.getItem(KEYS.SESSIONS) || '{}');
    if (allSessions[userEmail]) {
      allSessions[userEmail] = allSessions[userEmail].filter(s => s.id !== sessionId);
      localStorage.setItem(KEYS.SESSIONS, JSON.stringify(allSessions));
    }
  },

  // --- Configuration (AI Builder) ---
  getConfig: (): AppConfig => {
    const stored = localStorage.getItem(KEYS.CONFIG);
    return stored ? JSON.parse(stored) : DEFAULT_CONFIG;
  },

  saveConfig: (config: AppConfig) => {
    localStorage.setItem(KEYS.CONFIG, JSON.stringify(config));
  }
};