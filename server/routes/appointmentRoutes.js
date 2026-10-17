const express = require('express');
const { createAppointment, listAppointments } = require('../controllers/appointmentController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticateToken);
router.post('/', createAppointment);
router.get('/', listAppointments);

module.exports = router;
