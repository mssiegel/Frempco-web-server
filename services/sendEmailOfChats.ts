import nodemailer from 'nodemailer';

import { StudentChat } from '../services/types';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for port 465, false for other ports
  auth: {
    user: 'siegel.moshes@gmail.com',
    pass: 'lmpl dhww upgy rlbo',
  },
});

export async function sendEmailOfChats(
  chats: StudentChat[],
  recipientEmail: string,
) {
  const info = await transporter.sendMail({
    from: '"Moshe Siegel" <siegel.moshes@gmail.com>', // sender address
    to: recipientEmail, // list of receivers
    subject: 'Frempco chats', // Subject line
    text: createTextBody(chats), // plain text body, used by old email clients that don't support html
    html: createHtmlBody(chats), // html body, used by modern email clients
  });

  console.log('Email sent: %s', info.messageId);
}

function createHtmlBody(chats: StudentChat[]) {
  let body = '';
  let chatCount = 1;
  const student1TextColor = '#0070ff';
  const student2TextColor = 'red';
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    body += `<div style="font-size: 18px; ${
      i === 0 ? '' : 'margin-top: 32px;'
    }">----- Chat #${chatCount} -----</div>`;
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
  return body;
}

function createTextBody(chats: StudentChat[]) {
  let body = '';
  let chatCount = 1;
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    if (i !== 0) {
      body += '\n\n';
    }
    body += `----- Chat #${chatCount} -----\n`;
    body += `${chat.studentPair[0].realName} as ${chat.studentPair[0].character}\n`;
    body += `${chat.studentPair[1].realName} as ${chat.studentPair[1].character}\n`;
    body += '\n';
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
  return body;
}
