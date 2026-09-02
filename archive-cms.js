(() => {
  'use strict';

  const API_VERSION = '20260902-content-types-v3';
  const LIST_API_URL = `/api/archive?v=${API_VERSION}`;
  const DETAIL_API_URL = '/api/archive-detail';
  const CACHE_KEY = 'young-bio-archive-list-v3';
  const DETAIL_CACHE_PREFIX = 'young-bio-archive-detail-v3:';
  const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const CONTENT_TYPES = ['Learning Note', 'Paper Review', 'Inquiry', 'Research Project', 'Introduction'];
  const CONTENT_TYPE_ALIASES = {
    'Concept Note': 'Learning Note',
    'Research Note': 'Learning Note',
    Analysis: 'Learning Note',
    Reflection: 'Learning Note',
    'Review Paper': 'Paper Review',
    Question: 'Inquiry',
    'Hypothesis Note': 'Inquiry',
    Proposal: 'Inquiry',
    'Original Research': 'Research Project'
  };
  const state = {
    posts: [],
    details: {},
    settings: { postsPerListPage: 10 },
    generatedAt: '',
    selectedYear: 'all',
    selectedType: 'all',
    selectedTheme: 'all',
    listPage: 1,
    currentSlug: ''
  };

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const joinClass = (...items) => items.filter(Boolean).join(' ');
  const cleanText = (value) => value == null ? '' : String(value).trim();
  const hasText = (value) => Boolean(cleanText(value));
  const normalizeContentType = (value) => CONTENT_TYPE_ALIASES[cleanText(value)] || cleanText(value);
  const normalizeInquiryStage = (value, originalType) => {
    if (normalizeContentType(originalType) !== 'Inquiry') return '';
    const stage = cleanText(value);
    if (['Question', 'Hypothesis', 'Proposal'].includes(stage)) return stage;
    return originalType === 'Question' ? 'Question'
      : originalType === 'Hypothesis Note' ? 'Hypothesis'
        : originalType === 'Proposal' ? 'Proposal' : '';
  };
  const normalizePost = (post = {}) => {
    const originalType = cleanText(post.contentType);
    return {
      ...post,
      contentType: normalizeContentType(originalType),
      inquiryStage: normalizeInquiryStage(post.inquiryStage, originalType),
      researchQuestion: cleanText(post.researchQuestion),
      reflection: cleanText(post.reflection),
      notes: cleanText(post.notes),
      revisionNote: cleanText(post.revisionNote),
      blocks: Array.isArray(post.blocks) ? post.blocks : [],
      references: Array.isArray(post.references) ? post.references : []
    };
  };
  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? escapeHtml(value)
      : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
        .format(date).toUpperCase();
  };

  function showLoading() {
    $('#post-title').textContent = 'Loading the research archive…';
    $('#meta-kicker').innerHTML = '';
    $('#post-details').innerHTML = '';
    $('#post-body').innerHTML = '<p class="cms-status">Connecting to the archive.</p>';
    $('#post-pagination').innerHTML = '';
  }

  function showError(message) {
    $('#post-title').textContent = 'The archive could not be loaded.';
    $('#post-body').innerHTML = `
      <div class="cms-error" role="alert">
        <p>${escapeHtml(message)}</p>
        <button class="page-btn" id="cms-retry" type="button">RETRY</button>
      </div>`;
    $('#cms-retry')?.addEventListener('click', loadCms);
  }

  function showEmpty() {
    $('#meta-kicker').innerHTML = '<span>ARCHIVE PREPARING</span>';
    $('#post-title').textContent = 'The first research entry is being prepared.';
    $('#post-details').innerHTML = '';
    $('#post-body').innerHTML = '<p class="cms-status">Published entries will appear here automatically.</p>';
    $('#post-index-body').innerHTML = '';
    $('#empty-list').hidden = false;
    $('#empty-list').textContent = 'No published posts are available yet.';
    $('#list-pagination').innerHTML = '';
    $('#post-pagination').innerHTML = '';
  }

  function availableValues(key) {
    return [...new Set(state.posts.map((post) => post[key]).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b)));
  }

  function fillSelect(selector, values, firstLabel) {
    const select = $(selector);
    select.innerHTML = `<option value="all">${escapeHtml(firstLabel)}</option>`;
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function fillYearButtons() {
    const container = $('.year-options');
    const years = availableValues('activityYear').sort((a, b) => b - a);
    container.innerHTML = [
      '<button class="year-btn active" type="button" data-year="all">ALL</button>',
      ...years.map((year) => `<button class="year-btn" type="button" data-year="${escapeHtml(year)}">${escapeHtml(year)}</button>`)
    ].join('');
    container.querySelectorAll('[data-year]').forEach((button) => {
      button.addEventListener('click', () => {
        container.querySelectorAll('[data-year]').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        state.selectedYear = button.dataset.year;
        state.listPage = 1;
        renderList();
      });
    });
  }

  function filteredPosts() {
    return state.posts.filter((post) =>
      (state.selectedYear === 'all' || String(post.activityYear) === state.selectedYear) &&
      (state.selectedType === 'all' || post.contentType === state.selectedType) &&
      (state.selectedTheme === 'all' || post.researchTheme === state.selectedTheme)
    );
  }

  function renderList() {
    const filtered = filteredPosts();
    const perPage = Number(state.settings.postsPerListPage) || 10;
    const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
    state.listPage = Math.min(state.listPage, pageCount);
    const visible = filtered.slice((state.listPage - 1) * perPage, state.listPage * perPage);

    $('#post-index-body').innerHTML = visible.map((post) => `
      <tr>
        <td>${escapeHtml(post.no)}</td>
        <td><button class="post-title-link" type="button" data-slug="${escapeHtml(post.slug)}">${escapeHtml(post.title)}</button></td>
        <td>${escapeHtml(post.activityYear)}</td>
        <td>${escapeHtml(post.contentType)}</td>
        <td>${formatDate(post.publishDate)}</td>
      </tr>`).join('');

    $('#empty-list').hidden = visible.length > 0;
    $('#empty-list').textContent = 'No posts match the selected filters.';
    $('#list-pagination').innerHTML = pageCount > 1
      ? Array.from({ length: pageCount }, (_, index) => {
        const page = index + 1;
        return `<button class="page-btn ${page === state.listPage ? 'active' : ''}" type="button" data-list-page="${page}">${page}</button>`;
      }).join('')
      : '';

    document.querySelectorAll('[data-slug]').forEach((button) => {
      button.addEventListener('click', () => {
        renderPost(button.dataset.slug, true);
        closeList();
      });
    });
    document.querySelectorAll('[data-list-page]').forEach((button) => {
      button.addEventListener('click', () => {
        state.listPage = Number(button.dataset.listPage);
        renderList();
      });
    });
  }

  function renderBlocks(blocks) {
    return (blocks || []).map((block) => {
      if (!block || !hasText(block.type)) return '';
      const content = cleanText(block.content);
      const heading = cleanText(block.heading);
      const quoteSource = cleanText(block.quoteSource);
      const imageUrl = cleanText(block.imageUrl);
      const imageAlt = cleanText(block.imageAlt);
      const caption = cleanText(block.caption);
      const headingTag = ['H2', 'H3', 'H4'].includes(block.headingLevel) ? block.headingLevel.toLowerCase() : 'h2';
      switch (block.type) {
        case 'Heading':
          return heading ? `<${headingTag}>${escapeHtml(heading)}</${headingTag}>` : '';
        case 'Paragraph':
          return content ? `<p>${escapeHtml(content).replaceAll('\n', '<br>')}</p>` : '';
        case 'Quote':
          return content ? `
            <figure class="article-quote">
              <blockquote>${escapeHtml(content)}</blockquote>
              ${quoteSource ? `<cite>— ${escapeHtml(quoteSource)}</cite>` : ''}
            </figure>` : '';
        case 'Image':
          return imageUrl ? `
            <figure class="article-image">
              <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}" loading="lazy">
              ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
            </figure>` : '';
        case 'List': {
          const items = content.split(/\r?\n/).map((item) => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
          return items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
        }
        case 'Table':
          return renderTextTable(content);
        case 'Embed':
          return /^https?:\/\//i.test(content)
            ? `<p><a href="${escapeHtml(content)}" target="_blank" rel="noopener noreferrer">View related material ↗</a></p>`
            : '';
        default:
          return '';
      }
    }).join('');
  }

  function renderTextTable(content) {
    const rows = String(content || '').split(/\r?\n/).map((row) =>
      row.split(/\t|\|/).map((cell) => cell.trim()).filter((cell, index, array) => cell || (index > 0 && index < array.length - 1))
    ).filter((row) => row.length);
    if (!rows.length) return '';
    return `<div class="article-table-wrap"><table class="article-table">${rows.map((row, rowIndex) =>
      `<tr>${row.map((cell) => rowIndex === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    ).join('')}</table></div>`;
  }

  function paintPost(post, pushState = false) {
    if (!post) return showEmpty();
    state.currentSlug = post.slug;

    post = normalizePost(post);
    $('#meta-kicker').innerHTML = `
      <span>${escapeHtml(post.contentType)}</span>
      ${post.contentType === 'Inquiry' && hasText(post.inquiryStage) ? `<span>${escapeHtml(post.inquiryStage)}</span>` : ''}
      <span>${escapeHtml(post.activityYear)}</span>
      <span>${escapeHtml(post.researchTheme)}</span>`;
    $('#post-title').textContent = post.title;
    $('#post-details').innerHTML = `
      <span class="author-profile">
        <span class="author-logo" aria-hidden="true">
          ${post.authorLogoUrl
            ? `<img src="${escapeHtml(post.authorLogoUrl)}" alt="">`
            : '<svg viewBox="0 0 40 52"><path d="M9 4c15 8 7 17 22 25M31 4C16 12 24 21 9 29M11 9h16M10 16h18M12 23h15M12 30h16M10 37h18M12 44h15" stroke="currentColor" fill="none" stroke-width="1.7" stroke-linecap="round"/></svg>'}
        </span>
        <span class="author-name">${escapeHtml(post.authorNickname)}</span>
      </span>
      <span class="published-date">PUBLISHED <strong>${formatDate(post.publishDate)}</strong></span>`;

    const featured = hasText(post.featuredImageUrl)
      ? `<figure class="featured-image"><img src="${escapeHtml(post.featuredImageUrl)}" alt="${escapeHtml(post.featuredImageAlt)}"></figure>`
      : '';
    const question = hasText(post.researchQuestion)
      ? `<div class="research-question"><span class="label">MY CONTINUING QUESTION</span><p>${escapeHtml(post.researchQuestion)}</p></div>`
      : '';
    const reflection = hasText(post.reflection)
      ? `<div class="reflection"><h2>Reflection</h2><p>${escapeHtml(post.reflection).replaceAll('\n', '<br>')}</p></div>`
      : '';
    const notes = hasText(post.notes)
      ? `<section class="post-notes"><h2>NOTES</h2><p>${escapeHtml(post.notes).replaceAll('\n', '<br>')}</p></section>`
      : '';
    const revision = hasText(post.revisionNote)
      ? `<section class="revision-note"><h2>REVISION NOTE</h2><p>${escapeHtml(post.revisionNote).replaceAll('\n', '<br>')}</p></section>`
      : '';
    const validReferences = post.references.filter((reference) => reference && [
      reference.authors, reference.title, reference.journalOrPublisher,
      reference.year, reference.doi, reference.url
    ].some(hasText));
    const references = validReferences.length
      ? `<section class="references"><h2>REFERENCES</h2><ol>${validReferences.map((reference) => {
        const title = hasText(reference.url)
          ? `<a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.title)}</a>`
          : escapeHtml(reference.title);
        const details = [reference.authors, title, reference.journalOrPublisher, reference.year, reference.doi ? `DOI: ${escapeHtml(reference.doi)}` : ''].filter(Boolean).join('. ');
        return `<li>${details}</li>`;
      }).join('')}</ol></section>`
      : '';

    $('#post-body').innerHTML = featured + renderBlocks(post.blocks) + question + reflection + notes + revision + references;
    renderPostPagination();
    document.title = `${post.seo?.title || post.title} | Young Bio-Scholar's Research Archive`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', post.seo?.description || 'Student biology research archive.');

    if (pushState) history.pushState({ slug: post.slug }, '', `/archive/${encodeURIComponent(post.slug)}`);
    window.scrollTo({ top: $('.archive-title-row').offsetTop, behavior: 'smooth' });
  }

  function detailCacheKey(slug) {
    return `${DETAIL_CACHE_PREFIX}${slug}`;
  }

  function readDetailCache(slug) {
    try {
      const cached = JSON.parse(localStorage.getItem(detailCacheKey(slug)) || 'null');
      if (!cached?.savedAt || !cached?.payload?.ok || !cached?.payload?.post) return null;
      if (Date.now() - cached.savedAt > CACHE_MAX_AGE_MS) {
        localStorage.removeItem(detailCacheKey(slug));
        return null;
      }
      return cached.payload;
    } catch (error) {
      return null;
    }
  }

  function writeDetailCache(slug, payload) {
    try {
      localStorage.setItem(detailCacheKey(slug), JSON.stringify({ savedAt: Date.now(), payload }));
    } catch (error) {
      console.warn('Post cache could not be saved.', error);
    }
  }

  async function renderPost(slug, pushState = false) {
    const summary = state.posts.find((item) => item.slug === slug) || state.posts[0];
    if (!summary) return showEmpty();

    const cachedPayload = readDetailCache(summary.slug);
    if (cachedPayload) {
      state.details[summary.slug] = cachedPayload.post;
      paintPost(cachedPayload.post, pushState);
    } else {
      paintPost(summary, pushState);
      $('#post-body').innerHTML = '<p class="cms-status">Loading this research entry…</p>';
    }

    try {
      const response = await fetch(`${DETAIL_API_URL}?slug=${encodeURIComponent(summary.slug)}&v=${API_VERSION}`, {
        method: 'GET',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`Post request failed (${response.status}).`);
      const payload = await response.json();
      if (!payload.ok || !payload.post) throw new Error(payload.error || 'Invalid post response.');

      writeDetailCache(summary.slug, payload);
      payload.post = normalizePost(payload.post);
      state.details[summary.slug] = payload.post;
      if (!cachedPayload || payload.generatedAt !== cachedPayload.generatedAt) paintPost(payload.post, false);
    } catch (error) {
      console.error(error);
      if (!cachedPayload) {
        $('#post-body').innerHTML = `
          <div class="cms-error" role="alert">
            <p>This research entry could not be loaded.</p>
            <button class="page-btn" id="post-retry" type="button">RETRY</button>
          </div>`;
        $('#post-retry')?.addEventListener('click', () => renderPost(summary.slug, false));
      }
    }
  }

  function renderPostPagination() {
    const currentIndex = state.posts.findIndex((post) => post.slug === state.currentSlug);
    const current = currentIndex + 1;
    const total = state.posts.length;
    const numbers = [1, current - 2, current - 1, current, current + 1, current + 2, total]
      .filter((number) => number >= 1 && number <= total)
      .filter((number, index, array) => array.indexOf(number) === index)
      .sort((a, b) => a - b);
    let html = `<button class="page-btn" type="button" data-nav-index="${currentIndex - 1}" ${currentIndex <= 0 ? 'disabled' : ''}>←</button>`;
    numbers.forEach((number, index) => {
      if (index && number - numbers[index - 1] > 1) html += '<span class="page-ellipsis">…</span>';
      const post = state.posts[number - 1];
      html += `<button class="${joinClass('page-btn', number === current && 'active')}" type="button" data-nav-slug="${escapeHtml(post.slug)}" ${number === current ? 'aria-current="page"' : ''}>${number}</button>`;
    });
    html += `<button class="page-btn" type="button" data-nav-index="${currentIndex + 1}" ${currentIndex >= total - 1 ? 'disabled' : ''}>→</button>`;
    $('#post-pagination').innerHTML = html;
    document.querySelectorAll('[data-nav-slug]').forEach((button) => button.addEventListener('click', () => renderPost(button.dataset.navSlug, true)));
    document.querySelectorAll('[data-nav-index]').forEach((button) => button.addEventListener('click', () => {
      const post = state.posts[Number(button.dataset.navIndex)];
      if (post) renderPost(post.slug, true);
    }));
  }

  function closeList() {
    $('#post-list-panel').hidden = true;
    $('.post-list-toggle').setAttribute('aria-expanded', 'false');
  }

  function requestedSlug() {
    const match = location.pathname.match(/\/archive\/([^/]+)\/?$/);
    if (match) return decodeURIComponent(match[1]);
    return new URLSearchParams(location.search).get('slug') || '';
  }

  function readCmsCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!cached?.savedAt || !cached?.payload?.ok) return null;
      if (Date.now() - cached.savedAt > CACHE_MAX_AGE_MS) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return cached.payload;
    } catch (error) {
      return null;
    }
  }

  function writeCmsCache(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
    } catch (error) {
      console.warn('CMS cache could not be saved.', error);
    }
  }

  function applyPayload(payload) {
    state.posts = Array.isArray(payload.posts) ? payload.posts.map(normalizePost) : [];
    state.settings = payload.settings || state.settings;
    state.generatedAt = payload.generatedAt || '';
    if (!state.posts.length) {
      showEmpty();
      return;
    }

    fillYearButtons();
    fillSelect('#type-filter', CONTENT_TYPES, 'All Types');
    fillSelect('#theme-filter', availableValues('researchTheme'), 'All Themes');
    renderList();
    renderPost(requestedSlug() || state.posts[0].slug, false);
  }

  async function loadCms() {
    const cachedPayload = readCmsCache();
    if (cachedPayload) applyPayload(cachedPayload);
    else showLoading();

    try {
      const response = await fetch(LIST_API_URL, { method: 'GET', cache: 'no-store' });
      if (!response.ok) throw new Error(`API request failed (${response.status}).`);
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.message || payload.error || 'The CMS returned an error.');
      writeCmsCache(payload);
      if (!cachedPayload || payload.generatedAt !== state.generatedAt) applyPayload(payload);
    } catch (error) {
      console.error(error);
      if (!cachedPayload) showError('Please check the CMS web-app deployment and try again.');
    }
  }

  $('.post-list-toggle').addEventListener('click', () => {
    const expanded = $('.post-list-toggle').getAttribute('aria-expanded') === 'true';
    $('.post-list-toggle').setAttribute('aria-expanded', String(!expanded));
    $('#post-list-panel').hidden = expanded;
  });
  $('.menu-toggle').addEventListener('click', () => {
    const expanded = $('.menu-toggle').getAttribute('aria-expanded') === 'true';
    $('.menu-toggle').setAttribute('aria-expanded', String(!expanded));
    $('.primary-nav').classList.toggle('open', !expanded);
  });
  $('#type-filter').addEventListener('change', (event) => {
    state.selectedType = event.target.value;
    state.listPage = 1;
    renderList();
  });
  $('#theme-filter').addEventListener('change', (event) => {
    state.selectedTheme = event.target.value;
    state.listPage = 1;
    renderList();
  });
  window.addEventListener('popstate', () => renderPost(requestedSlug() || state.posts[0]?.slug, false));

  loadCms();
})();
