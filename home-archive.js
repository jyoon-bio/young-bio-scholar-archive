(() => {
  'use strict';
  const TYPES = ['Learning Note', 'Paper Review', 'Inquiry', 'Research Project', 'Introduction'];
  const CACHE_KEY = 'bio-home-archive-v1';
  const CACHE_MAX_AGE = 30 * 60 * 1000;
  const SLOTS = ['Paper Review', 'Inquiry', 'Research Project', 'Latest Entry'];
  const clean = value => String(value ?? '').trim();
  const typeOf = post => clean(post.contentType) === 'Research Question' ? 'Inquiry' : clean(post.contentType);

  // Parse calendar dates explicitly, including leap days; reject rollover dates.
  function publishTime(value) {
    const match = clean(value).match(/^(\d{4})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})\.?$/);
    if (!match) return NaN;
    const [, y, m, d] = match.map(Number);
    const date = new Date(0);
    date.setUTCFullYear(y, m - 1, d);
    date.setUTCHours(0, 0, 0, 0);
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? date.getTime() : NaN;
  }

  function selectPosts(posts) {
    const sorted = posts.filter(post => post && typeof post === 'object'
      && clean(post.status).toLowerCase() === 'published'
      && TYPES.includes(typeOf(post)) && Number.isFinite(publishTime(post.publishDate)))
      .sort((a, b) => publishTime(b.publishDate) - publishTime(a.publishDate)
        || clean(a.slug).localeCompare(clean(b.slug)));
    return [...SLOTS.slice(0, 3).map(type => sorted.find(post => typeOf(post) === type)), sorted[0]];
  }

  function entryLink(post) {
    if (clean(post.slug)) return '/archive/' + encodeURIComponent(clean(post.slug));
    const value = clean(post.url);
    if (!value || value.includes('#')) return '';
    try {
      const url = new URL(value, location.origin);
      return url.origin === location.origin && /^\/archive\/[^/]+\/?$/.test(url.pathname)
        ? url.pathname + url.search : '';
    } catch { return ''; }
  }

  function placeholder(container) {
    container.classList.add('placeholder');
    container.setAttribute('aria-label', 'Representative image preparing');
    const inner = document.createElement('div');
    inner.className = 'placeholder-inner';
    // Reuse the original preparation icon, without borrowing any post image.
    inner.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="8" width="26" height="24" rx="2"/><path d="M11 27l7-7 5 5 4-4 6 6"/><circle cx="26" cy="15" r="2.5"/></svg>';
    const text = document.createElement('span');
    text.textContent = 'Representative image preparing';
    inner.append(text);
    container.replaceChildren(inner);
  }

  function render(card, post, index, failed = false) {
    card.removeAttribute('href');
    card.setAttribute('aria-disabled', 'true');
    card.querySelector('.post-type span').textContent = post ? typeOf(post) : SLOTS[index];
    card.querySelector('h3').textContent = post ? clean(post.title) || 'Untitled Entry' : failed ? 'Unable to load entries' : 'Coming Soon';
    card.querySelector('.post-meta').textContent = post
      ? [clean(post.activityYear), clean(post.researchThread)].filter(Boolean).join(' · ') : '';
    const container = card.querySelector('.post-image');
    placeholder(container);
    if (post) {
      const href = entryLink(post);
      if (href) {
        card.href = href;
        card.removeAttribute('aria-disabled');
      } else console.error('Home archive entry has no valid detail link:', post.slug);
      const imageUrl = clean(post.featuredImageUrl);
      if (imageUrl && /^(https?:\/\/|\/(?!\/))/.test(imageUrl)) {
        const img = document.createElement('img');
        img.alt = clean(post.featuredImageAlt) || clean(post.title);
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', () => placeholder(container), {once: true});
        img.src = imageUrl;
        container.classList.remove('placeholder');
        container.removeAttribute('aria-label');
        container.replaceChildren(img);
      }
    }
    card.removeAttribute('aria-busy');
  }

  function validPayload(payload) {
    return payload && payload.ok === true && payload.homeSchemaVersion === 1
      && Array.isArray(payload.posts);
  }

  function readCache() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
      const age = Date.now() - saved?.savedAt;
      return age >= 0 && age < CACHE_MAX_AGE && validPayload(saved?.payload)
        ? saved.payload : null;
    } catch { return null; }
  }

  function saveCache(payload) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({savedAt: Date.now(), payload}));
    } catch { /* Storage limits must not block the cards. */ }
  }

  function cardSignature(post) {
    if (!post) return 'empty';
    return JSON.stringify([
      typeOf(post), clean(post.title), clean(post.slug), clean(post.url),
      clean(post.activityYear), clean(post.researchThread),
      clean(post.featuredImageUrl), clean(post.featuredImageAlt)
    ]);
  }

  async function loadHomeArchive() {
    const cards = [...document.querySelectorAll('[data-home-card]')];
    const signatures = [];
    let hasData = false;
    function showPayload(payload) {
      const selected = selectPosts(payload.posts);
      cards.forEach((card, index) => {
        const signature = cardSignature(selected[index]);
        if (signatures[index] === signature) return;
        try {
          render(card, selected[index], index);
          signatures[index] = signature;
        } catch (error) {
          console.error('Home archive card failed:', index, error);
          render(card, null, index, true);
        }
      });
      hasData = true;
    }

    // Restore before the network request so navigation does not show placeholders.
    const cached = readCache();
    if (cached) showPayload(cached);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      // Refresh from the live CMS on every visit, including additions/removals.
      const response = await fetch('/api/archive?mode=home', {
        cache: 'no-store', signal: controller.signal
      });
      if (!response.ok) throw new Error(`Home archive request failed (${response.status}).`);
      const payload = await response.json();
      if (!validPayload(payload))
        throw new Error('Home CMS schema is unavailable. Update the Apps Script web app deployment.');
      showPayload(payload);
      saveCache(payload);
    } catch (error) {
      console.error('Home archive could not be refreshed:', error);
      // Failed background refreshes must not erase loaded cards.
      if (!hasData) cards.forEach((card, index) => render(card, null, index, true));
    } finally {
      clearTimeout(timeout);
    }
  }

  // Expose pure selection helpers only to Node's test runner.
  if (typeof module !== 'undefined' && module.exports) module.exports = {publishTime, selectPosts};
  if (typeof document !== 'undefined') loadHomeArchive();
})();
