import { Socket } from 'socket.io';

export interface Classrooms {
  [classroomName: string]: {
    teacherSocketId: SocketId;
    students: SocketId[];
    // We track the chats so we can email them to the teacher at the end of class
    chats: Record<ChatId, StudentChat> | {};
    soloChats: Record<ChatId, SoloChat> | {};
    // The teacher's email address which will be sent a copy of all chats.
    email: string;
  };
}

export interface Teachers {
  [teacherSocketId: SocketId]: {
    socket: Socket;
    classroomName: string;
  };
}

export interface Students {
  [studentSocketId: SocketId]: Student;
}

export interface Student {
  socket: Socket;
  classroomName: string;
  realName: string;
  peerSocketId: SocketId | null;
}

export interface ChatIds {
  [socketId: SocketId]: ChatId;
}

export interface SoloChatIds {
  [socketId: SocketId]: ChatId;
}

export type ChatId = 'nanoid#${SocketId}#${SocketId}' | 'nanoid#${SocketId}';

type SocketId = string;

export interface SoloChat {
  student: StudentId;
  messages: SoloChatMessage[];
  mostRecentStudentMessageId: string | null;
}

export interface StudentChat {
  studentPair: [StudentId, StudentId];
  messages: ChatMessage[];
}

interface StudentId {
  realName: string;
  character: string;
  socketId: SocketId;
}

export type ChatMessage = ['student1' | 'student2' | 'teacher', string];
export type SoloChatMessage = ['student' | 'chatbot' | 'teacher', string];
