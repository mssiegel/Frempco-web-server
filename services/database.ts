import { Socket } from 'socket.io';
import { nanoid } from 'nanoid/non-secure';

import {
  Classrooms,
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
} from './types';
import { sendEmailOfChats } from './sendEmailOfChats.js';
import { getChatbotReplyMessages } from './gemini.js';

const classrooms: Classrooms = {};
const teachers: Teachers = {};
const students: Students = {};
const chatIds: ChatIds = {};
const soloChatIds: SoloChatIds = {};

export function getClassroom(classroomName: string) {
  return classrooms[classroomName];
}

export function addClassroom(classroomName: string, socket: Socket) {
  teachers[socket.id] = { socket, classroomName };
  classrooms[classroomName] = {
    teacherSocketId: socket.id,
    students: [],
    chats: {},
    soloChats: {},
    email: '',
  };
}

export async function deleteClassroom(teacher) {
  // Email the chats to the teacher before deleting the classroom
  await emailChatsToTeacher(teacher.socket.id);

  delete classrooms[teacher.classroomName];
  delete teachers[teacher.socket.id];

  // Does not delete the students from their chats. This lets the students
  // continue chatting even after the teacher closes the website. Additional
  // chat messages sent after the teacher deletes the classrom will not be
  // emailed to the teacher.
}

async function emailChatsToTeacher(teacherSocketId: string) {
  // Sends all chats to the teacher, even those which have already ended.

  const classroomName = teachers[teacherSocketId].classroomName;
  const classroom = getClassroom(classroomName);
  const chats = Object.values(classroom.chats);
  const soloChats = Object.values(classroom.soloChats);

  if ((chats.length === 0 && soloChats.length === 0) || classroom.email === '')
    return;

  await sendEmailOfChats(chats, soloChats, classroom.email);
}

export function setClassroomEmail(classroomName: string, email: string) {
  classrooms[classroomName].email = email;
}

export function getTeacher(socketId: string) {
  return teachers[socketId];
}

export function getStudent(socketId: string) {
  return students[socketId];
}

export function addStudentToClassroom(
  realName: string,
  classroomName: string,
  socket: Socket,
) {
  students[socket.id] = {
    socket,
    classroomName,
    realName,
    peerSocketId: null,
  };

  const classroom = getClassroom(classroomName);
  // double check student has not already joined classroom
  if (classroom.students.includes(socket.id)) return;
  classroom.students.push(socket.id);

  // inform teacher
  const teacherSocket = teachers[classroom.teacherSocketId].socket;
  teacherSocket.emit('new student joined', { realName, socketId: socket.id });
}

export function remStudentFromClassroom(student: Student) {
  const classroomName = student.classroomName;
  const classroom = getClassroom(classroomName);

  const isStudentInPairedChat = student.peerSocketId !== null;
  let teacherSocket = null;
  // a classroom won't exist if the teacher already left
  if (classroom) {
    classroom.students = classroom.students.filter(
      (socketId) => socketId !== student.socket.id,
    );

    const teacher = getTeacher(classroom.teacherSocketId);
    teacherSocket = teacher.socket;
    const isStudentInSoloMode = student.socket.id in soloChatIds;

    // Notify teacher if the student was neither in paired chat nor in solo chat
    if (!isStudentInPairedChat && !isStudentInSoloMode) {
      teacherSocket.emit('unpaired student left', {
        socketId: student.socket.id,
      });
    }

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

    // a teacher socket won't exist if the teacher already left
    if (teacherSocket) {
      // informs teacher that chat ended but student2 remains in the classroom
      teacherSocket.emit('chat ended - two students', {
        chatId,
        student2: {
          realName: student2.realName,
          socketId: student2.socket.id,
        },
      });
    }
  }

  delete students[student.socket.id];
}

export function pairStudents(studentPairs, teacherSocket: Socket) {
  const classroomName = teachers[teacherSocket.id].classroomName;
  const classroom = getClassroom(classroomName);

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

    // add a chat object to the classroom object. This will let us store a
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
    classroom.chats[chatId] = studentChat;
  }
}

function deleteChat(chatId: ChatId, student1: Student, student2: Student) {
  student1.socket.leave(chatId);
  student2.socket.leave(chatId);

  student1.peerSocketId = null;
  student2.peerSocketId = null;

  delete chatIds[student1.socket.id];
  delete chatIds[student2.socket.id];

  // this function does not delete the chat from the classroom object. This
  // ensures the teacher will get emailed all chats, even those which have
  // already ended.
}

export function unpairStudentChat(
  teacherSocket: Socket,
  chatId: ChatId,
  student1,
  student2,
) {
  const stud1 = getStudent(student1.socketId);
  const stud2 = getStudent(student2.socketId);

  // TODO refactor: have the teacher socket emit the message to end the chat.
  stud1.socket.to(chatId).emit('teacher ended chat', {});
  stud2.socket.to(chatId).emit('teacher ended chat', {});

  deleteChat(chatId, stud1, stud2);

  // TODO refactor: no need for this event, just end the chat on the teacher's front end immediately.
  if (teacherSocket) {
    teacherSocket.emit('student chat unpaired', {
      chatId,
      student1,
      student2,
    });
  }
}

export function studentSendsMessage(message: string, socket: Socket) {
  const socketId = socket.id;
  const chatId = chatIds[socketId];

  // send message to other student
  socket.to(chatId).emit('student sent message', { message });
  // send message to teacher
  const classroomName = students[socketId].classroomName;
  const classroom = getClassroom(classroomName);
  // a classroom won't exist if the teacher already left
  if (classroom) {
    socket
      .to(classroom.teacherSocketId)
      .emit('teacher listens to student message', {
        message,
        socketId,
        chatId,
      });

    const chat: StudentChat = classroom.chats[chatId];
    const messageAuthor =
      chat.studentPair[0].socketId === socketId ? 'student1' : 'student2';
    const chatMessage: ChatMessage = [messageAuthor, message];
    chat.messages.push(chatMessage);
  }
}

export function teacherSendsMessage(
  message: string,
  socket: Socket,
  chatId: ChatId,
) {
  socket.to(chatId).emit('teacher sent message', { message });

  const classroomName = teachers[socket.id].classroomName;
  const classroom = getClassroom(classroomName);
  const chat: StudentChat = classroom.chats[chatId];
  const chatMessage: ChatMessage = ['teacher', message];
  chat.messages.push(chatMessage);
}

export function sendUserTyping(socket: Socket) {
  const chatId = chatIds[socket.id];
  socket.to(chatId).emit('peer is typing');
}

export function startSoloMode(
  studentSocketId: string,
  characterName: string,
  teacherSocketId: string,
): { soloChatId: ChatId; messages: SoloChatMessage[] } {
  const classroomName = teachers[teacherSocketId].classroomName;
  const classroom = getClassroom(classroomName);
  const realName = getStudent(studentSocketId).realName;

  const chatbotWelcomeMessages = [
    ['chatbot', 'Hi there! 👋'],
    ['chatbot', 'So, um, who are you roleplaying as today? 😊'],
  ] as SoloChatMessage[];

  // Add a solo chat object to the classroom object to store a record of the
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
  classroom.soloChats[soloChatId] = studentChat;

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
): Promise<SoloChatMessage[] | null> {
  const socketId = studentSocket.id;
  const soloChatId = soloChatIds[socketId];

  if (soloChatId === undefined) return null;

  const classroomName = students[socketId].classroomName;
  const classroom = getClassroom(classroomName);
  const soloChat = classroom.soloChats[soloChatId];
  // A classroom won't exist if the teacher already left
  if (classroom) {
    // Send student's message to teacher
    sendMessagesToTeacherAndSaveRecordOfIt(
      classroom,
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
    // Ignore the reply messages if the student sent a new message before the
    // chatbot finished generating its reply.
    return [];
  }

  if (classroom) {
    // Send chatbot's reply messages to teacher
    sendMessagesToTeacherAndSaveRecordOfIt(
      classroom,
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
  classroom,
  soloChat: SoloChat,
  studentSocket: Socket,
  soloChatId: ChatId,
  messages: SoloChatMessage[],
) {
  if (classroom) {
    studentSocket
      .to(classroom.teacherSocketId)
      .emit('solo mode: teacher listens to new message', {
        messages,
        chatId: soloChatId,
      });
  }
  soloChat.messages.push(...messages);
}

export function soloModeTeacherSendsMessage(
  message: string,
  teacherSocket: Socket,
  soloChatId: ChatId,
) {
  const classroomName = teachers[teacherSocket.id].classroomName;
  const classroom = getClassroom(classroomName);
  const studentSocketId = classroom.soloChats[soloChatId].student.socketId;

  teacherSocket
    .to(studentSocketId)
    .emit('solo mode: teacher sent message', { message });

  const soloChat: SoloChat = classroom.soloChats[soloChatId];
  const soloChatMessage: SoloChatMessage = ['teacher', message];
  soloChat.messages.push(soloChatMessage);
}

export function endSoloMode(teacherSocket: Socket, soloChatId: ChatId) {
  const classroomName = teachers[teacherSocket.id].classroomName;
  const classroom = getClassroom(classroomName);
  const studentSocketId = classroom.soloChats[soloChatId].student.socketId;

  delete soloChatIds[studentSocketId];

  teacherSocket.to(studentSocketId).emit('solo mode: teacher ended chat', {});

  // This function does not delete the solo chat from the classroom object.
  // This ensures the teacher will get emailed all chats, even those which have
  // already ended.
}
