/* ------------------------------------------------------------------
   Edit this file to change the tools shown in the left panel.
   Articles, stories and gallery images are published from /write/ and
   don't live here.
   ------------------------------------------------------------------ */

const SITE = {
  name: "According to Knowledge",
  author: "Silver",

  /* LEFT PANEL — tools.
     embed: true  -> opens on its own page (tool.html) with a "Back to main site"
                     button. The url must be a page on this site.
     embed: false -> opens the other website in a new tab
     wip:   true  -> marks the tool as a work in progress (amber lamp + tag).
                     Delete the line when it's finished.                       */
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
      desc: "My companion site at ingoodfaith.site. Still being built.",
      url: "https://ingoodfaith.site",
      icon: "compass",
      embed: false,
      wip: true,
    },
    // Copy a block above to add another tool.
  ],

  /* Starter category lists offered in the editor. Categories already used by a
     published article / gallery image are offered too, and you can type new
     ones in the editor, so these are only a convenience.                      */
  categories: ["Mormons", "Comparative Religion", "Apologetics"],
  galleryCategories: ["Art", "Photography"],

  /* HOME PAGE — the short "About me" text. */
  about: "Welcome! This website is a small display of me, my interests, and some of my hobbies.",

  /* The Nine Rules now live on the articles site: articles-site/config.js */

  /* While reading a story or article the page switches to two panels so the
     text gets more room. Which side panel steps aside: "right" (latest
     articles) or "left" (tools and the latest-story card).                      */
  readingHides: "right",

  /* The "Why am I not…" page (#why-not) works already but has no tab yet, so you
     can build the list in /write/ first. Set this to true to show its tab.       */
  whyNotTab: false,
};
