const pool = require('../db');

const listDoctors = async (req, res) => {
  const { search, specialization, location, maxFee } = req.query;
  const conditions = [];
  const values = [];

  if (search !== undefined) {
    if (typeof search !== 'string') {
      return res.status(400).json({ error: 'search must be a string.' });
    }
    if (search.trim()) {
      values.push(`%${search.trim()}%`);
      conditions.push(`(u.full_name ILIKE $${values.length} OR d.specialization ILIKE $${values.length})`);
    }
  }

  if (specialization !== undefined) {
    if (typeof specialization !== 'string') {
      return res.status(400).json({ error: 'specialization must be a string.' });
    }
    if (specialization.trim()) {
      values.push(`%${specialization.trim()}%`);
      conditions.push(`d.specialization ILIKE $${values.length}`);
    }
  }

  if (location !== undefined) {
    if (typeof location !== 'string') {
      return res.status(400).json({ error: 'location must be a string.' });
    }
    if (location.trim()) {
      values.push(`%${location.trim()}%`);
      conditions.push(`d.location ILIKE $${values.length}`);
    }
  }

  if (maxFee !== undefined) {
    const fee = Number(maxFee);
    if (typeof maxFee !== 'string' || !maxFee.trim() || !Number.isFinite(fee) || fee < 0) {
      return res.status(400).json({ error: 'maxFee must be a non-negative number.' });
    }
    values.push(fee);
    conditions.push(`d.fee <= $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT d.id,
              d.user_id AS "userId",
              u.full_name AS "fullName",
              d.specialization,
              d.location,
              d.fee,
              d.experience_years AS "experienceYears",
              d.languages,
              d.bio
       FROM doctors d
       LEFT JOIN users u ON u.id = d.user_id
       ${whereClause}
       ORDER BY d.specialization, u.full_name`,
      values
    );

    return res.status(200).json({ doctors: result.rows });
  } catch (error) {
    console.error('Doctor search error:', error);
    return res.status(500).json({ error: 'Internal server error while fetching doctors.' });
  }
};

module.exports = { listDoctors };
