const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
  const { fullName, email, password } = req.body || {};

  if (
    typeof fullName !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !fullName.trim() ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({ error: 'Please provide fullName, email, and password.' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET is not configured.');
    return res.status(500).json({ error: 'Authentication service is not configured.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedFullName = fullName.trim();

  try {
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, full_name, email, role, created_at
    `, [normalizedFullName, normalizedEmail, passwordHash, 'patient']);
    const row = result.rows[0];
    const user = {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      createdAt: row.created_at,
    };

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '1d' }
    );

    res.status(201).json({ message: 'User registered successfully', token, user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({ error: 'Please provide email and password.' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET is not configured.');
    return res.status(500).json({ error: 'Authentication service is not configured.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const row = result.rows[0];
    if (!(await bcrypt.compare(password, row.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: row.id, email: row.email, role: row.role },
      jwtSecret,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        role: row.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
};

module.exports = { register, login };