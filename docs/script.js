// ── Sidebar active state ───────────────────────────────────────────────────
(function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'getting-started.html';
  document.querySelectorAll('.nav-link').forEach(function(link) {
    const href = link.getAttribute('href') || '';
    if (href === page || (page === '' && href === 'getting-started.html')) {
      link.classList.add('active');
    }
  });
})();

// ── Mobile sidebar toggle ─────────────────────────────────────────────────
(function initMobileSidebar() {
  const sidebar  = document.querySelector('.sidebar');
  const overlay  = document.querySelector('.sidebar-overlay');
  const hamburger = document.querySelector('.hamburger');
  if (!sidebar || !overlay || !hamburger) return;

  function openSidebar()  { sidebar.classList.add('open'); overlay.classList.add('visible'); document.body.style.overflow = 'hidden'; }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('visible'); document.body.style.overflow = ''; }

  hamburger.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeSidebar();
  });
})();

// ── Search ────────────────────────────────────────────────────────────────
var SEARCH_INDEX = [
  { title: 'Getting Started',     page: 'getting-started.html',   section: 'User Guide',   keywords: 'account register login studio profile setup first event' },
  { title: 'Managing Events',     page: 'events.html',            section: 'User Guide',   keywords: 'create event date groups cover photo delete archive' },
  { title: 'Uploading Photos',    page: 'uploading-photos.html',  section: 'User Guide',   keywords: 'upload drag drop batch resume queue S3 progress formats JPEG PNG' },
  { title: 'Sharing Galleries',   page: 'sharing-galleries.html', section: 'User Guide',   keywords: 'share link PIN password gallery client public URL expiry' },
  { title: 'Photo Selection',     page: 'photo-selection.html',   section: 'User Guide',   keywords: 'customer select photos submit review deliver selections note name email' },
  { title: 'AI Face Search',      page: 'face-recognition.html',  section: 'User Guide',   keywords: 'face recognition AI selfie find my photos cluster people detection' },
  { title: 'Watermarking',        page: 'watermarking.html',      section: 'User Guide',   keywords: 'watermark logo text opacity position download protect branding' },
  { title: 'Billing & Plans',     page: 'billing.html',           section: 'User Guide',   keywords: 'free pro studio plan upgrade billing invoice stripe payment storage events' },
];

(function initSearch() {
  var input   = document.querySelector('.search-input');
  var results = document.querySelector('.search-results');
  if (!input || !results) return;

  function renderResults(query) {
    if (!query.trim()) { results.classList.remove('visible'); return; }
    var q = query.toLowerCase();
    var matches = SEARCH_INDEX.filter(function(item) {
      return (item.title + ' ' + item.keywords + ' ' + item.section).toLowerCase().includes(q);
    });
    if (matches.length === 0) {
      results.innerHTML = '<div class="search-result-item" style="color:var(--muted)">No results for "' + query + '"</div>';
    } else {
      results.innerHTML = matches.slice(0, 6).map(function(item) {
        return '<a class="search-result-item" href="' + item.page + '">' +
          '<div>' + item.title + '</div>' +
          '<div class="search-result-page">' + item.section + '</div>' +
          '</a>';
      }).join('');
    }
    results.classList.add('visible');
  }

  input.addEventListener('input', function() { renderResults(this.value); });
  input.addEventListener('focus', function() { if (this.value) renderResults(this.value); });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.search-wrap')) results.classList.remove('visible');
  });

  // ⌘K / Ctrl+K shortcut
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
})();

// ── Table of contents ─────────────────────────────────────────────────────
(function initTOC() {
  var tocList = document.querySelector('.toc-list');
  if (!tocList) return;

  var headings = document.querySelectorAll('.content-body h2');
  if (headings.length === 0) { document.querySelector('.toc-col') && (document.querySelector('.toc-col').style.display = 'none'); return; }

  headings.forEach(function(h, i) {
    if (!h.id) h.id = 'section-' + i;
    var li = document.createElement('li');
    var a  = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    li.appendChild(a);
    tocList.appendChild(li);
  });

  // Scroll spy
  var links = tocList.querySelectorAll('a');
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        links.forEach(function(l) { l.classList.remove('toc-active'); });
        var active = tocList.querySelector('a[href="#' + entry.target.id + '"]');
        if (active) active.classList.add('toc-active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  headings.forEach(function(h) { observer.observe(h); });
})();

// ── Screenshot fallback ───────────────────────────────────────────────────
document.querySelectorAll('.docs-screenshot img').forEach(function(img) {
  img.addEventListener('error', function() {
    this.parentElement.classList.add('screenshot-missing');
  });
});
