/* ------------------------------------------------------------------
   Edit this file to change what shows in the left (tools) and right
   (articles) panels. The middle panel text lives in index.html.
   ------------------------------------------------------------------ */

const SITE = {
  name: "According to Knowledge",
  author: "Silver",

  /* LEFT PANEL — tools.
     embed: true  -> opens inside the middle panel (must be a page on this site)
     embed: false -> opens in a new tab (use for other websites)          */
  tools: [
    {
      id: "priorities-chart",
      title: "Priorities Chart Maker",
      desc: "Map issues on a severity bullseye. Rename tiers, recolor, export PNG/SVG.",
      url: "tools/priorities-chart/index.html",
      icon: "target",
      embed: true,
    },
    {
      id: "in-good-faith",
      title: "In Good Faith",
      desc: "My companion site at ingoodfaith.site.",
      url: "https://ingoodfaith.site",
      icon: "compass",
      embed: false,
    },
    // Copy a block above to add another tool.
  ],

  /* RIGHT PANEL — article highlights. Leave `url` empty until the post exists;
     the card shows as "coming soon" instead of a dead link.                  */
  posts: [
    {
      title: "Why I build tools instead of just writing opinions",
      topic: "Making",
      date: "Sep 18, 2026",
      read: "5 min read",
      url: "",
    },
    {
      title: "How to rank what actually matters: a severity framework",
      topic: "Thinking",
      date: "Sep 11, 2026",
      read: "8 min read",
      url: "",
    },
    {
      title: "Disagreeing in good faith online",
      topic: "Faith & Conversation",
      date: "Sep 3, 2026",
      read: "6 min read",
      url: "",
    },
    {
      title: "Notes on learning in public",
      topic: "Learning",
      date: "Aug 27, 2026",
      read: "4 min read",
      url: "",
    },
  ],
};
