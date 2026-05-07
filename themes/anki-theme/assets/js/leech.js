import { shuffle } from './lib/shuffle.js';

const raw = Array.from(document.querySelectorAll('#card-data .lc'));

let cards = shuffle(raw);
let idx = 0;
let revealed = false;

const fcTitle = document.getElementById('fc-title');
const fcDeck = document.getElementById('fc-deck');
const fcBack = document.getElementById('fc-back');
const fcStats = document.getElementById('fc-stats');
const flashcard = document.getElementById('flashcard');
const progressEl = document.getElementById('progress-label');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const shuffleBtn = document.getElementById('shuffle-btn');

function render() {
  const card = cards[idx];
  const title = card.dataset.title;
  const reading = card.dataset.reading;
  const lapses = parseInt(card.dataset.lapses) || 0;
  const ease = parseInt(card.dataset.ease) || 0;
  const deck = card.dataset.deck;
  const content = card.querySelector('.lc-content').innerHTML;

  progressEl.textContent = `${idx + 1} / ${cards.length}`;
  fcTitle.textContent = title;
  fcDeck.textContent = deck;

  let backHTML = '';
  if (reading) backHTML += `<div class="fc-reading">${reading}</div>`;
  backHTML += `<div class="fc-content">${content}</div>`;
  fcBack.innerHTML = backHTML;

  let statsHTML = '';
  if (lapses) statsHTML += `<span class="stat stat-bad">${lapses} lapse${lapses !== 1 ? 's' : ''}</span>`;
  if (ease > 0) statsHTML += `<span class="stat">${Math.round(ease / 10)}% ease</span>`;
  fcStats.innerHTML = statsHTML;

  revealed = false;
  flashcard.classList.remove('revealed');
}

function reveal() {
  if (revealed) return;
  revealed = true;
  flashcard.classList.add('revealed');
}

function goNext() {
  idx = (idx + 1) % cards.length;
  render();
}

function goPrev() {
  idx = (idx - 1 + cards.length) % cards.length;
  render();
}

flashcard.addEventListener('click', reveal);

nextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  goNext();
});

prevBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  goPrev();
});

shuffleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  cards = shuffle(raw);
  idx = 0;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'l') {
    goNext();
  } else if (e.key === 'ArrowLeft' || e.key === 'h') {
    goPrev();
  } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    revealed ? goNext() : reveal();
  }
});

render();
