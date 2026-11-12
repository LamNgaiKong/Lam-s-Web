/* ==========================================================================
   Lam-s-Web · 全局脚本
   1) 主题切换（跟随系统 + 手动 + 本地记忆）
   2) 导航当前页高亮（body[data-page]）
   3) 移动端导航抽屉
   4) 滚动淡入（.reveal）、回到顶部、页脚年份
   依赖：无。file:// 直接打开亦可工作。
   ========================================================================== */
(function () {
  'use strict';

  var THEME_KEY = 'lam-web-theme';
  var root = document.documentElement;
  var body = document.body;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function on(el, type, fn, opts) { if (el) el.addEventListener(type, fn, opts || false); }

  /* ---------- 1. 主题 ---------- */
  var mediaDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function storedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } }

  function applyTheme(theme, persist) {
    root.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (e) {} }
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1120' : '#f7f8fa');
    var btn = $('[data-theme-toggle]');
    if (btn) btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
  }

  function initTheme() {
    var theme = root.getAttribute('data-theme');
    if (!theme) theme = storedTheme() || (mediaDark && mediaDark.matches ? 'dark' : 'light');
    applyTheme(theme, false);
    on($('[data-theme-toggle]'), 'click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
    });
    if (mediaDark && mediaDark.addEventListener) {
      mediaDark.addEventListener('change', function (e) {
        if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light', false);
      });
    }
  }

  /* ---------- 2. 导航当前页高亮 ---------- */
  function initNavActive() {
    var page = body.getAttribute('data-page');
    if (!page) return;
    $$('[data-nav-link]').forEach(function (a) {
      var on = a.getAttribute('data-nav-link') === page;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
    });
  }

  /* ---------- 3. 移动端抽屉 ---------- */
  function initDrawer() {
    var toggle = $('[data-nav-toggle]');
    if (!toggle) return;
    var setOpen = function (open) {
      body.classList.toggle('is-nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    on(toggle, 'click', function () { setOpen(!body.classList.contains('is-nav-open')); });
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && body.classList.contains('is-nav-open')) setOpen(false);
    });
    // 点击导航项后收起抽屉
    on($('[data-nav]'), 'click', function (e) { if (e.target.closest('a')) setOpen(false); });
    // 断点恢复时复位
    on(window, 'resize', function () {
      if (window.innerWidth > 820 && body.classList.contains('is-nav-open')) setOpen(false);
    });
  }

  /* ---------- 4. 滚动淡入 + 回到顶部 + 年份 ---------- */
  function initScrollUi() {
    // 滚动淡入
    var items = $$('.reveal');
    if (items.length && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
      items.forEach(function (el) { io.observe(el); });
    } else {
      items.forEach(function (el) { el.classList.add('is-in'); });
    }

    // 回到顶部
    var toTop = $('[data-to-top]');
    if (toTop) {
      var onScroll = function () {
        toTop.classList.toggle('is-visible', window.scrollY > 480);
      };
      on(window, 'scroll', onScroll, { passive: true });
      on(toTop, 'click', function () {
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      });
      onScroll();
    }

    // 页脚年份
    $$('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    initTheme();
    initNavActive();
    initDrawer();
    initScrollUi();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
