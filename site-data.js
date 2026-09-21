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

  /* HOME PAGE — the Nine Rules. One string per rule. Wrap text in **double
     asterisks** to make it bold. */
  rulesTitle: "Nine Rules for Discourse and Engagement",
  rules: [
    "Everyone knows as much about their belief as you know about yours. Everyone knows as much about your belief as you know about theirs (little to nothing).",
    "Every belief is somehow reasonable, or no one would believe it.",
    "A belief system that has existed for more than 50 years has heard every rebuttal or disproof you could imagine.",
    "Nobody thinks they are wrong, or they would change their mind.",
    "Nobody lies about what they believe. Nobody lies about what they think you believe.",
    "The few who knowingly lie about what they believe are grifters and shysters to begin with. They are a tiny minority.",
    "What people claim to believe is always what they **want** to believe. When people lie to themselves subconciously, there is not intent or subterfuge behind it.",
    "People don't usually settle on the system that answers their questions best, they settle on the system that answers their questions first.",
    "Smart people are the people most likely to convert to another religion, because they are the most likely to question what they believe in to begin with.",
  ],

  /* While reading a story or article the page switches to two panels so the
     text gets more room. Which side panel steps aside: "left" (tools) or "right"
     (latest articles).                                                          */
  readingHides: "left",
};
