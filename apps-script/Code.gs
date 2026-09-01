/**
 * Im Jiyoon Bio Archive CMS API v2
 *
 * Endpoints:
 * - ?mode=list             lightweight public post summaries
 * - ?mode=detail&slug=...  one complete public post
 */

const CMS = Object.freeze({
  POSTS: 'POSTS',
  BLOCKS: 'POST_BLOCKS',
  REFERENCES: 'REFERENCES',
  SETTINGS: 'SETTINGS',
  TIMEZONE: 'Asia/Seoul',
  CACHE_SECONDS: 300,
  CACHE_VERSION: 'v3'
});

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const mode = clean_(params.mode).toLowerCase();

    if (mode === 'detail' || params.slug) {
      const detailPayload = getPublicPostPayload_(clean_(params.slug));
      return json_(detailPayload || { ok: false, error: 'POST_NOT_FOUND' });
    }

    return json_(getPublicListPayload_());
  } catch (error) {
    console.error(error);
    return json_({
      ok: false,
      error: 'CMS_API_ERROR',
      message: String(error && error.message ? error.message : error)
    });
  }
}

function getPublicListPayload_() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'public-list-' + CMS.CACHE_VERSION;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const settings = readSettings_(spreadsheet);
  const rows = getPublicPostRows_(spreadsheet);
  const posts = rows.map(function (row, index) {
    return buildPostSummary_(row, index, settings);
  });
  const payload = publicPayload_({ settings: settings, posts: posts });
  cachePayload_(cache, cacheKey, payload);
  return payload;
}

function getPublicPostPayload_(slug) {
  if (!slug) return null;
  const cache = CacheService.getScriptCache();
  const cacheKey = detailCacheKey_(slug);
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const settings = readSettings_(spreadsheet);
  const rows = getPublicPostRows_(spreadsheet);
  let matchedRow = null;
  let matchedIndex = -1;

  rows.some(function (row, index) {
    if (clean_(row['Slug*']) === slug) {
      matchedRow = row;
      matchedIndex = index;
      return true;
    }
    return false;
  });
  if (!matchedRow) return null;

  const postId = clean_(matchedRow['Post ID*']);
  const post = buildPostSummary_(matchedRow, matchedIndex, settings);
  post.reflection = clean_(matchedRow['Reflection']);
  post.notes = clean_(matchedRow['Notes (Optional)']);
  post.revisionNote = clean_(matchedRow['Revision Note (Optional)']);
  post.blocks = readBlocksForPost_(spreadsheet, postId, settings.imageBaseUrl);
  post.references = readReferencesForPost_(spreadsheet, postId);

  const payload = publicPayload_({ settings: settings, post: post });
  cachePayload_(cache, cacheKey, payload);
  return payload;
}

function getPublicPostRows_(spreadsheet) {
  const now = new Date();
  return readRows_(spreadsheet, CMS.POSTS)
    .filter(function (row) {
      const status = clean_(row['Status*']);
      const publishDate = asDate_(row['Publish Date*']);
      const publishableStatus = status === 'Published' || status === 'Scheduled';
      return publishableStatus && publishDate && publishDate.getTime() <= now.getTime();
    })
    .sort(function (a, b) {
      return asDate_(b['Publish Date*']).getTime() - asDate_(a['Publish Date*']).getTime();
    });
}

function buildPostSummary_(row, index, settings) {
  const activityDate = asDate_(row['Activity Date*']);
  const publishDate = asDate_(row['Publish Date*']);
  const cmsPublishedAt = asDate_(row['CMS Published At (Auto)']) || publishDate;
  const featuredImagePath = clean_(row['Featured Image Path']);
  const ogImagePath = clean_(row['OG Image Path']) || featuredImagePath;
  const slug = clean_(row['Slug*']);

  return {
    no: index + 1,
    title: clean_(row['Title*']),
    slug: slug,
    url: joinPath_(settings.archiveBasePath, slug),
    contentType: clean_(row['Content Type*']),
    activityDate: formatDate_(activityDate),
    activityYear: activityDate ? activityDate.getFullYear() : null,
    publishDate: formatDate_(publishDate),
    cmsPublishedAt: formatDateTime_(cmsPublishedAt),
    researchTheme: clean_(row['Research Theme*']),
    authorNickname: clean_(row['Author Nickname (Override)']) || settings.authorNickname,
    authorLogoUrl: imageUrl_(settings.imageBaseUrl, clean_(row['Author Logo Path (Override)']) || settings.authorLogoPath),
    featuredImageUrl: imageUrl_(settings.imageBaseUrl, featuredImagePath),
    featuredImageAlt: clean_(row['Featured Image Alt']),
    researchQuestion: clean_(row['Research Question*']),
    showOnHome: yes_(row['Show on HOME']),
    showInProposals: yes_(row['Show in PROPOSALS']),
    seo: {
      title: clean_(row['SEO Title']) || clean_(row['Title*']),
      description: clean_(row['Meta Description']),
      ogImageUrl: imageUrl_(settings.imageBaseUrl, ogImagePath)
    }
  };
}

function readBlocksForPost_(spreadsheet, postId, imageBaseUrl) {
  return readRows_(spreadsheet, CMS.BLOCKS)
    .filter(function (row) { return clean_(row['Post ID*']) === postId; })
    .map(function (row) {
      return {
        order: Number(row['Block Order*']) || 0,
        type: clean_(row['Block Type*']),
        headingLevel: clean_(row['Heading Level']),
        heading: clean_(row['Heading']),
        content: clean_(row['Content']),
        quoteSource: clean_(row['Quote Source']),
        imageUrl: imageUrl_(imageBaseUrl, clean_(row['Image Path'])),
        imageAlt: clean_(row['Image Alt']),
        caption: clean_(row['Caption'])
      };
    })
    .sort(function (a, b) { return a.order - b.order; });
}

function readReferencesForPost_(spreadsheet, postId) {
  return readRows_(spreadsheet, CMS.REFERENCES)
    .filter(function (row) { return clean_(row['Post ID*']) === postId; })
    .map(function (row) {
      return {
        order: Number(row['Reference Order*']) || 0,
        authors: clean_(row['Authors*']),
        title: clean_(row['Title*']),
        journalOrPublisher: clean_(row['Journal / Publisher']),
        year: row['Year'] === '' ? null : Number(row['Year']),
        doi: clean_(row['DOI']),
        url: clean_(row['URL']),
        accessedDate: formatDate_(asDate_(row['Accessed Date']))
      };
    })
    .sort(function (a, b) { return a.order - b.order; });
}

function publicPayload_(content) {
  const payload = {
    ok: true,
    generatedAt: Utilities.formatDate(new Date(), CMS.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
  Object.keys(content).forEach(function (key) { payload[key] = content[key]; });
  return payload;
}

function cachePayload_(cache, key, payload) {
  const serialized = JSON.stringify(payload);
  if (serialized.length < 95000) cache.put(key, serialized, CMS.CACHE_SECONDS);
}

function detailCacheKey_(slug) {
  return 'public-detail-' + CMS.CACHE_VERSION + ':' + slug;
}

function readSettings_(spreadsheet) {
  const sheet = requireSheet_(spreadsheet, CMS.SETTINGS);
  const values = sheet.getDataRange().getValues();
  const map = {};
  values.slice(1).forEach(function (row) {
    if (row[0] !== '') map[String(row[0]).trim()] = row[1];
  });

  return {
    siteTitle: clean_(map['Site Title']),
    authorNickname: clean_(map['Author Nickname']),
    authorLogoPath: clean_(map['Author Logo Path']),
    imageBaseUrl: clean_(map['Image Base URL']),
    archiveBasePath: clean_(map['Archive Base Path']) || '/archive/',
    postsPerListPage: Number(map['Posts per List Page']) || 10,
    timezone: clean_(map['Timezone']) || CMS.TIMEZONE
  };
}

function readRows_(spreadsheet, sheetName) {
  const sheet = requireSheet_(spreadsheet, sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function (value) { return String(value).trim(); });

  return values.slice(1).filter(function (row) {
    return row.some(function (value) { return value !== ''; });
  }).map(function (row) {
    const object = {};
    headers.forEach(function (header, index) { object[header] = row[index]; });
    return object;
  });
}

function imageUrl_(baseUrl, path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return joinPath_(baseUrl, path);
}

function joinPath_(base, path) {
  const left = clean_(base).replace(/\/+$/, '');
  const right = clean_(path).replace(/^\/+/, '');
  if (!left) return right ? '/' + right : '';
  return right ? left + '/' + right : left + '/';
}

function asDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate_(date) {
  return date ? Utilities.formatDate(date, CMS.TIMEZONE, 'yyyy-MM-dd') : '';
}

function formatDateTime_(date) {
  return date ? Utilities.formatDate(date, CMS.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX") : '';
}

function yes_(value) {
  return String(value).trim().toLowerCase() === 'yes';
}

function clean_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function requireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('Required sheet not found: ' + name);
  return sheet;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function clearCmsCache() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const keys = ['public-list-' + CMS.CACHE_VERSION];
  getPublicPostRows_(spreadsheet).forEach(function (row) {
    keys.push(detailCacheKey_(clean_(row['Slug*'])));
  });
  CacheService.getScriptCache().removeAll(keys);
}

/**
 * Records the first time a POSTS row is changed to Published.
 * The timestamp is intentionally retained if the post later returns to Draft.
 */
function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== CMS.POSTS || e.range.getRow() === 1) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(function (value) { return clean_(value); });
  const statusColumn = headers.indexOf('Status*') + 1;
  const timestampColumn = headers.indexOf('CMS Published At (Auto)') + 1;
  if (!statusColumn || !timestampColumn) return;

  const editedFirstColumn = e.range.getColumn();
  const editedLastColumn = e.range.getLastColumn();
  if (statusColumn < editedFirstColumn || statusColumn > editedLastColumn) return;

  let stamped = false;
  for (let row = Math.max(2, e.range.getRow()); row <= e.range.getLastRow(); row += 1) {
    const status = clean_(sheet.getRange(row, statusColumn).getDisplayValue());
    const timestampCell = sheet.getRange(row, timestampColumn);
    if (status === 'Published' && timestampCell.isBlank()) {
      timestampCell.setValue(new Date());
      stamped = true;
    }
  }

  if (stamped) clearCmsCache();
}

function testCmsList() {
  clearCmsCache();
  console.log(JSON.stringify(getPublicListPayload_(), null, 2));
}

function testCmsDetail() {
  clearCmsCache();
  const rows = getPublicPostRows_(SpreadsheetApp.getActiveSpreadsheet());
  const slug = rows.length ? clean_(rows[0]['Slug*']) : '';
  console.log(JSON.stringify(getPublicPostPayload_(slug), null, 2));
}
