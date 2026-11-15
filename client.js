/**
 * dsh-folo — Client half.
 *
 * Renders a Folo-style three-pane reader in the `main` panel and a matching
 * entry in `sidebar.panellist`. All feed work happens in the Host half; this
 * module only talks to `/dsh-folo/api/*` and renders.
 */
window.__ModuleLoader__.load({
  id: 'dsh-folo',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const {
      useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
    } = React

    const NAMESPACE = 'dsh-folo'
    const PANEL_KEY = 'dsh-folo'
    const API_BASE = (() => {
      try {
        return new URL('dsh-folo/api/', document.baseURI).toString()
      } catch {
        return 'dsh-folo/api/'
      }
    })()

    // macOS desktop shell: traffic lights float over the window's top-left corner.
    const TRAFFIC_LIGHT_RIGHT = 92
    const TRAFFIC_LIGHT_BOTTOM = 46

    // -----------------------------------------------------------------------
    // API
    // -----------------------------------------------------------------------

    async function request(path, options) {
      const response = await fetch(`${API_BASE}${path}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        ...options,
      })
      if (!response.ok) {
        let message = `HTTP ${response.status}`
        let code = ''
        try {
          const body = await response.json()
          if (body && typeof body.error === 'string') message = body.error
          if (body && typeof body.code === 'string') code = body.code
        } catch {
          /* keep the status text */
        }
        const failure = new Error(message)
        if (code) failure.code = code
        throw failure
      }
      return response
    }

    async function fetchSnapshot() {
      const response = await request('state')
      return response.json()
    }

    async function sendOperation(op, payload) {
      const response = await request(op, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      })
      return response.json()
    }

    async function fetchEntry(id) {
      const response = await request(`entry?id=${encodeURIComponent(id)}`)
      const body = await response.json()
      return body.entry
    }

    async function fetchOpml() {
      const response = await request('opml-export', { method: 'POST' })
      return response.text()
    }

    // UI dictionaries are inlined so the client never depends on a relative
    // module require; `locale/*.json` keeps the same content for tooling.
    const DICTIONARIES = {
      en: {
  "meta": {
    "title": "Folo RSS reader",
    "description": "Subscribe to RSS and Atom feeds, read them in a two-pane reader, and keep unread and starred state in the sidebar."
  },
  "panel": {
    "title": "Folo",
    "subtitle": "RSS reader"
  },
  "toolbar": {
    "allFeeds": "All subscriptions"
  },
  "splitter": {
    "label": "Resize the entry list",
    "hint": "Drag, or use the arrow keys, to change the list width."
  },
  "nav": {
    "inbox": "Inbox",
    "all": "All entries",
    "unread": "Unread",
    "starred": "Starred",
    "subscriptions": "Subscriptions",
    "empty": "No subscriptions",
    "addFeed": "Add feed",
    "importOpml": "Import OPML",
    "exportOpml": "Export OPML",
    "settings": "Library"
  },
  "action": {
    "refresh": "Refresh feeds",
    "refreshing": "Refreshing…",
    "markAllRead": "Mark all as read",
    "subscribe": "Subscribe",
    "cancel": "Cancel",
    "close": "Close",
    "search": "Search entries",
    "clearSearch": "Clear search",
    "unsubscribe": "Unsubscribe",
    "openOriginal": "Open original",
    "star": "Star",
    "unstar": "Remove star",
    "markRead": "Mark as read",
    "markUnread": "Mark as unread",
    "back": "Back to list",
    "addFirstFeed": "Add your first feed",
    "retry": "Try again",
    "settings": "Reading settings",
    "feeds": "Choose subscriptions"
  },
  "list": {
    "empty": "Nothing here yet",
    "emptyHint": "Entries show up after a feed is fetched.",
    "noFeeds": "No feeds yet",
    "noFeedsHint": "Add an RSS or Atom feed, or import an OPML file from another reader.",
    "noMatch": "No matching entries",
    "noMatchHint": "Try a different search term.",
    "count": "{count} entries",
    "unreadCount": "{count} unread",
    "markAllConfirm": "Marked {count} entries as read"
  },
  "reader": {
    "empty": "Select an entry",
    "emptyHint": "Pick something from the list to read it here.",
    "loading": "Loading entry…",
    "byAuthor": "by {author}",
    "noContent": "This entry has no content. Open the original to read it.",
    "error": "Could not load this entry."
  },
  "dialog": {
    "addTitle": "Add a feed",
    "addHint": "Paste an RSS or Atom URL. A website address also works when the site advertises a feed.",
    "addPlaceholder": "https://example.com/feed.xml",
    "importTitle": "Import OPML",
    "importHint": "Pick an OPML file exported from another reader.",
    "importButton": "Choose file"
  },
  "toast": {
    "subscribed": "Subscribed to {title}",
    "alreadySubscribed": "That feed is already in your library",
    "refreshed": "Feeds refreshed",
    "refreshFailed": "Refresh finished with errors",
    "noFeeds": "Add a feed first",
    "starred": "Starred",
    "unstarred": "Star removed",
    "imported": "Imported {count} feeds",
    "importEmpty": "No feeds found in that file",
    "exported": "OPML exported",
    "unsubscribed": "Feed removed",
    "error": "Something went wrong"
  },
  "state": {
    "unreadBadge": "{count} unread entries",
    "feedError": "Last fetch failed: {message}",
    "neverFetched": "Not fetched yet",
    "updated": "Updated {when}"
  },
  "settings": {
    "title": "Reading settings",
    "language": "Interface language",
    "languageHint": "Changes this reader's own labels; the rest of DeepSeek keeps its language.",
    "auto": "Follow DeepSeek",
    "zh": "简体中文",
    "en": "English"
  },
  "error": {
    "invalid_url": "That is not a valid URL.",
    "url_required": "Enter a feed address first.",
    "unsupported_protocol": "Only http and https feeds are supported.",
    "no_feed": "No RSS or Atom feed was found at that address.",
    "http_status": "The feed server returned an error.",
    "too_large": "That feed is too large to load.",
    "empty_feed": "That feed document has no entries.",
    "empty_opml": "The OPML file is empty.",
    "title_required": "A subscription title is required.",
    "entry_not_found": "That entry is no longer available.",
    "unknown_operation": "Unknown operation.",
    "forbidden": "The request was refused.",
    "bad_json": "The request body was malformed.",
    "invalid_setting": "That setting value is not accepted.",
    "unreachable": "Could not reach that feed. Try again later.",
    "unknown": "Something went wrong."
  }
},
      zh: {
  "meta": {
    "title": "Folo 订阅阅读器",
    "description": "订阅 RSS 与 Atom 源，在双栏阅读视图里阅读，并在侧边栏保留未读与收藏状态。"
  },
  "panel": {
    "title": "Folo",
    "subtitle": "订阅阅读器"
  },
  "toolbar": {
    "allFeeds": "全部订阅源"
  },
  "splitter": {
    "label": "调整列表宽度",
    "hint": "拖动或使用方向键改变列表宽度。"
  },
  "nav": {
    "inbox": "收件箱",
    "all": "全部文章",
    "unread": "未读",
    "starred": "收藏",
    "subscriptions": "订阅源",
    "empty": "还没有订阅",
    "addFeed": "添加订阅",
    "importOpml": "导入 OPML",
    "exportOpml": "导出 OPML",
    "settings": "书库"
  },
  "action": {
    "refresh": "刷新订阅",
    "refreshing": "正在刷新…",
    "markAllRead": "全部标为已读",
    "subscribe": "订阅",
    "cancel": "取消",
    "close": "关闭",
    "search": "搜索文章",
    "clearSearch": "清除搜索",
    "unsubscribe": "取消订阅",
    "openOriginal": "打开原文",
    "star": "收藏",
    "unstar": "取消收藏",
    "markRead": "标为已读",
    "markUnread": "标为未读",
    "back": "返回列表",
    "addFirstFeed": "添加第一个订阅",
    "retry": "重试",
    "settings": "阅读设置",
    "feeds": "选择订阅源"
  },
  "list": {
    "empty": "这里还没有内容",
    "emptyHint": "抓取订阅源之后文章会出现在这里。",
    "noFeeds": "还没有订阅源",
    "noFeedsHint": "添加一个 RSS 或 Atom 源，或从其他阅读器导入 OPML 文件。",
    "noMatch": "没有匹配的文章",
    "noMatchHint": "换一个搜索词试试。",
    "count": "{count} 篇文章",
    "unreadCount": "{count} 篇未读",
    "markAllConfirm": "已把 {count} 篇文章标为已读"
  },
  "reader": {
    "empty": "选择一篇文章",
    "emptyHint": "从左侧列表中挑一篇，正文会显示在这里。",
    "loading": "正在加载文章…",
    "byAuthor": "作者：{author}",
    "noContent": "这篇文章没有正文内容，可以打开原文阅读。",
    "error": "无法加载这篇文章。"
  },
  "dialog": {
    "addTitle": "添加订阅源",
    "addHint": "粘贴 RSS 或 Atom 地址。如果网站声明了订阅源，直接填网址也可以。",
    "addPlaceholder": "https://example.com/feed.xml",
    "importTitle": "导入 OPML",
    "importHint": "选择从其他阅读器导出的 OPML 文件。",
    "importButton": "选择文件"
  },
  "toast": {
    "subscribed": "已订阅 {title}",
    "alreadySubscribed": "这个订阅源已经在书库里了",
    "refreshed": "订阅已刷新",
    "refreshFailed": "刷新完成，但有订阅源出错",
    "noFeeds": "请先添加订阅源",
    "starred": "已收藏",
    "unstarred": "已取消收藏",
    "imported": "已导入 {count} 个订阅源",
    "importEmpty": "文件里没有找到订阅源",
    "exported": "已导出 OPML",
    "unsubscribed": "已移除订阅源",
    "error": "出错了"
  },
  "state": {
    "unreadBadge": "{count} 篇未读",
    "feedError": "上次抓取失败：{message}",
    "neverFetched": "尚未抓取",
    "updated": "更新于 {when}"
  },
  "settings": {
    "title": "阅读设置",
    "language": "界面语言",
    "languageHint": "只影响这个阅读器的界面文案，DeepSeek 其余部分保持原语言。",
    "auto": "跟随 DeepSeek",
    "zh": "简体中文",
    "en": "English"
  },
  "error": {
    "invalid_url": "这不是一个有效的网址。",
    "url_required": "请先填写订阅源地址。",
    "unsupported_protocol": "只支持 http 与 https 订阅源。",
    "no_feed": "这个地址上没有找到 RSS 或 Atom 订阅源。",
    "http_status": "订阅源服务器返回了错误。",
    "too_large": "这个订阅源太大，无法加载。",
    "empty_feed": "这个订阅源文档里没有内容。",
    "empty_opml": "OPML 文件是空的。",
    "title_required": "订阅源标题不能为空。",
    "entry_not_found": "这篇文章已经不存在了。",
    "unknown_operation": "未知操作。",
    "forbidden": "请求被拒绝。",
    "bad_json": "请求内容格式有误。",
    "invalid_setting": "这个设置值不被接受。",
    "unreachable": "连不上这个订阅源，请稍后再试。",
    "unknown": "出错了。"
  }
},
    }

    // -----------------------------------------------------------------------
    // Shared unread counter for the sidebar icon
    // -----------------------------------------------------------------------

    function createCounter() {
      let value = 0
      const listeners = new Set()
      return {
        get: () => value,
        set(next) {
          const guarded = Number.isFinite(next) ? next : 0
          if (guarded === value) return
          value = guarded
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      }
    }

    const unreadCounter = createCounter()

    // -----------------------------------------------------------------------
    // Interface preferences: the reader keeps its own language and pane width
    // so switching them never touches the rest of the Harness.
    // -----------------------------------------------------------------------

    const DEFAULT_PREFS = { locale: 'zh', listWidth: 0 }

    function createPrefs() {
      let value = { ...DEFAULT_PREFS }
      const listeners = new Set()
      return {
        get: () => value,
        set(next) {
          const merged = {
            locale: ['auto', 'zh', 'en'].includes(next && next.locale) ? next.locale : value.locale,
            listWidth: next && Number.isFinite(next.listWidth) && next.listWidth > 0
              ? Math.round(next.listWidth)
              : value.listWidth,
          }
          if (merged.locale === value.locale && merged.listWidth === value.listWidth) return
          value = merged
          for (const listener of [...listeners]) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      }
    }

    const prefs = createPrefs()

    // The Harness locale, read live: `auto` follows it without caching.
    let harnessLocale = () => 'en'

    function resolveLanguage() {
      const preference = prefs.get().locale
      if (preference === 'zh' || preference === 'en') return preference
      return String(harnessLocale() || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    function uiLocale() {
      return resolveLanguage() === 'zh' ? 'zh-CN' : 'en-US'
    }

    function readPath(dictionary, key) {
      let cursor = dictionary
      for (const part of String(key).split('.')) {
        if (!cursor || typeof cursor !== 'object') return undefined
        cursor = cursor[part]
      }
      return typeof cursor === 'string' ? cursor : undefined
    }

    function translate(key, values) {
      const language = resolveLanguage()
      const text = readPath(DICTIONARIES[language], key)
        ?? readPath(DICTIONARIES.zh, key)
        ?? key
      return values ? fill(text, values) : text
    }

    // Errors arrive with a stable code; fall back to the server message only
    // when the code is one this build does not know.
    function errorText(error) {
      const code = error && error.code
      if (code) {
        const text = readPath(DICTIONARIES[resolveLanguage()], `error.${code}`)
          ?? readPath(DICTIONARIES.zh, `error.${code}`)
        if (typeof text === 'string') return text
      }
      if (error instanceof Error && error.message) return error.message
      return translate('error.unknown')
    }

    // -----------------------------------------------------------------------
    // HTML sanitizing for feed content
    // -----------------------------------------------------------------------

    const ALLOWED_TAGS = new Set([
      'a', 'abbr', 'article', 'aside', 'audio', 'b', 'blockquote', 'br', 'caption', 'cite', 'code',
      'col', 'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption',
      'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'ins',
      'kbd', 'li', 'main', 'mark', 'ol', 'p', 'picture', 'pre', 'q', 's', 'section', 'small',
      'source', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
      'thead', 'time', 'tr', 'u', 'ul', 'video',
    ])
    const DROPPED_TAGS = new Set([
      'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea',
      'link', 'meta', 'base', 'noscript', 'template', 'svg', 'math',
    ])
    const ALLOWED_ATTRS = new Set([
      'alt', 'cite', 'colspan', 'controls', 'datetime', 'height', 'href', 'loading', 'poster',
      'preload', 'reversed', 'rowspan', 'scope', 'sizes', 'src', 'srcset', 'start', 'title',
      'type', 'value', 'width',
    ])

    function sanitizeHtml(html) {
      if (!html) return ''
      const document_ = new DOMParser().parseFromString(
        `<!doctype html><body><div id="folo-content-root">${html}</div></body>`,
        'text/html',
      )
      const root = document_.getElementById('folo-content-root')
      if (!root) return ''
      const clean = node => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 8) {
            child.remove()
            continue
          }
          if (child.nodeType !== 1) continue
          const tag = child.tagName.toLowerCase()
          if (DROPPED_TAGS.has(tag)) {
            child.remove()
            continue
          }
          if (!ALLOWED_TAGS.has(tag)) {
            const parent = child.parentNode
            while (child.firstChild) parent.insertBefore(child.firstChild, child)
            child.remove()
            continue
          }
          for (const attribute of [...child.attributes]) {
            const name = attribute.name.toLowerCase()
            const value = (attribute.value || '').trim()
            if (name.startsWith('on') || !ALLOWED_ATTRS.has(name)) {
              child.removeAttribute(attribute.name)
              continue
            }
            if (name === 'href' && /^(?:javascript|vbscript|data:text\/html)/i.test(value)) {
              child.removeAttribute(attribute.name)
            }
          }
          if (tag === 'a') {
            child.setAttribute('target', '_blank')
            child.setAttribute('rel', 'noreferrer noopener')
          }
          if (tag === 'img') {
            child.setAttribute('loading', 'lazy')
            child.setAttribute('decoding', 'async')
          }
          clean(child)
        }
      }
      clean(root)
      return root.innerHTML
    }

    // -----------------------------------------------------------------------
    // Formatting
    // -----------------------------------------------------------------------

    function relativeTime(timestamp, localeId) {
      if (!timestamp) return ''
      const diff = Date.now() - timestamp
      const minute = 60_000
      const hour = 60 * minute
      const day = 24 * hour
      const format = (value, unit) => {
        try {
          return new Intl.RelativeTimeFormat(localeId, { numeric: 'auto' }).format(value, unit)
        } catch {
          return ''
        }
      }
      if (diff < minute) return format(0, 'minute') || 'now'
      if (diff < hour) return format(-Math.round(diff / minute), 'minute')
      if (diff < day) return format(-Math.round(diff / hour), 'hour')
      if (diff < 7 * day) return format(-Math.round(diff / day), 'day')
      try {
        return new Intl.DateTimeFormat(localeId, { month: 'short', day: 'numeric' }).format(timestamp)
      } catch {
        return new Date(timestamp).toLocaleDateString()
      }
    }

    function dayHeading(timestamp, localeId) {
      const startOfDay = value => {
        const date = new Date(value)
        date.setHours(0, 0, 0, 0)
        return date.getTime()
      }
      const today = startOfDay(Date.now())
      const target = startOfDay(timestamp || Date.now())
      const days = Math.round((today - target) / 86_400_000)
      try {
        const format = new Intl.RelativeTimeFormat(localeId, { numeric: 'auto' })
        if (days === 0) return format.format(0, 'day')
        if (days === 1) return format.format(-1, 'day')
      } catch {
        /* fall through to a date */
      }
      const value = timestamp || Date.now()
      try {
        return new Intl.DateTimeFormat(localeId, {
          year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
          month: 'short',
          day: 'numeric',
        }).format(value)
      } catch {
        return new Date(value).toLocaleDateString()
      }
    }

    function fill(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        values[key] === undefined ? match : String(values[key])
      ))
    }

    function feedColor(id) {
      let hash = 0
      for (let index = 0; index < id.length; index += 1) {
        hash = (hash * 31 + id.charCodeAt(index)) % 360
      }
      return hash
    }

    function initials(title) {
      const text = String(title || '?').trim()
      if (!text) return '?'
      const first = text[0]
      return /[\u4e00-\u9fa5]/.test(first) ? first : text.slice(0, 2).toUpperCase()
    }

    // -----------------------------------------------------------------------
    // Icons
    // -----------------------------------------------------------------------

    function Icon({ size = 16, children, strokeWidth = 1.7, ...rest }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        ...rest,
      }, children)
    }

    const Icons = {
      rss: props => h(Icon, props, h('path', { d: 'M4 17a3 3 0 0 1 3 3' }), h('path', { d: 'M4 11a9 9 0 0 1 9 9' }), h('path', { d: 'M4 5a15 15 0 0 1 15 15' })),
      plus: props => h(Icon, props, h('path', { d: 'M12 5v14M5 12h14' })),
      refresh: props => h(Icon, props, h('path', { d: 'M20 11a8 8 0 1 0-2.3 6' }), h('path', { d: 'M20 5v6h-6' })),
      search: props => h(Icon, props, h('circle', { cx: 11, cy: 11, r: 6.5 }), h('path', { d: 'm16 16 4 4' })),
      star: props => h(Icon, props, h('path', { d: 'M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 10l5.2-.8z' })),
      check: props => h(Icon, props, h('path', { d: 'm5 13 4 4L19 7' })),
      mail: props => h(Icon, props, h('rect', { x: 3.5, y: 5.5, width: 17, height: 13, rx: 2.5 }), h('path', { d: 'm4.5 7.5 7.5 5.5 7.5-5.5' })),
      dot: props => h(Icon, props, h('circle', { cx: 12, cy: 12, r: 3.2, fill: 'currentColor', stroke: 'none' })),
      external: props => h(Icon, props, h('path', { d: 'M14 4h6v6' }), h('path', { d: 'M20 4 11 13' }), h('path', { d: 'M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10' })),
      back: props => h(Icon, props, h('path', { d: 'M15 5l-7 7 7 7' })),
      close: props => h(Icon, props, h('path', { d: 'm6 6 12 12M18 6 6 18' })),
      trash: props => h(Icon, props, h('path', { d: 'M5 7h14' }), h('path', { d: 'M9.5 7V5h5v2' }), h('path', { d: 'M6.5 7l.8 12.2A1.4 1.4 0 0 0 8.7 20.5h6.6a1.4 1.4 0 0 0 1.4-1.3L17.5 7' })),
      download: props => h(Icon, props, h('path', { d: 'M12 4v10' }), h('path', { d: 'm8 11 4 4 4-4' }), h('path', { d: 'M5 19h14' })),
      upload: props => h(Icon, props, h('path', { d: 'M12 16V6' }), h('path', { d: 'm8 9 4-4 4 4' }), h('path', { d: 'M5 19h14' })),
      inbox: props => h(Icon, props, h('path', { d: 'M4 13h4l1.5 2.5h5L16 13h4' }), h('path', { d: 'M5.5 5.5h13l1.5 7.5v4.5A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V13z' })),
      library: props => h(Icon, props, h('rect', { x: 4.5, y: 4.5, width: 15, height: 15, rx: 2.5 }), h('path', { d: 'M4.5 9.5h15' }), h('path', { d: 'M10 9.5V19.5' })),
      chevron: props => h(Icon, props, h('path', { d: 'm7 10 5 5 5-5' })),
      gear: props => h(Icon, props, h('circle', { cx: 12, cy: 12, r: 3.1 }), h('path', { d: 'M19.4 14.4a7.6 7.6 0 0 0 0-4.8l1.7-1.1-1.9-3.3-1.9 1a7.6 7.6 0 0 0-4.2-2.4L12.8 2h-3.6l-.3 1.8a7.6 7.6 0 0 0-4.2 2.4l-1.9-1L1 8.5l1.7 1.1a7.6 7.6 0 0 0 0 4.8L1 15.5l1.9 3.3 1.9-1a7.6 7.6 0 0 0 4.2 2.4l.3 1.8h3.6l.3-1.8a7.6 7.6 0 0 0 4.2-2.4l1.9 1 1.9-3.3z' })),
    }

    function StarGlyph({ filled, size = 14 }) {
      return h(Icon, {
        size,
        fill: filled ? 'currentColor' : 'none',
        strokeWidth: 1.6,
      }, h('path', { d: 'M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 10l5.2-.8z' }))
    }

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    const STYLES = `
.folo-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased}
.folo-root *{box-sizing:border-box}
.folo-root button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.folo-root input{font:inherit;color:inherit;background:none;border:0;outline:none}
.folo-header{position:relative;z-index:4;display:flex;align-items:center;gap:10px;flex:none;min-height:54px;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.folo-brand{display:flex;align-items:center;gap:9px;min-width:0;flex:none}
.folo-brand-mark{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;flex:none;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 15%, transparent);border:1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent)}
.folo-brand-text{display:flex;flex-direction:column;min-width:0}
.folo-brand-title{font-size:13.5px;font-weight:600;letter-spacing:.01em;line-height:1.25;white-space:nowrap}
.folo-brand-sub{font-size:10.5px;line-height:1.25;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.folo-header-main{display:flex;align-items:center;gap:8px;flex:1;min-width:0;justify-content:flex-end}
.folo-search{display:flex;align-items:center;gap:6px;height:30px;min-width:0;max-width:260px;flex:1 1 160px;padding:0 9px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-label-secondary) 6%, transparent);transition:border-color .15s ease,background .15s ease}
.folo-search:focus-within{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-layer-2)}
.folo-search svg{color:var(--dsw-alias-label-secondary);flex:none}
.folo-search input{min-width:0;flex:1;font-size:12.5px}
.folo-search input::placeholder{color:var(--dsw-alias-label-secondary)}
.folo-search-clear{display:grid;place-items:center;width:18px;height:18px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
.folo-search-clear:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 16%, transparent);color:var(--dsw-alias-label-primary)}
.folo-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);font-size:12.5px;white-space:nowrap;transition:border-color .15s ease,background .15s ease}
.folo-btn:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.folo-btn[disabled]{opacity:.55;cursor:default}
.folo-btn-ghost{border-color:transparent;background:transparent}
.folo-btn-ghost:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent)}
.folo-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}
.folo-btn-primary:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, #000)}
.folo-btn-primary[disabled]:hover{background:var(--dsw-alias-brand-primary)}
.folo-iconbtn{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;color:var(--dsw-alias-label-secondary);transition:background .15s ease,color .15s ease}
.folo-iconbtn:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent);color:var(--dsw-alias-label-primary)}
.folo-iconbtn[disabled]{opacity:.5;cursor:default}
.folo-iconbtn.is-on{color:var(--dsw-alias-brand-primary)}
.folo-spin{animation:folo-spin 1s linear infinite}
@keyframes folo-spin{to{transform:rotate(360deg)}}
.folo-body{display:flex;flex:1;min-height:0;min-width:0}
.folo-nav{display:flex;flex-direction:column;width:230px;flex:none;min-height:0;border-right:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 60%, var(--dsw-alias-bg-base))}
.folo-nav-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 12px 6px}
.folo-nav-label{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.folo-nav-group{display:flex;flex-direction:column;gap:1px;padding:2px 8px}
.folo-nav-row{display:flex;align-items:center;gap:8px;height:30px;padding:0 8px;border-radius:8px;color:var(--dsw-alias-label-primary);font-size:12.5px;text-align:left;width:100%}
.folo-nav-row:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 11%, transparent)}
.folo-nav-row.is-active{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent);color:var(--dsw-alias-label-primary)}
.folo-nav-row.is-active .folo-nav-row-icon{color:var(--dsw-alias-brand-primary)}
.folo-nav-row-icon{display:grid;place-items:center;width:18px;flex:none;color:var(--dsw-alias-label-secondary)}
.folo-nav-row-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.folo-count{flex:none;min-width:18px;padding:0 5px;height:17px;border-radius:6px;display:grid;place-items:center;font-size:10.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);background:color-mix(in srgb, var(--dsw-alias-label-secondary) 13%, transparent)}
.folo-nav-row.is-active .folo-count{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)}
.folo-feed-row{position:relative;display:flex;align-items:center;gap:8px;height:32px;padding:0 6px 0 8px;border-radius:8px;width:100%;text-align:left;font-size:12.5px}
.folo-feed-row:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent)}
.folo-feed-row.is-active{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 13%, transparent)}
.folo-feed-dot{display:grid;place-items:center;width:19px;height:19px;border-radius:6px;flex:none;font-size:9.5px;font-weight:600;letter-spacing:.02em;color:#fff}
.folo-feed-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.folo-feed-actions{display:none;align-items:center;gap:1px;flex:none}
.folo-feed-row:hover .folo-feed-actions{display:flex}
.folo-feed-row:hover .folo-count{display:none}
.folo-feed-action{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;color:var(--dsw-alias-label-secondary)}
.folo-feed-action:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);color:var(--dsw-alias-label-primary)}
.folo-feed-error{color:var(--dsw-alias-state-error-primary)}
.folo-nav-foot{display:flex;align-items:center;gap:2px;padding:8px 10px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:auto}
.folo-list{display:flex;flex-direction:column;width:340px;flex:none;min-height:0;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.folo-list-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;height:40px;padding:0 12px 0 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.folo-list-title{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.folo-list-meta{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.folo-scroll{overflow-y:auto;overscroll-behavior:contain;min-height:0;flex:1}
.folo-scroll::-webkit-scrollbar{width:9px;height:9px}
.folo-scroll::-webkit-scrollbar-thumb{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 26%, transparent);border-radius:6px;border:2px solid transparent;background-clip:padding-box}
.folo-scroll::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent);background-clip:padding-box}
.folo-day{padding:12px 14px 4px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.folo-item{position:relative;display:flex;flex-direction:column;gap:4px;width:100%;padding:10px 14px 11px;border-bottom:1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 65%, transparent);text-align:left}
.folo-item:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 7%, transparent)}
.folo-item.is-active{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)}
.folo-item.is-active::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:2.5px;border-radius:0 3px 3px 0;background:var(--dsw-alias-brand-primary)}
.folo-item-top{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--dsw-alias-label-secondary);min-width:0}
.folo-item-feed{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%}
.folo-item-sep{opacity:.45}
.folo-item-title{font-size:13px;font-weight:500;line-height:1.4;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.folo-item.is-read .folo-item-title{font-weight:400;color:color-mix(in srgb, var(--dsw-alias-label-primary) 72%, var(--dsw-alias-label-secondary))}
.folo-item-summary{font-size:11.5px;line-height:1.45;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.folo-item-unread{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}
.folo-item-body{display:flex;gap:10px;align-items:flex-start}
.folo-item-text{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.folo-item-thumb{width:52px;height:52px;border-radius:8px;object-fit:cover;flex:none;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.folo-item-star{position:absolute;right:10px;bottom:9px;display:grid;place-items:center;width:22px;height:22px;border-radius:6px;color:var(--dsw-alias-state-warn-primary);opacity:0}
.folo-item:hover .folo-item-star,.folo-item.is-starred .folo-item-star{opacity:1}
.folo-item-star:hover{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent)}
.folo-reader{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;background:var(--dsw-alias-bg-layer-1)}
.folo-reader-head{display:flex;align-items:center;gap:6px;flex:none;height:40px;padding:0 10px 0 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.folo-reader-actions{margin-left:auto;display:flex;align-items:center;gap:2px}
.folo-reader-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.folo-article{max-width:720px;margin:0 auto;padding:28px 32px 80px}
.folo-article-title{font-size:24px;line-height:1.3;font-weight:650;letter-spacing:-.01em;margin:0 0 10px}
.folo-article-meta{display:flex;flex-wrap:wrap;align-items:center;gap:7px;font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-bottom:18px}
.folo-article-feed{display:inline-flex;align-items:center;gap:5px;font-weight:500;color:var(--dsw-alias-label-primary)}
.folo-article-sep{opacity:.5}
.folo-article-content{font-size:15px;line-height:1.72;color:var(--dsw-alias-label-primary);word-break:break-word}
.folo-article-content>:first-child{margin-top:0}
.folo-article-content p{margin:0 0 1em}
.folo-article-content a{color:var(--dsw-alias-brand-primary);text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}
.folo-article-content h1,.folo-article-content h2,.folo-article-content h3,.folo-article-content h4{line-height:1.35;margin:1.6em 0 .6em;font-weight:640}
.folo-article-content h1{font-size:1.42em}
.folo-article-content h2{font-size:1.26em}
.folo-article-content h3{font-size:1.12em}
.folo-article-content h4{font-size:1em}
.folo-article-content img,.folo-article-content video{max-width:100%;height:auto;border-radius:10px;display:block;margin:1.1em auto;border:1px solid var(--dsw-alias-border-l1)}
.folo-article-content figure{margin:1.3em 0}
.folo-article-content figcaption{font-size:11.5px;color:var(--dsw-alias-label-secondary);text-align:center;margin-top:6px}
.folo-article-content blockquote{margin:1.2em 0;padding:.2em 0 .2em 14px;border-left:3px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 40%, var(--dsw-alias-border-l2));color:color-mix(in srgb, var(--dsw-alias-label-primary) 84%, var(--dsw-alias-label-secondary))}
.folo-article-content ul,.folo-article-content ol{margin:0 0 1em;padding-left:1.4em}
.folo-article-content li{margin:.25em 0}
.folo-article-content code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;padding:.15em .38em;border-radius:5px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.folo-article-content pre{padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);overflow-x:auto;font-size:12.5px;line-height:1.6}
.folo-article-content pre code{padding:0;border:0;background:none;font-size:inherit}
.folo-article-content hr{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:1.8em 0}
.folo-article-content table{width:100%;border-collapse:collapse;font-size:12.5px;margin:1.2em 0;display:block;overflow-x:auto}
.folo-article-content th,.folo-article-content td{border:1px solid var(--dsw-alias-border-l1);padding:6px 9px;text-align:left}
.folo-article-content th{background:var(--dsw-alias-bg-layer-2);font-weight:600}
.folo-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;height:100%;padding:32px 26px;text-align:center;color:var(--dsw-alias-label-secondary)}
.folo-empty-mark{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;color:var(--dsw-alias-label-secondary);background:color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent);border:1px solid var(--dsw-alias-border-l1)}
.folo-empty-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.folo-empty-hint{font-size:12px;max-width:250px;line-height:1.55}
.folo-backdrop{position:absolute;inset:0;z-index:20;display:grid;place-items:center;padding:24px;background:color-mix(in srgb, #000 34%, transparent);backdrop-filter:blur(1.5px)}
.folo-dialog{width:100%;max-width:430px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 20px 50px color-mix(in srgb, #000 30%, transparent);padding:18px 18px 15px}
.folo-dialog-title{font-size:14px;font-weight:600;margin-bottom:5px}
.folo-dialog-hint{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);margin-bottom:13px}
.folo-field{display:flex;align-items:center;height:34px;padding:0 11px;border-radius:9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);margin-bottom:12px}
.folo-field:focus-within{border-color:var(--dsw-alias-brand-primary)}
.folo-field input{flex:1;min-width:0;font-size:12.5px}
.folo-dialog-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.folo-error-text{font-size:11.5px;color:var(--dsw-alias-state-error-primary);margin:-4px 0 10px;line-height:1.5}
.folo-toast{position:absolute;left:50%;bottom:18px;z-index:30;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:70%;padding:8px 13px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 26px color-mix(in srgb, #000 22%, transparent);font-size:12px}
.folo-toast.is-error{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l2))}
.folo-toast.is-error .folo-toast-icon{color:var(--dsw-alias-state-error-primary)}
.folo-toast-icon{display:grid;place-items:center;color:var(--dsw-alias-state-success-primary)}
.folo-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (max-width:1060px){
.folo-article{padding:22px 22px 64px}
.folo-article-title{font-size:21px}
}
@media (max-width:820px){
.folo-splitter{display:none}
.folo-listcol{flex:1 1 auto;width:auto!important}
.folo-reader{flex:1 1 auto;width:100%;border-left:0}
.folo-article{padding:18px 18px 64px}
.folo-article-title{font-size:19px}
}
@media (prefers-reduced-motion:reduce){
.folo-spin{animation-duration:2.4s}
}

/* --- two-pane layout with a user-draggable divider --- */
.folo-root.is-dragging,.folo-root.is-dragging *{cursor:col-resize!important;user-select:none!important}
.folo-listcol{display:flex;flex-direction:column;flex:none;min-width:0;min-height:0;background:var(--dsw-alias-bg-base)}
.folo-splitter{position:relative;flex:0 0 7px;margin:0 -3px;z-index:3;cursor:col-resize;touch-action:none}
.folo-splitter::before{content:"";position:absolute;inset:0 3px;background:var(--dsw-alias-border-l1);transition:background .12s ease}
.folo-splitter:hover::before,.folo-splitter.is-active::before{background:var(--dsw-alias-brand-primary)}
.folo-splitter:focus-visible{outline:none}
.folo-splitter:focus-visible::before{background:var(--dsw-alias-brand-primary)}
.folo-toolbar{position:relative;display:flex;align-items:center;gap:6px;flex:none;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.folo-tabs{display:inline-flex;align-items:center;gap:2px;flex:none;padding:2px;border-radius:9px;background:color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent)}
.folo-tab{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:7px;font-size:11.5px;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.folo-tab:hover{color:var(--dsw-alias-label-primary)}
.folo-tab.is-active{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.16)}
.folo-tab-count{font-size:10px;font-variant-numeric:tabular-nums;opacity:.7}
.folo-feedbtn{display:inline-flex;align-items:center;gap:6px;height:28px;flex:1 1 auto;min-width:0;padding:0 7px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;color:var(--dsw-alias-label-primary);text-align:left}
.folo-feedbtn:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.folo-feedbtn-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.folo-menu{position:absolute;top:calc(100% - 3px);left:10px;right:10px;z-index:20;display:flex;flex-direction:column;max-height:min(430px,72vh);padding:6px;border-radius:11px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:0 16px 40px rgba(0,0,0,.3);overflow:hidden}
.folo-menu-scroll{overflow-y:auto;overscroll-behavior:contain;min-height:0}
.folo-menu-label{padding:7px 8px 3px;font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.folo-menu-row{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 8px;border-radius:7px;font-size:12.5px;text-align:left}
.folo-menu-row:hover{background:color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent)}
.folo-menu-row.is-active{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)}
.folo-menu-sep{height:1px;margin:5px 4px;background:var(--dsw-alias-border-l1)}
.folo-menu-actions{display:flex;flex-direction:column;gap:1px;flex:none}
.folo-settings-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:2px 0 12px}
.folo-settings-label{font-size:12.5px;font-weight:500}
.folo-settings-hint{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);margin-top:3px;max-width:270px}
.folo-lang{display:inline-flex;flex:none;padding:2px;gap:2px;border-radius:9px;background:color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent)}
.folo-lang button{height:26px;padding:0 10px;border-radius:7px;font-size:12px;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.folo-lang button.is-active{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.16)}
.folo-dragging-shield{position:absolute;inset:0;z-index:19}
`

    // -----------------------------------------------------------------------
    // Small building blocks
    // -----------------------------------------------------------------------

    function useMediaQuery(query) {
      const [matches, setMatches] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia(query).matches
          : false
      ))
      useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined
        const list = window.matchMedia(query)
        const update = () => setMatches(list.matches)
        update()
        if (typeof list.addEventListener === 'function') {
          list.addEventListener('change', update)
          return () => list.removeEventListener('change', update)
        }
        list.addListener(update)
        return () => list.removeListener(update)
      }, [query])
      return matches
    }

    function FeedBadge({ id, title, size = 19 }) {
      const hue = feedColor(id)
      return h('span', {
        className: 'folo-feed-dot',
        style: {
          width: size,
          height: size,
          background: `linear-gradient(145deg, hsl(${hue} 62% 52%), hsl(${(hue + 26) % 360} 58% 42%))`,
        },
        'aria-hidden': 'true',
      }, initials(title))
    }

    function Count({ value }) {
      if (!value) return null
      return h('span', { className: 'folo-count' }, value > 999 ? '999+' : String(value))
    }

    function EmptyState({ icon, title, hint, action }) {
      return h('div', { className: 'folo-empty' },
        h('div', { className: 'folo-empty-mark' }, h(icon || Icons.rss, { size: 22 })),
        h('div', { className: 'folo-empty-title' }, title),
        hint ? h('div', { className: 'folo-empty-hint' }, hint) : null,
        action || null)
    }

    // -----------------------------------------------------------------------
    // Panel
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Settings dialog
    // -----------------------------------------------------------------------

    function SettingsDialog({ locale, onChange, onClose }) {
      const closeRef = useRef(null)
      useEffect(() => {
        closeRef.current?.focus()
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])

      const choices = [
        ['zh', translate('settings.zh')],
        ['en', translate('settings.en')],
        ['auto', translate('settings.auto')],
      ]

      return h('div', {
        className: 'folo-backdrop',
        onMouseDown: event => {
          if (event.target === event.currentTarget) onClose()
        },
      },
        h('div', { className: 'folo-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': translate('settings.title') },
          h('div', { className: 'folo-dialog-title' }, translate('settings.title')),
          h('div', { className: 'folo-settings-row' },
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'folo-settings-label' }, translate('settings.language')),
              h('div', { className: 'folo-settings-hint' }, translate('settings.languageHint'))),
            h('div', { className: 'folo-lang' },
              choices.map(([value, label]) => h('button', {
                key: value,
                type: 'button',
                className: value === locale ? 'is-active' : undefined,
                'aria-pressed': value === locale,
                onClick: () => onChange(value),
              }, label)))),
          h('div', { className: 'folo-dialog-foot' },
            h('button', { type: 'button', ref: closeRef, className: 'folo-btn', onClick: onClose }, translate('action.close')))))
    }

    // -----------------------------------------------------------------------
    // Panel
    // -----------------------------------------------------------------------

    const MIN_LIST_WIDTH = 300
    const MAX_LIST_WIDTH = 760
    const READER_MIN_WIDTH = 340

    function clampListWidth(width, containerWidth) {
      const available = Number.isFinite(containerWidth) && containerWidth > 0
        ? containerWidth - READER_MIN_WIDTH
        : MAX_LIST_WIDTH
      const upper = Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, available))
      return Math.round(Math.min(upper, Math.max(MIN_LIST_WIDTH, width)))
    }

    function Panel() {
      const narrow = useMediaQuery('(max-width: 820px)')
      const preference = useSyncExternalStore(prefs.subscribe, prefs.get, prefs.get)
      const [snapshot, setSnapshot] = useState(null)
      const [status, setStatus] = useState('loading')
      const [loadError, setLoadError] = useState('')
      const [view, setView] = useState({ kind: 'unread', feedId: '' })
      const [query, setQuery] = useState('')
      const [selectedId, setSelectedId] = useState('')
      const [article, setArticle] = useState(null)
      const [articleState, setArticleState] = useState('idle')
      const [busy, setBusy] = useState({ refresh: false, subscribe: false })
      const [dialog, setDialog] = useState(null)
      const [toast, setToast] = useState(null)
      const [mobilePane, setMobilePane] = useState('list')
      const [headerInset, setHeaderInset] = useState(0)
      const [listWidth, setListWidth] = useState(() => clampListWidth(prefs.get().listWidth || 380))
      const [dragging, setDragging] = useState(false)
      const [menuOpen, setMenuOpen] = useState(false)
      const headerRef = useRef(null)
      const rootRef = useRef(null)
      const menuRef = useRef(null)
      const listWidthRef = useRef(listWidth)
      const dragRef = useRef(null)
      listWidthRef.current = listWidth

      const notify = useCallback((message, kind = 'info') => {
        setToast({ message, kind, id: Date.now() })
      }, [])

      useEffect(() => {
        if (!toast) return undefined
        const timer = window.setTimeout(() => setToast(null), toast.kind === 'error' ? 5200 : 3200)
        return () => window.clearTimeout(timer)
      }, [toast])

      const updateSettings = useCallback(async patch => {
        prefs.set({ ...prefs.get(), ...patch })
        try {
          const result = await sendOperation('settings', patch)
          if (result && result.settings) prefs.set(result.settings)
        } catch {
          /* a preference that fails to persist is not worth interrupting reading */
        }
      }, [])

      const applySnapshot = useCallback(next => {
        if (!next || !next.ok) return
        setSnapshot(next)
        unreadCounter.set(next.stats ? next.stats.unread : 0)
      }, [])

      const load = useCallback(async () => {
        setStatus(current => (current === 'ready' ? current : 'loading'))
        try {
          applySnapshot(await fetchSnapshot())
          setStatus('ready')
          setLoadError('')
        } catch (error) {
          setStatus('error')
          setLoadError(errorText(error))
        }
      }, [applySnapshot])

      useEffect(() => {
        let cancelled = false
        load().then(() => {
          if (cancelled) return
        })
        return () => {
          cancelled = true
        }
      }, [load])

      // The stored preferences arrive with the first snapshot.
      const hydratedRef = useRef(false)
      useEffect(() => {
        if (hydratedRef.current || !snapshot || !snapshot.settings) return
        hydratedRef.current = true
        prefs.set(snapshot.settings)
        if (snapshot.settings.listWidth) {
          const width = clampListWidth(snapshot.settings.listWidth, rootRef.current?.getBoundingClientRect().width)
          listWidthRef.current = width
          setListWidth(width)
        }
      }, [snapshot])

      const feeds = snapshot?.feeds || []
      const entries = snapshot?.entries || []
      const feedsById = useMemo(() => new Map(feeds.map(feed => [feed.id, feed])), [feeds])

      const refresh = useCallback(async ({ silent = false, feedIds } = {}) => {
        if (!feeds.length) {
          if (!silent) notify(translate('toast.noFeeds'))
          return
        }
        setBusy(current => ({ ...current, refresh: true }))
        try {
          const result = await sendOperation('refresh', feedIds ? { feedIds } : {})
          if (result.snapshot) applySnapshot(result.snapshot)
          const failed = (result.results || []).filter(item => item.error)
          if (!silent) {
            notify(
              failed.length ? translate('toast.refreshFailed') : translate('toast.refreshed'),
              failed.length ? 'error' : 'info',
            )
          }
        } catch (error) {
          if (!silent) notify(errorText(error), 'error')
        } finally {
          setBusy(current => ({ ...current, refresh: false }))
        }
      }, [applySnapshot, feeds.length, notify])

      // Refresh stale libraries on open, then on a slow interval while visible.
      useEffect(() => {
        if (status !== 'ready' || !feeds.length) return undefined
        const lastFetched = snapshot?.stats?.lastFetchedAt || 0
        if (Date.now() - lastFetched > 10 * 60_000 && !busy.refresh) {
          refresh({ silent: true })
        }
        const timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') refresh({ silent: true })
        }, 10 * 60_000)
        return () => window.clearInterval(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [status, feeds.length])

      // Keep the panel title clear of the macOS window buttons.
      useLayoutEffect(() => {
        const element = headerRef.current
        if (!element) return undefined
        let last = -1
        const measure = () => {
          const rect = element.getBoundingClientRect()
          const overlaps = rect.top < TRAFFIC_LIGHT_BOTTOM && rect.left < TRAFFIC_LIGHT_RIGHT
          const needed = overlaps ? Math.max(0, Math.round(TRAFFIC_LIGHT_RIGHT - rect.left + 6)) : 0
          if (needed !== last) {
            last = needed
            setHeaderInset(needed)
          }
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(document.documentElement)
        if (element.parentElement) observer.observe(element.parentElement)
        window.addEventListener('resize', measure)
        return () => {
          observer.disconnect()
          window.removeEventListener('resize', measure)
        }
      }, [])

      // A narrower window must never squeeze the reader out of existence.
      useEffect(() => {
        const root = rootRef.current
        if (!root || typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(() => {
          const width = root.getBoundingClientRect().width
          setListWidth(current => {
            const next = clampListWidth(current, width)
            return next === current ? current : next
          })
        })
        observer.observe(root)
        return () => observer.disconnect()
      }, [])

      const filtered = useMemo(() => {
        let list = entries
        if (view.kind === 'unread') list = list.filter(entry => !entry.read)
        else if (view.kind === 'starred') list = list.filter(entry => entry.starred)
        else if (view.kind === 'feed') list = list.filter(entry => entry.feedId === view.feedId)
        const needle = query.trim().toLowerCase()
        if (needle) {
          list = list.filter(entry => (
            entry.title.toLowerCase().includes(needle)
            || entry.summary.toLowerCase().includes(needle)
            || (feedsById.get(entry.feedId)?.title || '').toLowerCase().includes(needle)
          ))
        }
        return list
      }, [entries, view, query, feedsById])

      // Group by day. Sorting first keeps the grouping monotonic, so a feed that
      // reports entries out of order still produces one heading per day.
      const grouped = useMemo(() => {
        const groups = []
        let current = null
        const ordered = [...filtered].sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
        for (const entry of ordered) {
          const key = new Date(entry.publishedAt || Date.now()).toDateString()
          if (!current || current.key !== key) {
            current = { key, label: dayHeading(entry.publishedAt, uiLocale()), items: [] }
            groups.push(current)
          }
          current.items.push(entry)
        }
        return groups
      }, [filtered, preference])

      const selectedEntry = useMemo(
        () => entries.find(entry => entry.id === selectedId) || null,
        [entries, selectedId],
      )

      const markRead = useCallback(async (ids, read) => {
        if (!ids.length) return
        try {
          const result = await sendOperation('read', { ids, read })
          if (result.snapshot) applySnapshot(result.snapshot)
        } catch {
          /* a failed read flag is not worth a toast */
        }
      }, [applySnapshot])

      const toggleStar = useCallback(async entry => {
        try {
          const result = await sendOperation('star', { ids: [entry.id], starred: !entry.starred })
          if (result.snapshot) applySnapshot(result.snapshot)
          notify(entry.starred ? translate('toast.unstarred') : translate('toast.starred'))
        } catch (error) {
          notify(errorText(error), 'error')
        }
      }, [applySnapshot, notify])

      // Load the article body for the selected entry.
      useEffect(() => {
        if (!selectedId) {
          setArticle(null)
          setArticleState('idle')
          return undefined
        }
        let cancelled = false
        setArticleState('loading')
        fetchEntry(selectedId)
          .then(entry => {
            if (cancelled) return
            setArticle({ ...entry, html: sanitizeHtml(entry.content || '') })
            setArticleState('ready')
          })
          .catch(() => {
            if (cancelled) return
            setArticle(null)
            setArticleState('error')
          })
        return () => {
          cancelled = true
        }
      }, [selectedId])

      // Opening an entry marks it read.
      useEffect(() => {
        if (!selectedEntry || selectedEntry.read) return
        markRead([selectedEntry.id], true)
      }, [selectedEntry, markRead])

      const selectEntry = useCallback(entry => {
        setSelectedId(entry.id)
        if (narrow) setMobilePane('reader')
      }, [narrow])

      const step = useCallback(direction => {
        if (filtered.length === 0) return
        const index = filtered.findIndex(entry => entry.id === selectedId)
        const nextIndex = index === -1
          ? 0
          : Math.min(filtered.length - 1, Math.max(0, index + direction))
        selectEntry(filtered[nextIndex])
      }, [filtered, selectedId, selectEntry])

      const onKeyDown = useCallback(event => {
        const tag = (event.target && event.target.tagName) || ''
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return
        if (dialog) return
        if (event.key === 'ArrowDown' || event.key === 'j') {
          event.preventDefault()
          step(1)
          return
        }
        if (event.key === 'ArrowUp' || event.key === 'k') {
          event.preventDefault()
          step(-1)
          return
        }
        if (event.key === 's' && selectedEntry) {
          event.preventDefault()
          toggleStar(selectedEntry)
          return
        }
        if (event.key === 'o' && selectedEntry?.link) {
          event.preventDefault()
          window.open(selectedEntry.link, '_blank', 'noopener,noreferrer')
        }
      }, [dialog, selectedEntry, step, toggleStar])

      const markAllRead = useCallback(async () => {
        try {
          const payload = view.kind === 'feed' && view.feedId ? { feedId: view.feedId } : {}
          const result = await sendOperation('read-all', payload)
          if (result.snapshot) applySnapshot(result.snapshot)
          notify(fill(translate('list.markAllConfirm'), { count: result.changed || 0 }))
        } catch (error) {
          notify(errorText(error), 'error')
        }
      }, [applySnapshot, notify, view])

      const unsubscribe = useCallback(async feed => {
        try {
          const result = await sendOperation('unsubscribe', { feedId: feed.id })
          if (result.snapshot) applySnapshot(result.snapshot)
          if (view.kind === 'feed' && view.feedId === feed.id) setView({ kind: 'unread', feedId: '' })
          notify(translate('toast.unsubscribed'))
        } catch (error) {
          notify(errorText(error), 'error')
        }
      }, [applySnapshot, notify, view])

      const subscribe = useCallback(async url => {
        setBusy(current => ({ ...current, subscribe: true }))
        try {
          const result = await sendOperation('subscribe', { url })
          if (result.snapshot) applySnapshot(result.snapshot)
          setDialog(null)
          if (result.duplicate) notify(translate('toast.alreadySubscribed'))
          else notify(fill(translate('toast.subscribed'), { title: result.title || url }))
          if (result.feedId) setView({ kind: 'feed', feedId: result.feedId })
        } catch (error) {
          throw new Error(errorText(error))
        } finally {
          setBusy(current => ({ ...current, subscribe: false }))
        }
      }, [applySnapshot, notify])

      const importOpmlText = useCallback(async text => {
        try {
          const result = await sendOperation('opml-import', { text })
          if (result.snapshot) applySnapshot(result.snapshot)
          setDialog(null)
          const added = (result.added || []).length
          notify(
            added ? fill(translate('toast.imported'), { count: added }) : translate('toast.importEmpty'),
            added ? 'info' : 'error',
          )
        } catch (error) {
          notify(errorText(error), 'error')
        }
      }, [applySnapshot, notify])

      const exportOpml = useCallback(async () => {
        try {
          const text = await fetchOpml()
          const blob = new Blob([text], { type: 'text/x-opml' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = 'dsh-folo-subscriptions.opml'
          anchor.click()
          window.setTimeout(() => URL.revokeObjectURL(url), 4000)
          notify(translate('toast.exported'))
        } catch (error) {
          notify(errorText(error), 'error')
        }
      }, [notify])

      // --- divider dragging -------------------------------------------------

      const containerWidth = () => (rootRef.current ? rootRef.current.getBoundingClientRect().width : 0)

      const commitWidth = useCallback(next => {
        listWidthRef.current = next
        setListWidth(next)
        updateSettings({ listWidth: next })
      }, [updateSettings])

      const onSplitterDown = event => {
        if (event.button !== 0) return
        event.preventDefault()
        dragRef.current = { startX: event.clientX, startWidth: listWidthRef.current }
        setDragging(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }

      const onSplitterMove = event => {
        const drag = dragRef.current
        if (!drag) return
        const next = clampListWidth(drag.startWidth + (event.clientX - drag.startX), containerWidth())
        if (next === listWidthRef.current) return
        listWidthRef.current = next
        setListWidth(next)
      }

      const onSplitterUp = event => {
        if (!dragRef.current) return
        dragRef.current = null
        setDragging(false)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        updateSettings({ listWidth: listWidthRef.current })
      }

      const onSplitterKey = event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const delta = (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 48 : 16)
        commitWidth(clampListWidth(listWidthRef.current + delta, containerWidth()))
      }

      // --- subscription menu ------------------------------------------------

      useEffect(() => {
        if (!menuOpen) return undefined
        const onDown = event => {
          const insideMenu = menuRef.current && menuRef.current.contains(event.target)
          const onButton = event.target && event.target.closest && event.target.closest('.folo-feedbtn')
          if (!insideMenu && !onButton) setMenuOpen(false)
        }
        const onKey = event => {
          if (event.key === 'Escape') setMenuOpen(false)
        }
        document.addEventListener('pointerdown', onDown, true)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onDown, true)
          document.removeEventListener('keydown', onKey)
        }
      }, [menuOpen])

      const unreadTotal = snapshot?.stats?.unread || 0
      const starredTotal = snapshot?.stats?.starred || 0

      const titleOfView = view.kind === 'feed'
        ? (feedsById.get(view.feedId)?.title || translate('nav.subscriptions'))
        : view.kind === 'starred'
          ? translate('nav.starred')
          : view.kind === 'all'
            ? translate('nav.all')
            : translate('nav.unread')

      // --- header -----------------------------------------------------------

      const header = h('header', {
        ref: headerRef,
        className: 'folo-header',
        style: headerInset ? { paddingLeft: 16 + headerInset } : undefined,
      },
        h('div', { className: 'folo-brand' },
          h('span', { className: 'folo-brand-mark' }, h(Icons.rss, { size: 15 })),
          h('span', { className: 'folo-brand-text' },
            h('span', { className: 'folo-brand-title' }, translate('panel.title')),
            h('span', { className: 'folo-brand-sub' }, snapshot
              ? `${snapshot.stats.feeds} ${translate('nav.subscriptions')} · ${unreadTotal} ${translate('nav.unread')}`
              : translate('panel.subtitle')))),
        h('div', { className: 'folo-header-main' },
          h('label', { className: 'folo-search' },
            h(Icons.search, { size: 14 }),
            h('input', {
              value: query,
              onChange: event => setQuery(event.target.value),
              placeholder: translate('action.search'),
              'aria-label': translate('action.search'),
              spellCheck: false,
            }),
            query
              ? h('button', {
                type: 'button',
                className: 'folo-search-clear',
                title: translate('action.clearSearch'),
                onClick: () => setQuery(''),
              }, h(Icons.close, { size: 12 }))
              : null),
          h('button', {
            type: 'button',
            className: 'folo-iconbtn',
            title: translate('action.refresh'),
            'aria-label': translate('action.refresh'),
            disabled: busy.refresh || !feeds.length,
            onClick: () => refresh(),
          }, h(Icons.refresh, { size: 15, className: busy.refresh ? 'folo-spin' : undefined })),
          h('button', {
            type: 'button',
            className: 'folo-iconbtn',
            title: translate('action.settings'),
            'aria-label': translate('action.settings'),
            onClick: () => setDialog('settings'),
          }, h(Icons.gear, { size: 15 })),
          h('button', {
            type: 'button',
            className: 'folo-btn folo-btn-primary',
            onClick: () => setDialog('add'),
          }, h(Icons.plus, { size: 14 }), translate('nav.addFeed'))))

      // --- toolbar: view tabs and the subscription picker --------------------

      const tab = (kind, label, count) => h('button', {
        key: kind,
        type: 'button',
        className: `folo-tab${view.kind === kind ? ' is-active' : ''}`,
        'aria-pressed': view.kind === kind,
        onClick: () => {
          setView({ kind, feedId: '' })
          setMobilePane('list')
        },
      },
        h('span', null, label),
        count ? h('span', { className: 'folo-tab-count' }, count) : null)

      const activeFeed = view.kind === 'feed' ? feedsById.get(view.feedId) : null
      const feedButtonLabel = activeFeed ? activeFeed.title : translate('toolbar.allFeeds')

      const menuRow = (key, icon, label, count, active, onSelect, trailing) => h('div', {
        key,
        className: `folo-menu-row${active ? ' is-active' : ''}`,
        role: 'button',
        tabIndex: 0,
        onClick: onSelect,
        onKeyDown: event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onSelect()
        },
      },
        icon ? h('span', { className: 'folo-nav-row-icon' }, h(icon, { size: 15 })) : null,
        h('span', { className: 'folo-feedbtn-name' }, label),
        trailing || null,
        h(Count, { value: count }))

      const subscriptionMenu = menuOpen
        ? h('div', { className: 'folo-menu', ref: menuRef, role: 'menu', 'aria-label': translate('action.feeds') },
          h('div', { className: 'folo-menu-label' }, translate('nav.subscriptions')),
          h('div', { className: 'folo-menu-scroll' },
            menuRow(
              'all',
              Icons.library,
              translate('toolbar.allFeeds'),
              unreadTotal,
              view.kind === 'all' || view.kind === 'unread' || view.kind === 'starred',
              () => {
                setView({ kind: 'unread', feedId: '' })
                setMenuOpen(false)
              },
            ),
            feeds.length === 0
              ? h('div', {
                className: 'folo-menu-label',
                style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400 },
              }, translate('nav.empty'))
              : feeds.map(feed => menuRow(
                feed.id,
                () => h(FeedBadge, { id: feed.id, title: feed.title, size: 15 }),
                feed.title,
                feed.unread,
                view.kind === 'feed' && view.feedId === feed.id,
                () => {
                  setView({ kind: 'feed', feedId: feed.id })
                  setMenuOpen(false)
                },
                h('span', { className: 'folo-feed-actions', style: { display: 'flex' } },
                  feed.error
                    ? h('span', { className: 'folo-feed-action folo-feed-error', title: translate(`error.${feed.errorCode || 'unknown'}`) }, h(Icons.dot, { size: 11 }))
                    : null,
                  h('button', {
                    type: 'button',
                    className: 'folo-feed-action',
                    title: translate('action.refresh'),
                    onClick: event => {
                      event.stopPropagation()
                      refresh({ feedIds: [feed.id] })
                    },
                  }, h(Icons.refresh, { size: 12 })),
                  h('button', {
                    type: 'button',
                    className: 'folo-feed-action',
                    title: translate('action.unsubscribe'),
                    onClick: event => {
                      event.stopPropagation()
                      unsubscribe(feed)
                    },
                  }, h(Icons.trash, { size: 12 })))))),
          h('div', { className: 'folo-menu-sep' }),
          h('div', { className: 'folo-menu-actions' },
            menuRow('add', Icons.plus, translate('nav.addFeed'), 0, false, () => {
              setMenuOpen(false)
              setDialog('add')
            }),
            menuRow('import', Icons.upload, translate('nav.importOpml'), 0, false, () => {
              setMenuOpen(false)
              setDialog('import')
            }),
            menuRow('export', Icons.download, translate('nav.exportOpml'), 0, false, () => {
              setMenuOpen(false)
              exportOpml()
            })),
          snapshot?.stats?.lastFetchedAt
            ? h('div', {
              className: 'folo-menu-label',
              style: { textTransform: 'none', letterSpacing: 0, fontWeight: 400, paddingTop: 4 },
            }, fill(translate('state.updated'), { when: relativeTime(snapshot.stats.lastFetchedAt, uiLocale()) }))
            : null)
        : null

      const toolbar = h('div', { className: 'folo-toolbar' },
        h('div', { className: 'folo-tabs' },
          tab('unread', translate('nav.unread'), unreadTotal),
          tab('all', translate('nav.all'), 0),
          tab('starred', translate('nav.starred'), starredTotal)),
        h('button', {
          type: 'button',
          className: 'folo-feedbtn',
          title: translate('action.feeds'),
          'aria-expanded': menuOpen,
          'aria-haspopup': 'menu',
          onClick: () => setMenuOpen(open => !open),
        },
          activeFeed
            ? h(FeedBadge, { id: activeFeed.id, title: activeFeed.title, size: 15 })
            : h(Icons.inbox, { size: 14 }),
          h('span', { className: 'folo-feedbtn-name' }, feedButtonLabel),
          h(Icons.chevron, { size: 13 })),
        subscriptionMenu)

      // --- entry list -------------------------------------------------------

      const listHead = h('div', { className: 'folo-list-head' },
        h('div', { style: { minWidth: 0 } },
          h('div', { className: 'folo-list-title' }, titleOfView),
          h('div', { className: 'folo-list-meta' }, fill(translate('list.count'), { count: filtered.length }))),
        h('button', {
          type: 'button',
          className: 'folo-iconbtn',
          title: translate('action.markAllRead'),
          'aria-label': translate('action.markAllRead'),
          disabled: !entries.some(entry => !entry.read && (view.kind !== 'feed' || entry.feedId === view.feedId)),
          onClick: markAllRead,
        }, h(Icons.check, { size: 15 })))

      const showListEmpty = filtered.length === 0
      const listEmpty = feeds.length === 0
        ? h(EmptyState, {
          icon: Icons.rss,
          title: translate('list.noFeeds'),
          hint: translate('list.noFeedsHint'),
          action: h('button', {
            type: 'button',
            className: 'folo-btn folo-btn-primary',
            style: { marginTop: 4 },
            onClick: () => setDialog('add'),
          }, h(Icons.plus, { size: 13 }), translate('action.addFirstFeed')),
        })
        : query.trim()
          ? h(EmptyState, { icon: Icons.search, title: translate('list.noMatch'), hint: translate('list.noMatchHint') })
          : h(EmptyState, { icon: Icons.inbox, title: translate('list.empty'), hint: translate('list.emptyHint') })

      const entryRow = entry => {
        const feed = feedsById.get(entry.feedId)
        return h('div', {
          key: entry.id,
          className: [
            'folo-item',
            entry.read ? 'is-read' : '',
            entry.starred ? 'is-starred' : '',
            entry.id === selectedId ? 'is-active' : '',
          ].filter(Boolean).join(' '),
          role: 'button',
          tabIndex: 0,
          onClick: () => selectEntry(entry),
          onKeyDown: event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            selectEntry(entry)
          },
        },
          h('div', { className: 'folo-item-top' },
            !entry.read ? h('span', { className: 'folo-item-unread', 'aria-hidden': 'true' }) : null,
            h('span', { className: 'folo-item-feed' }, feed ? feed.title : ''),
            h('span', { className: 'folo-item-sep' }, '·'),
            h('span', null, relativeTime(entry.publishedAt, uiLocale()))),
          h('div', { className: 'folo-item-body' },
            h('div', { className: 'folo-item-text' },
              h('div', { className: 'folo-item-title' }, entry.title),
              entry.summary
                ? h('div', { className: 'folo-item-summary' }, entry.summary)
                : null),
            entry.image
              ? h('img', {
                className: 'folo-item-thumb',
                src: entry.image,
                alt: '',
                loading: 'lazy',
                onError: event => {
                  event.currentTarget.style.display = 'none'
                },
              })
              : null),
          h('button', {
            type: 'button',
            className: 'folo-item-star',
            title: entry.starred ? translate('action.unstar') : translate('action.star'),
            'aria-pressed': entry.starred,
            onClick: event => {
              event.stopPropagation()
              toggleStar(entry)
            },
          }, h(StarGlyph, { filled: entry.starred, size: 13 })))
      }

      const listScroll = h('div', { className: 'folo-scroll' },
        showListEmpty
          ? listEmpty
          : grouped.map(group => h('div', { key: group.key },
            h('div', { className: 'folo-day' }, group.label),
            group.items.map(entryRow))))

      // --- reader -----------------------------------------------------------

      const readerActions = selectedEntry
        ? h('div', { className: 'folo-reader-actions' },
          h('button', {
            type: 'button',
            className: `folo-iconbtn${selectedEntry.starred ? ' is-on' : ''}`,
            title: selectedEntry.starred ? translate('action.unstar') : translate('action.star'),
            'aria-pressed': selectedEntry.starred,
            onClick: () => toggleStar(selectedEntry),
            style: selectedEntry.starred ? { color: 'var(--dsw-alias-state-warn-primary)' } : undefined,
          }, h(StarGlyph, { filled: selectedEntry.starred, size: 15 })),
          h('button', {
            type: 'button',
            className: 'folo-iconbtn',
            title: selectedEntry.read ? translate('action.markUnread') : translate('action.markRead'),
            onClick: () => markRead([selectedEntry.id], !selectedEntry.read),
          }, h(Icons.mail, { size: 15 })),
          selectedEntry.link
            ? h('button', {
              type: 'button',
              className: 'folo-iconbtn',
              title: translate('action.openOriginal'),
              onClick: () => window.open(selectedEntry.link, '_blank', 'noopener,noreferrer'),
            }, h(Icons.external, { size: 15 }))
            : null)
        : null

      const readerHead = h('div', { className: 'folo-reader-head' },
        narrow
          ? h('button', {
            type: 'button',
            className: 'folo-iconbtn',
            title: translate('action.back'),
            onClick: () => setMobilePane('list'),
          }, h(Icons.back, { size: 16 }))
          : null,
        h('span', { className: 'folo-list-meta' }, selectedEntry ? relativeTime(selectedEntry.publishedAt, uiLocale()) : ''),
        readerActions)

      const articleBody = (() => {
        if (!selectedEntry) {
          return h(EmptyState, { icon: Icons.rss, title: translate('reader.empty'), hint: translate('reader.emptyHint') })
        }
        if (articleState === 'loading') {
          return h(EmptyState, { icon: Icons.refresh, title: translate('reader.loading') })
        }
        if (articleState === 'error') {
          return h(EmptyState, { icon: Icons.close, title: translate('reader.error') })
        }
        const feed = feedsById.get(selectedEntry.feedId)
        return h('div', { className: 'folo-scroll' },
          h('article', { className: 'folo-article' },
            h('h1', { className: 'folo-article-title' }, selectedEntry.title),
            h('div', { className: 'folo-article-meta' },
              h('span', { className: 'folo-article-feed' },
                h(FeedBadge, { id: selectedEntry.feedId, title: feed ? feed.title : '', size: 15 }),
                feed ? feed.title : ''),
              h('span', { className: 'folo-article-sep' }, '·'),
              h('span', null, new Date(selectedEntry.publishedAt || Date.now()).toLocaleString(uiLocale(), {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })),
              selectedEntry.author
                ? h('span', { className: 'folo-article-sep' }, '·')
                : null,
              selectedEntry.author
                ? h('span', null, fill(translate('reader.byAuthor'), { author: selectedEntry.author }))
                : null),
            article && article.html
              ? h('div', {
                className: 'folo-article-content',
                dangerouslySetInnerHTML: { __html: article.html },
              })
              : h('div', { className: 'folo-empty-hint', style: { fontSize: 13 } },
                translate('reader.noContent'),
                selectedEntry.link
                  ? h('div', { style: { marginTop: 10 } },
                    h('button', {
                      type: 'button',
                      className: 'folo-btn',
                      onClick: () => window.open(selectedEntry.link, '_blank', 'noopener,noreferrer'),
                    }, h(Icons.external, { size: 13 }), translate('action.openOriginal')))
                  : null)))
      })()

      const reader = h('section', {
        className: 'folo-reader',
        'aria-label': translate('panel.subtitle'),
      },
        readerHead,
        articleBody)

      // --- divider ----------------------------------------------------------

      const splitter = narrow
        ? null
        : h('div', {
          className: `folo-splitter${dragging ? ' is-active' : ''}`,
          role: 'separator',
          'aria-orientation': 'vertical',
          'aria-label': translate('splitter.label'),
          'aria-valuenow': listWidth,
          'aria-valuemin': MIN_LIST_WIDTH,
          'aria-valuemax': MAX_LIST_WIDTH,
          tabIndex: 0,
          title: translate('splitter.hint'),
          onPointerDown: onSplitterDown,
          onPointerMove: onSplitterMove,
          onPointerUp: onSplitterUp,
          onPointerCancel: onSplitterUp,
          onKeyDown: onSplitterKey,
        })

      // --- overlays ---------------------------------------------------------

      return h('div', {
        className: `folo-root${dragging ? ' is-dragging' : ''}`,
        ref: rootRef,
        tabIndex: -1,
        onKeyDown,
      },
        h('style', null, STYLES),
        header,
        h('div', { className: 'folo-body' },
          narrow && mobilePane === 'reader'
            ? null
            : h('div', {
              className: 'folo-listcol',
              style: narrow ? { width: '100%' } : { width: listWidth },
            }, toolbar, listHead, listScroll),
          splitter,
          narrow && mobilePane !== 'reader' ? null : reader),
        dialog === 'add'
          ? h(AddFeedDialog, {
            t: translate,
            busy: busy.subscribe,
            onCancel: () => setDialog(null),
            onSubmit: subscribe,
          })
          : null,
        dialog === 'import'
          ? h(ImportDialog, {
            t: translate,
            onCancel: () => setDialog(null),
            onText: importOpmlText,
          })
          : null,
        dialog === 'settings'
          ? h(SettingsDialog, {
            locale: preference.locale,
            onChange: value => updateSettings({ locale: value }),
            onClose: () => setDialog(null),
          })
          : null,
        toast
          ? h('div', { className: `folo-toast${toast.kind === 'error' ? ' is-error' : ''}`, role: 'status' },
            h('span', { className: 'folo-toast-icon' },
              toast.kind === 'error' ? h(Icons.close, { size: 13 }) : h(Icons.check, { size: 13 })),
            h('span', null, toast.message))
          : null,
        status === 'error' && loadError
          ? h('div', { className: 'folo-toast is-error', role: 'status' },
            h('span', { className: 'folo-toast-icon' }, h(Icons.close, { size: 13 })),
            h('span', null, loadError),
            h('button', {
              type: 'button',
              className: 'folo-btn folo-btn-ghost',
              style: { height: 22, padding: '0 8px' },
              onClick: load,
            }, translate('action.retry')))
          : null)
    }

    // -----------------------------------------------------------------------
    // Dialogs
    // -----------------------------------------------------------------------

    function AddFeedDialog({ t, busy, onCancel, onSubmit }) {
      const [value, setValue] = useState('')
      const [error, setError] = useState('')
      const inputRef = useRef(null)

      useEffect(() => {
        inputRef.current?.focus()
        const onKey = event => {
          if (event.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onCancel])

      const submit = async () => {
        if (busy) return
        const url = value.trim()
        if (!url) {
          setError(t('dialog.addPlaceholder'))
          return
        }
        setError('')
        try {
          await onSubmit(url)
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }

      return h('div', {
        className: 'folo-backdrop',
        onMouseDown: event => {
          if (event.target === event.currentTarget) onCancel()
        },
      },
        h('div', { className: 'folo-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('dialog.addTitle') },
          h('div', { className: 'folo-dialog-title' }, t('dialog.addTitle')),
          h('div', { className: 'folo-dialog-hint' }, t('dialog.addHint')),
          h('div', { className: 'folo-field' },
            h('input', {
              ref: inputRef,
              value,
              placeholder: t('dialog.addPlaceholder'),
              spellCheck: false,
              onChange: event => setValue(event.target.value),
              onKeyDown: event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              },
            })),
          error ? h('div', { className: 'folo-error-text' }, error) : null,
          h('div', { className: 'folo-dialog-foot' },
            h('button', { type: 'button', className: 'folo-btn', onClick: onCancel }, t('action.cancel')),
            h('button', {
              type: 'button',
              className: 'folo-btn folo-btn-primary',
              disabled: busy,
              onClick: submit,
            }, busy ? t('action.refreshing') : t('action.subscribe')))))
    }

    function ImportDialog({ t, onCancel, onText }) {
      const inputRef = useRef(null)

      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onCancel])

      return h('div', {
        className: 'folo-backdrop',
        onMouseDown: event => {
          if (event.target === event.currentTarget) onCancel()
        },
      },
        h('div', { className: 'folo-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('dialog.importTitle') },
          h('div', { className: 'folo-dialog-title' }, t('dialog.importTitle')),
          h('div', { className: 'folo-dialog-hint' }, t('dialog.importHint')),
          h('input', {
            ref: inputRef,
            type: 'file',
            accept: '.opml,.xml,text/xml,application/xml,text/x-opml',
            style: { display: 'none' },
            onChange: async event => {
              const file = event.target.files && event.target.files[0]
              if (!file) return
              onText(await file.text())
            },
          }),
          h('div', { className: 'folo-dialog-foot' },
            h('button', { type: 'button', className: 'folo-btn', onClick: onCancel }, t('action.cancel')),
            h('button', {
              type: 'button',
              className: 'folo-btn folo-btn-primary',
              onClick: () => inputRef.current?.click(),
            }, h(Icons.upload, { size: 13 }), t('dialog.importButton')))))
    }

    // -----------------------------------------------------------------------
    // Sidebar entry
    // -----------------------------------------------------------------------

    function SidebarIcon({ size }) {
      const unread = useSyncExternalStore(unreadCounter.subscribe, unreadCounter.get, unreadCounter.get)
      const dimension = typeof size === 'number' ? size : 20
      return h('span', {
        style: {
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: dimension,
          height: dimension,
        },
        title: unread ? fill(translate('state.unreadBadge'), { count: unread }) : translate('panel.title'),
      },
        h(Icons.rss, { size: Math.round(dimension * 0.86) }),
        unread
          ? h('span', {
            style: {
              position: 'absolute',
              top: -1,
              right: -1,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--dsw-alias-brand-primary)',
              boxShadow: '0 0 0 2px var(--dsw-alias-bg-base)',
            },
            'aria-hidden': 'true',
          })
          : null)
    }

    // -----------------------------------------------------------------------
    // Module
    // -----------------------------------------------------------------------

    return {
      name: NAMESPACE,
      inject: ['slots', 'locale'],
      apply(ctx) {
        // The reader defaults to Chinese and can follow the Harness instead;
        // `auto` needs the live Harness locale, so read it lazily.
        harnessLocale = () => {
          try {
            return ctx.locale.getLocale().active || 'en'
          } catch {
            return 'en'
          }
        }

        for (const [localeKey, dictionary] of Object.entries(DICTIONARIES)) {
          ctx.effect(
            () => ctx.locale.register(NAMESPACE, localeKey, dictionary),
            `dsh-folo: locale ${localeKey}`,
          )
        }

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_KEY,
          locale: NAMESPACE,
        }, Panel))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_KEY,
          order: 15,
          label: () => translate('panel.title'),
          locale: NAMESPACE,
        }, SidebarIcon))
      },
    }
  },
})
