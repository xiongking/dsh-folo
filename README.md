# dsh-folo

An RSS reader panel for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), modelled on [Folo](https://app.folo.is/). It adds a sidebar entry that opens a three-pane reader: subscriptions on the left, entries in the middle, the article on the right.

- **Feed support** — RSS 2.0, RSS 1.0/RDF, and Atom, including CDATA, entities, and feeds served from either a feed URL or a website address that advertises one through `<link rel="alternate">`.
- **Three-pane reader** — subscriptions, entry list grouped by day, and an article view with sanitized HTML, absolute image links, and keyboard navigation (`↑`/`↓`, `j`/`k`, `s` to star, `o` to open the original).
- **State that survives restarts** — unread and starred flags live on the Host, so the sidebar badge and the panel agree after a restart.
- **Background refresh** — conditional `GET` (`ETag` / `Last-Modified`, `304` handling), four fetches at a time, a ten-minute refresh while the panel is open, and per-feed error reporting.
- **OPML in and out** — import a library from another reader, or export this one.
- **macOS window controls respected** — the panel header measures itself and insets its title and toolbar so they never sit under the traffic lights.

## Install

Clone this repository somewhere permanent, then install the directory as a local bundle:

1. Open **Plugins** in the sidebar.
2. Choose **Add** and point it at the cloned `dsh-folo` directory.
3. Enable it if it is not enabled already.

The bundle registers itself through `cordis.patch.yml`, so no manual edits to the profile's `package.json` or `cordis.patch.yml` are needed.

Reload the window after installing; the sidebar gains an RSS icon between **Schedules** and **Context**.

## Use

| Action | How |
| --- | --- |
| Add a feed | **Add feed** in the header, or the `+` beside **Subscriptions** |
| Read | Click an entry; it is marked read as it opens |
| Star | The star in the list row, the reader toolbar, or `s` |
| Mark everything read | The check button at the top of the list |
| Refresh | The refresh button, or the ↻ on a feed row |
| Import / export OPML | The buttons at the bottom of the subscriptions column |
| Search | The box in the header; it filters the current view |

Feeds are fetched by the Host, so the panel works whether or not the window has network access for that origin.

## Where data lives

```
$DSH_HOME/plugin-data/dsh-folo/state.json
```

The file is written atomically (temporary file plus rename) behind a serialized mutation queue. Deleting it resets the library. Each feed keeps its 300 most recent entries; starred entries are kept beyond that, up to 100.

## Layout

| File | Role |
| --- | --- |
| `index.js` | Host half: feed fetching, XML parsing, sanitizing, persistence, and the `/dsh-folo/api` routes |
| `client.js` | Client half: the React panel, the sidebar icon, and all styling |
| `cordis.patch.yml` | The bundle patch that registers the plugin |
| `locale/*.json` | Display metadata and the English and Chinese dictionaries |
| `icon.svg` | Plugin artwork shown by the Plugin Manager |

### HTTP API

All routes live under `/dsh-folo/api` and refuse cross-site callers (`Sec-Fetch-Site: cross-site`, or an `Origin` that does not match the Host).

| Route | Purpose |
| --- | --- |
| `GET /state` | Feeds, entry metadata, and counters; entry bodies are excluded |
| `GET /entry?id=` | One entry with its sanitized body |
| `POST /refresh` | Refresh every feed, or only `feedIds` |
| `POST /subscribe` | Add a feed by feed URL or site URL |
| `POST /read`, `/star`, `/read-all` | Update flags by entry id, or every entry in a feed |
| `POST /unsubscribe`, `/rename` | Manage the subscription list |
| `POST /opml-import`, `/opml-export` | Move a library in and out |

### Security notes

Feed HTML is sanitized on the Host with a tag and attribute allowlist before it is stored, and again on the Client with `DOMParser` before it is rendered: `<script>`, `<iframe>`, `<object>`, and other executable elements are dropped, `on*` handlers are removed, and `javascript:` URLs are stripped out. Links open with `rel="noreferrer noopener"`.

## Development

The plugin has no build step and no runtime dependencies — the Host half parses XML by hand so it never has to be bundled. Edit `index.js` or `client.js` and reload the window; the bundle is installed from this directory, so a reload picks up the change.

## 中文说明

这是一个参照 [Folo](https://app.folo.is/) 做的 DeepSeek Harness RSS 阅读器插件。左侧边栏会多出一个 RSS 图标，点开后是三栏界面：左边订阅源、中间按天分组的文章列表、右边正文。支持 RSS / RDF / Atom，支持填网址自动发现订阅源、OPML 导入导出、未读与收藏、每十分钟自动刷新，也能记住上次的阅读状态。

面板标题和工具栏会自动测量自己相对窗口的位置：一旦落在 macOS 交通灯按钮的区域内，就向右让开，因此不会被原生窗口按钮遮住。

数据保存在 `$DSH_HOME/plugin-data/dsh-folo/state.json`，删掉它就等于重置书库。

## License

MIT
