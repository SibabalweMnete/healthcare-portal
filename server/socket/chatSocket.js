const jwt = require('jsonwebtoken');
const pool = require('../db');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 4000;

const getAppointmentParticipants = async (appointmentId, userId) => {
  const result = await pool.query(
    `SELECT a.id AS appointment_id,
            a.patient_id,
            d.user_id AS doctor_user_id
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.id = $1
       AND (a.patient_id = $2 OR d.user_id = $2)`,
    [appointmentId, userId]
  );

  return result.rows[0];
};

const registerChatSocket = (io) => {
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const jwtSecret = process.env.JWT_SECRET;

    if (typeof token !== 'string' || !token) {
      return next(new Error('Authentication token is required.'));
    }
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured.');
      return next(new Error('Authentication service is not configured.'));
    }

    try {
      const payload = jwt.verify(token, jwtSecret);
      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof payload.id !== 'string' ||
        !UUID_PATTERN.test(payload.id) ||
        !['patient', 'doctor'].includes(payload.role)
      ) {
        return next(new Error('Invalid authentication token.'));
      }

      socket.data.user = { id: payload.id, role: payload.role };
      return next();
    } catch {
      return next(new Error('Invalid or expired authentication token.'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_appointment', async (payload, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const appointmentId = payload && payload.appointmentId;

      if (typeof appointmentId !== 'string' || !UUID_PATTERN.test(appointmentId)) {
        return reply({ ok: false, error: 'A valid appointmentId is required.' });
      }

      try {
        const participants = await getAppointmentParticipants(appointmentId, socket.data.user.id);
        if (!participants || !participants.doctor_user_id) {
          return reply({ ok: false, error: 'Appointment not found or access denied.' });
        }

        const room = `appointment:${appointmentId}`;
        await socket.join(room);
        return reply({ ok: true, appointmentId });
      } catch (error) {
        console.error('Chat room authorization error:', error);
        return reply({ ok: false, error: 'Unable to join appointment chat.' });
      }
    });

    socket.on('send_message', async (payload, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const appointmentId = payload && payload.appointmentId;
      const messageText = payload && payload.messageText;

      if (typeof appointmentId !== 'string' || !UUID_PATTERN.test(appointmentId)) {
        return reply({ ok: false, error: 'A valid appointmentId is required.' });
      }
      if (
        typeof messageText !== 'string' ||
        !messageText.trim() ||
        messageText.trim().length > MAX_MESSAGE_LENGTH
      ) {
        return reply({
          ok: false,
          error: `messageText must contain 1 to ${MAX_MESSAGE_LENGTH} characters.`,
        });
      }

      const room = `appointment:${appointmentId}`;
      if (!socket.rooms.has(room)) {
        return reply({ ok: false, error: 'Join this appointment chat before sending messages.' });
      }

      try {
        const participants = await getAppointmentParticipants(appointmentId, socket.data.user.id);
        if (!participants || !participants.doctor_user_id) {
          await socket.leave(room);
          return reply({ ok: false, error: 'Appointment not found or access denied.' });
        }

        const senderId = socket.data.user.id;
        const recipientId = participants.patient_id === senderId
          ? participants.doctor_user_id
          : participants.patient_id;
        const result = await pool.query(
          `INSERT INTO messages (
             sender_id,
             recipient_id,
             appointment_id,
             message_text
           )
           VALUES ($1, $2, $3, $4)
           RETURNING id,
                     sender_id AS "senderId",
                     recipient_id AS "recipientId",
                     appointment_id AS "appointmentId",
                     message_text AS "messageText",
                     created_at AS "createdAt"`,
          [senderId, recipientId, appointmentId, messageText.trim()]
        );
        const message = result.rows[0];

        try {
          const roomSockets = await io.in(room).fetchSockets();
          const participantIds = new Set([participants.patient_id, participants.doctor_user_id]);
          for (const roomSocket of roomSockets) {
            if (participantIds.has(roomSocket.data.user && roomSocket.data.user.id)) {
              roomSocket.emit('receive_message', message);
            }
          }
        } catch (broadcastError) {
          console.error('Chat message broadcast error:', broadcastError);
        }

        return reply({ ok: true, message });
      } catch (error) {
        console.error('Chat message persistence error:', error);
        return reply({ ok: false, error: 'Unable to send message.' });
      }
    });
  });
};

module.exports = { registerChatSocket };
