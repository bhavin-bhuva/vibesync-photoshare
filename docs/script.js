/* ============================================================
   PhotoHouse Docs — script.js
   Covers: active nav, TOC gen, scroll spy, search, mobile
   sidebar, screenshot lightbox, smooth scroll.
   ============================================================ */

(function () {
  'use strict';

  // ── 1. Active navigation highlighting ───────────────────────────────────────
  (function initActiveNav() {
    const currentPage = window.location.pathname.split('/').pop() || 'getting-started.html';

    document.querySelectorAll('.sidebar-nav a').forEach(function (link) {
      if (link.getAttribute('href') === currentPage) {
        link.classList.add('active');
      }
    });
  })();


  // ── 2. Table of contents generation ─────────────────────────────────────────
  var tocContainer = document.querySelector('.toc-list') || document.getElementById('toc');
  var contentRoot  = document.querySelector('.content-body') || document.querySelector('.docs-content');

  var allHeadings = contentRoot
    ? contentRoot.querySelectorAll('h2')
    : document.querySelectorAll('h2');

  if (tocContainer && allHeadings.length > 0) {
    allHeadings.forEach(function (h2, i) {
      // Assign ID if missing
      if (!h2.id) {
        h2.id = h2.textContent
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-') || ('section-' + i);
      }

      var li  = document.createElement('li');
      var a   = document.createElement('a');
      a.href        = '#' + h2.id;
      a.textContent = h2.textContent;
      li.appendChild(a);
      tocContainer.appendChild(li);
    });
  } else if (tocContainer) {
    // No headings — hide the whole TOC column
    var tocCol = document.querySelector('.toc-col');
    if (tocCol) tocCol.style.display = 'none';
  }


  // ── 3. TOC scroll spy ───────────────────────────────────────────────────────
  if (tocContainer && allHeadings.length > 0) {
    var tocObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id      = entry.target.id;
        var tocLink = tocContainer.querySelector('a[href="#' + id + '"]');
        if (!tocLink) return;
        tocContainer.querySelectorAll('a').forEach(function (a) {
          a.classList.remove('toc-active');
        });
        tocLink.classList.add('toc-active');
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    allHeadings.forEach(function (h) { tocObserver.observe(h); });
  }


  // ── 4. Client-side search ────────────────────────────────────────────────────
  var SEARCH_DATA = [
    { title: 'Getting Started',   url: 'getting-started.html',
      keywords: 'register account setup studio profile first event logo branding tagline dashboard' },
    { title: 'Managing Events',   url: 'events.html',
      keywords: 'event create delete groups photos cover density lightbox people tab' },
    { title: 'Uploading Photos',  url: 'uploading-photos.html',
      keywords: 'upload photos drag drop progress resume indexeddb queue s3 multipart mobile thumbnail exif' },
    { title: 'Sharing Galleries', url: 'sharing-galleries.html',
      keywords: 'share link pin password protect expiry group visibility client download zip watermark' },
    { title: 'Photo Selection',   url: 'photo-selection.html',
      keywords: 'selection client pick favourite download submit review delivered pending status note' },
    { title: 'AI Face Search',    url: 'face-recognition.html',
      keywords: 'face ai selfie people find photos cluster embedding privacy data pro studio' },
    { title: 'Watermarking',      url: 'watermarking.html',
      keywords: 'watermark logo protect download opacity position sharp svg text branding' },
    { title: 'Billing & Plans',   url: 'billing.html',
      keywords: 'billing plan upgrade free pro studio price stripe invoice storage events limit cancel' },
  ];

  (function initSearch() {
    var searchInput   = document.querySelector('.search-input');
    var searchResults = document.querySelector('.search-results');
    if (!searchInput || !searchResults) return;

    var selectedIndex = -1;

    function getMatches(query) {
      var q = query.toLowerCase().trim();
      if (!q) return [];
      return SEARCH_DATA.filter(function (item) {
        return (item.title + ' ' + item.keywords).toLowerCase().indexOf(q) !== -1;
      });
    }

    function renderResults(matches, query) {
      if (matches.length === 0) {
        searchResults.innerHTML =
          '<div class="search-result-item" style="color:var(--muted);cursor:default">No results for &ldquo;' +
          escapeHtml(query) + '&rdquo;</div>';
      } else {
        searchResults.innerHTML = matches.slice(0, 7).map(function (item, i) {
          return '<a class="search-result-item" href="' + item.url + '" data-index="' + i + '">' +
            '<div>' + escapeHtml(item.title) + '</div>' +
            '<div class="search-result-page">' + escapeHtml(item.keywords.split(' ').slice(0, 4).join(', ')) + '&hellip;</div>' +
            '</a>';
        }).join('');
      }
      searchResults.classList.add('visible');
      selectedIndex = -1;
      highlightItem(-1);
    }

    function closeResults() {
      searchResults.classList.remove('visible');
      selectedIndex = -1;
    }

    function highlightItem(idx) {
      var items = searchResults.querySelectorAll('a.search-result-item');
      items.forEach(function (item, i) {
        item.style.background = (i === idx) ? 'var(--code-bg)' : '';
      });
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Input handler
    searchInput.addEventListener('input', function () {
      var q = this.value.trim();
      if (!q) { closeResults(); return; }
      renderResults(getMatches(q), q);
    });

    // Focus: re-show results if query already entered
    searchInput.addEventListener('focus', function () {
      if (this.value.trim()) renderResults(getMatches(this.value.trim()), this.value.trim());
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', function (e) {
      var items = searchResults.querySelectorAll('a.search-result-item');
      if (!searchResults.classList.contains('visible') || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        highlightItem(selectedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        highlightItem(selectedIndex);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          window.location.href = items[selectedIndex].getAttribute('href');
        } else if (items.length === 1) {
          window.location.href = items[0].getAttribute('href');
        }
      } else if (e.key === 'Escape') {
        closeResults();
        searchInput.blur();
      }
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search-wrap')) closeResults();
    });

    // ⌘K / Ctrl+K global shortcut
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  })();


  // ── 5. Mobile sidebar toggle ─────────────────────────────────────────────────
  (function initMobileSidebar() {
    var sidebar   = document.querySelector('.sidebar');
    var overlay   = document.querySelector('.sidebar-overlay');
    var hamburger = document.querySelector('.hamburger');
    if (!sidebar || !overlay || !hamburger) return;

    function openSidebar() {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
      document.body.style.overflow = 'hidden';
      hamburger.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
      document.body.style.overflow = '';
      hamburger.setAttribute('aria-expanded', 'false');
    }

    hamburger.addEventListener('click', openSidebar);
    overlay.addEventListener('click', closeSidebar);

    // Close on nav link click (mobile UX)
    sidebar.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeSidebar);
    });

    // Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
    });
  })();


  // ── 6. Screenshot zoom lightbox ───────────────────────────────────────────────
  (function initScreenshotLightbox() {
    var overlay = null;

    function openLightbox(src, alt) {
      overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', alt || 'Screenshot');
      Object.assign(overlay.style, {
        position:       'fixed',
        inset:          '0',
        zIndex:         '9999',
        background:     'rgba(0,0,0,0.88)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '24px',
        cursor:         'zoom-out',
        opacity:        '0',
        transition:     'opacity 0.2s ease',
      });

      var img = document.createElement('img');
      img.src = src;
      img.alt = alt || '';
      Object.assign(img.style, {
        maxWidth:     '92vw',
        maxHeight:    '90vh',
        borderRadius: '10px',
        boxShadow:    '0 24px 80px rgba(0,0,0,0.6)',
        cursor:       'default',
        objectFit:    'contain',
      });

      var closeBtn = document.createElement('button');
      closeBtn.setAttribute('aria-label', 'Close screenshot');
      closeBtn.innerHTML = '&times;';
      Object.assign(closeBtn.style, {
        position:   'absolute',
        top:        '16px',
        right:      '20px',
        background: 'none',
        border:     'none',
        color:      'rgba(255,255,255,0.7)',
        fontSize:   '32px',
        lineHeight: '1',
        cursor:     'pointer',
        padding:    '4px 10px',
      });
      closeBtn.addEventListener('mouseover', function () { this.style.color = '#fff'; });
      closeBtn.addEventListener('mouseout',  function () { this.style.color = 'rgba(255,255,255,0.7)'; });
      closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closeLightbox(); });

      overlay.appendChild(img);
      overlay.appendChild(closeBtn);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      // Prevent image click from closing
      img.addEventListener('click', function (e) { e.stopPropagation(); });

      // Backdrop click closes
      overlay.addEventListener('click', closeLightbox);

      // Fade in
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { overlay.style.opacity = '1'; });
      });
    }

    function closeLightbox() {
      if (!overlay) return;
      overlay.style.opacity = '0';
      overlay.addEventListener('transitionend', function () {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        document.body.style.overflow = '';
      });
    }

    // Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay) closeLightbox();
    });

    // Attach to all screenshot images
    document.querySelectorAll('.docs-screenshot img').forEach(function (img) {
      // Only attach if image loaded successfully
      function attach() {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', function () {
          openLightbox(this.src, this.alt);
        });
      }
      if (img.complete && img.naturalWidth > 0) {
        attach();
      } else {
        img.addEventListener('load', attach);
      }

      // Missing screenshot fallback
      img.addEventListener('error', function () {
        this.parentElement.classList.add('screenshot-missing');
        this.style.cursor = '';
      });
    });
  })();


  // ── 7. Smooth scroll with header offset ─────────────────────────────────────
  (function initSmoothScroll() {
    var OFFSET = 80; // px below the fixed topbar

    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        var id     = this.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.scrollY - OFFSET;
        window.scrollTo({ top: top, behavior: 'smooth' });
        // Update URL hash without jumping
        if (history.pushState) history.pushState(null, '', '#' + id);
      });
    });
  })();

})(); // end IIFE
