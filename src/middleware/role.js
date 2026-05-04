// src/middleware/role.js
const { error } = require('../utils/response');

const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    // req.user yuqoridagi auth.js dan keladi
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return error(res, 'Sizda bu amalni bajarish uchun huquq yo\'q!', 403);
    }
    next();
  };
};

module.exports = checkRole;