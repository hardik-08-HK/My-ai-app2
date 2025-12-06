export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export interface User {
  email: string;
  name: string;
  photoUrl?: string;
  role: UserRole;
  isBanned: boolean;
  joinedAt: number;
  lastLogin?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  image?: string; // base64
  isError?: boolean;
  sources?: { title: string; uri: string }[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface AppConfig {
  themeColor: string;
  systemInstruction: string;
  enableImageGeneration: boolean;
  enableCodeAssistant: boolean;
  siteName: string;
}

export const ADMIN_EMAIL = 'hardikomer8@gmail.com';