# Frempco Context

Frempco lets teachers create classroom Activities where Students chat in
character, either with another Student or with the chatbot.

## Language

**Activity**:
A classroom session created by a Teacher where Students join with a PIN and can enter chats.
_Avoid_: room, class

**Teacher**:
The person who creates and manages an Activity.
_Avoid_: admin, host

**Student**:
A participant who joins an Activity and chats in character.
_Avoid_: user, participant

**Paired chat**:
A chat between two Students who are each assigned a Character.
_Avoid_: peer chat, student chat

**Solo chat**:
A chat between one Student and the chatbot.
_Avoid_: bot chat, AI chat

**Chat transcript**:
The retained record of a Paired chat or Solo chat that can be sent to the Teacher.
_Avoid_: conversation, chat log

**Character**:
The role a Student plays during a chat.
_Avoid_: persona, role

## Relationships

- A **Teacher** creates one **Activity**
- An **Activity** has many **Students**
- An **Activity** has many **Paired chats** and many **Solo chats**
- A **Paired chat** has exactly two **Students**
- A **Solo chat** has exactly one **Student**
- A **Chat transcript** belongs to one **Paired chat** or one **Solo chat**

## Example Dialogue

> **Dev:** "When a **Student** leaves a **Paired chat**, should we delete the **Chat transcript**?"
> **Domain expert:** "No, the **Chat transcript** stays so the **Teacher** can receive it after the **Activity** ends."

## Flagged Ambiguities

- "conversation" appears in client UI state, but the retained server-side record is a **Chat transcript**.
