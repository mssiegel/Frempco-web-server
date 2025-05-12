import nodemailer from 'nodemailer';

import { SoloChat, StudentChat } from '../services/types';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for port 465, false for other ports
  auth: {
    user: 'NoReplyFrempco@gmail.com',
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export async function sendEmailOfChats(
  chats: StudentChat[],
  soloChats: SoloChat[],
  recipientEmail: string,
) {
  if (!process.env.EMAIL_APP_PASSWORD) {
    return console.error(
      'EMAIL_APP_PASSWORD not found in environment variables',
    );
  }

  const currentTimestampInSeconds = Math.floor(Date.now() / 1000);

  const info = await transporter.sendMail({
    // sender address
    from: '"Frempco No Reply" <NoReplyFrempco@gmail.com>',
    // list of receivers
    to: recipientEmail,
    // Subject line, we add the timestamp to make the subject line unique
    subject: `Frempco chats ${currentTimestampInSeconds}`,
    // plain text body, used by old email clients that don't support html
    text: createTextBody(chats, soloChats),
    // html body, used by modern email clients
    html: createHtmlBody(chats, soloChats),
  });

  console.log('Email sent: %s', info.messageId);
}

function createHtmlBody(chats: StudentChat[], soloChats: SoloChat[]) {
  let body = '';
  const student1TextColor = '#0070ff';
  const student2TextColor = 'red';

  if (chats.length) {
    body += `<div style="font-size: 24px; font-weight: bold; text-align: center;">Paired Students Chats</div>`;
    let chatCount = 1;
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      body += `<div style="font-size: 18px; ${
        i === 0 ? '' : 'margin-top: 32px;'
      }">----- Paired Students Chat #${chatCount} -----</div>`;
      body += `<div style="font-size: 18px;">${chat.studentPair[0].realName} as <span style="color: ${student1TextColor}; font-weight: bold;">${chat.studentPair[0].character}</span></div>`;
      body += `<div style="font-size: 18px; margin-bottom: 16px;">${chat.studentPair[1].realName} as <span style="color: ${student2TextColor}; font-weight: bold;">${chat.studentPair[1].character}</span></div>`;
      for (const [messageAuthor, message] of chat.messages) {
        let character = '';
        let authorTextColor = '';
        switch (messageAuthor) {
          case 'student1':
            character = chat.studentPair[0].character;
            authorTextColor = student1TextColor;
            break;
          case 'student2':
            character = chat.studentPair[1].character;
            authorTextColor = student2TextColor;
            break;
          case 'teacher':
            character = 'TEACHER';
            authorTextColor = 'purple';
        }

        const messageToAdd = `<div style="font-size: 16px;"><span style="color: ${authorTextColor}; font-weight: bold;">${character}: </span>${message}</div>`;
        body += messageToAdd;
      }
      chatCount++;
    }
  }

  if (soloChats.length) {
    body += `<div style="font-size: 24px; font-weight: bold; text-align: center; margin-top: 32px;">Solo Chats</div>`;
    let soloChatCount = 1;
    for (let i = 0; i < soloChats.length; i++) {
      const soloChat = soloChats[i];
      body += `<div style="font-size: 18px; ${
        i === 0 ? '' : 'margin-top: 32px;'
      }">----- Solo Chat #${soloChatCount} -----</div>`;
      body += `<div style="font-size: 18px;">${soloChat.student.realName} as <span style="color: ${student1TextColor}; font-weight: bold;">${soloChat.student.character}</span></div>`;
      body += `<div style="font-size: 18px; margin-bottom: 16px;"><span style="color: ${student2TextColor}; font-weight: bold;">chatbot</span></div>`;
      for (const [messageAuthor, message] of soloChat.messages) {
        let character = '';
        let authorTextColor = '';
        switch (messageAuthor) {
          case 'student':
            character = soloChat.student.character;
            authorTextColor = student1TextColor;
            break;
          case 'chatbot':
            character = 'chatbot';
            authorTextColor = student2TextColor;
            break;
          case 'teacher':
            character = 'TEACHER';
            authorTextColor = 'purple';
        }

        const messageToAdd = `<div style="font-size: 16px;"><span style="color: ${authorTextColor}; font-weight: bold;">${character}: </span>${message}</div>`;
        body += messageToAdd;
      }
      soloChatCount++;
    }
  }

  body +=
    '<div style="margin-top: 32px; text-align: center; font-size: 16px">-----</div>';
  body +=
    '<div style="text-align: center; font-size: 16px">All converations in this email were created by students on <a href="https://www.frempco.com/">Frempco</a>.</div>';
  return body;
}

function createTextBody(chats: StudentChat[], soloChats: SoloChat[]) {
  let body = '';
  if (chats.length) {
    body += '----- Paired Students Chats -----\n\n';
    let chatCount = 1;
    for (let i = 0; i < chats.length; i++) {
      const chat = chats[i];
      if (i !== 0) body += '\n\n';

      body += `----- Paired Students Chat #${chatCount} -----\n`;
      body += `${chat.studentPair[0].realName} as ${chat.studentPair[0].character}\n`;
      body += `${chat.studentPair[1].realName} as ${chat.studentPair[1].character}\n\n`;
      for (const [messageAuthor, message] of chat.messages) {
        let character = '';
        switch (messageAuthor) {
          case 'student1':
            character = chat.studentPair[0].character;
            break;
          case 'student2':
            character = chat.studentPair[1].character;
            break;
          case 'teacher':
            character = 'TEACHER';
        }

        const messageToAdd = `${character}: ${message}\n`;
        body += messageToAdd;
      }
      chatCount++;
    }
  }

  if (soloChats.length) {
    body += '\n\n----- Solo Chats -----\n\n';
    let soloChatCount = 1;
    for (let i = 0; i < soloChats.length; i++) {
      const soloChat = soloChats[i];
      if (i !== 0) body += '\n\n';

      body += `----- Solo Chat #${soloChatCount} -----\n`;
      body += `${soloChat.student.realName} as ${soloChat.student.character}\n`;
      body += 'chatbot\n\n';
      for (const [messageAuthor, message] of soloChat.messages) {
        let character = '';
        switch (messageAuthor) {
          case 'student':
            character = soloChat.student.character;
            break;
          case 'chatbot':
            character = 'chatbot';
            break;
          case 'teacher':
            character = 'TEACHER';
        }

        const messageToAdd = `${character}: ${message}\n`;
        body += messageToAdd;
      }
      soloChatCount++;
    }
  }

  body += '\n\n-----\n';
  body += 'All converations in this email were created by students on Frempco.';
  return body;
}
