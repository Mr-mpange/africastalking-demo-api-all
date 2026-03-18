const db = require('../database/connection');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

class UsersController {
  // Get all users (admin only)
  async getAllUsers(req, res) {
    try {
      const result = await db.query(`
        SELECT id, username, email, full_name, role, status, is_active, 
               created_at, updated_at, approval_date, approved_by, rejection_reason
        FROM users
        ORDER BY created_at DESC
      `);

      res.json({
        success: true,
        users: result.rows
      });
    } catch (error) {
      logger.error('Get all users error:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  // Get single user
  async getUser(req, res) {
    try {
      const { userId } = req.params;

      const result = await db.query(`
        SELECT id, username, email, full_name, role, is_active, created_at, updated_at
        FROM users
        WHERE id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        success: true,
        user: result.rows[0]
      });
    } catch (error) {
      logger.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  }

  // Update user status
  async updateUserStatus(req, res) {
    try {
      const { userId } = req.params;
      const { is_active } = req.body;

      if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'is_active must be a boolean' });
      }

      const result = await db.query(`
        UPDATE users
        SET is_active = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, username, email, full_name, role, is_active, updated_at
      `, [is_active, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info('User status updated', { userId, is_active });

      res.json({
        success: true,
        message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
        user: result.rows[0]
      });
    } catch (error) {
      logger.error('Update user status error:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  }

  // Update user role
  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      if (!['admin', 'researcher', 'viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      const result = await db.query(`
        UPDATE users
        SET role = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, username, email, full_name, role, is_active, updated_at
      `, [role, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info('User role updated', { userId, newRole: role });

      res.json({
        success: true,
        message: `User role updated to ${role}`,
        user: result.rows[0]
      });
    } catch (error) {
      logger.error('Update user role error:', error);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }

  // Delete user
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;

      if (userId === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const result = await db.query(`
        DELETE FROM users
        WHERE id = $1
        RETURNING username
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info('User deleted', { userId, username: result.rows[0].username });

      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      logger.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  // Update user profile
  async updateUserProfile(req, res) {
    try {
      const { userId } = req.params;
      const { full_name, email } = req.body;

      if (userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized to update this profile' });
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (full_name) {
        updates.push(`full_name = $${paramCount++}`);
        values.push(full_name);
      }

      if (email) {
        updates.push(`email = $${paramCount++}`);
        values.push(email);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(userId);

      const result = await db.query(`
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, username, email, full_name, role, is_active, updated_at
      `, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info('User profile updated', { userId });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: result.rows[0]
      });
    } catch (error) {
      logger.error('Update user profile error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }

  // Change password
  async changePassword(req, res) {
    try {
      const { userId } = req.params;
      const { current_password, new_password } = req.body;

      if (userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized to change this password' });
      }

      if (!new_password || new_password.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      if (userId === req.user.id) {
        if (!current_password) {
          return res.status(400).json({ error: 'Current password is required' });
        }

        const userResult = await db.query(
          'SELECT password_hash FROM users WHERE id = $1',
          [userId]
        );

        if (userResult.rows.length === 0) {
          return res.status(404).json({ error: 'User not found' });
        }

        const isValidPassword = await bcrypt.compare(
          current_password,
          userResult.rows[0].password_hash
        );

        if (!isValidPassword) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
      }

      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const password_hash = await bcrypt.hash(new_password, saltRounds);

      await db.query(`
        UPDATE users
        SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [password_hash, userId]);

      logger.info('Password changed', { userId });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      logger.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }

  // Get pending users (admin only)
  async getPendingUsers(req, res) {
    try {
      const result = await db.query(`
        SELECT id, username, email, full_name, role, status, created_at, rejection_reason
        FROM users
        WHERE status = 'pending'
        ORDER BY created_at ASC
      `);

      res.json({
        success: true,
        users: result.rows,
        count: result.rows.length
      });
    } catch (error) {
      logger.error('Get pending users error:', error);
      res.status(500).json({ error: 'Failed to fetch pending users' });
    }
  }

  // Approve user (admin only)
  async approveUser(req, res) {
    try {
      const { userId } = req.params;
      const approvedBy = req.user?.id || req.user?.userId || null;

      const result = await db.query(`
        UPDATE users
        SET status = 'active',
            approval_date = NOW(),
            approved_by = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'pending'
        RETURNING id, username, email, full_name, role, status, approval_date, approved_by
      `, [userId, approvedBy]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found or not pending approval' });
      }

      logger.info('User approved', { userId, username: result.rows[0].username });

      res.json({
        success: true,
        message: 'User approved successfully',
        user: result.rows[0]
      });
    } catch (error) {
      logger.error('Approve user error:', error);
      res.status(500).json({ error: 'Failed to approve user' });
    }
  }

  // Reject user (admin only)
  async rejectUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;

      const result = await db.query(`
        UPDATE users
        SET status = 'rejected',
            rejection_reason = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'pending'
        RETURNING id, username, email, full_name, role, status, rejection_reason
      `, [userId, reason || null]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found or not pending approval' });
      }

      logger.info('User rejected', { userId, username: result.rows[0].username, reason });

      res.json({
        success: true,
        message: 'User rejected',
        user: result.rows[0]
      });
    } catch (error) {
      logger.error('Reject user error:', error);
      res.status(500).json({ error: 'Failed to reject user' });
    }
  }
}

module.exports = new UsersController();
