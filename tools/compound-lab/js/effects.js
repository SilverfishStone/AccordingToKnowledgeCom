/* The effect and feature database. This is a hand-built, deliberately coarse model for fiction and worldbuilding:
   it says whether a structure's size, polarity and groups are the kind a mechanism would need. It does not predict that
   anything works, is safe, or can be made.

   An effect has:
     mech      the mechanism that would be needed, in plain words
     status    "established": real drugs act this way; "plausible": the mechanism exists but no good small-molecule
               template is known here; "speculative": a mechanism is only a hypothesis
     cns       the compound has to reach the brain (small, not too polar, no acid group)
     window    ranges for weight, logP, polar surface area and H-bond donors that suit the mechanism
     needs     groups that fit the mechanism, best match wins: { all: [pattern ids], w: weight, why }
     must      groups that are required; forbid: groups that rule it out
     conflicts effects that cannot be combined with this one
     warn      removes a warning signal the body relies on (adds to the hazard rating)
     kind      "enhance" (do more than the body normally can) or "modify" (change what it feels, needs or does)
     modes     for needs and urges, how the change is made: "urge" (don't feel it, the need remains), "ability" (can't do it, the
               need remains), "need" (the need itself is gone); each mode can override the mechanism, status and ranges */

export const PATTERNS = {
  aryl: { smarts: "c", label: "an aromatic ring" },
  amine_basic: { smarts: "[NX3;!$(N-C=[O,S,N]);!$(N-a);!$(N-S(=O)=O);!$(N-[#7,#8]);!$(N-C#N)]", label: "a basic amine" },
  amine_any: { smarts: "[NX3;H2,H1;!$(N-C=O);!$(N-S(=O)=O);!$(N-a)]", label: "a primary or secondary amine" },
  amide: { smarts: "[CX3](=O)[NX3]", label: "an amide" },
  anilide: { smarts: "c[NX3;H1][CX3](=O)", label: "an anilide (aryl–NH–C=O)" },
  aryl_amide: { smarts: "c[CX3](=O)[NX3]", label: "an aryl amide" },
  aryl_ester: { smarts: "c[CX3](=O)[OX2][CX4]", label: "an aryl ester" },
  ester: { smarts: "[CX3](=O)[OX2][CX4]", label: "an ester" },
  acid: { smarts: "[CX3](=O)[OX2H1]", label: "a carboxylic acid" },
  aryl_acid: { smarts: "c[CX3](=O)[OX2H1]", label: "an aryl carboxylic acid" },
  aryl_acid_alpha: { smarts: "c[CX4][CX3](=O)[OX2H1]", label: "an aryl-acetic acid" },
  phenol: { smarts: "c[OX2H1]", label: "a phenol" },
  aryl_ether: { smarts: "c[OX2][CX4]", label: "an aryl ether" },
  amino_alcohol: { smarts: "[NX3;!$(NC=O)][CX4][CX4][OX2H1]", label: "an amino-alcohol" },
  imidazole: { smarts: "[nX3]1c[nX2]cc1", label: "an imidazole ring" },
  fused_N: { smarts: "[$(c1ccc2c(c1)cc[nX3]2),$(c1ccc2c(c1)nc[nX3]2),$(c1ccc2ncccc2c1)]", label: "a fused nitrogen ring system" },
  nicotinamide_like: { smarts: "O=C([NX3])c1cccnc1", label: "a pyridine-3-carboxamide" },
  aryl_halide: { smarts: "c[F,Cl,Br,I]", label: "a halogen on an aromatic ring" },
  sulfonamide: { smarts: "[SX4](=O)(=O)[NX3]", label: "a sulfonamide" },
  nitro_arene: { smarts: "c[N+](=O)[O-]", label: "a nitro group on an aromatic ring" },
  amine_donor_arene: { smarts: "c[$([NX3;H2,H1]),$([OX2H1])]", label: "an amino or hydroxyl on an aromatic ring" },
  thiol: { smarts: "[SX2H1]", label: "a thiol" },
  xanthine_like: { smarts: "O=c1[nX3]c(=O)c2[nX3]cnc2[nX3]1", label: "a xanthine (the caffeine core)" },
  aryl_sulfone: { smarts: "c[SX4](=O)(=O)[CX4]", label: "an aryl methyl sulfone" },
  anilide_amine: { smarts: "c[NX3;H1][CX3](=O)[CX4][NX3;!$(NC=O)]", label: "an amino-acetanilide" },
  aryl_ester_amine: { smarts: "c[CX3](=O)[OX2][CX4][CX4][NX3;!$(NC=O)]", label: "an aminoalkyl aryl ester" },
  aryl_oxy_amine: { smarts: "cO[CX4][CX4][CX4][NX3;!$(NC=O)]", label: "an aryl-oxy-propylamine" },
  amino_ester: { smarts: "[NX3;!$(NC=O)][CX4][CX4][OX2][CX3]=O", label: "an aminoalkyl ester" },
  aryloxy_propanolamine: { smarts: "cO[CX4][CX4]([OX2H1])[CX4][NX3;!$(NC=O)]", label: "an aryl-oxy-propanolamine" },
};

/* Structural families that are controlled or dangerous. They are rated like any other structure, using what the family
   is known to do in the body (`fits`), and the family's mechanism and risks are shown. The search may suggest them too. */
export const CLASSES = [
  { id: "phenethylamine", smarts: "[NX3;!$(NC=O);!$(N-a)][CX4][CX4]c", label: "Phenethylamine family", short: "stimulant (phenethylamine)",
    fits: { alert: 0.9, tired: 0.85, hunger: 0.8, focus: 0.7, energy: 0.55, mood_up: 0.75, euphoria: 0.85, confidence: 0.75, social: 0.85, hallucination: 0.8, libido_up: 0.5, aggression_up: 0.4 },
    mech: "This is the scaffold of the body's own catecholamines (adrenaline, dopamine) and of many stimulant and psychedelic drugs. They act on the transporters and receptors for dopamine, noradrenaline and serotonin.",
    risks: "Raises heart rate and blood pressure, can be habit-forming, and strong doses can be dangerous." },
  { id: "cathinone", smarts: "c[CX3](=O)[CX4][NX3]", label: "Cathinone family", short: "stimulant (cathinone)",
    fits: { alert: 0.85, tired: 0.8, hunger: 0.75, focus: 0.65, energy: 0.5, mood_up: 0.7, euphoria: 0.8, confidence: 0.7, social: 0.6 },
    mech: "A close relative of the phenethylamines: it acts on the same dopamine, noradrenaline and serotonin transporters.",
    risks: "Raises heart rate and blood pressure and can be habit-forming." },
  { id: "arylcyclohexylamine", smarts: "[CX4;R]([NX3])(c)", label: "Aryl-cycloalkylamine family", short: "dissociative",
    fits: { pain_central: 0.6, hallucination: 0.7, amnesia: 0.65, fear_down: 0.5, h_coma: 0.5 },
    mech: "A scaffold of dissociative drugs, which block the NMDA-type glutamate receptors involved in learning and pain.",
    risks: "Disconnects the user from their body and surroundings and impairs judgement." },
  { id: "arylpiperidine", smarts: "[$([NX3]1CC[CX4](c)CC1),$([NX3]1CC[CX4]([NX3]c)CC1)]", label: "Arylpiperidine family", short: "opioid-type",
    fits: { pain_central: 0.95, euphoria: 0.85, calm: 0.7, libido_down: 0.6, apathy: 0.6, mood_up: 0.5, h_breath: 0.9, h_coma: 0.6 },
    mech: "A scaffold shared by many opioid drugs. They switch on the opioid receptors the body's own endorphins use to turn pain down.",
    risks: "Slows breathing, which is the usual cause of fatal overdose, and is strongly habit-forming." },
  { id: "dinitrophenol", smarts: "c([OX2H1])1c([N+](=O)[O-])cc([N+](=O)[O-])cc1", label: "Dinitrophenol family", short: "metabolic poison",
    fits: { h_heat: 0.95, h_cell_energy: 0.6 },
    mech: "Dinitrophenols uncouple the cell's energy production, turning food energy into heat. The body can't switch it off.",
    risks: "Fatal overheating, with no antidote." },
];
export const BLOCKED = CLASSES;

const CNS = { mw: [120, 450], logp: [1, 4.5], tpsa: [0, 90], hbd: [0, 3] };

export const EFFECT_GROUPS = ["Block discomfort signals", "More performance", "Body systems", "Mind", "Mood and drive", "Poison effects", "Antidote effects"];
export const EFFECTS = [
  /* ───── block discomfort signals ───── */
  { id: "pain_local", group: "Block discomfort signals", name: "Numb local pain", status: "established", warn: true,
    mech: "Block sodium channels in the nerve endings so pain signals stop at the source, the way local anaesthetics do.",
    window: { mw: [180, 380], logp: [1.5, 4.5], tpsa: [0, 75], hbd: [0, 2] },
    needs: [{ all: ["anilide_amine"], w: 1, why: "an amino-acetanilide, the lidocaine-type arrangement of local anaesthetics" }, { all: ["aryl_ester_amine"], w: 0.95, why: "an aminoalkyl aryl ester, the procaine-type arrangement of local anaesthetics" }, { all: ["anilide", "amine_basic"], w: 0.7, why: "an aryl amide plus an amine, as in local anaesthetics" }, { all: ["aryl_ester", "amine_basic"], w: 0.65, why: "an aryl ester plus an amine, as in local anaesthetics" }, { all: ["aryl", "amine_basic"], w: 0.45, why: "an aromatic ring with a basic amine" }] },
  { id: "pain_inflam", group: "Block discomfort signals", name: "Block inflammatory pain", status: "established", warn: true,
    mech: "Inhibit the enzymes that make the chemical messengers of inflamed, aching tissue (the way aspirin- and ibuprofen-type drugs work).",
    window: { mw: [150, 400], logp: [1, 5], tpsa: [30, 120], hbd: [0, 3] },
    needs: [{ all: ["sulfonamide", "aryl"], w: 0.8, why: "a sulfonamide on an aromatic ring, as in the acid-free selective anti-inflammatory drugs" }, { all: ["aryl_sulfone"], w: 0.75, why: "an aryl methyl sulfone, as in some acid-free selective anti-inflammatory drugs" }, { all: ["aryl_acid_alpha"], w: 1, why: "an aryl-acetic acid, the common anti-inflammatory arrangement" }, { all: ["aryl_acid"], w: 0.7, why: "an acid on an aromatic ring" }, { all: ["aryl", "acid"], w: 0.5, why: "an aromatic ring and an acid" }] },
  { id: "pain_central", group: "Block discomfort signals", name: "Block severe pain centrally", status: "established", warn: true, cns: true,
    mech: "Turn down pain processing in the spinal cord and brain. Real strong central painkillers work on the body's own pain-damping (endorphin) receptors or on glutamate receptors; no template for a safe, selective one is known.",
    window: CNS, needs: [] },
  { id: "tired", group: "Block discomfort signals", name: "Sleep", status: "established", warn: true, cns: true, unnoticed: "exhaustion", defaultMode: "urge",
    modes: {
      urge: { label: "Don't feel sleepy (the body still needs sleep)" },
      ability: { label: "Can't sleep at all (the body still needs sleep)", status: "speculative", hazardExtra: 3, unnoticed: "a sleep debt that can never be repaid", window: CNS,
        needs: [{ all: ["xanthine_like"], w: 0.7, why: "a xanthine: blocking adenosine keeps the brain awake" }, { all: ["aryl_ether", "amine_basic", "aryl_halide"], w: 0.8, why: "a halogenated aryl-oxy amine, the shape of histamine-receptor blockers that keep the brain awake" }, { all: ["fused_N", "amide"], w: 0.6, why: "a fused nitrogen ring with an amide" }, { all: ["aryl", "amide"], w: 0.45, why: "an aromatic amide, as in some wake-promoting drugs" }],
        mech: "Hold the brain's wake circuits on and shut off the circuits that start sleep, so sleep becomes impossible while the body still depends on it. A rare real disease shows the body can lose the ability to sleep, and it is fatal." },
      need: { label: "The body no longer needs sleep", status: "speculative", warn: false, window: CNS, needs: [],
        mech: "Take over everything sleep does (clearing waste from the brain, consolidating memories, resetting synapses, repairing tissue) by some other route, so no sleep is owed. Entirely hypothetical." },
    },
    mech: "Block the brain's adenosine signal that builds up as 'sleep pressure', the way caffeine-type molecules do. Removing it completely is only a hypothesis.",
    window: { mw: [150, 330], logp: [0.5, 3.5], tpsa: [30, 90], hbd: [0, 2] },
    needs: [{ all: ["xanthine_like"], w: 1, why: "a xanthine, the core of caffeine and the other adenosine blockers" }, { all: ["fused_N", "amide"], w: 0.85, why: "a fused nitrogen ring with an amide, the shape adenosine blockers share" }, { all: ["fused_N"], w: 0.6, why: "a fused nitrogen ring system" }, { all: ["imidazole"], w: 0.4, why: "an imidazole ring" }],
    conflicts: ["sleep_induce"] },
  { id: "hunger", group: "Block discomfort signals", name: "Hunger", status: "plausible", warn: true, cns: true, unnoticed: "starvation", defaultMode: "urge",
    modes: {
      urge: { label: "Don't feel hungry (the body still needs food)" },
      need: { label: "The body no longer needs food", status: "speculative", warn: false, cns: false, window: { mw: [100, 500], logp: [-1, 4.5], tpsa: [20, 160], hbd: [0, 6] }, needs: [],
        mech: "Fuel the cells directly from another source (stored reserves, or fuel made from air and light) so no meals are owed. Hypothetical." },
    },
    mech: "Quieten the gut-and-brain appetite signals. The strongest known drivers are peptide hormones, so no good small-molecule template is known: this effect is rated on size and polarity only.",
    window: CNS, needs: [], conflicts: ["appetite_up"] },
  { id: "thirst", group: "Block discomfort signals", name: "Thirst", status: "speculative", warn: true, cns: true, unnoticed: "dehydration", defaultMode: "urge",
    modes: {
      urge: { label: "Don't feel thirsty (the body still needs water)" },
      need: { label: "The body no longer needs water", status: "speculative", warn: false, cns: false, window: { mw: [100, 500], logp: [-1, 4.5], tpsa: [20, 160], hbd: [0, 6] }, needs: [],
        mech: "Make or recycle all the water the body uses so none has to be drunk. Hypothetical." },
    },
    mech: "Silence the brain's thirst drive (the hormone systems that track blood salt and volume). Only a hypothesis, and dangerous: thirst is what prevents dehydration.",
    window: CNS, needs: [] },
  { id: "nausea", group: "Block discomfort signals", name: "Block nausea", status: "established", warn: true,
    mech: "Block the serotonin and histamine signals in the gut and brainstem that trigger nausea and vomiting.",
    window: { mw: [200, 420], logp: [1.5, 4.5], tpsa: [20, 85], hbd: [0, 2] },
    needs: [{ all: ["amide", "amine_basic", "aryl"], w: 0.9, why: "an aromatic amide with a basic amine, a common anti-nausea arrangement" }, { all: ["aryl", "amine_basic"], w: 0.55, why: "an aromatic ring with a basic amine" }] },
  { id: "itch", group: "Block discomfort signals", name: "Block itch", status: "established",
    mech: "Block histamine receptors on the nerve endings and skin cells that make a rash itch.",
    window: { mw: [220, 420], logp: [2.5, 5], tpsa: [10, 60], hbd: [0, 1] },
    needs: [{ all: ["aryl", "amine_basic", "aryl_halide"], w: 0.9, why: "a halogenated aromatic ring with a basic amine, as in antihistamines" }, { all: ["aryl", "amine_basic"], w: 0.65, why: "an aromatic ring with a basic amine" }] },
  { id: "temp", group: "Block discomfort signals", name: "Block heat and cold discomfort", status: "speculative", warn: true,
    mech: "Dampen the temperature-sensing channels (the TRP family) in the skin so extremes stop feeling uncomfortable. Only a hypothesis, and it hides burns and frostbite.",
    window: { mw: [150, 400], logp: [2, 5], tpsa: [0, 70], hbd: [0, 2] }, needs: [] },
  { id: "muscle_burn", group: "Block discomfort signals", name: "Block muscle burn and cramps", status: "plausible", warn: true,
    mech: "Soak up the acid that builds in working muscle and steady calcium handling, so fatigue pain arrives later.",
    window: { mw: [100, 350], logp: [-2, 2], tpsa: [30, 140], hbd: [0, 4] },
    needs: [{ all: ["imidazole", "acid"], w: 1, why: "an imidazole with an acid, an acid buffer like those in muscle" }, { all: ["imidazole"], w: 0.65, why: "an imidazole ring, a good buffer near body pH" }, { all: ["acid", "amine_any"], w: 0.5, why: "an amino-acid-like pair" }] },

  /* ───── more performance ───── */
  { id: "energy", group: "More performance", name: "More cellular energy", status: "plausible",
    mech: "Feed the pathways that make the cell's energy currency (the nicotinamide cofactors that carry electrons in metabolism).",
    window: { mw: [100, 320], logp: [-2, 2], tpsa: [30, 140], hbd: [0, 4] },
    needs: [{ all: ["nicotinamide_like"], w: 1, why: "a pyridine-3-carboxamide, the core of the energy cofactors" }, { all: ["acid"], w: 0.35, why: "an acid, like the small acids of the energy cycle" }] },
  { id: "alert", group: "More performance", name: "More alertness and focus", status: "established", cns: true,
    mech: "Raise the brain's wake-promoting signals (adenosine, histamine and orexin systems).",
    window: { mw: [150, 330], logp: [0.5, 3.5], tpsa: [30, 90], hbd: [0, 2] },
    needs: [{ all: ["xanthine_like"], w: 1, why: "a xanthine, the core of caffeine and the other adenosine blockers" }, { all: ["fused_N", "amide"], w: 0.85, why: "a fused nitrogen ring with an amide" }, { all: ["fused_N"], w: 0.6, why: "a fused nitrogen ring system" }, { all: ["imidazole"], w: 0.4, why: "an imidazole ring" }],
    conflicts: ["sleep_induce"] },
  { id: "strength", group: "More performance", name: "More muscle strength", status: "plausible",
    mech: "Raise the force a muscle can make, for example by enlarging its short-term energy store (as creatine does). The strong routes (hormone-type growth signals) are controlled and not offered here.",
    window: { mw: [100, 300], logp: [-3, 1], tpsa: [50, 150], hbd: [1, 5] },
    needs: [{ all: ["acid", "amine_any"], w: 0.85, why: "an amino-acid-like pair, the shape of muscle energy-store molecules" }, { all: ["acid"], w: 0.4, why: "an acid group" }] },
  { id: "endurance", group: "More performance", name: "More endurance", status: "plausible",
    mech: "Buffer the acid that limits long effort and improve how efficiently muscle uses oxygen.",
    window: { mw: [100, 350], logp: [-2, 2], tpsa: [30, 140], hbd: [0, 4] },
    needs: [{ all: ["imidazole", "acid"], w: 1, why: "an imidazole with an acid, an acid buffer" }, { all: ["imidazole"], w: 0.65, why: "an imidazole ring" }, { all: ["acid", "amine_any"], w: 0.5, why: "an amino-acid-like pair" }] },
  { id: "recovery", group: "More performance", name: "Faster recovery and healing", status: "plausible",
    mech: "Calm the inflammation that follows effort and injury and clear the oxidising by-products.",
    window: { mw: [120, 400], logp: [0, 4], tpsa: [30, 130], hbd: [0, 4] },
    needs: [{ all: ["phenol", "aryl_acid_alpha"], w: 0.9, why: "a phenol with an aryl-acetic acid" }, { all: ["phenol"], w: 0.65, why: "a phenol, which can mop up reactive oxygen" }, { all: ["aryl_acid_alpha"], w: 0.5, why: "an anti-inflammatory arrangement" }] },

  /* ───── body systems ───── */
  { id: "antioxidant", group: "Body systems", name: "Antioxidant protection", status: "established",
    mech: "Donate hydrogen to reactive oxygen species before they damage fats and DNA.",
    window: { mw: [100, 400], logp: [0, 4.5], tpsa: [20, 130], hbd: [1, 5] },
    needs: [{ all: ["phenol", "amine_donor_arene"], w: 0.9, why: "a hydroxyl or amine on an aromatic ring, a hydrogen donor" }, { all: ["phenol"], w: 0.75, why: "a phenol, a hydrogen donor" }] },
  { id: "hr_down", group: "Body systems", name: "Slow the heart rate", status: "established",
    mech: "Block adrenaline's beta receptors on the heart.",
    window: { mw: [200, 350], logp: [0.5, 3.5], tpsa: [30, 80], hbd: [1, 3] },
    needs: [{ all: ["aryloxy_propanolamine"], w: 1, why: "an aryl-oxy-propanolamine, the beta-blocker arrangement" }, { all: ["aryl_ether", "amino_alcohol"], w: 0.8, why: "an aryl-oxy amino-alcohol, close to the beta-blocker arrangement" }, { all: ["aryl", "amino_alcohol"], w: 0.65, why: "an aromatic ring with an amino-alcohol" }] },
  { id: "bp_down", group: "Body systems", name: "Lower blood pressure", status: "established",
    mech: "Relax blood vessels, for example by blocking the enzyme that makes the vessel-tightening hormone angiotensin II.",
    window: { mw: [250, 450], logp: [-1, 3], tpsa: [70, 140], hbd: [1, 4] }, must: ["acid"],
    needs: [{ all: ["acid", "amide", "aryl"], w: 0.85, why: "an acid with an amide and an aromatic ring, as in the enzyme-blocking drugs" }, { all: ["acid", "amide"], w: 0.6, why: "an acid with an amide" }] },
  { id: "sweat", group: "Body systems", name: "Reduce sweating", status: "established",
    mech: "Block the acetylcholine signal to the sweat glands.",
    window: { mw: [250, 450], logp: [1, 4], tpsa: [20, 70], hbd: [0, 1] },
    needs: [{ all: ["amino_ester"], w: 0.9, why: "an aminoalkyl ester, the shape of anticholinergics" }, { all: ["amine_basic", "ester"], w: 0.7, why: "an amine with an ester, the shape of anticholinergics" }, { all: ["amine_basic", "aryl"], w: 0.4, why: "an amine with an aromatic ring" }] },
  { id: "sleep_induce", group: "Body systems", name: "Induce sleepiness", status: "established", cns: true,
    mech: "Block histamine's wake signal in the brain.",
    window: { mw: [220, 420], logp: [2.5, 5], tpsa: [10, 60], hbd: [0, 1] },
    needs: [{ all: ["aryl", "amine_basic", "aryl_halide"], w: 0.8, why: "a halogenated aromatic ring with a basic amine" }, { all: ["aryl", "amine_basic"], w: 0.65, why: "an aromatic ring with a basic amine" }],
    conflicts: ["tired", "alert"] },
  { id: "appetite_up", group: "Body systems", name: "Increase appetite", status: "plausible", cns: true,
    mech: "Turn up the hunger signals (the opposite of blocking hunger).",
    window: CNS, needs: [], conflicts: ["hunger"] },
  { id: "immune", group: "Body systems", name: "Strengthen the immune response", status: "speculative",
    mech: "Prime the body's innate immune sensors so infections are met faster. Only a hypothesis for small molecules.",
    window: { mw: [150, 450], logp: [0, 4], tpsa: [30, 140], hbd: [0, 4] }, needs: [] },
  { id: "bone", group: "Body systems", name: "Stronger bones", status: "speculative",
    mech: "Shift bone-building and bone-removing cells toward building. Only a hypothesis here.",
    window: { mw: [150, 450], logp: [-1, 3], tpsa: [40, 150], hbd: [1, 5] }, needs: [] },

  /* ───── mind ───── */
  { id: "focus", group: "Mind", name: "Sharper focus", status: "plausible", cns: true,
    mech: "Steady the brain's attention circuits without the jitter of a strong stimulant.",
    window: { mw: [150, 340], logp: [0.5, 3.5], tpsa: [20, 85], hbd: [0, 2] },
    needs: [{ all: ["xanthine_like"], w: 0.8, why: "a xanthine, the core of caffeine" }, { all: ["fused_N", "amide"], w: 0.7, why: "a fused nitrogen ring with an amide" }, { all: ["fused_N"], w: 0.5, why: "a fused nitrogen ring system" }] },
  { id: "memory", group: "Mind", name: "Better memory", status: "speculative", cns: true, conflicts: ["amnesia"],
    mech: "Strengthen the changes between brain cells that store a memory. Only a hypothesis.",
    window: CNS, needs: [] },
  { id: "night_vision", group: "Mind", name: "Sharper night vision", status: "speculative",
    mech: "Speed the regeneration of the light-sensitive pigment in the retina. Only a hypothesis.",
    window: { mw: [150, 450], logp: [2, 6], tpsa: [0, 70], hbd: [0, 2] }, needs: [] },

  /* ───── mood and drive ───── */
  { id: "mood_up", group: "Mood and drive", name: "Lift mood and happiness", status: "established", cns: true,
    mech: "Raise the brain's serotonin and noradrenaline signals (by slowing their re-uptake or their breakdown), which lifts low mood over days to weeks.",
    window: { mw: [200, 380], logp: [2, 5], tpsa: [10, 60], hbd: [0, 2] },
    needs: [{ all: ["aryl_oxy_amine"], w: 0.95, why: "an aryl-oxy-propylamine, the arrangement of several reuptake blockers" }, { all: ["aryl_ether", "amine_basic"], w: 0.8, why: "an aryl-oxy-alkyl amine, a common arrangement in reuptake blockers" }, { all: ["aryl", "amine_basic", "aryl_halide"], w: 0.7, why: "a halogenated aromatic ring with a basic amine" }, { all: ["aryl", "amine_basic"], w: 0.5, why: "an aromatic ring with a basic amine" }],
    conflicts: ["mood_down"] },
  { id: "euphoria", group: "Mood and drive", name: "Euphoria (intense pleasure)", status: "established", cns: true,
    mech: "Flood the brain's reward circuit with dopamine, or switch on the receptors for the body's own pleasure-and-pain-relief messengers.",
    window: { mw: [150, 400], logp: [1, 4.5], tpsa: [10, 70], hbd: [0, 2] }, needs: [], conflicts: ["mood_down"] },
  { id: "confidence", group: "Mood and drive", name: "More confidence and motivation", status: "plausible", cns: true,
    mech: "Raise dopamine and noradrenaline tone in the circuits that weigh effort against reward, so tasks feel worth starting.",
    window: { mw: [150, 380], logp: [1, 4.5], tpsa: [10, 70], hbd: [0, 2] },
    needs: [{ all: ["aryl", "amine_basic"], w: 0.45, why: "an aromatic ring with a basic amine" }], conflicts: ["apathy"] },
  { id: "social", group: "Mood and drive", name: "More sociability and empathy", status: "speculative", cns: true,
    mech: "Raise the oxytocin and serotonin signals that make closeness and trust feel rewarding. Only a hypothesis for a pure effect.",
    window: { mw: [150, 380], logp: [1, 4], tpsa: [10, 70], hbd: [0, 2] }, needs: [] },
  { id: "libido_up", group: "Mood and drive", name: "Increase libido and arousal", status: "plausible",
    mech: "Raise desire through dopamine and melanocortin signalling in the brain, and arousal through blood flow (by holding up the vessel-relaxing messenger cGMP).",
    window: { mw: [250, 500], logp: [0.5, 4], tpsa: [40, 120], hbd: [0, 2] },
    needs: [{ all: ["sulfonamide", "aryl"], w: 0.6, why: "a sulfonamide on an aromatic ring, a feature of blood-flow arousal drugs" }, { all: ["aryl", "amine_basic"], w: 0.4, why: "an aromatic ring with a basic amine" }],
    conflicts: ["libido_down"] },
  { id: "mood_down", group: "Mood and drive", name: "Lower mood (sadness)", status: "plausible", cns: true,
    mech: "Drain or block the serotonin, dopamine and noradrenaline signals that hold mood up (the way some old blood-pressure drugs sometimes did).",
    window: { mw: [150, 450], logp: [1, 4.5], tpsa: [20, 90], hbd: [0, 3] }, needs: [], conflicts: ["mood_up", "euphoria"] },
  { id: "calm", group: "Mood and drive", name: "Calm anxiety", status: "established", cns: true,
    mech: "Raise the brain's inhibitory (GABA) tone or tune serotonin 1A receptors so the threat circuits settle.",
    window: { mw: [250, 420], logp: [1, 4], tpsa: [30, 80], hbd: [0, 1] },
    needs: [{ all: ["aryl", "amine_basic", "amide"], w: 0.7, why: "an aromatic amine with an amide, as in non-sedating anxiety drugs" }, { all: ["aryl", "amine_basic"], w: 0.45, why: "an aromatic ring with a basic amine" }] },
  { id: "fear_down", group: "Mood and drive", name: "Remove fear", status: "speculative", warn: true, unnoticed: "danger", cns: true,
    mech: "Quiet the amygdala's threat response. Only a hypothesis, and it removes the fear that keeps people out of danger.",
    window: { mw: [200, 420], logp: [1.5, 4.5], tpsa: [20, 80], hbd: [0, 2] }, needs: [] },
  { id: "libido_down", group: "Mood and drive", name: "Decrease libido", status: "established",
    mech: "Lower desire by raising serotonin in the brain's reward circuit, or by blocking androgen signalling.",
    window: { mw: [220, 420], logp: [2, 5], tpsa: [10, 70], hbd: [0, 2] },
    needs: [{ all: ["aryl", "amine_basic", "aryl_halide"], w: 0.6, why: "a halogenated aromatic ring with a basic amine, as in drugs that dull libido" }, { all: ["aryl", "amine_basic"], w: 0.4, why: "an aromatic ring with a basic amine" }],
    conflicts: ["libido_up"] },
  { id: "apathy", group: "Mood and drive", name: "Dull motivation and drive", status: "plausible", cns: true,
    mech: "Turn down dopamine signalling in the circuits that make effort feel worthwhile.",
    window: { mw: [200, 450], logp: [1, 4.5], tpsa: [20, 90], hbd: [0, 3] }, needs: [], conflicts: ["confidence"] },
  { id: "hallucination", group: "Mood and drive", name: "Alter perception (hallucinations)", status: "established", cns: true,
    mech: "Switch on serotonin 2A receptors on cortical neurons, which loosens how the brain filters and builds what you see, hear and feel.",
    window: { mw: [150, 400], logp: [1, 4], tpsa: [10, 70], hbd: [0, 3] }, needs: [] },
  { id: "amnesia", group: "Mood and drive", name: "Block forming new memories", status: "established", cns: true,
    mech: "Block the acetylcholine signal the hippocampus needs to store new memories, or turn up inhibition there.",
    window: { mw: [250, 450], logp: [1, 4], tpsa: [20, 80], hbd: [0, 1] },
    needs: [{ all: ["amino_ester", "aryl"], w: 0.9, why: "an aminoalkyl ester with an aromatic ring, the shape of memory-blocking anticholinergics" }, { all: ["amine_basic", "ester", "aryl"], w: 0.7, why: "an amine with an ester and an aromatic ring" }, { all: ["amine_basic", "aryl"], w: 0.4, why: "an amine with an aromatic ring" }],
    conflicts: ["memory"] },
  { id: "aggression_down", group: "Mood and drive", name: "Reduce aggression", status: "plausible", cns: true,
    mech: "Raise serotonin's braking effect on the circuits that drive anger and impulsive acts.",
    window: { mw: [200, 420], logp: [1, 4.5], tpsa: [20, 80], hbd: [0, 2] },
    needs: [{ all: ["aryl", "amine_basic"], w: 0.4, why: "an aromatic ring with a basic amine" }], conflicts: ["aggression_up"] },
  { id: "mood_steady", group: "Mood and drive", name: "Keep mood steady (emotional flattening)", status: "plausible", cns: true,
    mech: "Hold the brain's mood circuits at a set point by damping the serotonin, dopamine and noradrenaline swings, the way mood stabilisers do, but pushed until neither highs nor lows get through.",
    window: { mw: [200, 420], logp: [1, 4.5], tpsa: [20, 90], hbd: [0, 2] },
    needs: [{ all: ["aryl", "amide"], w: 0.55, why: "an aromatic amide, common in mood-stabilising drugs" }, { all: ["aryl", "amine_basic"], w: 0.35, why: "an aromatic ring with a basic amine" }],
    conflicts: ["mood_up", "mood_down", "euphoria", "erratic"] },
  { id: "erratic", group: "Mood and drive", name: "Erratic, impulsive behaviour", status: "speculative", cns: true,
    mech: "Loosen the frontal circuits that hold back impulses and weigh consequences, so behaviour swings unpredictably.",
    window: { mw: [150, 420], logp: [1, 4.5], tpsa: [10, 80], hbd: [0, 2] }, needs: [], conflicts: ["mood_steady"] },
  { id: "aggression_up", group: "Mood and drive", name: "Raise aggression", status: "speculative", cns: true,
    mech: "Lower serotonin's brake and raise noradrenaline and dopamine drive in the threat-and-anger circuits. Only a hypothesis for a clean effect.",
    window: { mw: [150, 400], logp: [1, 4.5], tpsa: [10, 70], hbd: [0, 2] }, needs: [], conflicts: ["aggression_down"] },

  /* ───── poison effects: harms, described by the mechanism and when they act ─────
       severity   how dangerous it is on its own (1 to 5)
       shape      how it typically builds (spike, rise, gradual, delayed, waves)
       lag        how many times longer it takes to show than the compound takes to arrive (slow-acting harms)
       irreversible  the damage does not undo itself
       counters   the effects that undo it: the antidote view searches for these */
  { id: "h_cardiac", group: "Poison effects", name: "Stop the heart", status: "plausible", severity: 5, shape: "spike", lag: 1, counters: ["c_heart", "c_bind"],
    mech: "Break the heart's electrical rhythm: block its sodium or potassium channels, or overstimulate it, until it quivers or stops.",
    window: { mw: [200, 500], logp: [0.5, 5], tpsa: [10, 100], hbd: [0, 3] }, needs: [] },
  { id: "h_breath", group: "Poison effects", name: "Stop breathing", status: "established", severity: 5, shape: "rise", lag: 1, cns: true, counters: ["c_breath", "c_wake"],
    mech: "Silence the brainstem's breathing drive, or paralyse the breathing muscles.",
    window: { mw: [150, 500], logp: [1, 4.5], tpsa: [10, 90], hbd: [0, 3] }, needs: [] },
  { id: "h_paralysis", group: "Poison effects", name: "Paralyse the muscles", status: "established", severity: 4, shape: "rise", lag: 1, counters: ["c_muscle"],
    mech: "Block the signal from nerve to muscle (at the acetylcholine receptors or the nerve's sodium channels) so muscles go slack.",
    window: { mw: [150, 600], logp: [-1, 4], tpsa: [20, 140], hbd: [0, 4] }, needs: [] },
  { id: "h_seizure", group: "Poison effects", name: "Cause seizures", status: "established", severity: 3, shape: "spike", lag: 1, cns: true, counters: ["c_seizure"],
    mech: "Block the brain's inhibitory GABA or glycine signals so neurons fire uncontrollably.",
    window: { mw: [150, 450], logp: [0.5, 4], tpsa: [10, 80], hbd: [0, 2] }, needs: [] },
  { id: "h_coma", group: "Poison effects", name: "Cause coma and unconsciousness", status: "established", severity: 3, shape: "rise", lag: 1, cns: true, counters: ["c_wake", "c_breath"],
    mech: "Depress the brain's arousal circuits until the person cannot be woken.",
    window: { mw: [150, 500], logp: [1, 4.5], tpsa: [10, 90], hbd: [0, 3] }, needs: [] },
  { id: "h_delirium", group: "Poison effects", name: "Cause delirium and confusion", status: "established", severity: 1, shape: "gradual", lag: 1, cns: true, counters: ["c_delirium"],
    mech: "Block acetylcholine in the brain, or flood it with excitatory signals, so thinking and perception break down.",
    window: { mw: [250, 450], logp: [1, 4], tpsa: [20, 80], hbd: [0, 1] },
    needs: [{ all: ["amino_ester", "aryl"], w: 0.9, why: "an aminoalkyl ester with an aromatic ring, the shape of anticholinergics that cloud the mind" }, { all: ["amine_basic", "ester", "aryl"], w: 0.7, why: "an amine with an ester and an aromatic ring" }, { all: ["amine_basic", "aryl"], w: 0.4, why: "an amine with an aromatic ring" }] },
  { id: "h_organ", group: "Poison effects", name: "Damage the liver and kidneys", status: "plausible", severity: 4, shape: "gradual", lag: 20, irreversible: true, counters: ["c_organ", "c_bind"],
    mech: "Overload the organs that clear toxins with reactive by-products, or starve them of blood flow.",
    window: { mw: [150, 550], logp: [0, 5], tpsa: [10, 130], hbd: [0, 4] }, needs: [] },
  { id: "h_cell_energy", group: "Poison effects", name: "Block cellular energy", status: "plausible", severity: 5, shape: "delayed", lag: 4, irreversible: true, counters: ["c_energy", "c_bind"],
    mech: "Shut down the mitochondria's energy production so cells starve of ATP even with oxygen present.",
    window: { mw: [150, 550], logp: [0, 5], tpsa: [10, 130], hbd: [0, 4] }, needs: [] },
  { id: "h_oxygen", group: "Poison effects", name: "Block oxygen delivery", status: "plausible", severity: 5, shape: "rise", lag: 1, counters: ["c_oxygen"],
    mech: "Stop the blood carrying oxygen (by locking up or oxidising haemoglobin) so tissues suffocate.",
    window: { mw: [150, 550], logp: [0, 5], tpsa: [10, 130], hbd: [0, 4] }, needs: [] },
  { id: "h_bleed", group: "Poison effects", name: "Cause uncontrolled bleeding", status: "plausible", severity: 4, shape: "delayed", lag: 60, counters: ["c_clot"],
    mech: "Block the vitamin-K cycle the clotting factors depend on, so blood can't clot.",
    window: { mw: [150, 500], logp: [0, 4.5], tpsa: [30, 120], hbd: [0, 4] }, needs: [] },
  { id: "h_heat", group: "Poison effects", name: "Cause runaway overheating", status: "plausible", severity: 4, shape: "gradual", lag: 3, counters: ["c_cool"],
    mech: "Make cells burn fuel as heat (uncouple the mitochondria) faster than the body can shed it.",
    window: { mw: [150, 550], logp: [0, 5], tpsa: [10, 130], hbd: [0, 4] }, needs: [] },
  { id: "h_vomit", group: "Poison effects", name: "Cause violent vomiting", status: "established", severity: 1, shape: "rise", lag: 1, counters: ["nausea"],
    mech: "Trigger the brainstem's vomiting centre.",
    window: { mw: [150, 450], logp: [0.5, 4], tpsa: [10, 100], hbd: [0, 3] },
    needs: [{ all: ["aryl", "amine_basic"], w: 0.4, why: "an aromatic ring with a basic amine" }] },
  { id: "h_pain", group: "Poison effects", name: "Cause severe pain", status: "plausible", severity: 2, shape: "rise", lag: 1, counters: ["pain_local", "pain_inflam"],
    mech: "Open the pain-sensing channels (the TRP family) or inflame the nerve endings.",
    window: { mw: [150, 450], logp: [1, 5], tpsa: [0, 80], hbd: [0, 2] }, needs: [] },
  { id: "h_blind", group: "Poison effects", name: "Damage vision", status: "plausible", severity: 3, shape: "delayed", lag: 10, irreversible: true, counters: [],
    mech: "Poison the optic nerve or starve the retina's cells of energy.",
    window: { mw: [150, 550], logp: [0, 5], tpsa: [10, 130], hbd: [0, 4] }, needs: [] },

  /* ───── antidote effects: what undoes each harm ───── */
  { id: "c_breath", group: "Antidote effects", name: "Restore the breathing drive", status: "plausible", cns: true,
    mech: "Switch the brainstem's breathing drive back on, or block whatever is suppressing it.",
    window: { mw: [150, 450], logp: [1, 4], tpsa: [10, 90], hbd: [0, 3] }, needs: [{ all: ["aryl", "amine_basic"], w: 0.4, why: "an aromatic ring with a basic amine" }] },
  { id: "c_heart", group: "Antidote effects", name: "Steady the heart rhythm", status: "established",
    mech: "Stabilise the heart's electrical activity (sodium-channel blockers, beta blockers, calcium or magnesium).",
    window: { mw: [200, 420], logp: [1, 4], tpsa: [30, 85], hbd: [0, 2] },
    needs: [{ all: ["anilide_amine"], w: 0.95, why: "an amino-acetanilide, the lidocaine-type arrangement of rhythm-steadying drugs" }, { all: ["anilide", "amine_basic"], w: 0.75, why: "the anilide-plus-amine arrangement of rhythm-steadying drugs" }, { all: ["aryloxy_propanolamine"], w: 0.85, why: "an aryl-oxy-propanolamine, the beta-blocker arrangement" }, { all: ["aryl_ether", "amino_alcohol"], w: 0.7, why: "an aryl-oxy amino-alcohol, close to a beta-blocker arrangement" }] },
  { id: "c_muscle", group: "Antidote effects", name: "Restore nerve-to-muscle signalling", status: "plausible",
    mech: "Raise acetylcholine at the junction, or free the blocked enzyme or receptor, so muscles respond again.",
    window: { mw: [120, 400], logp: [-1, 3], tpsa: [20, 100], hbd: [0, 3] }, needs: [{ all: ["amine_basic", "amide"], w: 0.4, why: "an amine with an amide" }] },
  { id: "c_seizure", group: "Antidote effects", name: "Stop seizures", status: "established", cns: true,
    mech: "Turn up inhibition (GABA) or damp sodium channels so neurons stop firing wildly.",
    window: { mw: [200, 350], logp: [0.5, 3.5], tpsa: [40, 90], hbd: [0, 2] }, needs: [{ all: ["amide", "aryl"], w: 0.6, why: "an aromatic amide, common in anticonvulsants" }] },
  { id: "c_wake", group: "Antidote effects", name: "Reverse sedation and coma", status: "plausible", cns: true,
    mech: "Block the sedating receptor, or raise the brain's arousal drive.",
    window: { mw: [150, 450], logp: [1, 4], tpsa: [10, 90], hbd: [0, 3] }, needs: [{ all: ["aryl", "amine_basic"], w: 0.4, why: "an aromatic ring with a basic amine" }] },
  { id: "c_delirium", group: "Antidote effects", name: "Clear delirium", status: "plausible", cns: true,
    mech: "Raise acetylcholine in the brain (by blocking its breakdown) so thinking clears.",
    window: { mw: [150, 400], logp: [0, 3], tpsa: [20, 90], hbd: [0, 2] }, needs: [] },
  { id: "c_bind", group: "Antidote effects", name: "Bind and neutralise the toxin", status: "plausible",
    mech: "Grab the toxin (as chelators grab metals, or as adsorbents and antibodies grab molecules) so it can't act.",
    window: { mw: [100, 500], logp: [-3, 2], tpsa: [50, 200], hbd: [1, 8] },
    needs: [{ all: ["acid", "amine_any"], w: 0.8, why: "an amino-acid-like pair, the shape of metal-grabbing chelators" }, { all: ["phenol", "acid"], w: 0.7, why: "a phenol with an acid, a metal grabber" }, { all: ["acid"], w: 0.4, why: "an acid group" }] },
  { id: "c_organ", group: "Antidote effects", name: "Protect and repair the liver and kidneys", status: "established",
    mech: "Restore the antioxidant glutathione and support the organs' clearing work.",
    window: { mw: [100, 350], logp: [-2, 1.5], tpsa: [50, 150], hbd: [1, 5] },
    needs: [{ all: ["thiol", "acid"], w: 1, why: "a thiol with an acid, the shape of drugs that restore glutathione" }, { all: ["thiol"], w: 0.6, why: "a thiol, which can stand in for glutathione" }, { all: ["acid", "amine_any"], w: 0.4, why: "an amino-acid-like pair" }] },
  { id: "c_clot", group: "Antidote effects", name: "Restore blood clotting", status: "plausible",
    mech: "Replace the clotting factors, or restore the vitamin-K cycle.",
    window: { mw: [150, 500], logp: [0, 4], tpsa: [30, 120], hbd: [0, 4] }, needs: [] },
  { id: "c_cool", group: "Antidote effects", name: "Close the heat leak and cool the body", status: "speculative",
    mech: "Shut the leak that turns fuel into heat (hard once it's open) and dump the heat; today treatment is mostly supportive.",
    window: { mw: [150, 550], logp: [0, 5], tpsa: [10, 130], hbd: [0, 4] }, needs: [] },
  { id: "c_oxygen", group: "Antidote effects", name: "Restore oxygen delivery", status: "plausible",
    mech: "Re-activate the blood's oxygen carrier, or supply a decoy that mops up whatever is blocking it.",
    window: { mw: [150, 550], logp: [0, 5], tpsa: [10, 130], hbd: [0, 4] }, needs: [] },
  { id: "c_energy", group: "Antidote effects", name: "Restore cell energy", status: "plausible",
    mech: "Bypass the blocked step with another fuel route or cofactor so the mitochondria can work again.",
    window: { mw: [100, 320], logp: [-2, 2], tpsa: [30, 140], hbd: [0, 4] },
    needs: [{ all: ["nicotinamide_like"], w: 0.8, why: "a pyridine-3-carboxamide, the core of the energy cofactors" }, { all: ["acid"], w: 0.3, why: "an acid, like the small acids of the energy cycle" }] },
  { id: "c_sleep", group: "Antidote effects", name: "Restore the ability and drive to sleep", status: "plausible", cns: true,
    mech: "Rebuild or free the brain's sleep-promoting circuits (the adenosine and GABA sleep drive, the body-clock timing) so sleep starts and holds, without sedating the person into unconsciousness.",
    window: { mw: [150, 420], logp: [1, 4.5], tpsa: [10, 90], hbd: [0, 2] }, needs: [{ all: ["aryl", "amine_basic"], w: 0.5, why: "an aromatic ring with a basic amine, as in sleep-promoting antihistamines" }] },
  { id: "c_brain", group: "Antidote effects", name: "Repair and protect brain cells", status: "plausible", cns: true,
    mech: "Calm the over-excitation and oxidative stress that damage neurons, and support the growth signals that rebuild their connections.",
    window: { mw: [150, 420], logp: [0.5, 4], tpsa: [20, 90], hbd: [0, 3] },
    needs: [{ all: ["phenol", "aryl"], w: 0.55, why: "a phenol, which can mop up reactive oxygen in the brain" }, { all: ["aryl", "amide"], w: 0.4, why: "an aromatic amide" }] },
  { id: "c_reserve", group: "Antidote effects", name: "Rebuild body reserves and hydration", status: "plausible",
    mech: "Restore blood sugar, salts, protein and fluid in a controlled way (careful re-feeding), so starved and dried-out tissues recover.",
    window: { mw: [100, 350], logp: [-3, 1], tpsa: [50, 160], hbd: [1, 6] }, needs: [{ all: ["acid", "amine_any"], w: 0.6, why: "an amino-acid-like pair, a building block for rebuilding tissue" }, { all: ["acid"], w: 0.3, why: "an acid group" }] },
  { id: "c_pain", group: "Antidote effects", name: "Restore pain sensation", status: "plausible", cns: true,
    mech: "Re-open the pain pathways by blocking the body's own pain-damping signal, or by displacing whatever is blocking the nerve channels.",
    window: { mw: [150, 450], logp: [1, 4.5], tpsa: [10, 90], hbd: [0, 3] }, needs: [{ all: ["aryl", "amine_basic"], w: 0.4, why: "an aromatic ring with a basic amine, as in blockers of pain-damping receptors" }] },
  { id: "c_mood", group: "Antidote effects", name: "Restore a normal mood range", status: "plausible", cns: true,
    mech: "Release the damping on the mood circuits so highs and lows return.",
    window: { mw: [150, 420], logp: [1, 4.5], tpsa: [10, 90], hbd: [0, 2] }, needs: [{ all: ["aryl", "amine_basic"], w: 0.4, why: "an aromatic ring with a basic amine" }] },
];
export const EFFECT_BY_ID = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

const MODIFY = new Set(["pain_local", "pain_inflam", "pain_central", "tired", "hunger", "thirst", "nausea", "itch", "temp", "muscle_burn", "sweat", "hr_down", "bp_down", "sleep_induce", "appetite_up", "mood_down", "calm", "fear_down", "libido_down", "apathy", "hallucination", "amnesia", "aggression_down", "aggression_up", "mood_steady", "erratic"]);
/* Consequences: what happens, in days after the effect starts, when the body's need goes unmet or a warning is lost.
   They are rough, rule-of-thumb timelines (the sleep-loss ones lean on animal studies of total sleep deprivation, the hunger
   ones on fasting with water); `collapse` is when the body gives out. The strength of the effect scales the days. */
const SLEEP_LOSS = [
  { day: 1, text: "Attention, memory and reaction time start to slip", tone: "cognitive" },
  { day: 2, text: "Irritability and mood swings", tone: "behaviour" },
  { day: 3.5, text: "Hallucinations and paranoia begin; thinking turns erratic", tone: "cognitive" },
  { day: 5, text: "Impulse control fails: aggression and violent outbursts become likely", tone: "behaviour" },
  { day: 9, text: "Delusions, tremor, heart and immune strain", tone: "body" },
];
const HUNGER_LOSS = [
  { day: 3, text: "Fat stores burn; weakness and feeling cold", tone: "body" },
  { day: 10, text: "Muscle wasting; dizziness and low blood pressure", tone: "body" },
  { day: 21, text: "Heart and organ strain; confusion and apathy", tone: "cognitive" },
];
const THIRST_LOSS = [
  { day: 1, text: "Dehydration: confusion and dizziness", tone: "cognitive" },
  { day: 3, text: "The kidneys begin to fail", tone: "body" },
];
const UNNOTICED_INJURY = [{ day: 2, text: "Injuries, burns and infections go unnoticed and worsen", tone: "danger" }];
const EXTRA = {
  tired: { counters: ["c_sleep", "c_brain"], consequences: SLEEP_LOSS, collapse: { day: 17, text: "The body collapses: organ and immune failure (about two to three weeks in animal studies of total sleep loss)" } },
  hunger: { counters: ["appetite_up", "c_reserve"], consequences: HUNGER_LOSS, collapse: { day: 45, text: "The body collapses from starvation (people have survived roughly four to ten weeks without food, with water)" } },
  thirst: { counters: ["c_reserve"], consequences: THIRST_LOSS, collapse: { day: 4, text: "The body collapses from dehydration and kidney failure" } },
  pain_local: { counters: ["c_pain"], consequences: UNNOTICED_INJURY, painLike: true },
  pain_inflam: { counters: ["c_pain"], consequences: UNNOTICED_INJURY, painLike: true },
  pain_central: { counters: ["c_pain"], consequences: UNNOTICED_INJURY, painLike: true },
  temp: { consequences: [{ day: 1, text: "Burns and frostbite go unnoticed", tone: "danger" }] },
  fear_down: { consequences: [{ day: 1, text: "Walks into danger without fear", tone: "danger" }] },
  mood_steady: { counters: ["c_mood"] },
};
for (const [id, x] of Object.entries(EXTRA)) Object.assign(EFFECT_BY_ID[id], x);
// when the need itself is gone there is nothing to go wrong
for (const id of ["tired", "hunger", "thirst"]) Object.assign(EFFECT_BY_ID[id].modes.need, { consequences: [], collapse: null });

for (const e of EFFECTS) e.kind = e.id.startsWith("h_") ? "harm" : e.id.startsWith("c_") ? "counter" : MODIFY.has(e.id) ? "modify" : "enhance";
// a harm and what undoes it are opposites, so they can't be chosen together
for (const e of EFFECTS) if (e.kind === "harm") e.conflicts = [...(e.conflicts || []), ...e.counters.filter((id) => id.startsWith("c_"))];
export const KIND_INFO = {
  enhance: { label: "Enhancements", note: "Do more than the body normally can." },
  modify: { label: "Modifiers", note: "Change what the body feels, needs or does." },
  harm: { label: "Poison effects", note: "Harm or endanger the body. Pair with a time course below." },
  counter: { label: "Antidote effects", note: "Undo or block a harm. Or use “Show” below to find antidotes for you." },
};

/* an effect as chosen: the base effect with its mode's overrides, e.g. sleep as "can't sleep at all" */
export function resolve(sel) {
  const e = EFFECT_BY_ID[sel.id], mode = e.modes && (sel.mode in e.modes ? sel.mode : e.defaultMode);
  return mode ? { ...e, ...e.modes[mode], modeId: mode } : { ...e, modeId: null };
}

export const STATUS_NOTE = {
  established: "Real drugs act this way.",
  plausible: "The mechanism exists, but no good small-molecule template is known here.",
  speculative: "Only a hypothesis.",
};
export const LEVELS = ["mild", "strong", "extreme"];

/* the physical features a design can ask for */
export const FEATURES = {
  form: { label: "Form", options: [["any", "Any"], ["solid", "Powder or crystals"], ["liquid", "Liquid"]] },
  colour: { label: "Colour", options: [["any", "Any"], ["white", "White or colourless"], ["yellow", "Yellow"]] },
  solubility: { label: "Dissolves in", options: [["any", "Anything"], ["water", "Water"], ["oil", "Oil / fat"]] },
};
