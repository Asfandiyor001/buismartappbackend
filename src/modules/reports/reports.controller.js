/**
 * Hisobotlar — staff uchun oxirgi oylik hisobot endpointining eksporti.
 * Route: GET /api/staff/my-report (`staff.routes.js`).
 */
const staffController = require('../staff/staff.controller');

module.exports = {
  getMyReport: staffController.getMyReport,
};
