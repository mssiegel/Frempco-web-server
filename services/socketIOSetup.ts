import { Server } from 'socket.io';

import corsOptions from './corsOptions.js';
import errorCatcher from '../utils/errorCatcher.js';
import {
  addClassroom,
  deleteClassroom,
  getTeacher,
  getStudent,
  addStudentToClassroom,
  remStudentFromClassroom,
  unpairStudentChat,
  pairStudents,
  studentSendsMessage,
  teacherSendsMessage,
  sendUserTyping,
  startSoloMode,
  soloModeStudentSendsMessage,
  soloModeTeacherSendsMessage,
  endSoloMode,
} from './database.js';

export default function socketIOSetup(server) {
  const io = new Server(server, {
    cors: corsOptions,
  });

  io.on('connect', (socket) => {
    const userDisconnected = () => {
      const teacher = getTeacher(socket.id);
      if (teacher) deleteClassroom(teacher);

      const student = getStudent(socket.id);
      if (student) remStudentFromClassroom(student);
    };
    socket.on('disconnect', errorCatcher(userDisconnected));
    socket.on('user disconnected', errorCatcher(userDisconnected));

    socket.on(
      'activate classroom',
      errorCatcher(({ classroomName }) => {
        addClassroom(classroomName, socket);
      }),
    );

    socket.on(
      'deactivate classroom',
      errorCatcher(() => {
        const teacher = getTeacher(socket.id);
        if (teacher) deleteClassroom(teacher);
      }),
    );

    socket.on(
      'new student entered',
      errorCatcher(({ student: realName, classroom: classroomName }) => {
        addStudentToClassroom(realName, classroomName, socket);
      }),
    );

    // Teacher pairs up their students
    socket.on(
      'pair students',
      errorCatcher(({ studentPairs }) => {
        pairStudents(studentPairs, socket);
      }),
    );

    socket.on(
      'remove student from classroom',
      errorCatcher(({ socketId }) => {
        const student = getStudent(socketId);
        if (student) {
          remStudentFromClassroom(student);
          student.socket.emit('remove student from classroom');
        }
      }),
    );

    socket.on(
      'unpair student chat',
      errorCatcher(({ chatId, student1, student2 }) => {
        const teacher = getTeacher(socket.id);
        unpairStudentChat(teacher.socket, chatId, student1, student2);
      }),
    );

    // New chat message sent from one student to their peer
    socket.on(
      'student sent message',
      errorCatcher(({ message }) => {
        studentSendsMessage(message, socket);
      }),
    );

    // New chat message sent from teacher to students
    socket.on(
      'teacher sent message',
      errorCatcher(({ message, chatId }) => {
        teacherSendsMessage(message, socket, chatId);
      }),
    );

    // Informs student when their peer is typing
    socket.on(
      'student typing',
      errorCatcher(() => {
        sendUserTyping(socket);
      }),
    );

    // Teacher starts solo mode for a student
    socket.on(
      'solo mode: start chat',
      errorCatcher(({ studentSocketId, characterName }, callback) => {
        const { soloChatId: chatId, messages } = startSoloMode(
          studentSocketId,
          characterName,
          socket.id,
        );
        callback({ chatId, messages });
      }),
    );

    // New chat message sent by a student in solo mode
    socket.on(
      'solo mode: student sent message',
      errorCatcher(async ({ message }, callback) => {
        const chatbotReplyMessages = await soloModeStudentSendsMessage(
          message,
          socket,
        );
        if (chatbotReplyMessages.length > 0) callback({ chatbotReplyMessages });
      }),
    );

    // New chat message sent from teacher to a student in a solo chat
    socket.on(
      'solo mode: teacher sent message',
      errorCatcher(({ message, chatId }) => {
        soloModeTeacherSendsMessage(message, socket, chatId);
      }),
    );

    // Teacher ends solo mode for a student
    socket.on(
      'solo mode: end chat',
      errorCatcher(({ chatId }) => {
        endSoloMode(socket, chatId);
      }),
    );
  });
}
