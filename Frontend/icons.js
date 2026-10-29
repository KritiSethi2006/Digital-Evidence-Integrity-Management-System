/* Small local SVG icon set. Keeps the vanilla portal icons available offline. */
(function () {
  const icons = {
    "fa-user": '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    "fa-lock": '<rect x="4" y="11" width="16" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><path d="M12 15v3"/>',
    "fa-inbox": '<path d="M4 4h16l2 11v5H2v-5L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/>',
    "fa-folder-open": '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v1H7a2 2 0 0 0-2 1l-3 7V6Z"/><path d="M5 11a2 2 0 0 1 2-1h15l-3 9a2 2 0 0 1-2 1H3l2-9Z"/>',
    "fa-folder-tree": '<path d="M3 5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2H7a2 2 0 0 0-2 1l-2 5V5Z"/><path d="M5 11h8M9 11v4m0 0H6m3 0h3m-6 0v3m6-3v3"/><rect x="15" y="12" width="6" height="4" rx="1"/>',
    "fa-book-bookmark": '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22V4.5Z"/><path d="M5 5v17H4a2 2 0 0 1-2-2V5a3 3 0 0 1 3-3"/><path d="M13 2v8l2.5-2 2.5 2V2"/>',
    "fa-calendar-days": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    "fa-calendar": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    "fa-clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "fa-clock-rotate-left": '<path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7"/><path d="M12 7v5l3 2"/>',
    "fa-file-arrow-down": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 12v6m-3-3 3 3 3-3"/>',
    "fa-file-circle-check": '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6"/><path d="M13 2v6h6M14 17l2 2 5-5"/><path d="M14 2v6h6"/>',
    "fa-file-lines": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    "fa-box-open": '<path d="m3 8 9-5 9 5-9 5-9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
    "fa-microscope": '<path d="m6 3 6 6M9 6l5-3 4 4-3 5M12 12l-4 4M5 21h14M7 18h10a4 4 0 0 0 4-4v-1"/><circle cx="6" cy="18" r="2"/>',
    "fa-check": '<path d="m5 12 4 4L19 6"/>',
    "fa-triangle-exclamation": '<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    "fa-building": '<rect x="4" y="2" width="16" height="20" rx="1"/><path d="M9 22v-4h6v4M8 6h1M15 6h1M8 10h1M15 10h1M8 14h1M15 14h1"/>',
    "fa-users": '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    "fa-shield-halved": '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m12 8 4 2v2c0 3-2 5-4 6"/>',
    "fa-plus": '<path d="M12 5v14M5 12h14"/>',
    "fa-user-plus": '<path d="M15 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M16 11h6"/>',
  };

  function renderIcons(root) {
    const candidates = [];
    if (root.matches?.('i[class*="fa-"]')) candidates.push(root);
    root.querySelectorAll?.('i[class*="fa-"]').forEach((node) => candidates.push(node));

    for (const source of candidates) {
      const key = [...source.classList].find((name) => icons[name]);
      if (!key) continue;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.8");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      svg.classList.add("fc-icon");
      svg.style.width = "1em";
      svg.style.height = "1em";
      svg.style.display = "inline-block";
      svg.style.verticalAlign = "-0.125em";
      svg.style.flexShrink = "0";
      if (source.parentElement?.tagName === "LABEL") svg.style.margin = "0 10px 0 2px";
      svg.innerHTML = icons[key];
      source.replaceWith(svg);
    }
  }

  renderIcons(document);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) renderIcons(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
