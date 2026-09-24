/* ------------------------------------------------------------------
   Settings for the articles site (accordingtoknowledge.com).
   The articles themselves are published from the editor on the personal
   site (silverfishstone.com/write/) into /articles/, and both sites read
   them from there. Nothing here needs editing to publish an article.
   ------------------------------------------------------------------ */

const ATK = {
  name: "According To Knowledge",
  description: "Articles by Silver on religion, belief and discourse.",

  /* Cloudflare Turnstile (the "are you human" check) on the sign-up form. Leave it empty to
     go without. To switch it on, make a widget in Cloudflare (Turnstile → Add widget, for
     accordingtoknowledge.com), paste its site key here, and add its secret key to the Worker
     as a secret named TURNSTILE_SECRET. */
  turnstileSiteKey: "",

  /* The personal site, linked from the contact page. Old links to
     accordingtoknowledge.com/#stories, #gallery and so on are sent there. */
  personalSite: "https://silverfishstone.com",

  /* HOME PAGE — the rules. One string per rule. Wrap text in **double
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

  /* CONTACT PAGE — every link. `label` is shown small above the link. */
  links: [
    { label: "Personal site", text: "silverfishstone.com", url: "https://silverfishstone.com" },
    { label: "Email", text: "authorsoon@gmail.com", url: "mailto:authorsoon@gmail.com" },
    { label: "Substack", text: "@silverfishstone", url: "https://substack.com/@silverfishstone" },
    { label: "X", text: "@SilverTravelr", url: "https://x.com/SilverTravelr" },
    { label: "Companion site", text: "ingoodfaith.site", url: "https://ingoodfaith.site" },
  ],
};
