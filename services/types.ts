import { Socket } from 'socket.io';

export type SessionId = string;
export type SocketId = string;
export type ActivityPin = string;
export type ChatId = string;

export type StudentState = 'waiting' | 'paired' | 'solo' | 'ended';

export interface Activity {
  pin: ActivityPin;
  teacherSessionId: SessionId;
  studentSessionIds: SessionId[];
  pairedChatIds: ChatId[];
  soloChatIds: ChatId[];
}

export interface Teacher {
  sessionId: SessionId;
  socketId: SocketId;
  socket: Socket;
  email: string;
  activityPin: ActivityPin;
  connected: boolean;
}

export interface Student {
  sessionId: SessionId;
  socketId: SocketId;
  socket: Socket;
  activityPin: ActivityPin;
  realName: string;
  connected: boolean;
  chatId: ChatId | null;
  state: StudentState;
}

export interface StudentInChat {
  sessionId: SessionId;
  realName: string;
  character: string;
}

export type ChatMessageAuthor = 'student1' | 'student2' | 'teacher';
export type SoloChatMessageAuthor = 'student' | 'chatbot' | 'teacher';

export type ChatMessage = [ChatMessageAuthor, string];
export type SoloChatMessage = [SoloChatMessageAuthor, string];

export interface Chat {
  chatId: ChatId;
  studentPair: [StudentInChat, StudentInChat];
  messages: ChatMessage[];
}

export interface SoloChat {
  chatId: ChatId;
  student: StudentInChat;
  messages: SoloChatMessage[];
  mostRecentStudentMessageId: string | null;
}

export type StudentChat = Chat;

export type ActivityLookups = Record<ActivityPin, Activity>;
export type TeacherLookups = Record<SessionId, Teacher>;
export type StudentLookups = Record<SessionId, Student>;
export type ChatLookups = Record<ChatId, Chat>;
export type SoloChatLookups = Record<ChatId, SoloChat>;
export type SocketIdToSessionIdLookups = Record<SocketId, SessionId>;

export interface SessionResolution {
  sessionId: SessionId;
  socketId: SocketId;
}
