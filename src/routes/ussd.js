const express = require('express');
const db = require('../database/connection');
const at = require('../config/at');
const logger = require('../utils/logger');

const router = express.Router();
const sms = at.SMS;

const T = {
  en: {
    langMenu:     'CON Welcome to Research Platform\n1. English\n2. Kiswahili',
    mainMenu:     'CON Main Menu\n1. Browse Research Projects\n2. My Responses\n0. Exit',
    exit:         'END Thank you. Goodbye!',
    noProjects:   'END No active research projects at the moment.',
    selectProject:'CON Select a project:\n',
    back:         '0. Back',
    projectInfo:  (title, desc, count) =>
      `CON ${title}\n${desc ? desc.slice(0, 55) + '..' : ''}\nQuestions: ${count}\n1. Start answering\n0. Back`,
    noQuestions:  'END This project has no questions yet.',
    question:     (n, total, title, text) =>
      `CON Q${n}/${total}: ${title}\n${text || ''}\nType your answer:`,
    noResponses:  'END You have not submitted any responses yet.',
    myResponses:  (total, lines) => `END Your responses: ${total} total\n${lines}`,
    done:         (title, count) =>
      `END Thank you!\nCompleted: ${title}\n${count} response(s) saved.\nSMS confirmation sent.`,
    smsDone:      (title) => `Thank you for completing "${title}" survey! Responses recorded. - Research Platform`,
    invalid:      'END Invalid option. Please try again.',
    error:        'END System error. Please try again later.',
  },
  sw: {
    langMenu:     'CON Karibu kwenye Jukwaa la Utafiti\n1. English\n2. Kiswahili',
    mainMenu:     'CON Menyu Kuu\n1. Tazama Miradi ya Utafiti\n2. Majibu Yangu\n0. Toka',
    exit:         'END Asante. Kwaheri!',
    noProjects:   'END Hakuna miradi ya utafiti inayoendelea kwa sasa.',
    selectProject:'CON Chagua mradi:\n',
    back:         '0. Rudi',
    projectInfo:  (title, desc, count) =>
      `CON ${title}\n${desc ? desc.slice(0, 55) + '..' : ''}\nMaswali: ${count}\n1. Anza kujibu\n0. Rudi`,
    noQuestions:  'END Mradi huu hauna maswali bado.',
    question:     (n, total, title, text) =>
      `CON S${n}/${total}: ${title}\n${text || ''}\nAndika jibu lako:`,
    noResponses:  'END Bado hujawasilisha majibu yoyote.',
    myResponses:  (total, lines) => `END Majibu yako: ${total} jumla\n${lines}`,
    done:         (title, count) =>
      `END Asante!\nUmekamilisha: ${title}\nMajibu ${count} yamehifadhiwa.\nSMS ya uthibitisho imetumwa.`,
    smsDone:      (title) => `Asante kwa kukamilisha utafiti wa "${title}"! Majibu yamehifadhiwa. - Jukwaa la Utafiti`,
    invalid:      'END Chaguo batili. Tafadhali jaribu tena.',
    error:        'END Hitilafu ya mfumo. Tafadhali jaribu tena baadaye.',
  },
};

// Normalize phone — AT sometimes sends " 255..." with a leading space instead of "+255..."
function normalizePhone(phone) {
  const p = (phone || '').trim();
  if (p.startsWith('+')) return p;
  if (p.startsWith('255')) return '+' + p;
  return p;
}

function steps(text) {
  if (!text || text.trim() === '') return [];
  return text.split('*');
}

async function upsertParticipant(phone) {
  const p = normalizePhone(phone);
  const ex = await db.query('SELECT id FROM participants WHERE phone_number = $1', [p]);
  if (ex.rows.length) return ex.rows[0].id;
  const ins = await db.query('INSERT INTO participants (phone_number) VALUES ($1) RETURNING id', [p]);
  return ins.rows[0].id;
}

async function sendSms(to, message) {
  try {
    const normalized = normalizePhone(to);
    const isSandbox = (process.env.AT_USERNAME || 'sandbox') === 'sandbox';
    const opts = { to: [normalized], message };
    // Only set sender ID in live mode — sandbox rejects custom sender IDs
    if (!isSandbox && process.env.AT_SENDER_ID) opts.from = process.env.AT_SENDER_ID;
    const result = await sms.send(opts);
    const recipient = result?.SMSMessageData?.Recipients?.[0];
    logger.info('[USSD][SMS] sent', { to: normalized, status: recipient?.status, cost: recipient?.cost });
  } catch (e) {
    logger.warn('[USSD][SMS] send failed:', e.message);
  }
}

async function saveResponse(questionId, projectId, phone, answer) {
  const p = normalizePhone(phone);
  const participantId = await upsertParticipant(p);
  await db.query(`
    INSERT INTO research_responses
      (question_id, project_id, participant_id, phone_number, response_text, response_type)
    VALUES ($1, $2, $3, $4, $5, 'ussd')
  `, [questionId, projectId, participantId, p, answer.trim()]);

  // Trigger AI every 10 responses
  const countRes = await db.query(
    'SELECT COUNT(*) FROM research_responses WHERE project_id = $1 AND question_id = $2',
    [projectId, questionId]
  );
  const total = parseInt(countRes.rows[0].count, 10);
  if (total > 0 && total % 10 === 0) {
    const aiSvc = require('../services/projectAiService');
    aiSvc.generateAISummary(projectId, questionId).catch(() => {});
  }
}

// USSD flow
// s[0] = language (1=en, 2=sw)
// s[1] = main menu (1=projects, 2=my responses, 0=exit)
// s[2] = project index (1..N, 0=back)
// s[3] = confirm (1=start, 0=back)
// s[4..] = answers (free text per question)
router.post('/', async (req, res) => {
  const { sessionId, phoneNumber, text } = req.body;
  logger.info('[USSD]', { sessionId, phoneNumber, text });

  const s = steps(text);

  try {
    if (s.length === 0) return res.send(T.en.langMenu);

    const lang = s[0] === '2' ? 'sw' : 'en';
    const t = T[lang];

    if (s.length === 1) return res.send(t.mainMenu);
    if (s[1] === '0') return res.send(t.exit);

    // My Responses
    if (s[1] === '2') {
      const participant = await db.query(
        'SELECT id FROM participants WHERE phone_number = $1', [normalizePhone(phoneNumber)]
      );
      if (!participant.rows.length) return res.send(t.noResponses);
      const pid = participant.rows[0].id;
      const count = await db.query('SELECT COUNT(*) FROM research_responses WHERE participant_id = $1', [pid]);
      const recent = await db.query(`
        SELECT q.title, r.created_at::date AS date
        FROM research_responses r
        JOIN research_questions q ON q.id = r.question_id
        WHERE r.participant_id = $1
        ORDER BY r.created_at DESC LIMIT 3
      `, [pid]);
      const lines = recent.rows.map(r => `- ${r.title} (${r.date})`).join('\n');
      return res.send(t.myResponses(count.rows[0].count, lines));
    }

    // Browse Projects
    if (s[1] === '1') {
      if (s.length === 2) {
        const projects = await db.query(
          `SELECT id, title, COALESCE(title_sw, title) AS title_sw
           FROM research_projects WHERE is_active = true ORDER BY created_at DESC LIMIT 7`
        );
        if (!projects.rows.length) return res.send(t.noProjects);
        let menu = t.selectProject;
        projects.rows.forEach((p, i) => { menu += `${i + 1}. ${lang === 'sw' ? p.title_sw : p.title}\n`; });
        menu += t.back;
        return res.send(menu);
      }

      if (s[2] === '0') return res.send(t.mainMenu);

      const projects = await db.query(
        `SELECT id, title, description,
                COALESCE(title_sw, title) AS title_sw,
                COALESCE(description_sw, description) AS description_sw
         FROM research_projects WHERE is_active = true ORDER BY created_at DESC LIMIT 7`
      );
      const projectIdx = parseInt(s[2], 10) - 1;
      if (isNaN(projectIdx) || projectIdx < 0 || projectIdx >= projects.rows.length) return res.send(t.invalid);

      const project = projects.rows[projectIdx];
      const projectTitle = lang === 'sw' ? project.title_sw : project.title;
      const projectDesc  = lang === 'sw' ? project.description_sw : project.description;

      if (s.length === 3) {
        const qCount = await db.query(
          'SELECT COUNT(*) FROM research_questions WHERE project_id = $1 AND is_active = true', [project.id]
        );
        return res.send(t.projectInfo(projectTitle, projectDesc, qCount.rows[0].count));
      }

      if (s[3] === '0') {
        let menu = t.selectProject;
        projects.rows.forEach((p, i) => { menu += `${i + 1}. ${lang === 'sw' ? p.title_sw : p.title}\n`; });
        menu += t.back;
        return res.send(menu);
      }

      if (s[3] === '1' || s.length >= 5) {
        const questions = await db.query(
          `SELECT id, title, question_text,
                  COALESCE(title_sw, title) AS title_sw,
                  COALESCE(question_text_sw, question_text) AS question_text_sw
           FROM research_questions
           WHERE project_id = $1 AND is_active = true ORDER BY created_at ASC`,
          [project.id]
        );
        if (!questions.rows.length) return res.send(t.noQuestions);

        const answers = s.slice(4);
        const currentQIdx = answers.length;

        // Still answering
        if (currentQIdx < questions.rows.length) {
          if (answers.length > 0) {
            const prevQ = questions.rows[currentQIdx - 1];
            const prevAnswer = answers[answers.length - 1];
            if (prevAnswer && prevAnswer.trim()) {
              await saveResponse(prevQ.id, project.id, phoneNumber, prevAnswer);
            }
          }
          const q = questions.rows[currentQIdx];
          const qTitle = lang === 'sw' ? q.title_sw : q.title;
          const qText  = lang === 'sw' ? q.question_text_sw : q.question_text;
          return res.send(t.question(currentQIdx + 1, questions.rows.length, qTitle, qText));
        }

        // All done — save last answer, send SMS + airtime
        if (answers.length === questions.rows.length) {
          const lastQ = questions.rows[questions.rows.length - 1];
          const lastAnswer = answers[answers.length - 1];
          if (lastAnswer && lastAnswer.trim()) {
            await saveResponse(lastQ.id, project.id, phoneNumber, lastAnswer);
          }

          // Confirmation SMS
          sendSms(phoneNumber, t.smsDone(projectTitle));

          // 50 TZS airtime reward (fire-and-forget)
          upsertParticipant(phoneNumber).then(participantId => {
            const { sendReward } = require('../services/airtimeRewardService');
            return sendReward(participantId, project.id, normalizePhone(phoneNumber));
          }).catch(() => {});

          return res.send(t.done(projectTitle, questions.rows.length));
        }
      }
    }

    return res.send(t.invalid);

  } catch (err) {
    logger.error('[USSD] Error:', err);
    return res.send('END Sorry, a system error occurred. Please try again later.');
  }
});

module.exports = router;
