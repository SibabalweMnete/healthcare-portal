const express = require('express');
const { listDoctors } = require('../controllers/doctorController');

const router = express.Router();

router.get('/', listDoctors);

module.exports = router;
