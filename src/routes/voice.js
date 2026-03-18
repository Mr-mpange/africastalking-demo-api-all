const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../database/connection');
const at = require('../config/at');
const logger = require('../utils/logger');

const router = express.Router();
const voice = at.VOICE;

// ─── Gemini transcription helper ─────────────────────────────────────────────
// AT provides a recordingUrl after <Record>. We download the audio and send
// it to Gemini for transcription + analysis.
async function transcribeWithGemini(audioUrl, lang = 'en') {
  try {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

    // Download audio as base64
    const response = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
      timeout: 20000,
      headers: { apikey: process.env.AT_API_KEY },
    });

    const base64Audio = Buffer.from(response.data).toString('base64');
    const mimeType = 'audio/mpeg'; // AT recordings are mp3

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });

    const langHint = lang === 'sw' ? 'The speaker is speaking Swahili.' : 'The speaker is speaking English.';
    const prompt = `${langHint} Transcribe this audio recording accurately. Return only the transcribed text, nothing else.`;

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Audio } },
        ],
      }],
    });

    return result.response.text().trim();
  } catch (err) {
    logger.warn('[Voice] Transcription failed:', err.message);
    return null;
  }
}

// ─── Base URL helper — uses PUBLIC_URL env so AT can reach callbacks ─────────
function getBase(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  // Cloud Run always serves HTTPS; req.protocol may report 'http' behind the LB
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

function say(text) {
  return `<Say>${text}</Say>`;
}

function xml(...body) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${body.join('\n  ')}\n</Response>`;
}

// ─── Language prompts ─────────────────────────────────────────────────────────

const T = {
  en: {
    welcome:      'Welcome to the Research Platform. This call will ask you a few research questions. Your voice answers will be recorded.',
    chooseLang:   'Press 1 for English. Press 2 for Swahili.',
    noProjects:   'There are no active research projects at the moment. Goodbye.',
    selectProject:'Press the number to select a research project.',
    confirmStart: (title) => `You selected ${title}. Press 1 to start answering. Press 2 to go back.`,
    question:     (n, total, text) => `Question ${n} of ${total}. ${text}. Please speak your answer after the beep. Press hash when done.`,
    nextQ:        'Thank you. Moving to the next question.',
    done:         (title) => `Thank you for completing the ${title} survey. Your responses have been recorded. Goodbye.`,
    invalidChoice:'Invalid choice. Please try again.',
    error:        'Sorry, a system error occurred. Please try again later. Goodbye.',
  },
  sw: {
    welcome:      'Karibu kwenye Jukwaa la Utafiti. Simu hii itakuuliza maswali ya utafiti. Majibu yako ya sauti yatarekodiwa.',
    chooseLang:   'Bonyeza 1 kwa Kiingereza. Bonyeza 2 kwa Kiswahili.',
    noProjects:   'Hakuna miradi ya utafiti inayoendelea kwa sasa. Kwaheri.',
    selectProject:'Bonyeza nambari kuchagua mradi wa utafiti.',
    confirmStart: (title) => `Umechagua ${title}. Bonyeza 1 kuanza kujibu. Bonyeza 2 kurudi.`,
    question:     (n, total, text) => `Swali la ${n} kati ya ${total}. ${text}. Tafadhali sema jibu lako baada ya mlio. Bonyeza gridi unapomaliza.`,
    nextQ:        'Asante. Tunaendelea na swali lijalo.',
    done:         (title) => `Asante kwa kukamilisha utafiti wa ${title}. Majibu yako yamehifadhiwa. Kwaheri.`,
    invalidChoice:'Chaguo batili. Tafadhali jaribu tena.',
    error:        'Samahani, hitilafu ya mfumo imetokea. Tafadhali jaribu tena baadaye. Kwaheri.',
  },
};

// ─── Upsert participant ───────────────────────────────────────────────────────

async function upsertParticipant(phone) {
  const ex = await db.query('SELECT id FROM participants WHERE phone_number = $1', [phone]);
  if (ex.rows.length) return ex.rows[0].id;
  const ins = await db.query(
    'INSERT INTO participants (phone_number) VALUES ($1) RETURNING id', [phone]
  );
  return ins.rows[0].id;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// POST /voice/actions  — AT calls this when a call comes in (Voice Callback URL)
// Also called after each <GetDigits> / <Record> with results
router.post('/actions', async (req, res) => {
  res.set('Content-Type', 'application/xml');
  logger.info('[Voice Actions]', req.body);

  const { isActive, callerNumber, dtmfDigits, recordingUrl } = req.body;
  const digits = dtmfDigits || '';
  const base   = getBase(req);

  // AT posts isActive=0 for call summary — ignore
  if (String(isActive) === '0') {
    return res.send(xml());
  }

  try {
    // First hit: no digits yet → language selection
    if (!digits && !recordingUrl) {
      return res.send(xml(
        say(T.en.welcome),
        `<GetDigits timeout="15" numDigits="1" callbackUrl="${base}/voice/lang">`,
        say(T.en.chooseLang),
        `</GetDigits>`,
        say(T.en.chooseLang),
        `<Redirect>${base}/voice/actions</Redirect>`
      ));
    }

    return res.send(xml(say(T.en.error), '<Hangup/>'));
  } catch (err) {
    logger.error('[Voice Actions] error:', err);
    return res.send(xml(say(T.en.error), '<Hangup/>'));
  }
});

// POST /voice/lang  — language digit received → show project list
router.post('/lang', async (req, res) => {
  res.set('Content-Type', 'application/xml');
  logger.info('[Voice Lang]', req.body);

  const digit  = req.body.dtmfDigits || '1';
  const lang   = digit === '2' ? 'sw' : 'en';
  const t      = T[lang];
  const base   = getBase(req);

  try {
    const projects = await db.query(
      `SELECT id, title FROM research_projects WHERE is_active = true ORDER BY created_at DESC LIMIT 5`
    );

    if (!projects.rows.length) {
      return res.send(xml(say(t.noProjects), '<Hangup/>'));
    }

    let projectSay = t.selectProject + ' ';
    projects.rows.forEach((p, i) => {
      projectSay += `Press ${i + 1} for ${p.title}. `;
    });

    return res.send(xml(
      `<GetDigits timeout="15" numDigits="1" callbackUrl="${base}/voice/project?lang=${lang}">`,
      say(projectSay),
      `</GetDigits>`,
      say(t.invalidChoice),
      `<Redirect>${base}/voice/lang?digit=${digit}</Redirect>`
    ));
  } catch (err) {
    logger.error('[Voice Lang] error:', err);
    return res.send(xml(say(t.error), '<Hangup/>'));
  }
});

// GET /voice/lang  — redirect helper
router.get('/lang', async (req, res) => {
  res.set('Content-Type', 'application/xml');
  const digit = req.query.digit || '1';
  const lang  = digit === '2' ? 'sw' : 'en';
  const base  = getBase(req);
  const t     = T[lang];

  const projects = await db.query(
    `SELECT id, title FROM research_projects WHERE is_active = true ORDER BY created_at DESC LIMIT 5`
  ).catch(() => ({ rows: [] }));

  if (!projects.rows.length) return res.send(xml(say(t.noProjects), '<Hangup/>'));

  let projectSay = t.selectProject + ' ';
  projects.rows.forEach((p, i) => { projectSay += `Press ${i + 1} for ${p.title}. `; });

  return res.send(xml(
    `<GetDigits timeout="15" numDigits="1" callbackUrl="${base}/voice/project?lang=${lang}">`,
    say(projectSay),
    `</GetDigits>`,
    say(t.invalidChoice),
    `<Redirect>${base}/voice/lang?digit=${digit}</Redirect>`
  ));
});

// POST /voice/project  — project selected → confirm + start
router.post('/project', async (req, res) => {
  res.set('Content-Type', 'application/xml');
  logger.info('[Voice Project]', req.body);

  const digit = req.body.dtmfDigits || '';
  const lang  = req.query.lang || 'en';
  const t     = T[lang];
  const base  = getBase(req);

  try {
    const projects = await db.query(
      `SELECT id, title FROM research_projects WHERE is_active = true ORDER BY created_at DESC LIMIT 5`
    );

    const idx = parseInt(digit, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= projects.rows.length) {
      return res.send(xml(say(t.invalidChoice), `<Redirect>${base}/voice/lang?digit=${lang === 'sw' ? '2' : '1'}</Redirect>`));
    }

    const project = projects.rows[idx];

    return res.send(xml(
      `<GetDigits timeout="15" numDigits="1" callbackUrl="${base}/voice/survey?lang=${lang}&projectId=${project.id}&q=0">`,
      say(t.confirmStart(project.title)),
      `</GetDigits>`,
      say(t.invalidChoice),
      `<Redirect>${base}/voice/lang?digit=${lang === 'sw' ? '2' : '1'}</Redirect>`
    ));
  } catch (err) {
    logger.error('[Voice Project] error:', err);
    return res.send(xml(say(t.error), '<Hangup/>'));
  }
});

// POST /voice/survey  — main survey loop
// q = current question index (0-based)
// Called after each <Record> completes with recordingUrl
router.post('/survey', async (req, res) => {
  res.set('Content-Type', 'application/xml');
  logger.info('[Voice Survey]', { ...req.query, body: req.body });

  const lang       = req.query.lang || 'en';
  const projectId  = req.query.projectId;
  const qIdx       = parseInt(req.query.q || '0', 10);
  const t          = T[lang];
  const base       = getBase(req);
  const phone      = req.body.callerNumber || req.body.phoneNumber || '';
  const recordingUrl = req.body.recordingUrl || '';
  const digits     = req.body.dtmfDigits || '';

  try {
    // If digit=2 on confirm screen → go back to project list
    if (digits === '2' && qIdx === 0) {
      return res.send(xml(`<Redirect>${base}/voice/lang?digit=${lang === 'sw' ? '2' : '1'}</Redirect>`));
    }

    const questions = await db.query(
      `SELECT id, title, question_text FROM research_questions
       WHERE project_id = $1 AND is_active = true ORDER BY created_at ASC`,
      [projectId]
    );

    if (!questions.rows.length) {
      return res.send(xml(say(t.noProjects), '<Hangup/>'));
    }

    // ── Save previous recording if present ───────────────────────────────
    if (recordingUrl && qIdx > 0) {
      const prevQ = questions.rows[qIdx - 1];
      if (prevQ) {
        const participantId = await upsertParticipant(phone);

        // Transcribe in background — don't block the IVR response
        transcribeWithGemini(recordingUrl, lang).then(async (transcription) => {
          await db.query(`
            INSERT INTO research_responses
              (question_id, project_id, participant_id, phone_number,
               response_text, audio_url, response_type)
            VALUES ($1, $2, $3, $4, $5, $6, 'voice')
          `, [
            prevQ.id, projectId, participantId, phone,
            transcription || '[voice - transcription pending]',
            recordingUrl,
          ]);
          logger.info('[Voice] Response saved', { questionId: prevQ.id, transcription: !!transcription });

          // Trigger AI batch check
          const count = await db.query(
            'SELECT COUNT(*) FROM research_responses WHERE project_id = $1 AND question_id = $2',
            [projectId, prevQ.id]
          );
          const total = parseInt(count.rows[0].count, 10);
          if (total > 0 && total % 10 === 0) {
            const projectAiService = require('../services/projectAiService');
            projectAiService.generateAISummary(projectId, prevQ.id).catch(() => {});
          }
        }).catch(err => logger.warn('[Voice] Save response failed:', err.message));
      }
    }

    // ── All questions done ────────────────────────────────────────────────
    if (qIdx >= questions.rows.length) {
      const projResult = await db.query('SELECT title FROM research_projects WHERE id = $1', [projectId]);
      const title = projResult.rows[0]?.title || 'the survey';
      return res.send(xml(say(t.done(title)), '<Hangup/>'));
    }

    // ── Ask current question ──────────────────────────────────────────────
    const q    = questions.rows[qIdx];
    const text = q.question_text || q.title;
    const nextUrl = `${base}/voice/survey?lang=${lang}&projectId=${projectId}&q=${qIdx + 1}`;

    return res.send(xml(
      say(t.question(qIdx + 1, questions.rows.length, text)),
      `<Record finishOnKey="#" maxLength="120" trimSilence="true" callbackUrl="${nextUrl}"/>`,
      say(t.nextQ),
      `<Redirect>${nextUrl}</Redirect>`
    ));

  } catch (err) {
    logger.error('[Voice Survey] error:', err);
    return res.send(xml(say(t.error), '<Hangup/>'));
  }
});

// POST /voice/events  — call status events (duration, hangup, etc.)
router.post('/events', (req, res) => {
  logger.info('[Voice Events]', req.body);
  res.status(200).send('OK');
});

router.get('/events', (req, res) => {
  logger.info('[Voice Events][GET]', req.query);
  res.status(200).send('OK');
});

// POST /voice/call  — outbound call trigger
router.post('/call', async (req, res) => {
  try {
    const callFrom = req.body.callFrom || process.env.AT_VOICE_NUMBER;
    const callTo   = req.body.callTo;
    if (!callFrom || !callTo) {
      return res.status(400).json({ error: 'callFrom and callTo are required' });
    }
    try {
      const result = await voice.call({ callFrom, callTo });
      return res.json({ ok: true, via: 'sdk', result });
    } catch (sdkErr) {
      const form = new URLSearchParams();
      form.append('username', process.env.AT_USERNAME);
      form.append('from', callFrom);
      form.append('to', callTo);
      const r = await axios.post('https://voice.africastalking.com/call', form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', apikey: process.env.AT_API_KEY },
        timeout: 15000,
      });
      return res.json({ ok: true, via: 'rest', data: r.data });
    }
  } catch (err) {
    logger.error('[Voice Call] error:', err);
    return res.status(500).json({ error: 'Failed to initiate call', details: err.message });
  }
});

module.exports = router;
