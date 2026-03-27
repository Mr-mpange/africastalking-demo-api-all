const at = require('../config/at');
const db = require('../database/connection');
const logger = require('../utils/logger');

const REWARD_AMOUNT = process.env.AIRTIME_REWARD_AMOUNT || '50';
const REWARD_CURRENCY = process.env.AIRTIME_REWARD_CURRENCY || 'TZS';

/**
 * Send a one-time 50 TZS airtime reward to a participant for completing a project.
 * Safe to call fire-and-forget — will not throw.
 */
async function sendReward(participant_id, project_id, phone_number) {
  try {
    // Check if already rewarded for this project
    const existing = await db.query(
      'SELECT id FROM airtime_rewards WHERE participant_id = $1 AND project_id = $2',
      [participant_id, project_id]
    );
    if (existing.rows.length) {
      logger.info('Airtime reward already sent', { participant_id, project_id });
      return { skipped: true };
    }

    // Send via Africa's Talking
    const response = await at.AIRTIME.send({
      recipients: [{
        phoneNumber: phone_number,
        currencyCode: REWARD_CURRENCY,
        amount: REWARD_AMOUNT,
      }],
    });

    const status = response?.responses?.[0]?.status === 'Sent' ? 'sent' : 'failed';

    // Record the reward
    await db.query(`
      INSERT INTO airtime_rewards (participant_id, project_id, phone_number, amount, currency, status, at_response)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (participant_id, project_id) DO NOTHING
    `, [participant_id, project_id, phone_number, REWARD_AMOUNT, REWARD_CURRENCY, status, JSON.stringify(response)]);

    logger.info('Airtime reward sent', { phone_number, amount: REWARD_AMOUNT, currency: REWARD_CURRENCY, status });
    return { sent: true, amount: REWARD_AMOUNT, currency: REWARD_CURRENCY, status };
  } catch (err) {
    logger.error('Airtime reward error:', err.message);
    // Record failure so we can retry manually if needed
    try {
      await db.query(`
        INSERT INTO airtime_rewards (participant_id, project_id, phone_number, amount, currency, status, at_response)
        VALUES ($1, $2, $3, $4, $5, 'failed', $6)
        ON CONFLICT (participant_id, project_id) DO NOTHING
      `, [participant_id, project_id, phone_number, REWARD_AMOUNT, REWARD_CURRENCY, err.message]);
    } catch (_) {}
    return { sent: false, error: err.message };
  }
}

module.exports = { sendReward };
