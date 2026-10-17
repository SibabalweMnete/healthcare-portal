const pool = require('../db');

const createAppointment = async (req, res) => {
  if (req.user.role !== 'patient') {
    return res.status(403).json({ error: 'Only patients can book appointments.' });
  }

  const { doctorId, slotTime } = req.body || {};
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (typeof doctorId !== 'string' || !uuidPattern.test(doctorId)) {
    return res.status(400).json({ error: 'doctorId must be a valid UUID.' });
  }
  if (typeof slotTime !== 'string' || !slotTime.trim() || !Number.isFinite(Date.parse(slotTime))) {
    return res.status(400).json({ error: 'slotTime must be a valid date and time.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO appointments (doctor_id, patient_id, slot_time)
       SELECT id, $2, $3
       FROM doctors
       WHERE id = $1
       RETURNING id,
                 doctor_id AS "doctorId",
                 patient_id AS "patientId",
                 slot_time AS "slotTime",
                 status,
                 created_at AS "createdAt"`,
      [doctorId, req.user.id, slotTime]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Doctor not found.' });
    }

    return res.status(201).json({ appointment: result.rows[0] });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'unique_doctor_slot') {
      return res.status(409).json({ error: 'This appointment slot is already booked.' });
    }

    console.error('Appointment booking error:', error);
    return res.status(500).json({ error: 'Internal server error while booking appointment.' });
  }
};

const listAppointments = async (req, res) => {
  const { id, role } = req.user;
  if (role !== 'patient' && role !== 'doctor') {
    return res.status(403).json({ error: 'Only patients and doctors can view appointments.' });
  }

  const ownershipCondition = role === 'patient' ? 'a.patient_id = $1' : 'd.user_id = $1';

  try {
    const result = await pool.query(
      `SELECT a.id,
              a.doctor_id AS "doctorId",
              a.patient_id AS "patientId",
              a.slot_time AS "slotTime",
              a.status,
              a.created_at AS "createdAt",
              d.specialization,
              d.location,
              d.fee,
              du.full_name AS "doctorName",
              pu.full_name AS "patientName"
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       LEFT JOIN users du ON du.id = d.user_id
       JOIN users pu ON pu.id = a.patient_id
       WHERE ${ownershipCondition}
       ORDER BY a.slot_time`,
      [id]
    );

    return res.status(200).json({ appointments: result.rows });
  } catch (error) {
    console.error('Appointment lookup error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching appointments.' });
  }
};

module.exports = { createAppointment, listAppointments };
