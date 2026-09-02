const CMS_URL = 'https://script.google.com/macros/s/AKfycbwiZsgp3l-qoRFRDM0iwQwcONKoIyenzNhCHdbx0fBI41F6q1_NBum17fccVgPa5Lpx/exec';
const CONTENT_TYPE_ALIASES = {
  'Concept Note': 'Learning Note', 'Research Note': 'Learning Note', Analysis: 'Learning Note', Reflection: 'Learning Note',
  'Review Paper': 'Paper Review', Question: 'Inquiry', 'Hypothesis Note': 'Inquiry', Proposal: 'Inquiry',
  'Original Research': 'Research Project'
};

function normalizePost(post) {
  if (!post || typeof post !== 'object') return post;
  const originalType = String(post.contentType || '').trim();
  const contentType = CONTENT_TYPE_ALIASES[originalType] || originalType;
  const requestedStage = String(post.inquiryStage || '').trim();
  const inquiryStage = contentType !== 'Inquiry' ? ''
    : ['Question', 'Hypothesis', 'Proposal'].includes(requestedStage) ? requestedStage
      : originalType === 'Question' ? 'Question' : originalType === 'Hypothesis Note' ? 'Hypothesis' : originalType === 'Proposal' ? 'Proposal' : '';
  const blocks = Array.isArray(post.blocks) ? post.blocks.filter((block) => {
    if (!block || !String(block.type || '').trim()) return false;
    return block.type === 'Heading' ? Boolean(String(block.heading || '').trim())
      : block.type === 'Image' ? Boolean(String(block.imageUrl || '').trim())
        : Boolean(String(block.content || '').trim());
  }) : [];
  const references = Array.isArray(post.references) ? post.references.filter((reference) => reference && [
    reference.authors, reference.title, reference.journalOrPublisher, reference.year, reference.doi, reference.url
  ].some((value) => String(value ?? '').trim())) : [];
  return { ...post, contentType, inquiryStage, blocks, references };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ ok: false, error: 'Method not allowed.' });
  }

  const slug = String(request.query?.slug || '').trim();
  if (!slug || slug.length > 160) {
    return response.status(400).json({ ok: false, error: 'A valid slug is required.' });
  }

  try {
    const upstreamUrl = `${CMS_URL}?mode=detail&slug=${encodeURIComponent(slug)}`;
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'application/json' }
    });

    if (!upstream.ok) throw new Error(`CMS request failed (${upstream.status}).`);
    const payload = await upstream.json();
    if (!payload?.ok || !payload?.post) {
      return response.status(404).json({ ok: false, error: 'POST_NOT_FOUND' });
    }

    payload.post = normalizePost(payload.post);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    response.setHeader('CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    response.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return response.status(200).json(payload);
  } catch (error) {
    console.error('Archive detail proxy error:', error);
    response.setHeader('Cache-Control', 'no-store');
    return response.status(502).json({ ok: false, error: 'The post is temporarily unavailable.' });
  }
};
