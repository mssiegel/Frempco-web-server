import { Socket } from 'socket.io';
import { nanoid } from 'nanoid/non-secure';

import {
  Activities,
  Teachers,
  Students,
  Student,
  ChatIds,
  ChatId,
  StudentChat,
  ChatMessage,
  SoloChat,
  SoloChatIds,
  SoloChatMessage,
} from './types.js';
import { sendEmailOfChats } from './sendEmailOfChats.js';
import { getChatbotReplyMessages } from './gemini.js';

const activities: Activities = {};
const teachers: Teachers = {};
const students: Students = {};
const chatIds: ChatIds = {};
const soloChatIds: SoloChatIds = {};

export function getActivity(activityPin: string) {
  return activities[activityPin];
}

export function addActivity(
  activityPin: string,
  socket: Socket,
  email: string,
) {
  teachers[socket.id] = { socket, activityPin };
  activities[activityPin] = {
    teacherSocketId: socket.id,
    students: [],
    chats: {},
    soloChats: {},
    email,
  };
}

export async function deleteActivity(teacher) {
  // Email the chats to the teacher before deleting the activity
  await emailChatsToTeacher(teacher.socket.id);

  delete activities[teacher.activityPin];
  delete teachers[teacher.socket.id];

  // Does not delete the students from their chats. This lets the students
  // continue chatting even after the teacher closes the website. Additional
  // chat messages sent after the teacher deletes the activity will not be
  // emailed to the teacher.
}

async function emailChatsToTeacher(teacherSocketId: string) {
  // Sends all chats to the teacher, even those which have already ended.

  const activityPin = teachers[teacherSocketId].activityPin;
  const activity = getActivity(activityPin);
  const chats = Object.values(activity.chats);
  const soloChats = Object.values(activity.soloChats);

  if ((chats.length === 0 && soloChats.length === 0) || activity.email === '')
    return;

  await sendEmailOfChats(chats, soloChats, activity.email);
}

export function setActivityEmail(activityPin: string, email: string) {
  activities[activityPin].email = email;
}

export function getTeacher(socketId: string) {
  return teachers[socketId];
}

export function getStudent(socketId: string) {
  return students[socketId];
}

export function addStudentToActivity(
  realName: string,
  activityPin: string,
  socket: Socket,
) {
  students[socket.id] = {
    socket,
    activityPin,
    realName,
    peerSocketId: null,
  };

  const activity = getActivity(activityPin);
  // activity won't exist if the teacher already left or pin is invalid
  if (!activity) return;

  // double check student has not already joined activity
  if (activity.students.includes(socket.id)) return;
  activity.students.push(socket.id);

  // inform teacher
  const teacherSocket = teachers[activity.teacherSocketId].socket;
  teacherSocket.emit('new student joined', { realName, socketId: socket.id });
}

/**
 * Removes a student from an activity when it is known they were not in a
 * paired or solo chat.
 */
export function removeUnpairedStudentFromActivity(student: Student) {
  const activity = getActivity(student.activityPin);

  if (activity) {
    activity.students = activity.students.filter(
      (socketId) => socketId !== student.socket.id,
    );
  }

  delete students[student.socket.id];
}

/**
 * Handles the case when a student leaves and it is unknown whether they were
 * in a chat.
 */
export function removeStudentFromActivity(student: Student) {
  const activityPin = student.activityPin;
  const activity = getActivity(activityPin);

  const isStudentInPairedChat = student.peerSocketId !== null;
  const isStudentInSoloMode = student.socket.id in soloChatIds;

  if (!isStudentInPairedChat && !isStudentInSoloMode) {
    removeUnpairedStudentFromActivity(student);

    const teacherSocket = getTeacher(activity.teacherSocketId).socket;
    teacherSocket.emit('unpaired student left', {
      socketId: student.socket.id,
    });
    return;
  }

  let teacherSocket = null;
  // an activity won't exist if the teacher already left
  if (activity) {
    activity.students = activity.students.filter(
      (socketId) => socketId !== student.socket.id,
    );

    const teacher = getTeacher(activity.teacherSocketId);
    teacherSocket = teacher.socket;

    if (isStudentInSoloMode) {
      teacherSocket.emit('solo mode: student disconnected', {
        chatId: soloChatIds[student.socket.id],
      });
      delete soloChatIds[student.socket.id];
    }
  }

  if (isStudentInPairedChat) {
    const chatId = chatIds[student.socket.id];
    student.socket.to(chatId).emit('peer left chat', {});
    const student2 = getStudent(student.peerSocketId);

    deleteChat(chatId, student, student2);
    removeUnpairedStudentFromActivity(student2);

    // a teacher socket won't exist if the teacher already left
    if (teacherSocket) {
      teacherSocket.emit('chat ended - two students', { chatId });
    }
  }

  delete students[student.socket.id];
}

export function pairStudents(studentPairs, teacherSocket: Socket) {
  const activityPin = teachers[teacherSocket.id].activityPin;
  const activity = getActivity(activityPin);

  for (const [tempStudent1, tempStudent2] of studentPairs) {
    const student1 = getStudent(tempStudent1.socketId);
    const student2 = getStudent(tempStudent2.socketId);
    const chatId = `${nanoid(5)}#${student1.socket.id}#${
      student2.socket.id
    }` as ChatId;

    // join the students to a chat
    student1.socket.join(chatId);
    student2.socket.join(chatId);
    // map their socket ids to the chat
    chatIds[student1.socket.id] = chatId;
    chatIds[student2.socket.id] = chatId;

    // set peer ids so they can be later unpaired
    students[student1.socket.id].peerSocketId = student2.socket.id;
    students[student2.socket.id].peerSocketId = student1.socket.id;

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
      studentPair: [tempStudent1, tempStudent2],
    });

    // add a chat object to the activity object. This will let us store a
    // record of the chat messages.
    const studentChat: StudentChat = {
      studentPair: [
        {
          realName: student1.realName,
          character: tempStudent1.character,
          socketId: student1.socket.id,
        },
        {
          realName: student2.realName,
          character: tempStudent2.character,
          socketId: student2.socket.id,
        },
      ],
      messages: [],
    };
    activity.chats[chatId] = studentChat;
  }
}

function deleteChat(chatId: ChatId, student1: Student, student2: Student) {
  student1.socket.leave(chatId);
  student2.socket.leave(chatId);

  student1.peerSocketId = null;
  student2.peerSocketId = null;

  delete chatIds[student1.socket.id];
  delete chatIds[student2.socket.id];

  // this function does not delete the chat from the activity object. This
  // ensures the teacher will get emailed all chats, even those which have
  // already ended.
}

export function unpairStudentChat(
  teacherSocket: Socket,
  chatId: ChatId,
  student1,
  student2,
) {
  teacherSocket.to(chatId).emit('teacher ended chat', {});

  const stud1 = getStudent(student1.socketId);
  const stud2 = getStudent(student2.socketId);

  deleteChat(chatId, stud1, stud2);

  removeUnpairedStudentFromActivity(stud1);
  removeUnpairedStudentFromActivity(stud2);
}

export function studentSendsMessage(message: string, socket: Socket) {
  const socketId = socket.id;
  const chatId = chatIds[socketId];

  // send message to other student
  socket.to(chatId).emit('student sent message', { message });
  // send message to teacher
  const activityPin = students[socketId].activityPin;
  const activity = getActivity(activityPin);
  // an activity won't exist if the teacher already left
  if (activity) {
    socket
      .to(activity.teacherSocketId)
      .emit('teacher listens to student message', {
        message,
        socketId,
        chatId,
      });

    const chat: StudentChat = activity.chats[chatId];
    const messageAuthor =
      chat.studentPair[0].socketId === socketId ? 'student1' : 'student2';
    const chatMessage: ChatMessage = [messageAuthor, message];
    chat.messages.push(chatMessage);
  }
}

export function sendUserTyping(socket: Socket) {
  const chatId = chatIds[socket.id];
  socket.to(chatId).emit('peer is typing');
}

export function checkIfStudentIsInsideAnActivity(socketId: string) {
  return socketId in students;
}

export function startSoloMode(
  studentSocketId: string,
  characterName: string,
  teacherSocketId: string,
): { soloChatId: ChatId; messages: SoloChatMessage[] } {
  const activityPin = teachers[teacherSocketId].activityPin;
  const activity = getActivity(activityPin);
  const realName = getStudent(studentSocketId).realName;

  const chatbotWelcomeMessages = [
    ['chatbot', 'Hi there! 👋'],
    ['chatbot', 'So, um, who are you roleplaying as today? 😊'],
  ] as SoloChatMessage[];

  // Add a solo chat object to the activity object to store a record of the
  // chat messages.
  const studentChat: SoloChat = {
    student: {
      realName: realName,
      character: characterName,
      socketId: studentSocketId,
    },
    messages: chatbotWelcomeMessages,
    mostRecentStudentMessageId: null,
  };
  const soloChatId = `${nanoid(5)}#${studentSocketId}` as ChatId;
  activity.soloChats[soloChatId] = studentChat;

  soloChatIds[studentSocketId] = soloChatId;

  const student = getStudent(studentSocketId);
  // Inform the student
  student.socket.emit('solo mode: chat started', {
    character: characterName,
    messages: chatbotWelcomeMessages,
  });

  return { soloChatId, messages: chatbotWelcomeMessages };
}

export async function soloModeStudentSendsMessage(
  message: string,
  studentSocket: Socket,
): Promise<SoloChatMessage[]> {
  const socketId = studentSocket.id;
  const soloChatId = soloChatIds[socketId];

  const activityPin = students[socketId].activityPin;
  const activity = getActivity(activityPin);
  const soloChat = activity.soloChats[soloChatId];
  // An activity won't exist if the teacher already left
  if (activity) {
    // Send student's message to teacher
    sendMessagesToTeacherAndSaveRecordOfIt(
      activity,
      soloChat,
      studentSocket,
      soloChatId,
      [['student', message]],
    );
  }

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

  if (activity) {
    // Send chatbot's reply messages to teacher
    sendMessagesToTeacherAndSaveRecordOfIt(
      activity,
      soloChat,
      studentSocket,
      soloChatId,
      chatbotReplyMessages,
    );
  }

  // Return chatbot's reply messages to the student
  return chatbotReplyMessages;
}

function sendMessagesToTeacherAndSaveRecordOfIt(
  activity,
  soloChat: SoloChat,
  studentSocket: Socket,
  soloChatId: ChatId,
  messages: SoloChatMessage[],
) {
  if (activity) {
    studentSocket
      .to(activity.teacherSocketId)
      .emit('solo mode: teacher listens to new message', {
        messages,
        chatId: soloChatId,
      });
  }
  soloChat.messages.push(...messages);
}

export function endSoloMode(teacherSocket: Socket, soloChatId: ChatId) {
  const activityPin = teachers[teacherSocket.id].activityPin;
  const activity = getActivity(activityPin);
  const studentSocketId = activity.soloChats[soloChatId].student.socketId;

  delete soloChatIds[studentSocketId];

  teacherSocket.to(studentSocketId).emit('solo mode: teacher ended chat', {});

  removeUnpairedStudentFromActivity(getStudent(studentSocketId));

  // This function does not delete the solo chat from the activity object.
  // This ensures the teacher will get emailed all chats, even those which have
  // already ended.
}
