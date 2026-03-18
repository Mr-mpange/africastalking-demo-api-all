const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../database/connection');
const logger = require('../utils/logger');

class AuthController {
  // User login
  async login(req, res) {
    try {
      // Validate input
      await body('username').notEmpty().withMessage('Username is required').run(req);
      await body('password').notEmpty().withMessage('Password is required').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors.array() 
        });
      }

      const { username, password } = req.body;

      // Get user from database
      const result = await db.query(
        'SELECT * FROM users WHERE username = $1 OR email = $1',
        [username]
      );

      if (result.rows.length === 0) {
        logger.security('Login attempt with invalid username', { username });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Check if user is active
      if (!user.is_active) {
        logger.security('Login attempt with deactivated account', { 
          userId: user.id, 
          username: user.username 
        });
        return res.status(401).json({ error: 'Account is deactivated' });
      }

      // Check user status (pending, active, inactive, rejected)
      const status = user.status || 'active'; // Default to active for existing users
      if (status === 'pending') {
        logger.security('Login attempt with pending account', { 
          userId: user.id, 
          username: user.username 
        });
        return res.status(403).json({ 
          error: 'Account pending approval', 
          message: 'Your account is waiting for admin approval. You will be notified once approved.' 
        });
      }
      
      if (status === 'rejected') {
        logger.security('Login attempt with rejected account', { 
          userId: user.id, 
          username: user.username 
        });
        return res.status(403).json({ 
          error: 'Account rejected', 
          message: 'Your account registration was not approved.' 
        });
      }
      
      if (status === 'inactive') {
        logger.security('Login attempt with inactive account', { 
          userId: user.id, 
          username: user.username 
        });
        return res.status(403).json({ 
          error: 'Account inactive', 
          message: 'Your account has been deactivated. Please contact support.' 
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        logger.security('Login attempt with invalid password', { 
          userId: user.id, 
          username: user.username 
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          username: user.username, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      // Remove password from response
      const { password_hash, ...userResponse } = user;

      logger.info('User logged in successfully', { 
        userId: user.id, 
        username: user.username 
      });

      res.json({
        success: true,
        token,
        user: userResponse
      });

    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  // User registration
  async register(req, res) {
    try {
      // Validate input
      await body('username')
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be 3-50 characters')
        .run(req);
      
      await body('email')
        .isEmail()
        .withMessage('Valid email is required')
        .run(req);
      
      await body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .run(req);
      
      await body('full_name')
        .notEmpty()
        .withMessage('Full name is required')
        .run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors.array() 
        });
      }

      const { username, email, password, full_name, role = 'researcher' } = req.body;

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }

      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const password_hash = await bcrypt.hash(password, saltRounds);

      // Set status based on role
      // Admins are auto-approved, researchers need approval
      const status = role === 'admin' ? 'active' : 'pending';

      // Create user
      const result = await db.query(`
        INSERT INTO users (username, email, password_hash, full_name, role, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, username, email, full_name, role, status, is_active, created_at
      `, [username, email, password_hash, full_name, role, status]);

      const newUser = result.rows[0];

      logger.info('User registered successfully', { 
        userId: newUser.id, 
        username: newUser.username,
        status: newUser.status
      });

      const message = status === 'pending' 
        ? 'Registration successful! Your account is pending admin approval. You will be notified once approved.'
        : 'User registered successfully';

      res.status(201).json({
        success: true,
        message,
        user: newUser,
        requiresApproval: status === 'pending'
      });

    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }

  // User logout
  async logout(req, res) {
    try {
      // In a more sophisticated setup, you might want to blacklist the token
      // For now, we'll just return success and let the client handle token removal
      
      if (req.user) {
        logger.info('User logged out', { 
          userId: req.user.id, 
          username: req.user.username 
        });
      }

      res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }

  // Refresh token
  async refreshToken(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(401).json({ error: 'Token is required' });
      }

      // Verify the existing token (even if expired)
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          // Allow refresh of expired tokens
          decoded = jwt.decode(token);
        } else {
          return res.status(401).json({ error: 'Invalid token' });
        }
      }

      // Get user from database to ensure they still exist and are active
      const result = await db.query(
        'SELECT id, username, email, full_name, role, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return res.status(401).json({ error: 'User not found or inactive' });
      }

      const user = result.rows[0];

      // Generate new token
      const newToken = jwt.sign(
        { 
          userId: user.id, 
          username: user.username, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.json({
        success: true,
        token: newToken,
        user
      });

    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  }

  // Forgot password
  async forgotPassword(req, res) {
    try {
      await body('email').isEmail().withMessage('Valid email is required').run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors.array() 
        });
      }

      const { email } = req.body;

      // Check if user exists
      const result = await db.query('SELECT id, username FROM users WHERE email = $1', [email]);

      // Always return success to prevent email enumeration
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });

      // If user exists, log the request (in production, you'd send an email)
      if (result.rows.length > 0) {
        logger.info('Password reset requested', { 
          userId: result.rows[0].id, 
          email 
        });
        
        // TODO: Implement email sending with reset token
        // For now, just log that a reset was requested
      }

    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({ error: 'Password reset request failed' });
    }
  }

  // Reset password
  async resetPassword(req, res) {
    try {
      await body('token').notEmpty().withMessage('Reset token is required').run(req);
      await body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: errors.array() 
        });
      }

      // TODO: Implement token verification and password reset
      // For now, return not implemented
      res.status(501).json({ 
        error: 'Password reset not fully implemented yet' 
      });

    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({ error: 'Password reset failed' });
    }
  }
}

module.exports = new AuthController();