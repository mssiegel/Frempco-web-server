import { Server } from 'socket.io';

import corsOptions from './corsOptions.js';
import errorCatcher from '../utils/errorCatcher.js';
import {
  addActivity,
  deleteActivity,
  getTeacher,
  getStudent,
  addStudentToActivity,
  removeUnpairedStudentFromActivity,
  removeStudentFromActivity,
  unpairStudentChat,
  pairStudents,
  studentSendsMessage,
  sendUserTyping,
  startSoloMode,
  soloModeStudentSendsMessage,
  endSoloMode,
  checkIfStudentIsInsideAnActivity,
} from './database.js';

export default function socketIOSetup(server) {
  const io = new Server(server, {
    cors: corsOptions,
  });

  io.on('connect', (socket) => {
    const userDisconnected = () => {
      const teacher = getTeacher(socket.id);
      if (teacher) deleteActivity(teacher);

      const student = getStudent(socket.id);
      if (student) removeStudentFromActivity(student);
    };
    socket.on('disconnect', errorCatcher(userDisconnected));
    socket.on('user disconnected', errorCatcher(userDisconnected));

    socket.on(
      'create activity',
      errorCatcher(({ activityPin, email }) => {
        addActivity(activityPin, socket, email);
      }),
    );

    socket.on(
      'new student entered',
      errorCatcher(({ student: realName, activityPin }) => {
        addStudentToActivity(realName, activityPin, socket);
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
      'remove student from activity',
      errorCatcher(({ socketId }) => {
        const student = getStudent(socketId);
        if (student) {
          removeUnpairedStudentFromActivity(student);
          student.socket.emit('student removed from activity');
        }
      }),
    );

    socket.on(
      'unpair student chat',
      errorCatcher(({ chatId, student1, student2 }) => {
        unpairStudentChat(socket, chatId, student1, student2);
      }),
    );

    // New chat message sent from one student to their peer
    socket.on(
      'student sent message',
      errorCatcher(({ message }) => {
        // A student is no longer in the server's activity when a student's
        // phone goes dark and the socket disconnects and afterwards the student
        // reopens the web app and sends a message.
        const isStudentInsideActivity = checkIfStudentIsInsideAnActivity(
          socket.id,
        );
        if (isStudentInsideActivity) studentSendsMessage(message, socket);
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
        const isStudentInsideActivity = checkIfStudentIsInsideAnActivity(
          socket.id,
        );

        // A student is no longer in the server's activity when a student's
        // phone goes dark and the socket disconnects and afterwards the student
        // reopens the web app and sends a message.
        if (isStudentInsideActivity) {
          const chatbotReplyMessages = await soloModeStudentSendsMessage(
            message,
            socket,
          );

          // If another student message is received before the chatbot finished
          // generating a reply to the previous message, the pending reply is
          // discarded, and chatbotReplyMessages will be empty for this turn.
          if (chatbotReplyMessages.length > 0)
            callback({ chatbotReplyMessages });
        }
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
