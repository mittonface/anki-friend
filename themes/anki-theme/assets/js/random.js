import { shuffle } from './lib/shuffle.js';

const cards = shuffle(Array.from(document.querySelectorAll('.random-card')));

cards.slice(0, 5).forEach(card => {
  card.style.display = '';
});

document.querySelectorAll('.random-card .card-header').forEach(header => {
  header.addEventListener('click', () => {
    header.closest('.card-item').classList.toggle('open');
  });
});

document.querySelectorAll('.random-card .card-meta').forEach(meta => {
  meta.addEventListener('click', (e) => {
    e.stopPropagation();
    meta.classList.toggle('revealed');
  });
});
