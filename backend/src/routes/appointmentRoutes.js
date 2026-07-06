const express = require('express');
const router = express.Router();
const {
  listDoctors,
  createAppointment,
  getAppointments,
  verifyRoomAccess
} = require('../controllers/appointmentController');
const authMiddleware = require('../middleware/authMiddleware');

// Secure all endpoints below with JWT verification
router.use(authMiddleware);

router.get('/doctors', listDoctors);
router.post('/', createAppointment);
router.get('/', getAppointments);
router.get('/:id/verify-access', verifyRoomAccess);

module.exports = router;
