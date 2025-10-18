const express = require('express');
const { getAllocationsByTenantId } = require('../controllers/allocationController');

const router = express.Router();

router.get('/tenant/:tenantId', getAllocationsByTenantId);

module.exports = router;