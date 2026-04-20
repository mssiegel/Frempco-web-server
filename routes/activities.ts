import express from 'express';

import {
  getActivity,
  checkIfStudentIsInsideAnActivity,
  setTeacherEmailForActivity,
} from '../services/database.js';

const router = express.Router();

// @desc      Get an activity's activation status
// @route     GET /api/v1/activities/:activityPin
router.get('/:activityPin', (req, res) => {
  const { activityPin } = req.params;
  const isActive = getActivity(activityPin) !== undefined;
  res.status(200).json({ activityPin, isActive });
});

// @desc      Checks if a student is inside an activity
// @route     GET /api/v1/activities/:activityPin/studentSocket/:socketId
// TODO: Rename this route segment to sessionId when the frontend contract changes.
router.get('/:activityPin/studentSockets/:socketId', (req, res) => {
  const { socketId } = req.params;
  const isStudentInsideActivity = checkIfStudentIsInsideAnActivity(
    socketId,
    'session',
  );
  res.status(200).json({ isStudentInsideActivity });
});

// @desc      Sets the email address to receive a copy of all an activity's chats
// @route     PATCH /api/v1/activities/:activityPin/email/:email
router.patch('/:activityPin/email/:email', (req, res) => {
  const { activityPin, email } = req.params;
  setTeacherEmailForActivity(activityPin, email);
  res.sendStatus(200);
});

export default router;
