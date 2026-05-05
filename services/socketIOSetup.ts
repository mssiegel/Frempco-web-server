import { Server } from 'socket.io';

import corsOptions from './corsOptions.js';
import errorCatcher from '../utils/errorCatcher.js';
import {
  addActivity,
  deleteActivity,
  getSessionIdFromSocket,
  getConnectedTeacher,
  getConnectedStudent,
  getStudentBySessionId,
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
  studentEndedPairedChat,
  checkIfConnectedStudentIsInsideAnActivity,
  studentEndedSoloChat,
  setStudentRealNameRevealForActivity,
} from './database.js';

export default function socketIOSetup(server) {
  const io = new Server(server, {
    cors: corsOptions,
  });

  io.use((socket, next) => {
    try {
      socket.data.sessionId = getSessionIdFromSocket(socket);
      next();
    } catch (error) {
      next(
        error instanceof Error
          ? error
          : new Error('Socket connection requires auth.sessionId.'),
      );
    }
  });

  io.on('connect', (socket) => {
    const getSessionId = () => getSessionIdFromSocket(socket);

    const userDisconnected = () => {
      const teacher = getConnectedTeacher(socket);
      if (teacher) deleteActivity(teacher);

      const student = getConnectedStudent(socket);
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
      'teacher:set-real-name-reveal',
      errorCatcher(({ shouldRevealStudentRealNames }) => {
        setStudentRealNameRevealForActivity(
          socket,
          shouldRevealStudentRealNames,
        );
      }),
    );

    socket.on(
      'teacher:removed-unpaired-student-from-activity',
      errorCatcher(({ sessionId }) => {
        const student = getStudentBySessionId(sessionId);
        if (student) {
          removeUnpairedStudentFromActivity(student);
          student.socket.emit('student:removed-from-activity');
        }
      }),
    );

    socket.on(
      'unpair student chat',
      errorCatcher(({ chatId, student1, student2 }) => {
        unpairStudentChat(socket, chatId, student1, student2);
      }),
    );

    // Student ends a paired chat
    socket.on(
      'student:ended-paired-chat',
      errorCatcher(() => {
        studentEndedPairedChat(socket);
      }),
    );

    // Student ends a solo chat
    socket.on(
      'student:ended-solo-chat',
      errorCatcher(() => {
        studentEndedSoloChat(socket);
      }),
    );

    // New chat message sent from one student to their peer
    socket.on(
      'student sent message',
      errorCatcher(({ message }) => {
        studentSendsMessage(message, socket);
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
      errorCatcher(({ studentSessionId, characterName }, callback) => {
        const { soloChatId: chatId, messages } = startSoloMode(
          studentSessionId,
          characterName,
          getSessionId(),
        );
        callback({ chatId, messages });
      }),
    );

    // New chat message sent by a student in solo mode
    socket.on(
      'solo mode: student sent message',
      errorCatcher(async ({ message }, callback) => {
        const isStudentInsideActivity =
          checkIfConnectedStudentIsInsideAnActivity(socket);

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
        endSoloMode(chatId);
      }),
    );
  });
}
