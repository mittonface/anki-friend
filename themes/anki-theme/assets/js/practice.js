import { callClaude, getKey, parseJsonLoose, setKey } from './lib/claude-api.js';
import { MODEL_EVAL, MODEL_FAST } from './lib/config.js';
import { escHtml } from './lib/dom.js';
import { shuffle } from './lib/shuffle.js';

const rawCards = Array.from(document.querySelectorAll('#card-data .pc-card')).map(el => ({
  title: el.dataset.title,
  reading: el.dataset.reading,
  meaning: el.dataset.meaning,
  state: el.dataset.state,
}));

const progressEl = document.getElementById('progress-label');
const loadingEl = document.getElementById('pc-loading');
const englishEl = document.getElementById('pc-english');
const hintEl = document.getElementById('pc-hint');
const revealBtn = document.getElementById('reveal-hint-btn');
const answerInput = document.getElementById('answer-input');
const submitBtn = document.getElementById('submit-btn');
const skipBtn = document.getElementById('skip-btn');
const practiceCard = document.getElementById('practice-card');
const feedbackPanel = document.getElementById('feedback-panel');
const feedbackContent = document.getElementById('feedback-content');
const nextBtn = document.getElementById('next-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const easyBtn = document.getElementById('easy-btn');
const normalBtn = document.getElementById('normal-btn');
const breakdownBtn = document.getElementById('breakdown-btn');
const breakdownPanel = document.getElementById('breakdown-panel');
const presubmitBreakdownBtn = document.getElementById('presubmit-breakdown-btn');
const presubmitBreakdownPanel = document.getElementById('presubmit-breakdown-panel');

const reviewCards = shuffle(rawCards.filter(c => c.state === 'review'));
const learningCards = shuffle(rawCards.filter(c => c.state === 'learning' || c.state === 'relearning'));

let queue = [...reviewCards, ...learningCards];
let qIdx = 0;
let doneCount = 0;
let currentSentence = '';
let currentCard = null;
let difficulty = 'normal';
let lastCorrectJapanese = '';

function handleMissingKey(err) {
  if (err.code !== 'missing_api_key') return false;

  settingsPanel.style.display = 'block';
  apiKeyInput.focus();
  return true;
}

apiKeyInput.value = getKey();

settingsBtn.addEventListener('click', () => {
  settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
});

saveKeyBtn.addEventListener('click', () => {
  setKey(apiKeyInput.value);
  settingsPanel.style.display = 'none';
  if (!currentSentence) loadCard();
});

easyBtn.addEventListener('click', () => {
  if (difficulty === 'easy') return;
  difficulty = 'easy';
  easyBtn.classList.add('active');
  normalBtn.classList.remove('active');
  if (currentCard) generateSentence();
});

normalBtn.addEventListener('click', () => {
  if (difficulty === 'normal') return;
  difficulty = 'normal';
  normalBtn.classList.add('active');
  easyBtn.classList.remove('active');
  if (currentCard) generateSentence();
});

revealBtn.addEventListener('click', () => {
  hintEl.style.display = 'inline';
  revealBtn.style.display = 'none';
});

async function generateSentence() {
  hintEl.style.display = 'none';
  revealBtn.style.display = 'inline';
  answerInput.value = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Check Translation';
  englishEl.style.display = 'none';
  loadingEl.style.display = 'block';
  loadingEl.textContent = 'Generating sentence…';
  currentSentence = '';
  presubmitBreakdownPanel.style.display = 'none';
  presubmitBreakdownPanel.innerHTML = '';
  presubmitBreakdownBtn.disabled = false;
  presubmitBreakdownBtn.textContent = 'Break it down →';

  try {
    const sentence = await callClaude([{
      role: 'user',
      content: difficulty === 'easy'
        ? `Create a very short, super simple English sentence (3–6 words) for a beginner Japanese learner to translate into Japanese. The sentence must use the concept expressed by the Japanese word: ${currentCard.title} (${currentCard.reading}), meaning "${currentCard.meaning}".

Rules:
- Extremely simple structure: subject + verb (+ object), nothing more
- No adjectives, adverbs, or subordinate clauses
- Use only the most basic everyday words (I, you, he, she, eat, go, see, buy, etc.)
- Return ONLY the sentence, no explanations or punctuation marks surrounding it`
        : `Create a simple English sentence (6–12 words) for a beginner Japanese learner to translate into Japanese. The sentence must naturally use the concept expressed by the Japanese word: ${currentCard.title} (${currentCard.reading}), meaning "${currentCard.meaning}".

Rules:
- Use only simple, everyday English vocabulary
- Keep grammar clear and unambiguous
- Return ONLY the sentence, no explanations or punctuation marks surrounding it`,
    }], 80, MODEL_FAST);

    currentSentence = sentence.trim().replace(/^["']|["']$/g, '');
    loadingEl.style.display = 'none';
    englishEl.textContent = currentSentence;
    englishEl.style.display = 'block';
    submitBtn.disabled = false;
    answerInput.focus();
  } catch (err) {
    handleMissingKey(err);
    loadingEl.textContent = `Error: ${err.message}`;
  }
}

async function loadCard() {
  if (qIdx >= queue.length) {
    qIdx = 0;
    queue = [...shuffle(reviewCards), ...shuffle(learningCards)];
  }
  currentCard = queue[qIdx++];

  feedbackPanel.style.display = 'none';
  practiceCard.style.display = 'block';
  hintEl.textContent = `${currentCard.title} (${currentCard.reading}) — ${currentCard.meaning}`;
  progressEl.textContent = `${doneCount} done`;

  await generateSentence();
}

async function submitAnswer() {
  const answer = answerInput.value.trim();
  if (!answer || submitBtn.disabled) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Checking…';

  try {
    const raw = await callClaude([{
      role: 'user',
      content: `A Japanese learner was asked to translate this English sentence:
"${currentSentence}"

Target vocabulary word: ${currentCard.title} (${currentCard.reading}) — "${currentCard.meaning}"
Their Japanese translation: "${answer}"

Evaluate and reply with valid JSON only (no markdown fences):
{
  "score": "correct" or "mostly_correct" or "needs_work",
  "feedback": "1–2 sentence plain-English explanation of the overall quality",
  "better_version": "an improved Japanese translation, or null if their answer is already correct",
  "notes": ["up to 2 short specific grammar or word-choice tips"]
}`,
    }], 350, MODEL_EVAL);

    let data;
    try {
      data = parseJsonLoose(raw);
    } catch {
      data = { score: 'needs_work', feedback: raw, better_version: null, notes: [] };
    }

    showFeedback(data);
    doneCount++;
    progressEl.textContent = `${doneCount} done`;
  } catch (err) {
    handleMissingKey(err);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Check Translation';
    alert(`Error: ${err.message}`);
  }
}

function showFeedback(data) {
  const colors = { correct: '#4caf50', mostly_correct: '#ff9800', needs_work: '#e94560' };
  const labels = { correct: 'Correct ✓', mostly_correct: 'Mostly Correct', needs_work: 'Needs Work' };
  const color = colors[data.score] || '#aaa';
  const label = labels[data.score] || data.score;

  lastCorrectJapanese = data.better_version || answerInput.value.trim();
  breakdownPanel.style.display = 'none';
  breakdownPanel.innerHTML = '';
  breakdownBtn.disabled = false;
  breakdownBtn.textContent = 'Break it down →';

  let html = `<div class="fb-score" style="color:${color};">${label}</div>`;
  html += `<div class="fb-row"><span class="fb-label">Your answer</span><span class="fb-val">${escHtml(answerInput.value.trim())}</span></div>`;
  if (data.better_version) {
    html += `<div class="fb-row"><span class="fb-label">Better</span><span class="fb-val">${escHtml(data.better_version)}</span></div>`;
  }
  html += `<div class="fb-feedback">${escHtml(data.feedback)}</div>`;
  if (data.notes && data.notes.length) {
    html += `<ul class="fb-notes">${data.notes.map(n => `<li>${escHtml(n)}</li>`).join('')}</ul>`;
  }

  feedbackContent.innerHTML = html;
  practiceCard.style.display = 'none';
  feedbackPanel.style.display = 'block';
  nextBtn.focus();
}

function renderBreakdown(data) {
  let html = '<div class="bd-wrap">';
  html += `<div class="bd-overview">${escHtml(data.overview)}</div>`;

  if (data.steps && data.steps.length) {
    html += '<div class="bd-section-title">Step-by-step</div>';
    html += '<ol class="bd-steps">';
    for (const step of data.steps) {
      html += `<li class="bd-step">
        <div class="bd-step-title">${escHtml(step.title)}</div>
        <div class="bd-mapping">
          <span class="bd-en">${escHtml(step.english_part)}</span>
          <span class="bd-arrow">→</span>
          <span class="bd-jp">${escHtml(step.japanese_part)}</span>
        </div>
        <div class="bd-step-exp">${escHtml(step.explanation)}</div>
      </li>`;
    }
    html += '</ol>';
  }

  if (data.word_order_note) {
    html += '<div class="bd-section-title">Word order</div>';
    html += `<div class="bd-word-order">${escHtml(data.word_order_note)}</div>`;
  }

  if (data.grammar_notes && data.grammar_notes.length) {
    html += '<div class="bd-section-title">Grammar rules</div>';
    html += '<ul class="bd-grammar">';
    for (const g of data.grammar_notes) {
      html += `<li><span class="bd-rule">${escHtml(g.rule)}</span> — ${escHtml(g.explanation)}</li>`;
    }
    html += '</ul>';
  }

  html += '</div>';
  return html;
}

async function doBreakdown(panelEl, btnEl, targetJapanese) {
  btnEl.disabled = true;
  btnEl.textContent = 'Breaking it down…';
  panelEl.style.display = 'none';

  const hasTarget = !!targetJapanese;
  const prompt = hasTarget
    ? `You are a Japanese language teacher. A student is translating this English sentence into Japanese:

English: "${currentSentence}"
Japanese translation: "${targetJapanese}"
Vocabulary focus: ${currentCard.title} (${currentCard.reading}) — "${currentCard.meaning}"

Give a thorough step-by-step breakdown of HOW to arrive at this Japanese translation. Be as instructive as possible.`
    : `You are a Japanese language teacher. A student wants to understand how to translate this English sentence into Japanese BEFORE attempting it:

English: "${currentSentence}"
Vocabulary focus: ${currentCard.title} (${currentCard.reading}) — "${currentCard.meaning}"

First decide on the best natural Japanese translation, then give a thorough step-by-step breakdown of HOW to build it from scratch. Be as instructive as possible.`;

  try {
    const raw = await callClaude([{
      role: 'user',
      content: `${prompt}

Reply with valid JSON only (no markdown fences):
{
  "overview": "1–2 sentences describing the overall sentence structure and key challenge",
  "steps": [
    {
      "title": "Short step title (e.g. 'Identify the subject')",
      "english_part": "the English word/phrase this step covers",
      "japanese_part": "the corresponding Japanese",
      "explanation": "Clear explanation of what to do and why — name the grammar rule, particle, or conjugation pattern being applied"
    }
  ],
  "grammar_notes": [
    {
      "rule": "Grammar rule or pattern name (e.g. 'Topic particle は')",
      "explanation": "Concise explanation of the rule and when to use it"
    }
  ],
  "word_order_note": "Explain the Japanese word order used here vs English (e.g. SOV vs SVO) and any other structural differences"
}`,
    }], 2000, MODEL_EVAL);

    const data = parseJsonLoose(raw);

    panelEl.innerHTML = renderBreakdown(data);
    panelEl.style.display = 'block';
  } catch (err) {
    handleMissingKey(err);
    panelEl.innerHTML = `<div class="bd-error">Error: ${escHtml(err.message)}</div>`;
    panelEl.style.display = 'block';
  }

  btnEl.textContent = 'Break it down →';
  btnEl.disabled = false;
}

breakdownBtn.addEventListener('click', () =>
  doBreakdown(breakdownPanel, breakdownBtn, lastCorrectJapanese || answerInput.value.trim())
);

presubmitBreakdownBtn.addEventListener('click', () =>
  doBreakdown(presubmitBreakdownPanel, presubmitBreakdownBtn, null)
);

skipBtn.addEventListener('click', loadCard);
submitBtn.addEventListener('click', submitAnswer);
nextBtn.addEventListener('click', loadCard);

answerInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    submitAnswer();
  }
});

if (!getKey()) {
  settingsPanel.style.display = 'block';
  loadingEl.textContent = 'Enter your Anthropic API key above to begin.';
} else {
  loadCard();
}
