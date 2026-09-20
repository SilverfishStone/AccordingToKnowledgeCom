/* ------------------------------------------------------------------
   Edit this file to change what shows in the left (tools) and right
   (articles) panels. The middle panel text lives in index.html.
   ------------------------------------------------------------------ */

const SITE = {
  name: "According to Knowledge",
  author: "Silver",

  /* LEFT PANEL — tools.
     embed: true  -> opens on its own page (tool.html) with a "Back to main site"
                     button. The url must be a page on this site.
     embed: false -> opens the other website in a new tab                    */
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

  /* RIGHT PANEL — article highlights.
     While this list is empty the panel shows a "work in progress" notice.
     Add an entry and the notice is replaced by the article list, e.g.:
       { title: "My first article", topic: "Thinking", date: "Oct 1, 2026",
         read: "5 min read", url: "articles/first.html" },                    */
  posts: [],
};
