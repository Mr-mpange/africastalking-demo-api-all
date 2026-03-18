const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// Get pending users (admin only)
router.get('/pending/list', authorize('admin'), usersController.getPendingUsers);

// Approve user (admin only)
router.post('/:userId/approve', authorize('admin'), usersController.approveUser);

// Reject user (admin only)
router.post('/:userId/reject', authorize('admin'), usersController.rejectUser);

// Get all users (admin only)
router.get('/', authorize('admin'), usersController.getAllUsers);

// Get single user
router.get('/:userId', usersController.getUser);

// Update user status (admin only)
router.patch('/:userId/status', authorize('admin'), usersController.updateUserStatus);

// Update user role (admin only)
router.patch('/:userId/role', authorize('admin'), usersController.updateUserRole);

// Delete user (admin only)
router.delete('/:userId', authorize('admin'), usersController.deleteUser);

// Update user profile
router.patch('/:userId/profile', usersController.updateUserProfile);

// Change password
router.post('/:userId/change-password', usersController.changePassword);

module.exports = router;
