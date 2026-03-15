document.addEventListener('DOMContentLoaded', () => {
  // Card expand/collapse
  document.querySelectorAll('.card-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.card-item').classList.toggle('open');
    });
  });

  const searchInput = document.getElementById('search');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.card-item');
  const countEl = document.getElementById('card-count');
  let activeFilter = 'struggling';

  function applyFilters() {
    const query = searchInput.value.toLowerCase().trim();
    let visible = 0;

    cards.forEach(card => {
      const title = card.dataset.title || '';
      const summary = card.dataset.summary || '';
      const deck = card.dataset.deck || '';
      const isStruggling = card.classList.contains('struggling');

      let matchesFilter = true;
      if (activeFilter === 'struggling') {
        matchesFilter = isStruggling;
      } else if (activeFilter.startsWith('deck:')) {
        matchesFilter = deck === activeFilter.slice(5);
      }
      // 'all' matches everything

      const matchesSearch = !query
        || title.includes(query)
        || summary.includes(query);

      if (matchesFilter && matchesSearch) {
        card.classList.remove('hidden');
        visible++;
      } else {
        card.classList.add('hidden');
      }
    });

    countEl.textContent = visible + ' card' + (visible !== 1 ? 's' : '');
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      applyFilters();
    });
  });

  searchInput.addEventListener('input', applyFilters);

  // Initial filter
  applyFilters();
});
