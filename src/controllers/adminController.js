const { asyncHandler } = require('../utils/errors');
const adminService = require('../services/adminService');
const env = require('../config/env');

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

const createInvitation = asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { email } = req.body;
  const result = await adminService.createInvitation({ tenantId, email });
  const response = {
    invitation: result.invitation,
    message: 'An email invitation has been sent. It expires in 7 days and can be accepted once.'
  };
  if (result.previewUrl && env.DEV_AUTH_TOKENS) {
    response.previewUrl = result.previewUrl;
  }
  return res.status(201).json(response);
});

module.exports = {
  getDashboard,
  listTenants,
  createTenant,
  listUsers,
  updateUserRole,
  updateUserTenant,
  createInvitation
};
