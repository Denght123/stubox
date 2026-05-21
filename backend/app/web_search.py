from __future__ import annotations

import asyncio
import html
import re
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urldefrag, urljoin, urlparse

import httpx

from .config import settings
from .schemas import ChatMessage


SCHOOL_QUERY_KEYWORDS = {
    "河北水利电力学院",
    "水利电力学院",
    "学校",
    "地址",
    "位置",
    "校址",
    "沧州",
    "联系方式",
    "电话",
    "招生",
    "录取",
    "分数",
    "投档",
    "调档",
    "章程",
    "计划",
    "专业",
    "院系",
    "学费",
    "住宿",
    "宿舍",
    "食堂",
    "校区",
    "校园",
    "报到",
    "入学",
    "奖学金",
    "助学金",
    "转专业",
    "就业",
    "升学",
    "水利",
    "电力",
    "电气",
    "自动化",
    "土木",
    "工程",
    "建筑",
    "机械",
    "计算机",
    "软件",
    "数据",
    "智能",
    "新能源",
    "物联网",
    "交通",
    "测绘",
    "会计",
    "财务",
    "商务",
}

CASUAL_PATTERNS = (
    re.compile(r"^\s*(你好|您好|hello|hi|在吗|谢谢|感谢|好的|ok|OK)[。！？!\s]*$"),
)

OFF_TOPIC_KEYWORDS = {
    "明星",
    "电影",
    "电视剧",
    "股票",
    "基金",
    "彩票",
    "游戏攻略",
    "政治",
    "军事",
}

OFFICIAL_SEARCH_SEEDS = (
    "https://zsb.hbwe.edu.cn/",
    "https://zsb.hbwe.edu.cn/zyjs.htm",
    "https://www.hbwe.edu.cn/",
    "https://www.hbwe.edu.cn/xxgkw/",
)

GENERIC_QUERY_TERMS = {
    "河北水利电力学院",
    "水利电力学院",
    "请问",
    "一下",
    "了解",
    "介绍",
    "相关",
    "情况",
    "哪些",
    "什么",
}


@dataclass(frozen=True)
class WebSource:
    title: str
    url: str
    snippet: str
    content: str = ""


@dataclass(frozen=True)
class WebSearchResult:
    query: str
    used: bool
    sources: list[WebSource]
    error: str = ""


class _VisibleTextParser(HTMLParser):
    _skip_tags = {"script", "style", "noscript", "svg", "canvas", "iframe"}
    _block_tags = {
        "article",
        "section",
        "main",
        "div",
        "p",
        "br",
        "li",
        "tr",
        "td",
        "th",
        "h1",
        "h2",
        "h3",
        "h4",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._skip_tags:
            self._skip_depth += 1
            return
        if self._skip_depth == 0 and tag in self._block_tags:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._skip_tags and self._skip_depth > 0:
            self._skip_depth -= 1
            return
        if self._skip_depth == 0 and tag in self._block_tags:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            text = data.strip()
            if text:
                self._parts.append(text)

    def text(self) -> str:
        text = html.unescape(" ".join(self._parts))
        text = re.sub(r"[ \t\r\f\v]+", " ", text)
        text = re.sub(r"\n\s*\n+", "\n", text)
        return text.strip()


class _PageParser(_VisibleTextParser):
    def __init__(self, base_url: str) -> None:
        super().__init__()
        self.base_url = base_url
        self.title = ""
        self._in_title = False
        self._active_href = ""
        self._active_text: list[str] = []
        self._links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        super().handle_starttag(tag, attrs)

        if tag == "title":
            self._in_title = True
            return

        if tag == "a":
            attr_map = dict(attrs)
            href = attr_map.get("href") or ""
            url = _normalize_url(href, self.base_url)
            if url:
                self._active_href = url
                self._active_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

        if tag == "a" and self._active_href:
            label = _clean_text("".join(self._active_text), 120)
            self._links.append((self._active_href, label))
            self._active_href = ""
            self._active_text = []

        super().handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        super().handle_data(data)

        if self._in_title:
            self.title += data.strip()

        if self._active_href:
            self._active_text.append(data)

    def links(self) -> list[tuple[str, str]]:
        seen: set[str] = set()
        result: list[tuple[str, str]] = []
        for url, label in self._links:
            if url in seen:
                continue
            seen.add(url)
            result.append((url, label))
        return result


def should_use_web_search(messages: list[ChatMessage]) -> bool:
    if not settings.web_search_enabled or not messages:
        return False

    question = messages[-1].content.strip()
    if not question:
        return False

    if any(pattern.match(question) for pattern in CASUAL_PATTERNS):
        return False

    has_school_signal = any(keyword in question for keyword in SCHOOL_QUERY_KEYWORDS)
    has_off_topic_signal = any(keyword in question for keyword in OFF_TOPIC_KEYWORDS)
    return has_school_signal and not (has_off_topic_signal and not has_school_signal)


def build_search_query(question: str) -> str:
    cleaned = re.sub(r"\s+", " ", question).strip()
    cleaned = cleaned[:120]
    return f"site:hbwe.edu.cn 河北水利电力学院 {cleaned}"


def _normalize_url(url: str, base_url: str = "") -> str:
    if not url or url.startswith(("javascript:", "mailto:", "tel:")):
        return ""

    absolute = urljoin(base_url, url.strip())
    absolute = urldefrag(absolute).url
    parsed = urlparse(absolute)
    if parsed.scheme not in {"http", "https"}:
        return ""
    if not _is_allowed_official_url(absolute):
        return ""
    return absolute


def _is_allowed_official_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower().split(":")[0]
    if not host:
        return False
    return any(host == domain or host.endswith(f".{domain}") for domain in settings.web_search_official_domains)


def _clean_text(value: str, limit: int = 260) -> str:
    value = html.unescape(value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit]


def _query_terms(question: str) -> list[str]:
    terms: list[str] = []
    for keyword in sorted(SCHOOL_QUERY_KEYWORDS, key=len, reverse=True):
        if keyword in question and keyword not in GENERIC_QUERY_TERMS:
            terms.append(keyword)

    for item in re.findall(r"[\u3400-\u9fffA-Za-z0-9]{2,}", question):
        if item not in GENERIC_QUERY_TERMS:
            terms.append(item)

    seen: set[str] = set()
    deduped: list[str] = []
    for term in terms:
        if term in seen:
            continue
        seen.add(term)
        deduped.append(term)

    return deduped or ["招生", "专业"]


def _source_score(source: WebSource, terms: list[str]) -> int:
    title = source.title.lower()
    body = f"{source.snippet} {source.content}".lower()
    url = source.url.lower()

    score = 0
    for term in terms:
        term_lower = term.lower()
        if term_lower in title:
            score += 5
        if term_lower in body:
            score += 3
        if term_lower in url:
            score += 1

    if "zsb.hbwe.edu.cn" in url:
        score += 2
    if any(marker in url for marker in ("zyjs", "zszc", "zs", "xxgk")):
        score += 1
    return score


async def _search_bing(client: httpx.AsyncClient, query: str, max_results: int) -> list[WebSource]:
    response = await client.get(
        "https://cn.bing.com/search",
        params={"q": query, "format": "rss", "setlang": "zh-Hans", "cc": "cn"},
        follow_redirects=True,
    )
    response.raise_for_status()

    try:
        root = ET.fromstring(response.text)
    except ET.ParseError:
        return []

    sources: list[WebSource] = []
    seen_urls: set[str] = set()
    for item in root.findall(".//item"):
        title = _clean_text(item.findtext("title") or "", 120)
        url = (item.findtext("link") or "").strip()
        snippet = _clean_text(item.findtext("description") or "")
        if not title or not url or url in seen_urls:
            continue
        if not _is_allowed_official_url(url):
            continue
        seen_urls.add(url)
        sources.append(WebSource(title=title, url=url, snippet=snippet))
        if len(sources) >= max_results:
            break
    return sources


async def _fetch_page_summary(client: httpx.AsyncClient, url: str, fallback_title: str = "") -> tuple[WebSource | None, list[tuple[str, str]]]:
    try:
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()
    except httpx.HTTPError:
        return None, []

    if not _is_allowed_official_url(str(response.url)):
        return None, []

    content_type = response.headers.get("content-type", "").lower()
    if "html" not in content_type and "text" not in content_type:
        return (
            WebSource(
                title=fallback_title or str(response.url),
                url=str(response.url),
                snippet="学校官方附件或非网页资料。",
            ),
            [],
        )

    parser = _PageParser(str(response.url))
    try:
        parser.feed(response.text)
    except Exception:
        return None, []

    content = parser.text()
    title = _clean_text(parser.title or fallback_title or str(response.url), 120)
    source = WebSource(
        title=title,
        url=str(response.url),
        snippet=_clean_text(content, 300),
        content=content[:1800],
    )
    return source, parser.links()


async def _fetch_source_content(client: httpx.AsyncClient, source: WebSource) -> WebSource:
    if re.search(r"\.(pdf|doc|docx|xls|xlsx)(?:$|\?)", source.url, re.IGNORECASE):
        return source

    try:
        response = await client.get(source.url, follow_redirects=True)
        response.raise_for_status()
    except httpx.HTTPError:
        return source

    content_type = response.headers.get("content-type", "").lower()
    if "html" not in content_type and "text" not in content_type:
        return source

    parser = _PageParser(str(response.url))
    try:
        parser.feed(response.text)
    except Exception:
        return source

    content = parser.text()
    if not content:
        return source

    return WebSource(
        title=_clean_text(parser.title or source.title, 120),
        url=str(response.url),
        snippet=source.snippet,
        content=content[:1800],
    )


async def _search_official_site(client: httpx.AsyncClient, question: str, max_results: int) -> list[WebSource]:
    terms = _query_terms(question)
    seed_results = await asyncio.gather(
        *(_fetch_page_summary(client, url) for url in OFFICIAL_SEARCH_SEEDS),
        return_exceptions=True,
    )

    candidates: dict[str, WebSource] = {}
    linked_candidates: dict[str, WebSource] = {}

    for item in seed_results:
        if not isinstance(item, tuple):
            continue

        source, links = item
        if source:
            candidates[source.url] = source

        for url, label in links:
            if url in linked_candidates:
                continue
            linked_candidates[url] = WebSource(
                title=label or url,
                url=url,
                snippet=label,
            )

    ranked_links = sorted(
        linked_candidates.values(),
        key=lambda source: _source_score(source, terms),
        reverse=True,
    )
    top_links = [source for source in ranked_links if _source_score(source, terms) > 0][: max(max_results * 3, 8)]

    enriched = await asyncio.gather(
        *(_fetch_source_content(client, source) for source in top_links),
        return_exceptions=True,
    )
    for item, fallback in zip(enriched, top_links):
        source = item if isinstance(item, WebSource) else fallback
        candidates[source.url] = source

    ranked_sources = sorted(
        candidates.values(),
        key=lambda source: _source_score(source, terms),
        reverse=True,
    )
    return [source for source in ranked_sources if _source_score(source, terms) > 0][:max_results]


async def search_official_web(question: str) -> WebSearchResult:
    if not settings.web_search_enabled:
        return WebSearchResult(query="", used=False, sources=[])

    query = build_search_query(question)
    timeout = httpx.Timeout(
        timeout=settings.web_search_timeout_seconds,
        connect=settings.connect_timeout_seconds,
        read=settings.web_fetch_timeout_seconds,
        write=settings.connect_timeout_seconds,
        pool=settings.connect_timeout_seconds,
    )
    headers = {
        "User-Agent": settings.web_search_user_agent,
        "Accept": "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.4",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
            try:
                sources = await _search_bing(client, query, settings.web_search_max_results)
            except httpx.HTTPError:
                sources = []

            if not sources:
                sources = await _search_official_site(client, question, settings.web_search_max_results)

            if not sources:
                return WebSearchResult(query=query, used=True, sources=[])

            enriched = await asyncio.gather(
                *(_fetch_source_content(client, source) for source in sources),
                return_exceptions=True,
            )
    except httpx.HTTPError as exc:
        return WebSearchResult(query=query, used=True, sources=[], error=exc.__class__.__name__)

    final_sources: list[WebSource] = []
    for item, fallback in zip(enriched, sources):
        if isinstance(item, WebSource):
            final_sources.append(item)
        else:
            final_sources.append(fallback)

    return WebSearchResult(query=query, used=True, sources=final_sources)


def compact_sources_for_client(sources: Iterable[WebSource]) -> list[dict[str, str]]:
    return [
        {
            "title": source.title,
            "url": source.url,
            "snippet": source.snippet,
        }
        for source in sources
    ]


def format_web_context(result: WebSearchResult) -> str:
    if not result.sources:
        return (
            "## 本轮联网搜索结果\n"
            f"检索关键词：{result.query or '未执行'}\n"
            "未检索到可用于回答的学校官方网页资料。请不要编造具体数据；如果问题涉及最新政策、分数线、计划数、费用或时间安排，请说明以学校官网、招生信息网和当年官方通知为准。"
        )

    lines = [
        "## 本轮联网搜索资料",
        f"检索关键词：{result.query}",
        "请只把下列学校官方网页资料作为可引用依据；如果资料不足，请明确说明未查到官方明确口径，不要自行补全数字、日期或政策细节。",
    ]

    for index, source in enumerate(result.sources, start=1):
        excerpt = source.content or source.snippet or "无正文摘录"
        lines.append(
            "\n".join(
                [
                    f"[{index}] 标题：{source.title}",
                    f"网址：{source.url}",
                    f"摘要：{source.snippet or '无摘要'}",
                    f"正文摘录：{excerpt[:1800]}",
                ]
            )
        )

    lines.append("回答末尾请用“信息来源”列出实际使用到的官方网页标题和网址。")
    return "\n\n".join(lines)
