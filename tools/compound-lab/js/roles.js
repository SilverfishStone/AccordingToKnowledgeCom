/* What each group does in a molecule, in plain words, for the guided tour. These are general chemistry-of-drugs facts
   about the group; how they apply to a particular compound is worked out in tour.js by taking the group off and seeing
   what changes. */
export const ROLE = {
  f: "Fluorine is tiny but pulls electrons hard. It adds almost no bulk, makes the spot it sits on much harder for liver enzymes to oxidise (so the compound lasts longer), and slightly raises fat-solubility.",
  cl: "Chlorine is bigger and oilier than fluorine. It makes the molecule more fat-soluble, helps it slip through cell membranes, and fills a small oily pocket in a receptor.",
  br: "Bromine is larger and heavier still. It adds weight and fat-solubility, and can form a halogen bond: a weak attraction to an oxygen or nitrogen on a protein.",
  i: "Iodine is the largest common halogen. It adds a lot of weight and fat-solubility, but the carbon–iodine bond is the weakest of the halogens, so this group is the least durable.",
  me: "A methyl is a small oily bump. It fills a small pocket, raises fat-solubility a little, and can shield its neighbours from enzymes that would otherwise attack them.",
  et: "An ethyl is a slightly longer oily bump than methyl: a little more fat-solubility and bulk to fill a pocket, and a spot the liver can oxidise.",
  pr: "A propyl chain adds more oily bulk and flexibility. It makes the molecule more fat-soluble and lets it reach into a longer pocket.",
  ipr: "An isopropyl is a branched, bulky, oily group. Its branch fills a pocket snugly and shields neighbouring atoms from enzymes.",
  tbu: "A tert-butyl is a compact, very bulky, oily group. It fills a pocket firmly, shields everything nearby from enzymes, and makes the molecule much more fat-soluble.",
  cpr: "A cyclopropyl is a tiny, rigid ring. It is as compact as an isopropyl but stiffer and harder for liver enzymes to break down.",
  oh: "A hydroxyl both gives and receives hydrogen bonds. It makes the molecule more water-soluble, lets it anchor to a receptor, and is a handle the liver can attach a sugar to so the compound is flushed out.",
  ome: "A methoxy accepts hydrogen bonds but cannot donate them. It adds little polarity, and liver enzymes can strip its methyl off to leave a hydroxyl.",
  oet: "An ethoxy is a methoxy with a longer oily tail: it still accepts hydrogen bonds, and is a little more fat-soluble.",
  oxo: "A double-bonded oxygen (a carbonyl) is a strong hydrogen-bond acceptor. It flattens the carbon it sits on and adds polarity.",
  nh2: "A primary amino group gives hydrogen bonds and adds polarity. On a flat aromatic ring it is only weakly basic; on a saturated ring it picks up a proton and becomes charged.",
  nhme: "A methylamino group gives one hydrogen bond and accepts others, with a little more oily bulk than a plain amino group.",
  nme2: "A dimethylamino group cannot donate hydrogen bonds but accepts them, and on a saturated chain it is basic. It is a common receptor anchor and adds oily bulk.",
  nhac: "An acetamido group is an amide: neutral, a hydrogen-bond donor and acceptor, flat and rigid. It adds polarity and grips receptors firmly.",
  no2: "A nitro group pulls electrons strongly and adds polarity. On a ring it tints the compound yellow, and the body can reduce it to reactive by-products, which is why it is a toxicity flag.",
  cooh: "A carboxylic acid loses its hydrogen at body pH and becomes negatively charged. That makes it water-soluble, keeps it in the blood and largely out of the brain, and lets it bind positive sites on proteins, as aspirin-type drugs do.",
  conh2: "A primary amide is neutral but strongly polar: it gives two hydrogen bonds and accepts one. It adds water-solubility without a charge.",
  cho: "An aldehyde is polar and reactive: it can bond to amine groups on proteins, and the body quickly oxidises it to an acid.",
  ac: "An acetyl is a ketone: a hydrogen-bond acceptor that adds moderate polarity and a flat carbonyl.",
  cooMe: "A methyl ester accepts hydrogen bonds but cannot donate. It is more fat-soluble than the acid it comes from, and blood and liver esterases cut it, so it tends to act quickly and fade.",
  cn: "A nitrile is small, straight and polar. It accepts hydrogen bonds, adds polarity with almost no bulk, and is hard for the body to break down.",
  sh: "A thiol grips metal ions (zinc, iron, mercury, lead) tightly and is easily oxidised. Grabbing metals is how chelating antidotes work.",
  sme: "A methylthio is oily and soft. It adds fat-solubility, and the liver oxidises its sulfur to a sulfoxide or sulfone.",
  so2me: "A methyl sulfone is strongly polar and neutral, accepts hydrogen bonds, and resists breakdown. Several selective anti-inflammatory drugs carry one.",
  so2nh2: "A sulfonamide is polar and weakly acidic. It grips zinc in enzymes, and its shape fits the side pocket of COX-2 type anti-inflammatory targets.",
  cf3: "A trifluoromethyl is bulky, very oily and pulls electrons. It blocks enzymes from attacking nearby atoms and helps the molecule cross membranes.",
  ocf3: "A trifluoromethoxy is even oilier than trifluoromethyl, sits at an angle to the ring, and resists breakdown.",
  ch2oh: "A hydroxymethyl puts an alcohol one carbon out from the ring. It gives and takes hydrogen bonds and adds water-solubility.",
  ch2nh2: "An aminomethyl puts a basic amine one carbon out from the ring. It picks up a proton in the body and becomes positively charged, which helps it dissolve in water and bind negative sites.",
  etoh: "A hydroxyethyl is a short flexible chain ending in an alcohol: water-soluble, hydrogen-bonding, and a handle for the liver to clear it.",
  etnh2: "An aminoethyl chain: a basic amine two carbons from the ring. That ring, two carbons, amine layout is the one found in serotonin, dopamine and adrenaline, so receptors for them recognise it.",
  prnh2: "A 2-aminopropyl chain: the same ring, two carbons, amine layout as the brain's own messengers, plus a methyl beside the amine that shields it from the enzyme (MAO) that would otherwise break it down.",
  ch2cooh: "An aryl-acetic acid arrangement: an acid one carbon from the ring. This is the layout of several anti-inflammatory drugs, where the acid anchors in the channel of the COX enzyme.",
  chmecooh: "A 2-arylpropionic acid arrangement, the layout of ibuprofen and naproxen: an acid on the carbon next to the ring, with a methyl that adds a snug fit in the COX enzyme.",
  nhcoch2net2: "An amino-acetamide: an amide linking the ring to a basic amine. This is the lidocaine-type layout that plugs sodium channels in nerve cells.",
  cooch2ch2net2: "An aminoalkyl ester: an ester linking the ring to a basic amine. This is the procaine-type layout of local anaesthetics, which also plug nerve sodium channels.",
  opr3nme2: "An aryl-oxy-propylamine: a flexible chain with a basic amine at the end. Several reuptake blockers and antihistamines share this tether, which lets the amine reach a charged spot in the receptor.",
  obblocker: "A beta-blocker side chain: an alcohol and an amine on a short chain off an aryl-oxy link. Together they fit the adrenaline receptor and block it.",
  ph: "A phenyl ring adds a large, flat, oily surface that can stack against other rings in a receptor. It raises fat-solubility sharply and stiffens the molecule.",
  py3: "A pyridyl group is a flat ring with a nitrogen that accepts hydrogen bonds and can grip metals such as the iron in enzymes. It is less oily than phenyl.",
  py4: "A 4-pyridyl group is a flat ring whose nitrogen points straight out, ready to accept a hydrogen bond or hold a metal ion such as iron.",
  th2: "A thienyl is a benzene-like ring with sulfur. It is oily and flat, and often used as a stand-in for phenyl with a slightly different shape and breakdown.",
  im1: "An imidazole joined through one of its nitrogens. The other ring nitrogen accepts hydrogen bonds and grips metal ions such as the iron in enzymes; the ring is mildly basic.",
  im4: "An imidazole joined through carbon, as in histamine. It can both give and take hydrogen bonds and is mildly basic, which is why it works in the active sites of enzymes.",
  fu2: "A furyl is a small flat ring with an oxygen. It is more polar than phenyl but also more reactive, and the liver can open it.",
};

/* what the central ring does, from its family and what is in it */
export function coreRole(core) {
  const base = {
    "Aromatic rings": "A flat, rigid ring. It holds every group in a fixed position, and its cloud of shared electrons lets it stack against other rings inside a receptor pocket.",
    "Fused rings": "Rings fused into one flat, rigid frame. It is larger and oilier than a single ring, and gives the groups on it a fixed layout.",
    "Saturated rings": "A puckered ring with no flat electron cloud. It is more flexible and three-dimensional than an aromatic ring, so it points its groups in different directions.",
  }[core.group] || "The ring everything else hangs from.";
  const has = (el) => core.atoms.some((a) => a.replace("H", "") === el);
  const bits = [];
  if (core.id === "xanthine") bits.push("This is the xanthine frame of caffeine and theophylline, the shape that fits the brain's adenosine receptors. Blocking those is why caffeine keeps you awake.");
  else if (core.id === "indole") bits.push("The indole frame is the one in tryptophan and serotonin, nature's own ring for brain chemistry.");
  else {
    if (has("N")) bits.push(core.group === "Saturated rings" ? "Its nitrogen is basic: it picks up a proton in the body and carries a positive charge, which suits receptors that grip charged amines." : "Its ring nitrogen has a free lone pair that accepts hydrogen bonds and can grip metal ions.");
    if (has("S")) bits.push("The sulfur makes it oilier than a nitrogen or oxygen ring, and is a spot the liver can oxidise.");
    if (has("O") && core.group !== "Fused rings") bits.push("The ring oxygen adds a little polarity and accepts hydrogen bonds.");
  }
  return [base, ...bits];
}
