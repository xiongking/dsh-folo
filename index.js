/**
 * dsh-folo — a Folo-style RSS reader for DeepSeek Harness.
 *
 * Host half: feed storage, fetching, RSS/Atom/RDF parsing, and the HTTP API the
 * Client half talks to at `/dsh-folo/api/*`.
 *
 * Everything here is dependency-free: Node's own `fetch` for HTTP, a small
 * tolerant XML scanner for feeds, and one JSON document for persistence.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const NAME = 'dsh-folo'
const API_PREFIX = '/dsh-folo/api'
const STORE_VERSION = 1
const STORE_FILE = 'state.json'
const MAX_ENTRIES_PER_FEED = 300
const MAX_STARRED_PER_FEED = 100
const MAX_BODY_BYTES = 8 * 1024 * 1024
const MAX_REQUEST_BYTES = 512 * 1024
const FETCH_TIMEOUT_MS = 20_000
const REFRESH_CONCURRENCY = 4
const USER_AGENT = 'dsh-folo/0.1 (+https://github.com/xiongjin/dsh-folo)'

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function dataDirectory() {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  return path.join(home, 'plugin-data', NAME)
}

let state = null
let loading = null
let writeQueue = Promise.resolve()

function emptyState() {
  return { version: STORE_VERSION, feeds: [], entries: [] }
}

function normalizeState(raw) {
  const next = emptyState()
  if (!raw || typeof raw !== 'object') return next
  if (Array.isArray(raw.feeds)) next.feeds = raw.feeds.filter(feed => feed && typeof feed.id === 'string')
  if (Array.isArray(raw.entries)) {
    next.entries = raw.entries.filter(entry => entry && typeof entry.id === 'string')
  }
  return next
}

async function loadState() {
  if (state) return state
  if (loading) return loading
  loading = (async () => {
    const file = path.join(dataDirectory(), STORE_FILE)
    try {
      const text = await readFile(file, 'utf8')
      state = normalizeState(JSON.parse(text))
    } catch {
      state = emptyState()
    }
    return state
  })()
  try {
    return await loading
  } finally {
    loading = null
  }
}

function persist() {
  const snapshot = JSON.stringify(state)
  const file = path.join(dataDirectory(), STORE_FILE)
  const tmp = `${file}.tmp`
  writeQueue = writeQueue
    .then(async () => {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, file)
    })
    .catch(() => {})
  return writeQueue
}

// One mutation at a time: refreshes and mark-read calls may overlap from the UI.
let mutationQueue = Promise.resolve()
function mutate(task) {
  const run = mutationQueue.then(async () => {
    const value = await loadState()
    const result = await task(value)
    await persist()
    return result
  })
  mutationQueue = run.catch(() => {})
  return run
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', rsquo: '\u2019', lsquo: '\u2018',
  ldquo: '\u201c', rdquo: '\u201d', copy: '\u00a9', reg: '\u00ae', trade: '\u2122',
}

function decodeEntities(input) {
  if (!input || input.indexOf('&') === -1) return input
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    const named = NAMED_ENTITIES[body]
    return named === undefined ? match : named
  })
}

function findTagEnd(text, from) {
  let quote = ''
  for (let index = from; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') return index
  }
  return -1
}

function parseAttributes(body) {
  const attrs = {}
  const pattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match
  while ((match = pattern.exec(body)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attrs[match[1].toLowerCase()] = decodeEntities(value)
  }
  return attrs
}

/** Tolerant XML/HTML scanner: returns a `#root` node whose children are elements. */
function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [] }
  const stack = [root]
  const push = node => stack[stack.length - 1].children.push(node)
  const pushText = raw => {
    if (!raw) return
    const value = decodeEntities(raw)
    if (value.trim() === '' && stack[stack.length - 1].children.length === 0) return
    stack[stack.length - 1].children.push({ name: '#text', value })
  }

  let index = 0
  while (index < text.length) {
    const lt = text.indexOf('<', index)
    if (lt === -1) {
      pushText(text.slice(index))
      break
    }
    if (lt > index) pushText(text.slice(index, lt))

    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4)
      index = end === -1 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9)
      const raw = text.slice(lt + 9, end === -1 ? text.length : end)
      push({ name: '#text', value: raw, cdata: true })
      index = end === -1 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2)
      index = end === -1 ? text.length : end + 2
      continue
    }
    if (text.startsWith('<!', lt)) {
      let cursor = lt + 2
      let depth = 0
      while (cursor < text.length) {
        const char = text[cursor]
        if (char === '[') depth += 1
        else if (char === ']') depth -= 1
        else if (char === '>' && depth <= 0) break
        cursor += 1
      }
      index = cursor + 1
      continue
    }

    const gt = findTagEnd(text, lt + 1)
    if (gt === -1) break
    const raw = text.slice(lt + 1, gt)
    index = gt + 1

    if (raw.startsWith('/')) {
      if (stack.length > 1) stack.pop()
      continue
    }

    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1) : raw
    const nameMatch = /^([^\s/>]+)/.exec(body)
    if (!nameMatch) continue
    const node = {
      name: nameMatch[1].toLowerCase(),
      local: nameMatch[1].toLowerCase().split(':').pop(),
      attrs: parseAttributes(body.slice(nameMatch[1].length)),
      children: [],
    }
    push(node)
    if (!selfClosing) stack.push(node)
  }

  return root
}

function childNodes(node, local) {
  if (!node) return []
  return node.children.filter(item => item && item.name !== '#text' && item.local === local)
}

function firstChild(node, ...locals) {
  for (const local of locals) {
    const found = childNodes(node, local)[0]
    if (found) return found
  }
  return undefined
}

function descendants(node, locals, out = []) {
  if (!node || !Array.isArray(node.children)) return out
  for (const item of node.children) {
    if (!item || item.name === '#text') continue
    if (locals.includes(item.local)) out.push(item)
    descendants(item, locals, out)
  }
  return out
}

function textOf(node) {
  if (!node) return ''
  if (node.name === '#text') return node.value
  let out = ''
  for (const item of node.children) {
    if (!item) continue
    if (item.name === '#text') out += item.value
    else out += textOf(item)
  }
  return out
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function serializeChildren(node) {
  if (!node || !Array.isArray(node.children)) return ''
  let out = ''
  for (const item of node.children) {
    if (!item) continue
    if (item.name === '#text') {
      out += escapeHtml(item.value)
      continue
    }
    const attrs = Object.entries(item.attrs || {})
      .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
      .join('')
    out += `<${item.local}${attrs}>${serializeChildren(item)}</${item.local}>`
  }
  return out
}

/** The HTML a feed node carries: CDATA, escaped text, or nested XHTML. */
function htmlOf(node) {
  if (!node) return ''
  const hasElements = node.children.some(item => item && item.name !== '#text')
  if (hasElements) return serializeChildren(node).trim()
  return textOf(node).trim()
}

// ---------------------------------------------------------------------------
// Feed document → normalized feed
// ---------------------------------------------------------------------------

function absolutize(html, base) {
  if (!html || !base) return html
  return html.replace(/\b(href|src|poster)\s*=\s*("([^"]*)"|'([^']*)')/gi, (match, attr, _quoted, dq, sq) => {
    const value = (dq ?? sq ?? '').trim()
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return match
    try {
      return `${attr}="${new URL(value, base).toString()}"`
    } catch {
      return match
    }
  })
}

function plainText(html, limit = 320) {
  if (!html) return ''
  const stripped = decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  ).trim()
  return stripped.length > limit ? `${stripped.slice(0, limit - 1).trimEnd()}…` : stripped
}

function stripDangerous(html) {
  if (!html) return ''
  return html
    .replace(/<\/?(script|style|iframe|object|embed|form|input|button|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|poster)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1=$2#$2')
}

function resolveLink(node, base) {
  if (!node) return ''
  const href = node.attrs?.href
  const text = textOf(node).trim()
  const raw = href || text
  if (!raw) return ''
  try {
    return new URL(raw, base).toString()
  } catch {
    return raw
  }
}

function atomLink(node, base) {
  const links = childNodes(node, 'link')
  const alternate = links.find(link => {
    const rel = (link.attrs?.rel || 'alternate').toLowerCase()
    return rel === 'alternate' && typeof link.attrs?.href === 'string'
  })
  const chosen = alternate || links.find(link => typeof link.attrs?.href === 'string')
  if (!chosen) return ''
  try {
    return new URL(chosen.attrs.href, base).toString()
  } catch {
    return chosen.attrs.href
  }
}

function firstImage(item, content, base) {
  const enclosures = [
    ...childNodes(item, 'enclosure'),
    ...descendants(item, ['thumbnail', 'content']).filter(node => node.parentTag === undefined),
  ]
  for (const node of enclosures) {
    const type = (node.attrs?.type || '').toLowerCase()
    const medium = (node.attrs?.medium || '').toLowerCase()
    const url = node.attrs?.url
    if (!url) continue
    if (type.startsWith('image/') || medium === 'image') {
      try {
        return new URL(url, base).toString()
      } catch {
        return url
      }
    }
  }
  const match = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(content || '')
  if (match) {
    try {
      return new URL(match[1], base).toString()
    } catch {
      return match[1]
    }
  }
  return ''
}

function parseDate(node) {
  const candidates = ['pubdate', 'published', 'updated', 'date', 'created', 'issued']
  for (const local of candidates) {
    const found = firstChild(node, local)
    const text = textOf(found).trim()
    if (!text) continue
    const stamp = Date.parse(text)
    if (Number.isFinite(stamp)) return stamp
  }
  return Date.now()
}

function entryAuthor(item) {
  const direct = firstChild(item, 'author', 'creator')
  if (direct) {
    const name = firstChild(direct, 'name')
    const value = name ? textOf(name) : textOf(direct)
    if (value.trim()) return value.trim()
  }
  return ''
}

/** Parse an RSS 2.0, RSS 1.0 (RDF) or Atom document into a normalized feed. */
function parseFeedDocument(xml, sourceUrl) {
  const root = parseXml(xml)
  const top = root.children.find(node => node && node.name !== '#text')
  if (!top) throw new Error('Empty feed document')

  const isAtom = top.local === 'feed'
  const isRdf = top.local === 'rdf'
  const channel = isAtom ? top : firstChild(top, 'channel') || top

  const base = (() => {
    const link = isAtom ? atomLink(channel, sourceUrl) : resolveLink(firstChild(channel, 'link'), sourceUrl)
    return link || sourceUrl
  })()

  const titleText = textOf(firstChild(channel, 'title')).trim()
    || textOf(firstChild(top, 'title')).trim()
    || new URL(sourceUrl).hostname

  const siteUrl = isAtom
    ? atomLink(channel, sourceUrl)
    : resolveLink(firstChild(channel, 'link'), sourceUrl) || base

  const description = plainText(
    htmlOf(firstChild(channel, 'description', 'subtitle', 'tagline')),
    400,
  )

  const itemNodes = descendants(isRdf ? top : channel, ['item', 'entry']).filter(node => {
    // Atom feeds nest `entry` directly under `feed`; RDF keeps `item` as siblings.
    return node.local === 'item' || node.local === 'entry'
  })

  const items = []
  for (const item of itemNodes) {
    const rawContent = htmlOf(firstChild(item, 'encoded'))
      || htmlOf(firstChild(item, 'content'))
      || htmlOf(firstChild(item, 'description', 'summary'))
    const link = isAtom
      ? atomLink(item, base)
      : resolveLink(firstChild(item, 'link'), base) || base
    const guid = textOf(firstChild(item, 'guid', 'id')).trim() || link || `${titleText}:${itemNodes.indexOf(item)}`
    const content = stripDangerous(absolutize(rawContent, link || base))
    const summaryNode = firstChild(item, 'summary', 'description')
    const summaryHtml = summaryNode ? htmlOf(summaryNode) : ''
    const published = parseDate(item)
    const itemTitle = plainText(htmlOf(firstChild(item, 'title')), 300).trim()
      || plainText(content, 120)
      || '(untitled)'

    items.push({
      guid,
      title: itemTitle,
      link,
      author: entryAuthor(item),
      publishedAt: published,
      summary: plainText(summaryHtml || content),
      content,
      image: firstImage(item, content, link || base),
    })
  }

  return {
    title: plainText(titleText, 200).trim() || new URL(sourceUrl).hostname,
    siteUrl,
    description,
    items,
  }
}

/** Find feed URLs advertised by an HTML page (`<link rel="alternate">`). */
function discoverFeeds(html, base) {
  const found = []
  const pattern = /<link\b[^>]*>/gi
  let match
  while ((match = pattern.exec(html)) !== null) {
    const tag = match[0]
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() || ''
    const type = /type\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() || ''
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] || ''
    if (!href || !rel.includes('alternate')) continue
    if (!/(rss|atom|xml)/.test(type)) continue
    try {
      const url = new URL(href, base).toString()
      if (!found.includes(url)) found.push(url)
    } catch {
      /* ignore unusable href */
    }
  }
  return found
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function readLimited(response, limit) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > limit) throw new Error('feed document is too large')
    return buffer
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      size += value.byteLength
      if (size > limit) throw new Error('feed document is too large')
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks)
}

async function fetchDocument(url, conditional = {}) {
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
  if (conditional.etag) headers['if-none-match'] = conditional.etag
  if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified

  const response = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (response.status === 304) {
    return { notModified: true, etag: conditional.etag, lastModified: conditional.lastModified }
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim())
  }

  const buffer = await readLimited(response, MAX_BODY_BYTES)
  return {
    notModified: false,
    body: buffer.toString('utf8'),
    contentType: (response.headers.get('content-type') || '').toLowerCase(),
    etag: response.headers.get('etag') || '',
    lastModified: response.headers.get('last-modified') || '',
  }
}

function looksLikeHtml(document) {
  const head = document.slice(0, 2048).trimStart().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}

async function readFeed(url) {
  const document = await fetchDocument(url)
  let xml = document.body
  let resolvedUrl = url
  if (looksLikeHtml(xml) || document.contentType.includes('text/html')) {
    const candidates = discoverFeeds(xml, url)
    if (candidates.length === 0) {
      throw new Error('No RSS or Atom feed found at that address')
    }
    resolvedUrl = candidates[0]
    const feedDocument = await fetchDocument(resolvedUrl)
    xml = feedDocument.body
    document.etag = feedDocument.etag
    document.lastModified = feedDocument.lastModified
  }
  const parsed = parseFeedDocument(xml, resolvedUrl)
  return { ...parsed, resolvedUrl, etag: document.etag, lastModified: document.lastModified }
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value))
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(body.length),
  })
  response.end(body)
}

function sendText(response, status, value, type = 'text/plain; charset=utf-8') {
  const body = Buffer.from(value)
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': String(body.length),
  })
  response.end(body)
}

async function readJsonBody(request, limit = MAX_REQUEST_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw)
}

function headerOf(request, name) {
  const value = request.headers?.[name]
  return Array.isArray(value) ? value.join(',') : value || ''
}

/** Same-origin guard: plugin routes carry no CORS headers, so refuse cross-site calls. */
function allowRequest(request, response) {
  const site = headerOf(request, 'sec-fetch-site').toLowerCase()
  if (site === 'cross-site') {
    sendJson(response, 403, { ok: false, error: 'cross-site request refused' })
    return false
  }
  const origin = headerOf(request, 'origin').trim()
  if (!origin) return true
  if (origin === 'null') {
    sendJson(response, 403, { ok: false, error: 'cross-site request refused' })
    return false
  }
  try {
    const host = headerOf(request, 'host').trim().toLowerCase()
    if (!host || new URL(origin).host.toLowerCase() !== host) {
      sendJson(response, 403, { ok: false, error: 'origin mismatch' })
      return false
    }
  } catch {
    sendJson(response, 403, { ok: false, error: 'origin mismatch' })
    return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function entryIdFor(feedId, guid) {
  return createHash('sha1').update(`${feedId}\u0000${guid}`).digest('hex').slice(0, 16)
}

function feedIdFor(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 12)
}

function sortedEntries(list) {
  return [...list].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
}

function publicFeed(feed, entries) {
  const own = entries.filter(entry => entry.feedId === feed.id)
  return {
    id: feed.id,
    url: feed.url,
    title: feed.title,
    siteUrl: feed.siteUrl || '',
    description: feed.description || '',
    error: feed.error || '',
    addedAt: feed.addedAt,
    lastFetchedAt: feed.lastFetchedAt || 0,
    unread: own.filter(entry => !entry.read).length,
    total: own.length,
    starred: own.filter(entry => entry.starred).length,
  }
}

function publicEntry(entry) {
  return {
    id: entry.id,
    feedId: entry.feedId,
    title: entry.title,
    link: entry.link || '',
    author: entry.author || '',
    publishedAt: entry.publishedAt || 0,
    summary: entry.summary || '',
    image: entry.image || '',
    read: Boolean(entry.read),
    starred: Boolean(entry.starred),
  }
}

function buildSnapshot() {
  const feeds = [...state.feeds].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
  const entries = sortedEntries(state.entries)
  const unreadByFeed = {}
  let unreadTotal = 0
  let starredTotal = 0
  for (const entry of entries) {
    if (!entry.read) {
      unreadTotal += 1
      unreadByFeed[entry.feedId] = (unreadByFeed[entry.feedId] || 0) + 1
    }
    if (entry.starred) starredTotal += 1
  }
  const lastFetched = feeds.reduce((latest, feed) => Math.max(latest, feed.lastFetchedAt || 0), 0)
  return {
    ok: true,
    platform: process.platform,
    desktop: Boolean(process.versions.electron),
    feeds: feeds.map(feed => publicFeed(feed, entries)),
    entries: entries.map(publicEntry),
    stats: {
      feeds: feeds.length,
      entries: entries.length,
      unread: unreadTotal,
      starred: starredTotal,
      unreadByFeed,
      lastFetchedAt: lastFetched,
    },
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function mergeFeedItems(feed, parsed, options = {}) {
  const now = Date.now()
  const existing = new Map(
    state.entries.filter(entry => entry.feedId === feed.id).map(entry => [entry.guid, entry]),
  )
  let added = 0
  for (const item of parsed.items) {
    const previous = existing.get(item.guid)
    if (previous) {
      previous.title = item.title || previous.title
      previous.link = item.link || previous.link
      previous.author = item.author || previous.author
      previous.publishedAt = item.publishedAt
      previous.summary = item.summary || previous.summary
      if (item.content) previous.content = item.content
      previous.image = item.image || previous.image
      continue
    }
    added += 1
    state.entries.push({
      id: entryIdFor(feed.id, item.guid),
      feedId: feed.id,
      guid: item.guid,
      title: item.title,
      link: item.link,
      author: item.author,
      publishedAt: item.publishedAt,
      summary: item.summary,
      content: item.content,
      image: item.image,
      read: options.markRead ? true : false,
      starred: false,
      fetchedAt: now,
    })
  }
  pruneFeedEntries(feed.id)
  return added
}

function pruneFeedEntries(feedId) {
  const own = state.entries.filter(entry => entry.feedId === feedId)
  if (own.length <= MAX_ENTRIES_PER_FEED + MAX_STARRED_PER_FEED) return
  const ordered = sortedEntries(own)
  const keep = new Set()
  let plainKept = 0
  let starredKept = 0
  for (const entry of ordered) {
    if (entry.starred) {
      if (starredKept < MAX_STARRED_PER_FEED) {
        starredKept += 1
        keep.add(entry.id)
      }
      continue
    }
    if (plainKept < MAX_ENTRIES_PER_FEED) {
      plainKept += 1
      keep.add(entry.id)
    }
  }
  state.entries = state.entries.filter(entry => entry.feedId !== feedId || keep.has(entry.id))
}

async function refreshFeed(feed) {
  try {
    const document = await fetchDocument(feed.url, {
      etag: feed.etag,
      lastModified: feed.lastModified,
    })
    if (document.notModified) {
      feed.lastFetchedAt = Date.now()
      feed.error = ''
      return { id: feed.id, added: 0, notModified: true }
    }
    let xml = document.body
    let resolvedUrl = feed.url
    if (looksLikeHtml(xml) || document.contentType.includes('text/html')) {
      const candidates = discoverFeeds(xml, feed.url)
      if (candidates.length === 0) throw new Error('No RSS or Atom feed found at that address')
      resolvedUrl = candidates[0]
      const nested = await fetchDocument(resolvedUrl)
      xml = nested.body
      feed.etag = nested.etag
      feed.lastModified = nested.lastModified
    } else {
      feed.etag = document.etag || feed.etag
      feed.lastModified = document.lastModified || feed.lastModified
    }
    const parsed = parseFeedDocument(xml, resolvedUrl)
    feed.title = parsed.title || feed.title
    feed.siteUrl = parsed.siteUrl || feed.siteUrl
    feed.description = parsed.description || feed.description
    feed.lastFetchedAt = Date.now()
    feed.error = ''
    const added = mergeFeedItems(feed, parsed)
    return { id: feed.id, added, notModified: false }
  } catch (error) {
    feed.error = error instanceof Error ? error.message : String(error)
    feed.lastFetchedAt = Date.now()
    return { id: feed.id, added: 0, error: feed.error }
  }
}

async function refreshFeeds(ids) {
  const targets = ids && ids.length > 0
    ? state.feeds.filter(feed => ids.includes(feed.id))
    : state.feeds
  const results = []
  const queue = [...targets]
  const workers = Array.from({ length: Math.min(REFRESH_CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const feed = queue.shift()
      if (!feed) return
      results.push(await refreshFeed(feed))
    }
  })
  await Promise.all(workers)
  return results
}

/** Validates user input early so the route can answer 400 before any fetch. */
function normalizeFeedUrl(input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('Feed URL is required')
  let url
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`).toString()
  } catch {
    throw new Error('That is not a valid URL')
  }
  if (!/^https?:/i.test(url)) throw new Error('Only http and https feeds are supported')
  return url
}

async function addFeed(input) {
  const url = normalizeFeedUrl(input)

  const parsed = await readFeed(url)
  const existing = state.feeds.find(feed => feed.url === parsed.resolvedUrl || feed.url === url)
  if (existing) {
    return { ok: true, feedId: existing.id, added: 0, duplicate: true }
  }

  const feed = {
    id: feedIdFor(parsed.resolvedUrl),
    url: parsed.resolvedUrl,
    title: parsed.title,
    siteUrl: parsed.siteUrl,
    description: parsed.description,
    etag: parsed.etag || '',
    lastModified: parsed.lastModified || '',
    addedAt: Date.now(),
    lastFetchedAt: Date.now(),
    error: '',
  }
  state.feeds.push(feed)
  const added = mergeFeedItems(feed, parsed)
  return { ok: true, feedId: feed.id, added, duplicate: false, title: feed.title }
}

function findEntry(id) {
  return state.entries.find(entry => entry.id === id)
}

function setFlags(ids, patch) {
  let changed = 0
  const target = new Set(ids)
  for (const entry of state.entries) {
    if (!target.has(entry.id)) continue
    let touched = false
    for (const [key, value] of Object.entries(patch)) {
      if (entry[key] !== value) {
        entry[key] = value
        touched = true
      }
    }
    if (touched) changed += 1
  }
  return changed
}

function markAllRead(feedId) {
  let changed = 0
  for (const entry of state.entries) {
    if (feedId && entry.feedId !== feedId) continue
    if (!entry.read) {
      entry.read = true
      changed += 1
    }
  }
  return changed
}

function importOpml(text) {
  const root = parseXml(text)
  const outlines = descendants(root, ['outline'])
  const urls = []
  for (const outline of outlines) {
    const url = outline.attrs?.xmlurl
    if (!url) continue
    const normalized = url.startsWith('http') ? url : `https://${url}`
    if (!urls.includes(normalized)) urls.push(normalized)
  }
  return urls
}

function exportOpml() {
  const escape = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  const rows = state.feeds.map(feed => (
    `    <outline type="rss" text="${escape(feed.title)}" title="${escape(feed.title)}" `
    + `xmlUrl="${escape(feed.url)}"${feed.siteUrl ? ` htmlUrl="${escape(feed.siteUrl)}"` : ''} />`
  ))
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>dsh-folo subscriptions</title>`,
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>',
    ...rows,
    '  </body>',
    '</opml>',
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

async function handleRequest(request, response) {
  if (!allowRequest(request, response)) return
  const method = (request.method || 'GET').toUpperCase()
  const url = new URL(request.url || '/', 'http://localhost')
  const route = url.pathname.slice(API_PREFIX.length) || '/'

  try {
    if (route === '/state' && method === 'GET') {
      await loadState()
      sendJson(response, 200, buildSnapshot())
      return
    }

    if (route === '/entry' && method === 'GET') {
      await loadState()
      const entry = findEntry(url.searchParams.get('id') || '')
      if (!entry) {
        sendJson(response, 404, { ok: false, error: 'entry not found' })
        return
      }
      sendJson(response, 200, {
        ok: true,
        entry: { ...publicEntry(entry), content: entry.content || '', feedTitle: state.feeds.find(f => f.id === entry.feedId)?.title || '' },
      })
      return
    }

    if (method !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'method not allowed' })
      return
    }

    const body = await readJsonBody(request)

    switch (route) {
      case '/refresh': {
        const ids = Array.isArray(body.feedIds) && body.feedIds.length > 0 ? body.feedIds : null
        const results = await mutate(async () => refreshFeeds(ids))
        sendJson(response, 200, { ok: true, results, snapshot: buildSnapshot() })
        return
      }

      case '/subscribe': {
        try {
          normalizeFeedUrl(body.url)
        } catch (error) {
          sendJson(response, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
          return
        }
        const result = await mutate(async () => addFeed(body.url))
        sendJson(response, 200, { ...result, snapshot: buildSnapshot() })
        return
      }

      case '/read': {
        const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string') : []
        const read = body.read !== false
        const changed = await mutate(async () => setFlags(ids, { read }))
        sendJson(response, 200, { ok: true, changed, snapshot: buildSnapshot() })
        return
      }

      case '/star': {
        const ids = Array.isArray(body.ids) ? body.ids.filter(id => typeof id === 'string') : []
        const starred = body.starred !== false
        const changed = await mutate(async () => setFlags(ids, { starred }))
        sendJson(response, 200, { ok: true, changed, snapshot: buildSnapshot() })
        return
      }

      case '/read-all': {
        const feedId = typeof body.feedId === 'string' ? body.feedId : ''
        const changed = await mutate(async () => markAllRead(feedId))
        sendJson(response, 200, { ok: true, changed, snapshot: buildSnapshot() })
        return
      }

      case '/unsubscribe': {
        const feedId = String(body.feedId || '')
        const removed = await mutate(async () => {
          const before = state.feeds.length
          state.feeds = state.feeds.filter(feed => feed.id !== feedId)
          state.entries = state.entries.filter(entry => entry.feedId !== feedId)
          return before - state.feeds.length
        })
        sendJson(response, 200, { ok: true, removed, snapshot: buildSnapshot() })
        return
      }

      case '/rename': {
        const feedId = String(body.feedId || '')
        const title = String(body.title || '').trim()
        if (!title) {
          sendJson(response, 400, { ok: false, error: 'title is required' })
          return
        }
        await mutate(async () => {
          const feed = state.feeds.find(item => item.id === feedId)
          if (feed) feed.title = title
        })
        sendJson(response, 200, { ok: true, snapshot: buildSnapshot() })
        return
      }

      case '/opml-import': {
        const text = String(body.text || '')
        if (!text.trim()) {
          sendJson(response, 400, { ok: false, error: 'The OPML file is empty' })
          return
        }
        const urls = importOpml(text)
        const summary = await mutate(async () => {
          const added = []
          const failed = []
          for (const url of urls.slice(0, 200)) {
            try {
              const result = await addFeed(url)
              if (!result.duplicate) added.push(url)
            } catch (error) {
              failed.push({ url, error: error instanceof Error ? error.message : String(error) })
            }
          }
          return { added, failed, total: urls.length }
        })
        sendJson(response, 200, { ok: true, ...summary, snapshot: buildSnapshot() })
        return
      }

      case '/opml-export': {
        await loadState()
        sendText(response, 200, exportOpml(), 'text/x-opml; charset=utf-8')
        return
      }

      default:
        sendJson(response, 404, { ok: false, error: 'unknown operation' })
    }
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const name = NAME

export function apply(ctx) {
  ctx.inject(['webServer'], host => {
    host.effect(() => host.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: (request, response) => handleRequest(request, response),
    }), 'dsh-folo: api route')
  })
}
