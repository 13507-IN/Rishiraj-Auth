const { asyncHandler } = require('../utils/errors');
const userService = require('../services/userService');

const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user.id);
  return res.status(200).json({ profile });
});

module.exports = {
  getProfile
};