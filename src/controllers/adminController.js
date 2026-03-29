const { asyncHandler } = require('../utils/errors');
const adminService = require('../services/adminService');

const getDashboard = asyncHandler(async (req, res) => {
  return res.status(200).json({
    message: 'Welcome to the admin dashboard',
    tenantId: req.user.tenantId
  });
});

const listTenants = asyncHandler(async (req, res) => {
  const tenants = await adminService.listTenants();
  return res.status(200).json({ tenants });
});

const createTenant = asyncHandler(async (req, res) => {
  const { name } = req.body;
  const tenant = await adminService.createTenant(name);
  return res.status(201).json({ tenant });
});

const listUsers = asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  const users = await adminService.listUsers(tenantId);
  return res.status(200).json({ users });
});

const updateUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const user = await adminService.updateUserRole(userId, role);
  return res.status(200).json({ user });
});

const updateUserTenant = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { tenantId } = req.body;
  const user = await adminService.updateUserTenant(userId, tenantId);
  return res.status(200).json({ user });
});

module.exports = {
  getDashboard,
  listTenants,
  createTenant,
  listUsers,
  updateUserRole,
  updateUserTenant
};
