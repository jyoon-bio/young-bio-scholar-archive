(() => {
  'use strict';
  const TYPES = ['Learning Note', 'Paper Review', 'Inquiry', 'Research Project', 'Introduction'];
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

  async function loadHomeArchive() {
    const cards = [...document.querySelectorAll('[data-home-card]')];
    try {
      const response = await fetch('/api/archive?mode=home', {cache: 'no-store'});
      if (!response.ok) throw new Error(`Home archive request failed (${response.status}).`);
      const payload = await response.json();
      if (!payload.ok || !Array.isArray(payload.posts) || payload.homeSchemaVersion !== 1)
        throw new Error('Home CMS schema is unavailable. Update the Apps Script web app deployment.');
      const selected = selectPosts(payload.posts);
      cards.forEach((card, index) => {
        try { render(card, selected[index], index); }
        catch (error) { console.error('Home archive card failed:', index, error); render(card, null, index, true); }
      });
    } catch (error) {
      console.error('Home archive could not be loaded:', error);
      cards.forEach((card, index) => render(card, null, index, true));
    }
  }

  // Expose pure selection helpers only to Node's test runner.
  if (typeof module !== 'undefined' && module.exports) module.exports = {publishTime, selectPosts};
  if (typeof document !== 'undefined') loadHomeArchive();
})();
