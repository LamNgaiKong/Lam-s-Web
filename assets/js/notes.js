/* ==========================================================================
   AI 知识库 · 交互脚本
   1) 主题切换（明/暗，跟随系统，本地记忆）
   2) 移动端目录抽屉
   3) 侧栏目录自动生成 + 滚动高亮
   4) 站内即时搜索（筛选 + 结果面板 + 文本高亮）
   5) 阅读进度条 / 回到顶部 / 标题锚点
   依赖：无。file:// 直接双击打开亦可正常工作。
   ========================================================================== */
(function () {
  'use strict';

  var THEME_KEY = 'lam-web-theme';
  var root = document.documentElement;
  var body = document.body;

  /* ------------------------------ 工具 ------------------------------ */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function on(el, type, fn, opts) { if (el) el.addEventListener(type, fn, opts || false); }
  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }
  function rafThrottle(fn) {
    var queued = false, lastArgs;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        fn.apply(null, lastArgs);
      });
    };
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* --------------------------- 1. 主题切换 --------------------------- */
  var mediaDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) {} }
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e1116' : '#f4f6f9');
    var btn = $('[data-theme-toggle]');
    if (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
      btn.setAttribute('title', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }
  function initTheme() {
    var theme = root.getAttribute('data-theme');
    if (!theme) {
      theme = storedTheme() || (mediaDark && mediaDark.matches ? 'dark' : 'light');
    }
    applyTheme(theme, false);
    var btn = $('[data-theme-toggle]');
    on(btn, 'click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });
    if (mediaDark && mediaDark.addEventListener) {
      mediaDark.addEventListener('change', function (e) {
        if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light', false);
      });
    }
  }

  /* ------------------------ 2. 移动端目录抽屉 ------------------------ */
  function initDrawer() {
    var toggle = $('[data-nav-toggle]');
    var scrim = $('[data-scrim]');
    var sidebar = $('[data-sidebar]');
    if (!toggle || !sidebar) return;

    function setOpen(open) {
      body.classList.toggle('is-nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        var first = sidebar.querySelector('a');
        if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 260);
      } else {
        toggle.focus({ preventScroll: true });
      }
    }
    on(toggle, 'click', function () { setOpen(!body.classList.contains('is-nav-open')); });
    on(scrim, 'click', function () { setOpen(false); });
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && body.classList.contains('is-nav-open')) setOpen(false);
    });
    // 点击目录内链接后自动收起
    on(sidebar, 'click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    // 断点切换时复位
    on(window, 'resize', debounce(function () {
      if (window.innerWidth > 1080 && body.classList.contains('is-nav-open')) {
        body.classList.remove('is-nav-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    }, 150));
  }

  /* --------------------- 3. 目录生成 + 滚动高亮 --------------------- */
  var TOC_SELECTOR = {
    main: 'h2, h3.h3',
    notes: 'h2, .part-title, .card > h3'
  };

  function slugify(text) {
    return String(text)
      .replace(/[（(].*?[)）]/g, ' ')
      .replace(/[^\w\u4e00-\u9fa5\- ]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'section';
  }

  function uniqueId(base) {
    var id = base, i = 2;
    while (document.getElementById(id)) { id = base + '-' + i++; }
    return id;
  }

  function headingLabel(el) {
    var clone = el.cloneNode(true);
    $$('.anchor-link, .badge, .tag, small, .en', clone).forEach(function (n) { n.remove(); });
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  function buildToc() {
    var mode = body.getAttribute('data-toc-mode');
    var selector = TOC_SELECTOR[mode];
    var list = $('[data-toc]');
    if (!selector || !list) return [];

    var scope = $('#main') || document;
    var currentSub = null;

    // 按文档顺序一次遍历：h2 / .part-title 为一级，其余为二级
    $$(selector, scope).forEach(function (heading) {
      var label = headingLabel(heading);
      if (!label) return;
      if (!heading.id) heading.id = uniqueId(slugify(label));

      var isTop = heading.tagName === 'H2' || heading.classList.contains('part-title');
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + heading.id;
      a.textContent = label;
      a.title = label;
      a.setAttribute('data-toc-target', heading.id);

      if (isTop) {
        li.appendChild(a);
        list.appendChild(li);
        currentSub = null;
      } else {
        if (!currentSub) {
          currentSub = document.createElement('li');
          currentSub.className = 'toc__sub';
          var ul = document.createElement('ul');
          ul.className = 'toc toc--plain';
          currentSub.appendChild(ul);
          list.appendChild(currentSub);
        }
        li.appendChild(a);
        currentSub.querySelector('ul').appendChild(li);
      }
    });

    return $$('[data-toc-target]', list).map(function (a) {
      return { el: document.getElementById(a.getAttribute('data-toc-target')) };
    }).filter(function (entry) { return entry.el; });
  }

  function initScrollSpy(entries) {
    if (!entries.length) return;
    var links = {};
    $$('[data-toc-target]').forEach(function (a) { links[a.getAttribute('data-toc-target')] = a; });
    var activeId = null;

    function setActive(id) {
      if (id === activeId) return;
      activeId = id;
      Object.keys(links).forEach(function (key) {
        links[key].classList.toggle('is-active', key === id);
        if (key === id) links[key].setAttribute('aria-current', 'location');
        else links[key].removeAttribute('aria-current');
      });
      var activeLink = links[id];
      if (activeLink && window.innerWidth <= 1080) return; // 抽屉内不滚动
      if (activeLink && activeLink.offsetParent) {
        var box = activeLink.closest('.sidebar');
        if (!box) return;
        var linkRect = activeLink.getBoundingClientRect();
        var boxRect = box.getBoundingClientRect();
        if (linkRect.top < boxRect.top + 8) box.scrollTop -= (boxRect.top + 8 - linkRect.top);
        else if (linkRect.bottom > boxRect.bottom - 8) box.scrollTop += (linkRect.bottom - boxRect.bottom + 8);
      }
    }

    var ticking = false;
    function update() {
      ticking = false;
      var offset = (parseInt(getComputedStyle(root).getPropertyValue('--topbar-h'), 10) || 62) + 40;
      var best = entries[0];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].el.getBoundingClientRect().top <= offset) best = entries[i];
        else break;
      }
      // 页面滚动到底部时，高亮最后一个
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        best = entries[entries.length - 1];
      }
      setActive(best.el.id);
    }
    on(window, 'scroll', rafThrottle(function () {
      if (ticking) return;
      ticking = true;
      update();
    }), { passive: true });
    on(window, 'resize', debounce(update, 150));
    update();
  }

  /* ---------------------------- 4. 搜索 ---------------------------- */
  function groupOf(el) {
    var holder = el.closest('[data-search-group]');
    if (holder) return (holder.getAttribute('data-search-group') || '').trim();

    var section = el.closest('section.board');
    if (section) {
      var h2 = section.querySelector('h2');
      if (h2) return h2.textContent.replace(/\s+/g, ' ').trim();
    }

    var node = el.previousElementSibling;
    while (node) {
      if (node.classList && node.classList.contains('part-title')) {
        return node.textContent.split(/[（(]/)[0].replace(/\s+/g, ' ').trim();
      }
      node = node.previousElementSibling;
    }
    return '';
  }

  function buildIndex() {
    var items = $$('[data-search-item]');
    return items.map(function (el) {
      var titleEl = el.querySelector('.js-hit, .name, h3, h4');
      var title = (titleEl ? titleEl.textContent : el.textContent).replace(/\s+/g, ' ').trim();
      if (!el.id) el.id = uniqueId('hit-' + slugify(title));
      return {
        el: el,
        id: el.id,
        title: title,
        group: groupOf(el),
        text: el.textContent.replace(/\s+/g, ' ').trim()
      };
    });
  }

  var markNodes = [];
  function clearMarks() {
    markNodes.forEach(function (m) {
      var parent = m.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(m.textContent), m);
      parent.normalize();
    });
    markNodes = [];
  }
  function markTerm(textNodes, term) {
    var lower = term.toLowerCase();
    textNodes.forEach(function (node) {
      var value = node.nodeValue;
      var idx = value.toLowerCase().indexOf(lower);
      if (idx < 0) return;
      var frag = document.createDocumentFragment();
      var pos = 0;
      while (idx >= 0) {
        if (idx > pos) frag.appendChild(document.createTextNode(value.slice(pos, idx)));
        var mark = document.createElement('mark');
        mark.textContent = value.slice(idx, idx + term.length);
        frag.appendChild(mark);
        markNodes.push(mark);
        pos = idx + term.length;
        idx = value.toLowerCase().indexOf(lower, pos);
      }
      if (pos < value.length) frag.appendChild(document.createTextNode(value.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function initSearch() {
    var form = $('[data-search-form]');
    var input = $('[data-search-input]');
    var panel = $('[data-search-panel]');
    var status = $('[data-search-status]');
    if (!input || !panel) return;
    if (!status) {
      status = document.createElement('div');
      status.className = 'search-status';
      status.setAttribute('data-search-status', '');
      var anchor = $('.page-head') || $('.board');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(status, anchor.nextSibling);
    }

    var index = buildIndex();
    var hits = [];
    var activeHit = -1;
    var term = '';

    function closePanel() {
      panel.hidden = true;
      panel.innerHTML = '';
      activeHit = -1;
    }

    function snippetFor(hit, needle) {
      var text = hit.text;
      var idx = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : 0;
      if (idx < 0) idx = 0;
      var start = Math.max(0, idx - 26);
      var end = Math.min(text.length, idx + needle.length + 62);
      return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    }

    function renderPanel(needle, matches) {
      panel.innerHTML = '';
      if (!needle) { closePanel(); return; }
      var meta = document.createElement('div');
      meta.className = 'search-panel__meta';
      meta.innerHTML = '<span>找到 ' + matches.length + ' 条结果</span><span>↑↓ 选择 · Enter 跳转 · Esc 关闭</span>';
      panel.appendChild(meta);

      if (!matches.length) {
        var empty = document.createElement('div');
        empty.className = 'search-panel__empty';
        empty.textContent = '没有匹配「' + needle + '」的内容，试试更短的关键词。';
        panel.appendChild(empty);
        panel.hidden = false;
        return;
      }

      var ul = document.createElement('ul');
      ul.className = 'search-panel__list';
      matches.slice(0, 30).forEach(function (hit, i) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + hit.id;
        a.setAttribute('role', 'option');
        a.dataset.index = String(i);

        var t = document.createElement('span');
        t.className = 'hit__title';
        t.textContent = hit.title.length > 48 ? hit.title.slice(0, 47) + '…' : hit.title;
        a.appendChild(t);

        if (hit.group) {
          var g = document.createElement('span');
          g.className = 'hit__meta';
          g.textContent = hit.group;
          a.appendChild(g);
        }
        var s = document.createElement('span');
        s.className = 'hit__snippet';
        s.textContent = snippetFor(hit, needle);
        a.appendChild(s);

        on(a, 'click', function () { closePanel(); flash(hit.el); });
        li.appendChild(a);
        ul.appendChild(li);
      });
      panel.appendChild(ul);
      panel.hidden = false;
      activeHit = -1;
    }

    function flash(el) {
      if (prefersReducedMotion() || !el.animate) return;
      el.animate(
        [{ boxShadow: '0 0 0 3px rgba(37,99,235,.35)' }, { boxShadow: '0 0 0 0 rgba(37,99,235,0)' }],
        { duration: 1300, easing: 'ease-out' }
      );
    }

    function applyFilter(raw) {
      term = raw.trim();
      var needle = term.toLowerCase();
      clearMarks();
      hits = [];
      var total = index.length;

      if (!needle) {
        index.forEach(function (hit) { hit.el.classList.remove('is-filtered-out'); });
        closePanel();
        status.classList.remove('is-active');
        status.innerHTML = '';
        input.closest('.search').setAttribute('data-filled', 'false');
        return;
      }

      var terms = needle.split(/\s+/).filter(Boolean);

      index.forEach(function (hit) {
        var hay = hit.text.toLowerCase();
        var ok = terms.every(function (t) { return hay.indexOf(t) >= 0; });
        hit.el.classList.toggle('is-filtered-out', !ok);
        if (ok) hits.push(hit);
      });

      // 页面内高亮（仅首个关键词）
      if (hits.length <= 60) {
        hits.forEach(function (hit) {
          var target = hit.el.querySelector('.js-hit, .name, h3, h4') || hit.el;
          var walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
              if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
              if (n.parentNode && n.parentNode.closest && n.parentNode.closest('.anchor-link, mark')) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          });
          var nodes = [];
          while (walker.nextNode()) nodes.push(walker.currentNode);
          markTerm(nodes, terms[0]);
        });
      }

      renderPanel(terms[0], hits);

      input.closest('.search').setAttribute('data-filled', 'true');
      status.classList.add('is-active');
      status.innerHTML =
        '<span>已筛选「' + escapeHtml(term) + '」：命中 <b>' + hits.length + '</b> / ' + total + ' 条</span>' +
        '<button type="button" data-search-reset>清除筛选</button>';
      on(status.querySelector('[data-search-reset]'), 'click', function () {
        input.value = '';
        applyFilter('');
        input.focus();
      });
      if (window.scrollY > 200 && hits.length) { /* 保持当前位置，避免打断阅读 */ }
    }

    function moveActive(delta) {
      var options = $$('.search-panel a[role="option"]', panel);
      if (!options.length) return;
      activeHit = (activeHit + delta + options.length) % options.length;
      options.forEach(function (o, i) {
        o.classList.toggle('is-active', i === activeHit);
        o.setAttribute('aria-selected', i === activeHit ? 'true' : 'false');
      });
      var cur = options[activeHit];
      cur.scrollIntoView({ block: 'nearest' });
    }

    on(input, 'input', debounce(function () { applyFilter(input.value); }, 110));
    var clearBtn = $('[data-search-clear]');
    on(clearBtn, 'click', function () {
      input.value = '';
      applyFilter('');
      input.focus();
    });
    on(input, 'focus', function () {
      if (input.value.trim()) applyFilter(input.value);
    });
    on(form, 'submit', function (e) {
      e.preventDefault();
      var first = panel.querySelector('a[role="option"]');
      if (first) {
        var id = first.getAttribute('href').slice(1);
        closePanel();
        var el = document.getElementById(id);
        if (el) { el.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); flash(el); }
        history.replaceState(null, '', '#' + id);
      }
    });
    on(input, 'keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
      else if (e.key === 'Escape') { input.value = ''; applyFilter(''); input.blur(); }
      else if (e.key === 'Enter' && activeHit >= 0) {
        e.preventDefault();
        var current = $$('.search-panel a[role="option"]', panel)[activeHit];
        if (current) {
          var el = document.getElementById(current.getAttribute('href').slice(1));
          closePanel();
          if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); flash(el); }
        }
      }
    });

    on(document, 'click', function (e) {
      if (!panel.hidden && !e.target.closest('.search')) closePanel();
    });

    // 移动端：点击搜索框先展开
    var shell = input.closest('.search');
    if (shell) {
      on(input, 'click', function () {
        if (window.innerWidth <= 720) shell.setAttribute('data-open', 'true');
      });
      on(document, 'pointerdown', function (e) {
        if (window.innerWidth <= 720 && !e.target.closest('.search')) shell.setAttribute('data-open', 'false');
      });
    }

    // 快捷键：/ 或 Ctrl(⌘)+K
    on(document, 'keydown', function (e) {
      var typing = /^(input|textarea|select)$/i.test((e.target.tagName || '')) || e.target.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (shell) shell.setAttribute('data-open', 'true');
        input.focus();
        input.select();
      }
    });

    // 支持 ?q= 预填
    try {
      var q = new URLSearchParams(location.search).get('q');
      if (q) { input.value = q; applyFilter(q); }
    } catch (err) { /* 忽略 */ }

    // 打开页面时若带锚点，稍后纠正位置（图片/字体加载后）
    if (location.hash) {
      setTimeout(function () {
        var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target) target.scrollIntoView({ block: 'start' });
      }, 80);
    }
  }

  /* ------------------ 5. 进度条 / 回到顶部 / 锚点 ------------------ */
  function initReadingUi() {
    var bar = $('[data-progress]');
    var toTop = $('[data-to-top]');

    var update = function () {
      var doc = document.documentElement;
      var total = doc.scrollHeight - window.innerHeight;
      var ratio = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
      if (bar) bar.style.width = (ratio * 100).toFixed(2) + '%';
      if (toTop) toTop.classList.toggle('is-visible', window.scrollY > 480);
    };
    on(window, 'scroll', rafThrottle(update), { passive: true });
    on(window, 'resize', debounce(update, 120));
    on(toTop, 'click', function () {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
    update();

    var printBtn = $('[data-print]');
    on(printBtn, 'click', function () { window.print(); });

    // 标题锚点
    $$('main h2[id], main h3[id]').forEach(function (h) {
      var link = document.createElement('a');
      link.className = 'anchor-link';
      link.href = '#' + h.id;
      link.textContent = '#';
      link.setAttribute('aria-label', '复制此节链接');
      link.title = '此节链接';
      on(link, 'click', function (e) {
        e.stopPropagation();
        try { history.replaceState(null, '', '#' + h.id); } catch (err) {}
      });
      h.appendChild(link);
    });
  }

  /* --------------------------- 启动 --------------------------- */
  function boot() {
    initTheme();
    initDrawer();
    var entries = buildToc();
    initScrollSpy(entries);
    initSearch();
    initReadingUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
