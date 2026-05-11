import { Server } from 'socket.io';

import corsOptions from './corsOptions.js';
import { SERVER_EMIT_EVENTS } from './emitEvents.const.js';
import { SERVER_LISTEN_EVENTS } from './listenEvents.const.js';
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
  reconnectPairedStudentIfInGrace,
  getPairedChatReconnectSnapshot,
  getSoloChatReconnectSnapshot,
  removeStudentFromActivityAfterPageLeave,
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
    reconnectPairedStudentIfInGrace(socket);

    const getSessionId = () => getSessionIdFromSocket(socket);

    const userDisconnected = () => {
      const teacher = getConnectedTeacher(socket);
      if (teacher) deleteActivity(teacher);

      const student = getConnectedStudent(socket);
      if (student) removeStudentFromActivity(student);
    };
    socket.on('disconnect', errorCatcher(userDisconnected));
    socket.on(
      SERVER_LISTEN_EVENTS.TEACHER_LEAVE_ACTIVITY,
      errorCatcher(userDisconnected),
    );
    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_LEFT_PAGE,
      errorCatcher(() => {
        removeStudentFromActivityAfterPageLeave(getSessionId());
      }),
    );

    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_REFRESHED_PAGE,
      errorCatcher(() => {
        removeStudentFromActivityAfterPageLeave(getSessionId());
      }),
    );

    socket.on(
      SERVER_LISTEN_EVENTS.TEACHER_CREATE_ACTIVITY,
      errorCatcher(({ activityPin, email }) => {
        addActivity(activityPin, socket, email);
      }),
    );

    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_JOIN_ACTIVITY,
      errorCatcher(({ student: realName, activityPin }) => {
        addStudentToActivity(realName, activityPin, socket);
      }),
    );

    // Teacher pairs up their students
    socket.on(
      SERVER_LISTEN_EVENTS.TEACHER_PAIR_STUDENTS,
      errorCatcher(({ studentPairs }) => {
        pairStudents(studentPairs, socket);
      }),
    );

    socket.on(
      SERVER_LISTEN_EVENTS.TEACHER_SET_REAL_NAME_REVEAL,
      errorCatcher(({ shouldRevealStudentRealNames }) => {
        setStudentRealNameRevealForActivity(
          socket,
          shouldRevealStudentRealNames,
        );
      }),
    );

    socket.on(
      SERVER_LISTEN_EVENTS.TEACHER_REMOVE_UNPAIRED_STUDENT_FROM_ACTIVITY,
      errorCatcher(({ sessionId }) => {
        const student = getStudentBySessionId(sessionId);
        if (student) {
          removeUnpairedStudentFromActivity(student);
          student.socket.emit(SERVER_EMIT_EVENTS.STUDENT_REMOVED_FROM_ACTIVITY);
        }
      }),
    );

    socket.on(
      SERVER_LISTEN_EVENTS.TEACHER_END_PAIRED_CHAT,
      errorCatcher(({ chatId, student1, student2 }) => {
        unpairStudentChat(socket, chatId, student1, student2);
      }),
    );

    // Student ends a paired chat
    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_END_PAIRED_CHAT,
      errorCatcher(() => {
        studentEndedPairedChat(socket);
      }),
    );

    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_REJOIN_PAIRED_CHAT,
      errorCatcher((callback) => {
        callback(getPairedChatReconnectSnapshot(socket));
      }),
    );

    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_REJOIN_SOLO_CHAT,
      errorCatcher((callback) => {
        callback(getSoloChatReconnectSnapshot(socket));
      }),
    );

    // Student ends a solo chat
    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_END_SOLO_CHAT,
      errorCatcher(() => {
        studentEndedSoloChat(socket);
      }),
    );

    // New chat message sent from one student to their peer
    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_SEND_PAIRED_MESSAGE,
      errorCatcher(({ message }) => {
        studentSendsMessage(message, socket);
      }),
    );

    // Informs the chat peer about typing activity.
    socket.on(
      SERVER_LISTEN_EVENTS.STUDENT_SEND_TYPING,
      errorCatcher(() => {
        sendUserTyping(socket);
      }),
    );

    // Teacher starts solo mode for a student
    socket.on(
      SERVER_LISTEN_EVENTS.TEACHER_START_SOLO_CHAT,
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
      SERVER_LISTEN_EVENTS.STUDENT_SEND_SOLO_MESSAGE,
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
      SERVER_LISTEN_EVENTS.TEACHER_END_SOLO_CHAT,
      errorCatcher(({ chatId }) => {
        endSoloMode(chatId);
      }),
    );
  });
}
