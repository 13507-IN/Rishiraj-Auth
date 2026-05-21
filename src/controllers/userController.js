const { asyncHandler } = require('../utils/errors');
const userService = require('../services/userService');

const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user.id);
  return res.status(200).json({ profile });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const profile = await userService.updateProfile(req.user.id, { name });
  return res.status(200).json({ profile });
});

const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  await userService.changePassword(req.user.id, oldPassword, newPassword);
  return res.status(200).json({ message: 'Password changed successfully. All sessions have been revoked.' });
});

const getSessionsList = asyncHandler(async (req, res) => {
  const sessions = await userService.getSessionsList(req.user.id);
  return res.status(200).json({ sessions });
});

const revokeSession = asyncHandler(async (req, res) => {
  await userService.revokeSession(req.user.id, req.params.id);
  return res.status(200).json({ message: 'Session revoked successfully' });
});

const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await userService.getDashboardStats(req.user.id, req.user.tenantId);
  return res.status(200).json({ stats });
});

const getAuditLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const result = await userService.getAuditLogs(req.user.id, { page, limit });
  return res.status(200).json(result);
});

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getSessionsList,
  revokeSession,
  getDashboardStats,
  getAuditLogs
};