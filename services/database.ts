import { Socket } from 'socket.io';
import { nanoid } from 'nanoid/non-secure';

import {
  ActivityLookups,
  TeacherLookups,
  StudentLookups,
  Student,
  Teacher,
  Activity,
  SessionId,
  SocketId,
  ChatId,
  ChatLookups,
  StudentChat,
  ChatMessage,
  SoloChat,
  SoloChatLookups,
  SoloChatMessage,
  SocketIdToSessionIdLookups,
  StudentInChat,
} from './types.js';
import { sendEmailOfChats } from './sendEmailOfChats.js';
import { getChatbotReplyMessages } from './gemini.js';

const activities: ActivityLookups = {};
const teacherLookups: TeacherLookups = {};
const studentLookups: StudentLookups = {};
const chatLookups: ChatLookups = {};
const soloChatLookups: SoloChatLookups = {};
const socketIdToTeacherSessionId: SocketIdToSessionIdLookups = {};
const socketIdToStudentSessionId: SocketIdToSessionIdLookups = {};

export function getSessionIdFromSocket(socket: Socket): SessionId {
  const handshakeSessionId = socket.handshake.auth.sessionId;
  return typeof handshakeSessionId === 'string' && handshakeSessionId.length > 0
    ? handshakeSessionId
    : socket.id;
}

function clearTeacherSocketMapping(socketId: SocketId, sessionId: SessionId) {
  if (socketIdToTeacherSessionId[socketId] === sessionId) {
    delete socketIdToTeacherSessionId[socketId];
  }
}

function clearStudentSocketMapping(socketId: SocketId, sessionId: SessionId) {
  if (socketIdToStudentSessionId[socketId] === sessionId) {
    delete socketIdToStudentSessionId[socketId];
  }
}

function getStudentParticipant(
  student: Student,
  character: string,
): StudentInChat {
  return {
    sessionId: student.sessionId,
    realName: student.realName,
    character,
  };
}

function getTeacherBySessionId(sessionId: SessionId) {
  return teacherLookups[sessionId];
}

export function getTeacherBySocketId(socketId: SocketId) {
  const sessionId = socketIdToTeacherSessionId[socketId];
  return sessionId ? getTeacherBySessionId(sessionId) : undefined;
}

export function getStudentBySessionId(sessionId: SessionId) {
  return studentLookups[sessionId];
}

export function getStudentBySocketId(socketId: SocketId) {
  const sessionId = socketIdToStudentSessionId[socketId];
  return sessionId ? getStudentBySessionId(sessionId) : undefined;
}

function removeStudentRecord(student: Student) {
  clearStudentSocketMapping(student.socketId, student.sessionId);
  delete studentLookups[student.sessionId];
}

function removeStudentFromActivityList(student: Student) {
  const activity = getActivity(student.activityPin);

  if (activity) {
    activity.studentSessionIds = activity.studentSessionIds.filter(
      (sessionId) => sessionId !== student.sessionId,
    );
  }
}

function getChatPeer(chat: StudentChat, sessionId: SessionId) {
  return chat.studentPair.find((student) => student.sessionId !== sessionId);
}

export function getActivity(activityPin: string) {
  return activities[activityPin];
}

export function addActivity(
  activityPin: string,
  socket: Socket,
  email: string,
) {
  const sessionId = getSessionIdFromSocket(socket);
  const existingTeacher = teacherLookups[sessionId];

  if (existingTeacher) {
    clearTeacherSocketMapping(existingTeacher.socketId, sessionId);
  }

  teacherLookups[sessionId] = {
    sessionId,
    socketId: socket.id,
    socket,
    email,
    activityPin,
    connected: true,
  };
  socketIdToTeacherSessionId[socket.id] = sessionId;

  activities[activityPin] = {
    pin: activityPin,
    teacherSessionId: sessionId,
    studentSessionIds: [],
    pairedChatIds: [],
    soloChatIds: [],
  };
}

export async function deleteActivity(teacher: Teacher) {
  // Email the chats to the teacher before deleting the activity
  teacher.connected = false;
  await emailChatsToTeacher(teacher);

  delete activities[teacher.activityPin];
  clearTeacherSocketMapping(teacher.socketId, teacher.sessionId);
  delete teacherLookups[teacher.sessionId];

  // Does not delete the students from their chats. This lets the students
  // continue chatting even after the teacher closes the website. Additional
  // chat messages sent after the teacher deletes the activity will not be
  // emailed to the teacher.
}

async function emailChatsToTeacher(teacher: Teacher) {
  // Sends all chats to the teacher, even those which have already ended.

  if (!teacher) return;

  const activityPin = teacher.activityPin;
  const activity = getActivity(activityPin);

  if (!activity) return;

  const chats = activity.pairedChatIds
    .map((chatId) => chatLookups[chatId])
    .filter(Boolean);
  const soloChats = activity.soloChatIds
    .map((chatId) => soloChatLookups[chatId])
    .filter(Boolean);

  if ((chats.length === 0 && soloChats.length === 0) || teacher.email === '')
    return;

  await sendEmailOfChats(chats, soloChats, teacher.email);
}

export function setTeacherEmailForActivity(activityPin: string, email: string) {
  const activity = activities[activityPin];

  if (!activity) return;

  const teacher = getTeacherBySessionId(activity.teacherSessionId);
  if (teacher) {
    teacher.email = email;
  }
}

export function addStudentToActivity(
  realName: string,
  activityPin: string,
  socket: Socket,
) {
  const activity = getActivity(activityPin);
  // activity won't exist if the teacher already left or pin is invalid
  if (!activity) return;

  const sessionId = getSessionIdFromSocket(socket);
  const existingStudent = studentLookups[sessionId];

  if (existingStudent) {
    clearStudentSocketMapping(existingStudent.socketId, sessionId);
  }

  studentLookups[sessionId] = {
    sessionId,
    socketId: socket.id,
    socket,
    activityPin,
    realName,
    connected: true,
    chatId: existingStudent?.chatId ?? null,
    state: existingStudent?.state ?? 'waiting',
  };
  socketIdToStudentSessionId[socket.id] = sessionId;

  // double check student has not already joined activity
  if (activity.studentSessionIds.includes(sessionId)) return;
  activity.studentSessionIds.push(sessionId);

  // inform teacher
  const teacher = getTeacherBySessionId(activity.teacherSessionId);
  teacher?.socket.emit('new student joined', {
    realName,
    // TODO: Rename this field to sessionId in the frontend contract.
    socketId: sessionId,
  });
}

/**
 * Removes a student from an activity when it is known they were not in a
 * paired or solo chat.
 */
export function removeUnpairedStudentFromActivity(student: Student) {
  removeStudentFromActivityList(student);
  student.chatId = null;
  student.state = 'ended';
  removeStudentRecord(student);
}

/**
 * Handles the case when a student leaves and it is unknown whether they were
 * in a chat.
 */
export function removeStudentFromActivity(student: Student) {
  student.connected = false;

  if (student.state === 'waiting' || !student.chatId) {
    const activity = getActivity(student.activityPin);
    const teacher = activity
      ? getTeacherBySessionId(activity.teacherSessionId)
      : undefined;

    removeUnpairedStudentFromActivity(student);

    teacher?.socket.emit('unpaired student left', {
      // TODO: Rename this field to sessionId in the frontend contract.
      socketId: student.sessionId,
    });
    return;
  }

  const activity = getActivity(student.activityPin);
  const teacher = activity
    ? getTeacherBySessionId(activity.teacherSessionId)
    : undefined;

  // an activity won't exist if the teacher already left
  if (activity) {
    removeStudentFromActivityList(student);
  }

  if (student.state === 'solo') {
    teacher?.socket.emit('solo mode: student disconnected', {
      chatId: student.chatId,
    });

    student.chatId = null;
    student.state = 'ended';
    removeStudentRecord(student);
    return;
  }

  const chatId = student.chatId;
  const chat = chatId ? chatLookups[chatId] : undefined;
  const peerParticipant = chat
    ? getChatPeer(chat, student.sessionId)
    : undefined;
  const peerStudent = peerParticipant
    ? getStudentBySessionId(peerParticipant.sessionId)
    : undefined;

  if (chatId) {
    student.socket.to(chatId).emit('peer left chat', {});
    deleteChat(chatId, student, peerStudent);
  }

  if (peerStudent) {
    removeUnpairedStudentFromActivity(peerStudent);
  }

  removeStudentRecord(student);

  teacher?.socket.emit('chat ended - two students', { chatId });
}

export function pairStudents(
  studentPairs: Array<
    [
      { socketId: SessionId; character: string; realName?: string },
      { socketId: SessionId; character: string; realName?: string },
    ]
  >,
  teacherSocket: Socket,
) {
  const teacher = getTeacherBySocketId(teacherSocket.id);
  if (!teacher) return;

  const activity = getActivity(teacher.activityPin);
  if (!activity) return;

  for (const [tempStudent1, tempStudent2] of studentPairs) {
    // TODO: Rename incoming socketId fields to sessionId in the frontend contract.
    const student1 = getStudentBySessionId(tempStudent1.socketId);
    const student2 = getStudentBySessionId(tempStudent2.socketId);

    if (!student1 || !student2) continue;

    const chatId = nanoid(8) as ChatId;

    // join the students to a chat
    student1.socket.join(chatId);
    student2.socket.join(chatId);
    student1.connected = true;
    student2.connected = true;
    student1.chatId = chatId;
    student2.chatId = chatId;
    student1.state = 'paired';
    student2.state = 'paired';

    // exchange names between the two students and start the chat
    student1.socket.emit('chat start', {
      yourCharacter: tempStudent1.character,
      peersCharacter: tempStudent2.character,
    });
    student2.socket.emit('chat start', {
      yourCharacter: tempStudent2.character,
      peersCharacter: tempStudent1.character,
    });

    // TODO refactor: no need for this event, just start the chat on the teacher's front end immediately.
    teacherSocket.emit('chat started - two students', {
      chatId,
      studentPair: [
        {
          realName: student1.realName,
          character: tempStudent1.character,
          // TODO: Rename this field to sessionId in the frontend contract.
          socketId: student1.sessionId,
        },
        {
          realName: student2.realName,
          character: tempStudent2.character,
          // TODO: Rename this field to sessionId in the frontend contract.
          socketId: student2.sessionId,
        },
      ],
    });

    const studentChat: StudentChat = {
      chatId,
      studentPair: [
        getStudentParticipant(student1, tempStudent1.character),
        getStudentParticipant(student2, tempStudent2.character),
      ],
      messages: [],
    };
    chatLookups[chatId] = studentChat;
    activity.pairedChatIds.push(chatId);
  }
}

function clearStudentChatState(student: Student | undefined, chatId: ChatId) {
  if (!student || student.chatId !== chatId) return;

  student.socket.leave(chatId);
  student.chatId = null;
  student.state = 'ended';
}

function deleteChat(chatId: ChatId, student1?: Student, student2?: Student) {
  clearStudentChatState(student1, chatId);
  clearStudentChatState(student2, chatId);

  // this function does not delete the chat from the activity object. This
  // ensures the teacher will get emailed all chats, even those which have
  // already ended.
}

export function unpairStudentChat(
  teacherSocket: Socket,
  chatId: ChatId,
  student1: { socketId: SessionId },
  student2: { socketId: SessionId },
) {
  teacherSocket.to(chatId).emit('teacher ended chat', {});

  // TODO: Rename incoming socketId fields to sessionId in the frontend contract.
  const stud1 = getStudentBySessionId(student1.socketId);
  const stud2 = getStudentBySessionId(student2.socketId);

  if (!stud1 || !stud2) return;

  deleteChat(chatId, stud1, stud2);

  removeUnpairedStudentFromActivity(stud1);
  removeUnpairedStudentFromActivity(stud2);
}

export function studentSendsMessage(message: string, socket: Socket) {
  const student = getStudentBySocketId(socket.id);
  if (!student?.chatId) return;

  const chatId = student.chatId;

  // send message to other student
  socket.to(chatId).emit('student sent message', { message });
  // send message to teacher
  const activity = getActivity(student.activityPin);
  // an activity won't exist if the teacher already left
  if (activity) {
    const teacher = getTeacherBySessionId(activity.teacherSessionId);
    teacher?.socket.emit('teacher listens to student message', {
      message,
      // TODO: Rename this field to sessionId in the frontend contract.
      socketId: student.sessionId,
      chatId,
    });

    const chat = chatLookups[chatId];
    if (!chat) return;

    const messageAuthor =
      chat.studentPair[0].sessionId === student.sessionId
        ? 'student1'
        : 'student2';
    const chatMessage: ChatMessage = [messageAuthor, message];
    chat.messages.push(chatMessage);
  }
}

export function sendUserTyping(socket: Socket) {
  const student = getStudentBySocketId(socket.id);

  if (student?.chatId) {
    socket.to(student.chatId).emit('peer is typing');
  }
}

// TODO: Simplify this helper once sessionId is the only persistent user
// identifier and socket-based lookup translation is no longer needed.
export function checkIfStudentIsInsideAnActivity(
  studentIdentifier: string,
  identifierType: 'session' | 'socket' = 'session',
) {
  const sessionId =
    identifierType === 'socket'
      ? socketIdToStudentSessionId[studentIdentifier]
      : studentIdentifier;

  return Boolean(sessionId && studentLookups[sessionId]);
}

export function startSoloMode(
  studentSessionId: SessionId,
  character: string,
  teacherSessionId: SessionId,
): { soloChatId: ChatId; messages: SoloChatMessage[] } {
  const teacher = getTeacherBySessionId(teacherSessionId);
  const student = getStudentBySessionId(studentSessionId);

  if (!teacher || !student) {
    throw new Error('Teacher or student session could not be found.');
  }

  const activity = getActivity(teacher.activityPin);
  if (!activity) {
    throw new Error('Activity could not be found for solo mode.');
  }

  const chatbotWelcomeMessages = [
    ['chatbot', 'Hi there! 👋'],
    ['chatbot', 'So, um, who are you roleplaying as today? 😊'],
  ] as SoloChatMessage[];

  const soloChatId = nanoid(8) as ChatId;
  const studentChat: SoloChat = {
    chatId: soloChatId,
    student: {
      sessionId: student.sessionId,
      realName: student.realName,
      character,
    },
    messages: chatbotWelcomeMessages,
    mostRecentStudentMessageId: null,
  };
  soloChatLookups[soloChatId] = studentChat;
  activity.soloChatIds.push(soloChatId);
  student.chatId = soloChatId;
  student.state = 'solo';
  student.connected = true;

  // Inform the student
  student.socket.emit('solo mode: chat started', {
    character,
    messages: chatbotWelcomeMessages,
  });

  return { soloChatId, messages: chatbotWelcomeMessages };
}

export async function soloModeStudentSendsMessage(
  message: string,
  studentSocket: Socket,
): Promise<SoloChatMessage[]> {
  const student = getStudentBySocketId(studentSocket.id);
  if (!student?.chatId) return [];

  const activity = getActivity(student.activityPin);
  const soloChat = soloChatLookups[student.chatId];
  if (!soloChat) return [];

  sendMessagesToTeacherAndSaveRecordOfIt(activity, soloChat, [
    ['student', message],
  ]);

  const upToDateMessageHistory = JSON.stringify(soloChat.messages);
  const chatHistoryWithCharacter = `The student was assigned the character of ${soloChat.student.character}.\n + ${upToDateMessageHistory}`;

  const currentStudentMessageId = nanoid(5);
  soloChat.mostRecentStudentMessageId = currentStudentMessageId;

  const chatbotReplyMessages = await getChatbotReplyMessages(
    chatHistoryWithCharacter,
  );

  if (currentStudentMessageId !== soloChat.mostRecentStudentMessageId) {
    // Discard the chatbot's reply messages if another student message arrived while the chatbot
    // was still preparing its reply. This ensures the chatbot only responds to the latest message.
    return [];
  }

  // Send chatbot's reply messages to teacher when the activity still exists,
  // and always persist them in the solo chat transcript.
  sendMessagesToTeacherAndSaveRecordOfIt(
    activity,
    soloChat,
    chatbotReplyMessages,
  );

  // Return chatbot's reply messages to the student
  return chatbotReplyMessages;
}

function sendMessagesToTeacherAndSaveRecordOfIt(
  activity: Activity | undefined,
  soloChat: SoloChat,
  messages: SoloChatMessage[],
) {
  if (activity) {
    const teacher = getTeacherBySessionId(activity.teacherSessionId);
    teacher?.socket.emit('solo mode: teacher listens to new message', {
      messages,
      chatId: soloChat.chatId,
    });
  }
  soloChat.messages.push(...messages);
}

export function endSoloMode(soloChatId: ChatId) {
  const soloChat = soloChatLookups[soloChatId];
  if (!soloChat) return;

  const student = getStudentBySessionId(soloChat.student.sessionId);
  if (!student) return;
  student.chatId = null;
  student.state = 'ended';

  student.socket.emit('solo mode: teacher ended chat', {});

  removeUnpairedStudentFromActivity(student);

  // This function does not delete the solo chat from the activity object.
  // This ensures the teacher will get emailed all chats, even those which have
  // already ended.
}
