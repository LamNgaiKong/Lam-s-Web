#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按《笔记 HTML 输出约定 v2》从 notes/**/*.md 生成 pages/**/*.html。

约定要点：
1. 手写批注 -> <aside class="handnote">，不再输出「（手写批注：…）」字样
2. 目录/章节列表 -> <ul class="toc">，每个 <li> 只放一个 <a>
3. <h2> 不带内联样式
4. 不写 <style> 块，样式统一由 assets/css/main.css 提供
5. 句内补充保留「（…）」原文，不写“手写批注”四个字
"""
import os
import re
import html as ihtml
import glob

ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
NOTES = os.path.join(ROOT, "fitness", "nutrition", "notes")
PAGES = os.path.join(ROOT, "fitness", "nutrition", "pages")

HEAD = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f7f8fa">
<meta name="description" content="{desc}">
<title>{title} · NSCA 运动营养指南 · Lam Ngai Kong</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%234f46e5'/%3E%3Ctext x='16' y='22' font-size='16' font-weight='bold' text-anchor='middle' fill='%23fff' font-family='Arial'%3ELK%3C/text%3E%3C/svg%3E">
<script>(function(){{var t=null;try{{t=localStorage.getItem('lam-web-theme');}}catch(e){{}}if(!t)t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);}})();</script>
<link rel="stylesheet" href="{css}">
<script src="{js}" defer></script>
</head>
<body data-page="fitness">
<a class="skip-link" href="#main">跳到正文</a>
<header class="topbar">
  <div class="topbar__inner">
    <a class="brand" href="{root}index.html"><span class="brand__mark">LK</span><span class="brand__text">Lam Ngai Kong</span></a>
    <button class="icon-btn nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="打开菜单"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <nav class="nav" id="site-nav" data-nav aria-label="站点导航">
      <a href="{root}index.html" data-nav-link="home">首页</a>
      <a href="{root}ai-learning/index.html" data-nav-link="ai">AI 学习</a>
      <a href="{fitness}index.html" data-nav-link="fitness">健身</a>
      <a href="{root}projects/index.html" data-nav-link="projects">项目</a>
    </nav>
    <div class="topbar__tools"><button class="icon-btn" type="button" data-theme-toggle aria-label="切换深浅色主题" title="切换主题"><svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg><svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.9 6.9 0 0 0 11.1 11.1z"/></svg></button></div>
  </div>
</header>
<main class="page" id="main">
  <section class="section container">
    <a class="backlink" href="{back_href}">{back_text}</a>
    <article class="note">
"""

TAIL = """    </article>
  </section>
</main>
<footer class="site-foot">
  <div class="site-foot__inner">
    <div class="site-foot__links"><a href="https://github.com/LamNgaiKong" target="_blank" rel="noopener">GitHub</a><a href="mailto:you@example.com">Email</a></div>
    <p>© <span data-year>2026</span> Lam Ngai Kong · 由 GitHub Pages 托管</p>
  </div>
</footer>
<button class="to-top" type="button" data-to-top aria-label="回到顶部" title="回到顶部"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg></button>
</body>
</html>
"""

HAND_RE = re.compile(r"^（手写批注：(.+)）$")


def inline(text):
    t = ihtml.escape(text, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<!!)\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    t = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r'<img src="\2" alt="\1" loading="lazy">', t)
    t = re.sub(r'href="(?!https?:|mailto:|#)([^"]+?)\.md"', r'href="\1.html"', t)
    # 句内手写批注（约定 5）：不出现“手写批注”字样，交给 .handnote-inline
    t = re.sub(r"（手写批注：(.+?)）", r'<span class="handnote-inline">\1</span>', t)
    return t


def convert(md):
    lines = md.split("\n")
    out = []
    i = 0
    n = len(lines)
    while i < n:
        raw = lines[i]
        line = raw.rstrip()
        if not line.strip():
            i += 1
            continue

        # 手写批注
        m = HAND_RE.match(line.strip())
        if m:
            out.append('<aside class="handnote">%s</aside>' % inline(m.group(1).strip()))
            i += 1
            continue

        # 表格
        if line.startswith("|"):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(lines[i].strip())
                i += 1
            cells = []
            for r in rows:
                if re.fullmatch(r"\|[\s\-:|]+\|", r):
                    continue
                cells.append([c.strip() for c in r.strip("|").split("|")])
            if cells:
                html = ['<div class="table-wrap">', "<table>"]
                html.append("<thead><tr>%s</tr></thead>" % "".join("<th>%s</th>" % inline(c) for c in cells[0]))
                html.append("<tbody>")
                for row in cells[1:]:
                    html.append("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in row))
                html.append("</tbody></table></div>")
                out.append("\n".join(html))
            continue

        # 标题
        if line.startswith("### "):
            out.append("<h3>%s</h3>" % inline(line[4:].strip()))
            i += 1
            continue
        if line.startswith("## "):
            out.append("<h2>%s</h2>" % inline(line[3:].strip()))
            i += 1
            continue
        if line.startswith("# "):
            out.append("<h1>%s</h1>" % inline(line[2:].strip()))
            i += 1
            continue

        # 分隔线
        if line.strip() == "---":
            out.append("<hr>")
            i += 1
            continue

        # 图片（独占一行）
        m = re.fullmatch(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if m:
            out.append('<figure><img src="%s" alt="%s" loading="lazy"></figure>' % (ihtml.escape(m.group(2)), ihtml.escape(m.group(1))))
            i += 1
            continue

        # 列表
        if re.match(r"^\s*[-*] ", line):
            items = []
            while i < n and re.match(r"^\s*[-*] ", lines[i]):
                items.append(re.sub(r"^\s*[-*] ", "", lines[i]).strip())
                i += 1
            only_links = all(re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", it) for it in items)
            cls = ' class="toc"' if only_links else ""
            out.append("<ul%s>%s</ul>" % (cls, "".join("<li>%s</li>" % inline(x) for x in items)))
            continue

        if re.match(r"^\s*\d+\. ", line):
            items = []
            while i < n and re.match(r"^\s*\d+\. ", lines[i]):
                items.append(re.sub(r"^\s*\d+\. ", "", lines[i]).strip())
                i += 1
            out.append("<ol>%s</ol>" % "".join("<li>%s</li>" % inline(x) for x in items))
            continue

        # 段落
        out.append("<p>%s</p>" % inline(line.strip()))
        i += 1

    return "\n".join(out)


def rel(from_dir, target):
    r = os.path.relpath(target, from_dir).replace("\\", "/")
    return r


def main():
    made = 0
    for md_path in sorted(glob.glob(os.path.join(NOTES, "**", "*.md"), recursive=True)):
        rel_md = os.path.relpath(md_path, NOTES)
        rel_html = os.path.splitext(rel_md)[0] + ".html"
        out_path = os.path.join(PAGES, rel_html)
        out_dir = os.path.dirname(out_path)
        os.makedirs(out_dir, exist_ok=True)

        md = open(md_path, encoding="utf-8").read()
        body = convert(md)

        title = os.path.splitext(os.path.basename(md_path))[0]
        if title == "index":
            title = os.path.basename(os.path.dirname(md_path))
        m = re.search(r"^# (.+)$", md, re.M)
        if m:
            title = m.group(1).strip()

        first_p = ""
        for l in md.split("\n"):
            if l.strip() and not l.startswith("#") and not l.startswith("-") and not l.startswith("!") and not l.startswith("|"):
                first_p = re.sub(r"[*`\[\]]", "", l.strip())[:60]
                break
        desc = "%s：NSCA《运动营养指南》学习笔记。" % title

        root_rel = rel(out_dir, ROOT).replace("\\", "/") + "/"
        fitness_rel = rel(out_dir, os.path.join(ROOT, "fitness")) + "/"
        css = rel(out_dir, os.path.join(ROOT, "assets", "css", "main.css")).replace("\\", "/")
        js = rel(out_dir, os.path.join(ROOT, "assets", "js", "main.js")).replace("\\", "/")

        if os.path.basename(md_path) == "index.md":
            parent_md = os.path.dirname(os.path.dirname(md_path))  # notes/ 下同层目录
            if os.path.normpath(parent_md) == os.path.normpath(NOTES):
                # 章级 index：返回营养指南首页
                back_href = rel(out_dir, os.path.join(ROOT, "fitness", "nutrition", "index.html")).replace("\\", "/")
                back_text = "← 返回运动营养指南"
            else:
                # 目录级 index：返回上一级在 pages/ 下的同名 index
                parent_rel_dir = os.path.relpath(parent_md, NOTES)
                back_href = rel(out_dir, os.path.join(PAGES, parent_rel_dir, "index.html")).replace("\\", "/")
                back_text = "← 返回%s" % os.path.basename(parent_md)
        else:
            back_href = "index.html"
            back_text = "← 返回%s" % os.path.basename(os.path.dirname(md_path))

        html = HEAD.format(desc=ihtml.escape(desc), title=ihtml.escape(title), css=css, js=js,
                           root=root_rel, fitness=fitness_rel,
                           back_href=back_href, back_text=back_text)
        html += body + "\n" + TAIL
        open(out_path, "w", encoding="utf-8").write(html)
        made += 1
    print("generated:", made)


if __name__ == "__main__":
    main()
