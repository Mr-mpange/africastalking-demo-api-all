const db = require('../database/connection');
const logger = require('../utils/logger');

class ProjectsController {
  // GET /api/projects  — public list (marketplace)
  async list(req, res) {
    try {
      const result = await db.query(`
        SELECT p.*, u.full_name AS researcher_name,
               COUNT(DISTINCT q.id)::int AS question_count,
               COUNT(DISTINCT r.id)::int AS response_count
        FROM research_projects p
        JOIN users u ON u.id = p.researcher_id
        LEFT JOIN research_questions q ON q.project_id = p.id AND q.is_active = true
        LEFT JOIN research_responses r ON r.project_id = p.id
        WHERE p.is_active = true
        GROUP BY p.id, u.full_name
        ORDER BY p.created_at DESC
      `);
      res.json({ success: true, data: { projects: result.rows } });
    } catch (err) {
      logger.error('List projects error:', err);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  }

  // GET /api/projects/:id
  async get(req, res) {
    try {
      const { id } = req.params;
      const result = await db.query(`
        SELECT p.*, u.full_name AS researcher_name
        FROM research_projects p
        JOIN users u ON u.id = p.researcher_id
        WHERE p.id = $1
      `, [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Project not found' });
      res.json({ success: true, data: { project: result.rows[0] } });
    } catch (err) {
      logger.error('Get project error:', err);
      res.status(500).json({ error: 'Failed to get project' });
    }
  }

  // POST /api/projects  — researcher/admin only
  async create(req, res) {
    try {
      const { title, description } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });

      const result = await db.query(`
        INSERT INTO research_projects (title, description, researcher_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [title, description || null, req.user.id]);

      logger.info('Project created', { id: result.rows[0].id, by: req.user.id });
      res.status(201).json({ success: true, data: { project: result.rows[0] } });
    } catch (err) {
      logger.error('Create project error:', err);
      res.status(500).json({ error: 'Failed to create project' });
    }
  }

  // PUT /api/projects/:id
  async update(req, res) {
    try {
      const { id } = req.params;
      const { title, description, is_active } = req.body;

      const existing = await db.query('SELECT * FROM research_projects WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Project not found' });

      const proj = existing.rows[0];
      if (req.user.role !== 'admin' && proj.researcher_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const result = await db.query(`
        UPDATE research_projects
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            is_active = COALESCE($3, is_active),
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `, [title, description, is_active, id]);

      res.json({ success: true, data: { project: result.rows[0] } });
    } catch (err) {
      logger.error('Update project error:', err);
      res.status(500).json({ error: 'Failed to update project' });
    }
  }

  // DELETE /api/projects/:id
  async remove(req, res) {
    try {
      const { id } = req.params;
      const existing = await db.query('SELECT * FROM research_projects WHERE id = $1', [id]);
      if (!existing.rows.length) return res.status(404).json({ error: 'Project not found' });

      const proj = existing.rows[0];
      if (req.user.role !== 'admin' && proj.researcher_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await db.query('DELETE FROM research_projects WHERE id = $1', [id]);
      res.json({ success: true, message: 'Project deleted' });
    } catch (err) {
      logger.error('Delete project error:', err);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  }

  // GET /api/projects/:id/questions
  async getQuestions(req, res) {
    try {
      const { id } = req.params;
      const result = await db.query(`
        SELECT * FROM research_questions
        WHERE project_id = $1 AND is_active = true
        ORDER BY created_at ASC
      `, [id]);
      res.json({ success: true, data: { questions: result.rows } });
    } catch (err) {
      logger.error('Get project questions error:', err);
      res.status(500).json({ error: 'Failed to get questions' });
    }
  }

  // GET /api/projects/:id/responses
  async getResponses(req, res) {
    try {
      const { id } = req.params;
      const result = await db.query(`
        SELECT r.*, q.title AS question_title, q.question_text,
               p.phone_number AS participant_phone, p.name AS participant_name
        FROM research_responses r
        LEFT JOIN research_questions q ON q.id = r.question_id
        LEFT JOIN participants p ON p.id = r.participant_id
        WHERE r.project_id = $1
        ORDER BY r.created_at DESC
      `, [id]);
      res.json({ success: true, data: { responses: result.rows } });
    } catch (err) {
      logger.error('Get project responses error:', err);
      res.status(500).json({ error: 'Failed to get responses' });
    }
  }

  // GET /api/projects/:id/ai-summary
  async getAISummary(req, res) {
    try {
      const { id } = req.params;
      const { question_id } = req.query;

      let query = `
        SELECT s.*, q.title AS question_title
        FROM ai_summaries s
        LEFT JOIN research_questions q ON q.id = s.question_id
        WHERE s.project_id = $1
      `;
      const params = [id];
      if (question_id) { query += ' AND s.question_id = $2'; params.push(question_id); }
      query += ' ORDER BY s.created_at DESC';

      const result = await db.query(query, params);
      res.json({ success: true, data: { summaries: result.rows } });
    } catch (err) {
      logger.error('Get AI summary error:', err);
      res.status(500).json({ error: 'Failed to get AI summary' });
    }
  }

  // POST /api/projects/:id/responses  — submit a response (public/participant)
  async submitResponse(req, res) {
    try {
      const { id: project_id } = req.params;
      const { question_id, phone_number, response_text, audio_url, name } = req.body;

      if (!question_id || !phone_number || !response_text) {
        return res.status(400).json({ error: 'question_id, phone_number, and response_text are required' });
      }

      // Upsert participant
      let participantResult = await db.query(
        'SELECT id FROM participants WHERE phone_number = $1', [phone_number]
      );
      let participant_id;
      if (participantResult.rows.length) {
        participant_id = participantResult.rows[0].id;
      } else {
        const ins = await db.query(
          'INSERT INTO participants (phone_number, name) VALUES ($1, $2) RETURNING id',
          [phone_number, name || null]
        );
        participant_id = ins.rows[0].id;
      }

      const result = await db.query(`
        INSERT INTO research_responses
          (question_id, project_id, participant_id, phone_number, response_text, audio_url, response_type)
        VALUES ($1, $2, $3, $4, $5, $6, 'text')
        RETURNING *
      `, [question_id, project_id, participant_id, phone_number, response_text, audio_url || null]);

      // Trigger batch AI processing (every 10 responses)
      this._maybeTriggerAI(project_id, question_id).catch(() => {});

      // Send 50 TZS airtime reward on first response per project (fire-and-forget)
      const { sendReward } = require('../services/airtimeRewardService');
      sendReward(participant_id, project_id, phone_number).catch(() => {});

      res.status(201).json({ success: true, data: { response: result.rows[0], reward: { amount: 50, currency: 'TZS', message: 'Airtime reward will be sent to your number' } } });
    } catch (err) {
      logger.error('Submit response error:', err);
      res.status(500).json({ error: 'Failed to submit response' });
    }
  }

  // Internal: trigger AI summary every 10 new responses per question
  async _maybeTriggerAI(project_id, question_id) {
    const count = await db.query(
      'SELECT COUNT(*) FROM research_responses WHERE project_id = $1 AND question_id = $2',
      [project_id, question_id]
    );
    const total = parseInt(count.rows[0].count, 10);
    if (total > 0 && total % 10 === 0) {
      const aiService = require('../services/projectAiService');
      await aiService.generateAISummary(project_id, question_id);
    }
  }
}

module.exports = new ProjectsController();
