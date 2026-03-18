const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../database/connection');
const logger = require('../utils/logger');

class ProjectAiService {
  constructor() {
    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      });
    }
  }

  /**
   * Generate (or refresh) an AI summary for a project question.
   * If question_id is null, generates a project-level summary.
   */
  async generateAISummary(project_id, question_id = null) {
    try {
      if (!this.model) throw new Error('Gemini not configured');

      // Fetch responses
      let query = `
        SELECT response_text FROM research_responses
        WHERE project_id = $1 AND response_text IS NOT NULL AND response_text <> ''
      `;
      const params = [project_id];
      if (question_id) { query += ' AND question_id = $2'; params.push(question_id); }
      query += ' ORDER BY created_at DESC LIMIT 200';

      const rows = (await db.query(query, params)).rows;
      if (!rows.length) return null;

      const responseTexts = rows.map((r, i) => `${i + 1}. ${r.response_text}`).join('\n');

      const prompt = `You are a research analyst. Analyze the following survey responses and return a JSON object with these exact keys:
- "summary": a concise paragraph summarizing the main findings
- "themes": array of objects { "theme": string, "percentage": number, "keywords": string[] }
- "sentiment": "positive" | "negative" | "neutral"
- "key_insights": array of short insight strings (max 5)

Responses to analyze:
${responseTexts}

Return ONLY valid JSON, no markdown.`;

      const result = await this.model.generateContent(prompt);
      const raw = result.response.text().trim();

      let insights;
      try {
        // Strip possible markdown code fences
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        insights = JSON.parse(cleaned);
      } catch {
        insights = { summary: raw, themes: [], sentiment: 'neutral', key_insights: [] };
      }

      const summary_text = insights.summary || raw;

      // Upsert: replace existing summary for same project+question
      await db.query(`
        INSERT INTO ai_summaries (project_id, question_id, summary_text, insights_json)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [project_id, question_id, summary_text, JSON.stringify(insights)]);

      // Also try update if already exists
      await db.query(`
        UPDATE ai_summaries
        SET summary_text = $3, insights_json = $4, created_at = NOW()
        WHERE project_id = $1 AND (question_id = $2 OR ($2 IS NULL AND question_id IS NULL))
      `, [project_id, question_id, summary_text, JSON.stringify(insights)]);

      logger.info('AI summary generated', { project_id, question_id });
      return { summary_text, insights };
    } catch (err) {
      logger.error('generateAISummary error:', err);
      throw err;
    }
  }

  // Trigger project-level summary (all questions combined)
  async generateProjectSummary(project_id) {
    return this.generateAISummary(project_id, null);
  }
}

module.exports = new ProjectAiService();
