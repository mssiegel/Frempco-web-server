import {
  Activity,
  ChatId,
  ChatMessage,
  ChatLookups,
  SoloChat,
  SoloChatLookups,
  SoloChatMessage,
  StudentChat,
  StudentInChat,
} from './types.js';

const pairedChatTranscripts: ChatLookups = {};
const soloChatTranscripts: SoloChatLookups = {};

export function createPairedChatTranscript(
  chatId: ChatId,
  studentPair: [StudentInChat, StudentInChat],
): StudentChat {
  const transcript: StudentChat = {
    chatId,
    studentPair,
    messages: [],
  };

  pairedChatTranscripts[chatId] = transcript;
  return transcript;
}

export function createSoloChatTranscript(
  chatId: ChatId,
  student: StudentInChat,
  messages: SoloChatMessage[],
): SoloChat {
  const transcript: SoloChat = {
    chatId,
    student,
    messages,
    mostRecentStudentMessageId: null,
  };

  soloChatTranscripts[chatId] = transcript;
  return transcript;
}

export function getPairedChatTranscript(chatId: ChatId) {
  return pairedChatTranscripts[chatId];
}

export function getSoloChatTranscript(chatId: ChatId) {
  return soloChatTranscripts[chatId];
}

export function getActivityChatTranscripts(activity: Activity) {
  return {
    pairedChats: activity.pairedChatIds
      .map((chatId) => pairedChatTranscripts[chatId])
      .filter(Boolean),
    soloChats: activity.soloChatIds
      .map((chatId) => soloChatTranscripts[chatId])
      .filter(Boolean),
  };
}

export function appendPairedChatMessage(
  chatId: ChatId,
  message: ChatMessage,
) {
  const transcript = getPairedChatTranscript(chatId);
  if (!transcript) return;

  transcript.messages.push(message);
}

export function appendSoloChatMessages(
  chatId: ChatId,
  messages: SoloChatMessage[],
) {
  const transcript = getSoloChatTranscript(chatId);
  if (!transcript) return;

  transcript.messages.push(...messages);
}
