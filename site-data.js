/* ------------------------------------------------------------------
   Edit this file to change the tools shown in the left panel.
   Articles and stories are published from /write/ and don't live here.
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

  /* Starter category list offered in the editor when you file an article.
     Any category already used by a published article is offered too, and you
     can type new ones in the editor, so this is only a convenience.          */
  categories: ["Mormons", "Comparative Religion", "Apologetics"],
};
