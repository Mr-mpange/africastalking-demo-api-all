const db = require('../database/connection');
const logger = require('../utils/logger');

class SMSController {
  // Get SMS statistics
  async getStatistics(req, res) {
    try {
      // Get today's SMS count (from sms_history if table exists)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      
      // Check if sms_history table exists
      const tableCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'sms_history'
        );
      `);

      if (!tableCheck.rows[0].exists) {
        // Return empty stats if table doesn't exist
        return res.json({
          success: true,
          stats: {
            todayCount: 0,
            yesterdayCount: 0,
            percentageChange: 0,
            totalRecipients: 0,
            last30DaysCount: 0,
            deliveryRate: 0
          },
          recentActivity: []
        });
      }

      const todayCount = await db.query(`
        SELECT COUNT(*) as count
        FROM sms_history
        WHERE sent_at >= $1 AND status = 'sent'
      `, [todayStart]);

      const yesterdayCount = await db.query(`
        SELECT COUNT(*) as count
        FROM sms_history
        WHERE sent_at >= $1 AND sent_at < $2 AND status = 'sent'
      `, [yesterdayStart, todayStart]);

      // Get total unique recipients
      const totalRecipients = await db.query(`
        SELECT COUNT(DISTINCT phone_number) as count
        FROM sms_history
        WHERE status = 'sent'
      `);

      // Get last 30 days count and calculate delivery rate
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const last30DaysStats = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
        FROM sms_history
        WHERE sent_at >= $1
      `, [thirtyDaysAgo]);

      const totalSent = parseInt(last30DaysStats.rows[0].sent) || 0;
      const totalAttempted = parseInt(last30DaysStats.rows[0].total) || 1;
      const deliveryRate = ((totalSent / totalAttempted) * 100).toFixed(1);

      // Get recent SMS activity (last 10 sent messages)
      const recentActivity = await db.query(`
        SELECT 
          sh.phone_number,
          sh.message,
          sh.message_type,
          sh.status,
          sh.sent_at as created_at,
          sh.cost,
          u.username as sent_by_username
        FROM sms_history sh
        LEFT JOIN users u ON sh.sent_by = u.id
        WHERE sh.status = 'sent'
        ORDER BY sh.sent_at DESC
        LIMIT 10
      `);

      // Calculate percentage change
      const todayTotal = parseInt(todayCount.rows[0].count) || 0;
      const yesterdayTotal = parseInt(yesterdayCount.rows[0].count) || 0;
      const percentageChange = yesterdayTotal > 0 
        ? ((todayTotal - yesterdayTotal) / yesterdayTotal * 100).toFixed(1)
        : 0;

      res.json({
        success: true,
        stats: {
          todayCount: todayTotal,
          yesterdayCount: yesterdayTotal,
          percentageChange: parseFloat(percentageChange),
          totalRecipients: parseInt(totalRecipients.rows[0].count) || 0,
          last30DaysCount: totalSent,
          deliveryRate: parseFloat(deliveryRate)
        },
        recentActivity: recentActivity.rows
      });

    } catch (error) {
      logger.error('Get SMS statistics error:', error);
      res.status(500).json({ error: 'Failed to get SMS statistics' });
    }
  }
}

module.exports = new SMSController();
