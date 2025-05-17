import express from 'express';

import {
  getClassroom,
  checkIfStudentIsInsideAClassroom,
  setClassroomEmail,
} from '../services/database.js';

const router = express.Router();

// @desc      Get a classroom's activation status
// @route     GET /api/v1/classrooms/:classroomName
router.get('/:classroomName', (req, res) => {
  const { classroomName } = req.params;
  const isActive = getClassroom(classroomName) !== undefined;
  res.status(200).json({ classroomName, isActive });
});

// @desc      Checks if a student is inside a classroom
// @route     GET /api/v1/classrooms/:classroomName/studentSocket/:socketId
router.get('/:classroomName/studentSockets/:socketId', (req, res) => {
  const { socketId } = req.params;
  const isStudentInsideClassroom = checkIfStudentIsInsideAClassroom(socketId);
  res.status(200).json({ isStudentInsideClassroom });
});

// @desc      Sets the email address to receive a copy of all a classroom's chats
// @route     PATCH /api/v1/classrooms/:classroomName/email/:email
router.patch('/:classroomName/email/:email', (req, res) => {
  const { classroomName, email } = req.params;
  setClassroomEmail(classroomName, email);
  res.sendStatus(200);
});

export default router;
