var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.js
import { EmailMessage } from "cloudflare:email";

// worker/quiz-seed.js
var quiz_seed_default = [{ "slug": "salvation-moral-truth-placement-test", "published": true, "title": "Salvation Morality and Truth Placement Test", "summary": "Sixty questions on salvation, other religions, belief, hidden knowledge and ethics, and which sect and religious figure you are closest to.", "eyebrow": "", "intro": `Six old debates about salvation, other religions, belief, hidden knowledge and ethics. Pick the answer CLOSEST to your view on each question. Every question has seven answers, including "I don't know," which leaves your position unmoved.`, "sections": [{ "id": "sal", "title": "Universal Salvation vs Eternal Torment vs Annihilationism", "short": "Final Destiny", "poles": ["Eternal Torment", "Universal Salvation", "Annihilationism"], "questions": [{ "text": "Will every person eventually be reconciled to God?", "options": [{ "text": "Yes, all will be saved, without exception", "to": [1] }, { "text": "Yes, all will be saved, but some only after purification", "to": [1] }, { "text": "Probably, though we can only hope for it", "to": [1] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "No, some will be destroyed and cease to exist", "to": [2] }, { "text": "No, some will remain separated from God forever by their own choice", "to": [0] }, { "text": "No, some are predestined to eternal punishment", "to": [0] }], "id": "sal1" }, { "text": "Is hell a place of conscious suffering?", "options": [{ "text": "No, hell does not exist", "to": [1] }, { "text": 'No, hell is non-existence (the "second death")', "to": [2] }, { "text": "Yes, but only temporarily before restoration or destruction", "to": [1, 2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, but the suffering is mainly the pain of separation from God", "to": [0] }, { "text": "Yes, both spiritual and physical suffering", "to": [0] }, { "text": "Yes, intense and literal torment as scripture describes", "to": [0] }], "id": "sal2" }, { "text": "Is the punishment of the wicked everlasting in duration?", "options": [{ "text": "No, there is no punishment of the wicked", "to": [1] }, { "text": "No, it is corrective and ends when it has done its work", "to": [1] }, { "text": "No, it ends in annihilation", "to": [2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Its effects are everlasting, but not the suffering itself", "to": [2] }, { "text": "Yes, but its intensity may vary by person", "to": [0] }, { "text": "Yes, conscious and unending", "to": [0] }], "id": "sal3" }, { "text": "Can a person repent after death?", "options": [{ "text": "Yes, everyone eventually will", "to": [1] }, { "text": "Yes, the door is never closed", "to": [1] }, { "text": "Yes, but only for those who never had a fair chance in life", "to": [1] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "No, those who die unrepentant are finally destroyed", "to": [2] }, { "text": "No, death seals one's choice", "to": [0] }, { "text": "No, and the damned would not want to", "to": [0] }], "id": "sal4" }, { "text": "Is the human soul naturally immortal?", "options": [{ "text": "Yes, and so all souls must eventually return to God", "to": [1] }, { "text": "Yes, the soul is inherently eternal", "to": [0] }, { "text": "Yes, but only because God sustains it", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "No, immortality is a gift given only to the saved", "to": [2] }, { "text": "No, the soul dies with the body until resurrection", "to": [2] }, { "text": "No, there is no separate soul", "to": [2] }], "id": "sal5" }, { "text": "Is eternal punishment compatible with God's love?", "options": [{ "text": "No, it is completely incompatible", "to": [1, 2] }, { "text": "No, a loving God would not allow it", "to": [1, 2] }, { "text": "Only if it is self-chosen by the person", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, because God respects human freedom", "to": [0] }, { "text": "Yes, because God's justice and love are not in conflict", "to": [0] }, { "text": "Yes, it displays God's glory and holiness", "to": [0] }], "id": "sal6" }, { "text": "Can God's justice be satisfied by a finite punishment for finite sins?", "options": [{ "text": "Yes, and no punishment is needed at all", "to": [1] }, { "text": "Yes, finite sins deserve only finite punishment", "to": [1, 2] }, { "text": "Yes, and destruction is the just and final penalty", "to": [2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only for some sins, not all", "to": [2, 0] }, { "text": "No, ongoing rebellion earns ongoing punishment", "to": [0] }, { "text": "No, sin against an infinite God deserves infinite punishment", "to": [0] }], "id": "sal7" }, { "text": "Will the devil and his angels ultimately be redeemed?", "options": [{ "text": "Yes, all creation will be restored", "to": [1] }, { "text": "Yes, if they eventually repent", "to": [1] }, { "text": "Possibly, but we cannot know", "to": [1] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "No, they will be destroyed", "to": [2] }, { "text": "No, they are beyond redemption by nature", "to": [0] }, { "text": "No, they will be punished forever", "to": [0] }], "id": "sal8" }, { "text": "Is the purpose of divine punishment to correct the sinner?", "options": [{ "text": "Yes, entirely", "to": [1] }, { "text": "Mostly, though it also serves justice", "to": [1] }, { "text": "Partly, alongside protecting others", "to": [1, 2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "No, it is to end evil permanently", "to": [2] }, { "text": "No, it is primarily retributive justice", "to": [0] }, { "text": "No, it exists to display God's glory", "to": [0] }], "id": "sal9" }, { "text": "Will the saved in heaven be aware of those who are lost?", "options": [{ "text": "No one will be lost", "to": [1] }, { "text": "No, the lost will no longer exist", "to": [2] }, { "text": "No, God will remove the memory", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, but it will not cause them sorrow", "to": [0] }, { "text": "Yes, and they will agree with God's justice", "to": [0] }, { "text": "Yes, and it will increase their gratitude", "to": [0] }], "id": "sal10" }] }, { "id": "uni", "title": "Who Can Be Saved? Universalism vs Exclusivism", "short": "Who Can Be Saved", "poles": ["Universalism", "Exclusivism"], "mid": "Inclusivism", "questions": [{ "text": "Can a person who has never heard of Christ be saved?", "options": [{ "text": "Yes, everyone will be saved" }, { "text": "Yes, through general revelation in nature and conscience" }, { "text": "Yes, if he responds to the light he has been given" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, if he accepts Christ when presented after death" }, { "text": "Only in rare cases, through God's special intervention" }, { "text": "No" }], "id": "uni1" }, { "text": "Can a sincere follower of another religion be saved?", "options": [{ "text": "Yes, all religions lead to God" }, { "text": "Yes, sincerity is what matters" }, { "text": "Yes, through Christ, even if unknowingly" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, if he does not deny the truth if it is revealed to him" }, { "text": "Only if his religion contains no direct rejection of Christ" }, { "text": "No" }], "id": "uni2" }, { "text": "Is explicit faith in Christ necessary for salvation?", "options": [{ "text": "No, salvation is universal" }, { "text": "No, any genuine seeking of God is enough" }, { "text": "No, Christ saves but faith in him need not be explicit" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, for those who have heard the gospel" }, { "text": "Yes, except for infants and the mentally disabled" }, { "text": "Yes, without exception" }], "id": "uni3" }, { "text": "Can a person who died while believing bad theology go to heaven?", "options": [{ "text": "Yes, there is no such thing as bad theology" }, { "text": "Yes, theology is irrelevant to his eternal fate" }, { "text": "Yes, if his heart is in the right place" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, if he does not deny the truth if it is revealed to him" }, { "text": "Yes, if the bad doctrine is a minor doctrine" }, { "text": "No" }], "id": "uni4" }, { "text": "Can an atheist who lived a moral life be saved?", "options": [{ "text": "Yes, everyone will be saved" }, { "text": "Yes, morality is what God cares about" }, { "text": "Yes, if his unbelief was honest rather than willful" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, if he accepts God after death when shown the truth" }, { "text": "Only if he never truly encountered the gospel" }, { "text": "No" }], "id": "uni5" }, { "text": "Could people who lived before Christ be saved?", "options": [{ "text": "Yes, everyone will be saved" }, { "text": "Yes, through the light they had, in nature and conscience" }, { "text": "Yes, through Christ's work, which reaches back to them" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, when Christ preached to the dead" }, { "text": "Only those who looked forward to the Messiah" }, { "text": "No, only those who knew Christ could be saved" }], "id": "uni6" }, { "text": "Can a person be saved outside the visible church?", "options": [{ "text": "Yes, the church is irrelevant to salvation" }, { "text": "Yes, the true church is invisible" }, { "text": "Yes, if he is united to the church by desire" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, but only in extraordinary circumstances" }, { "text": "Only if he did not know the church's claims" }, { "text": "No" }], "id": "uni7" }, { "text": "Are infants and those incapable of belief saved?", "options": [{ "text": "Yes, all people are saved" }, { "text": "Yes, they are innocent" }, { "text": "Yes, by God's special mercy" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only the baptized" }, { "text": "Only the elect" }, { "text": "No" }], "id": "uni8" }, { "text": "Can someone be saved without ever being baptised?", "options": [{ "text": "Yes, everyone will be saved, baptised or not" }, { "text": "Yes, baptism makes no difference to who is saved" }, { "text": "Yes, if they trust in Christ: baptism is a sign of that trust" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, though baptism is the ordinary way, and God can save without it" }, { "text": "Only if they wanted baptism, or died for the faith before receiving it" }, { "text": "No, baptism is necessary without exception" }], "id": "uni9" }, { "text": "Can a person who rejected a distorted version of Christianity be saved?", "options": [{ "text": "Yes, everyone will be saved" }, { "text": "Yes, he did not reject the real Christ" }, { "text": "Yes, if he was seeking truth honestly" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, if he would accept the true version when shown it" }, { "text": "Only if he never had access to the true version" }, { "text": "No" }], "id": "uni10" }] }, { "id": "rel", "title": "Truth in Other Religions: Pluralism vs Exclusivism", "short": "Other Religions", "poles": ["Pluralism", "Exclusivism"], "mid": "Inclusivism", "questions": [{ "text": "Do other religions contain saving truth?", "options": [{ "text": "Yes, all religions are equally valid paths" }, { "text": "Yes, each contains enough truth to save" }, { "text": "Yes, but only insofar as they reflect Christ" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "They contain partial truth, but not saving truth" }, { "text": "They contain some truth, mixed with serious error" }, { "text": "No, they are false" }], "id": "rel1" }, { "text": "Do Christians, Jews and Muslims worship the same God?", "options": [{ "text": "Yes, all religions worship the same God" }, { "text": "Yes, all three worship the one God of Abraham" }, { "text": "Yes, though they understand him imperfectly" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Partly: they may worship the true God but misunderstand who he is" }, { "text": "No, only Christians worship the true God" }, { "text": "No, other religions worship false gods" }], "id": "rel2" }, { "text": "Can the scriptures of other religions be genuinely inspired by God?", "options": [{ "text": "Yes, all sacred texts are equally inspired" }, { "text": "Yes, many are inspired in their own way" }, { "text": "Yes, in part: they can carry real revelation without being complete" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "They contain some insight God has allowed, but are not inspired" }, { "text": "They contain human wisdom only" }, { "text": "No, they are false or deceptive" }], "id": "rel3" }, { "text": "Can the founders of other religions be guided by God?", "options": [{ "text": "Yes, all of them were prophets or teachers sent by God" }, { "text": "Yes, many of them were" }, { "text": "Some may have been, in a limited way" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "They may have had true insight, but not guidance from God" }, { "text": "They were wise people, nothing more" }, { "text": "No, they led people away from God" }], "id": "rel4" }, { "text": "Is Jesus the only way to God?", "options": [{ "text": "No, there are many ways to God" }, { "text": "No, Jesus is one way among others" }, { "text": "Jesus is the only saviour, but his work reaches people beyond the church" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, the only way, though some may follow him without knowing it" }, { "text": "Yes, the only way, and the church is where it is found" }, { "text": "Yes, the only way, and it must be taken knowingly" }], "id": "rel5" }, { "text": "Should Christians try to convert people of other religions?", "options": [{ "text": "No, conversion is unnecessary or harmful" }, { "text": "No, Christians should only dialogue and learn" }, { "text": "Only if invited to share, and without pressure" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, by sharing the faith and by example" }, { "text": "Yes, it is the duty of every Christian" }, { "text": "Yes, urgently, since people are lost without it" }], "id": "rel6" }, { "text": "Can Christians pray or worship together with people of other religions?", "options": [{ "text": "Yes, freely, as one family of faith" }, { "text": "Yes, there is no real difference" }, { "text": "Yes, on certain occasions, as a sign of peace" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only at public occasions, not in worship" }, { "text": "No, but they can work together on shared causes" }, { "text": "No, Christians should not join in the worship of others" }], "id": "rel7" }, { "text": "Can other religions teach morality as well as Christianity?", "options": [{ "text": "Yes, equally well" }, { "text": "Yes, in many ways better" }, { "text": "Yes, in many respects" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "In some respects, but not as fully" }, { "text": "Only partly, since sin has damaged moral understanding" }, { "text": "No, only Christianity teaches true morality" }], "id": "rel8" }, { "text": "When religions contradict each other, can both be right?", "options": [{ "text": "Yes, the contradictions are only apparent" }, { "text": "Yes, each is true for those who follow it" }, { "text": "Yes, on the deepest level they agree" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "On secondary matters, not on the central claims" }, { "text": "Rarely, since most differences are real" }, { "text": "No, if they differ, all but one is wrong" }], "id": "rel9" }, { "text": "Does God work through the prayers and rituals of other religions?", "options": [{ "text": "Yes, equally" }, { "text": "Yes, God answers all sincere prayer" }, { "text": "Yes, God can use them to draw people to himself" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Perhaps in individual cases, known only to God" }, { "text": "Not as a rule, since they lack the means God has given" }, { "text": "No, only through Christ and his church" }], "id": "rel10" }] }, { "id": "ort", "title": "Orthodoxy vs Orthopraxy vs Orthopathy", "short": "Right Belief, Practice, or Heart", "poles": ["Orthodoxy", "Orthopraxy", "Orthopathy"], "questions": [{ "text": "Is right belief necessary to be a faithful member of the religion?", "options": [{ "text": "No, belief is irrelevant", "to": [1, 2] }, { "text": "No, practice is what matters", "to": [1] }, { "text": "No, the heart's devotion is what matters", "to": [2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only core beliefs are necessary", "to": [0] }, { "text": "Yes, but belief must be accompanied by practice", "to": [0, 1] }, { "text": "Yes, it is the foundation of faithfulness", "to": [0] }], "id": "ort1" }, { "text": "Can a person who acts rightly but believes wrongly be considered righteous?", "options": [{ "text": "Yes, actions are all that matter", "to": [1] }, { "text": "Yes, right action implies right belief at some level", "to": [1] }, { "text": "Yes, if his heart is in the right place", "to": [2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Partially righteous", "to": [1, 0] }, { "text": "Only if the wrong beliefs are minor", "to": [0] }, { "text": "No", "to": [0] }], "id": "ort2" }, { "text": "Can a person who believes rightly but acts wrongly be considered righteous?", "options": [{ "text": "Yes, belief is what saves", "to": [0] }, { "text": "Yes, because his sins are forgiven", "to": [0] }, { "text": "Yes, if he repents of his actions", "to": [0, 2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Partially righteous", "to": [0, 1] }, { "text": "Only if the wrong actions are minor", "to": [1] }, { "text": "No, faith without works is dead", "to": [1] }], "id": "ort3" }, { "text": "Does God judge people more by their beliefs, actions, or inner disposition?", "options": [{ "text": "Beliefs alone", "to": [0] }, { "text": "More beliefs", "to": [0] }, { "text": "All three almost equally", "to": [0, 1, 2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "More actions", "to": [1] }, { "text": "More inner disposition", "to": [2] }], "id": "ort4" }, { "text": "Is genuine love for God possible without correct doctrine?", "options": [{ "text": "Yes, doctrine is irrelevant to love", "to": [2] }, { "text": "Yes, love matters more than doctrine", "to": [2] }, { "text": "Yes, but correct doctrine deepens it", "to": [2, 0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only with correct core doctrines", "to": [0] }, { "text": "Only imperfectly", "to": [0] }, { "text": "No, you cannot love what you do not know rightly", "to": [0] }], "id": "ort5" }, { "text": "Should a religious community exclude members for incorrect beliefs?", "options": [{ "text": "Never", "to": [1, 2] }, { "text": "Only if they teach their beliefs to others", "to": [1, 2] }, { "text": "Only for denial of core doctrines", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, after repeated correction", "to": [0] }, { "text": "Yes, for any serious doctrinal error", "to": [0] }, { "text": "Yes, for any doctrinal error", "to": [0] }], "id": "ort6" }, { "text": "Should a religious community exclude members for incorrect practice?", "options": [{ "text": "Never", "to": [0, 2] }, { "text": "Only if it harms others", "to": [0, 2] }, { "text": "Only for grave public sin", "to": [1] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, after repeated correction", "to": [1] }, { "text": "Yes, for any serious violation", "to": [1] }, { "text": "Yes, for any violation", "to": [1] }], "id": "ort7" }, { "text": "Is ritual observance valuable if performed without inner feeling?", "options": [{ "text": "Yes, the act itself is what matters", "to": [1] }, { "text": "Yes, it shapes the heart over time", "to": [1] }, { "text": "Yes, but less valuable than heartfelt ritual", "to": [1, 2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only as a habit until feeling returns", "to": [1, 2] }, { "text": "Barely", "to": [2] }, { "text": "No, it is empty or even hypocritical", "to": [2] }], "id": "ort8" }, { "text": "Is doubt compatible with true faith?", "options": [{ "text": "Yes, doubt is essential to faith", "to": [2] }, { "text": "Yes, faith is practice, not certainty", "to": [1] }, { "text": "Yes, if one keeps seeking", "to": [2] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only minor or temporary doubts", "to": [0] }, { "text": "Only doubts about non-essential doctrines", "to": [0] }, { "text": "No", "to": [0] }], "id": "ort9" }, { "text": "Can emotional experience of God serve as a source of religious truth?", "options": [{ "text": "Yes, it is the primary source", "to": [2] }, { "text": "Yes, equal to scripture and tradition", "to": [2] }, { "text": "Yes, as a secondary confirmation", "to": [2, 0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only if it agrees with scripture", "to": [0] }, { "text": "Rarely, and with great caution", "to": [0] }, { "text": "No, emotions are unreliable", "to": [0] }], "id": "ort10" }] }, { "id": "eso", "title": "Esotericism vs Exotericism", "short": "Hidden or Public Truth", "poles": ["Esotericism", "Exotericism"], "mid": "Balanced", "questions": [{ "text": "Do sacred texts contain hidden meanings beyond their literal sense?", "options": [{ "text": "Yes, the hidden meaning is the true meaning" }, { "text": "Yes, there are many layers of meaning" }, { "text": "Yes, but the literal sense is primary" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only symbolic meanings that are publicly accessible" }, { "text": "Only in specific prophetic or poetic passages" }, { "text": "No" }], "id": "eso1" }, { "text": "Should certain religious teachings be reserved for initiates?", "options": [{ "text": "Yes, most important teachings are hidden" }, { "text": "Yes, the deepest truths must be protected" }, { "text": "Yes, but only until a person is ready" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only practices, not teachings" }, { "text": "No, but some teachings require maturity" }, { "text": "No, all truth should be public" }], "id": "eso2" }, { "text": "Can an ordinary believer understand the full truth of their religion?", "options": [{ "text": "No, only a few enlightened people can" }, { "text": "No, it requires initiation" }, { "text": "No, but they can grasp enough to be saved" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, with enough study and devotion" }, { "text": "Yes, with the help of the Spirit" }, { "text": "Yes, the truth is plain and simple" }], "id": "eso3" }, { "text": "Is the literal meaning of scripture ever false?", "options": [{ "text": "Yes, it is often a veil over the true meaning" }, { "text": "Yes, when it conflicts with the spiritual meaning" }, { "text": "Yes, in some passages" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only in non-essential matters like science or history" }, { "text": "No, though it is sometimes figurative" }, { "text": "No, never" }], "id": "eso4" }, { "text": "Do all religions share a hidden common core?", "options": [{ "text": "Yes, all religions teach the same truth beneath the surface" }, { "text": "Yes, the mystics of all faiths agree" }, { "text": "Yes, but some religions express it better" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "They share some moral truths only" }, { "text": "They share little of importance" }, { "text": "No" }], "id": "eso5" }, { "text": "Is mystical experience a reliable path to religious knowledge?", "options": [{ "text": "Yes, it is the only true path" }, { "text": "Yes, it is the highest path" }, { "text": "Yes, if guided by a tradition" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only if tested against scripture" }, { "text": "Rarely" }, { "text": "No" }], "id": "eso6" }, { "text": "Should spiritual knowledge require a teacher or lineage to transmit it?", "options": [{ "text": "Yes, always" }, { "text": "Yes, for the deepest knowledge" }, { "text": "Yes, ideally, but not strictly" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Teachers help, but are not necessary" }, { "text": "No, scripture is enough" }, { "text": "No, each person can access God directly" }], "id": "eso7" }, { "text": "Is public religious ritual sufficient for spiritual fulfillment?", "options": [{ "text": "No, it is only the outer shell" }, { "text": "No, it must be supplemented by inner practice" }, { "text": "No, but it is a necessary starting point" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, if done with sincerity" }, { "text": "Yes, for most people" }, { "text": "Yes, it is the fullness of religious life" }], "id": "eso8" }, { "text": "Can secret knowledge be necessary for salvation or enlightenment?", "options": [{ "text": "Yes, salvation is by knowledge" }, { "text": "Yes, for full enlightenment" }, { "text": "Yes, for higher levels of spiritual life" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only knowledge that God reveals personally" }, { "text": "No, but it can help" }, { "text": "No, salvation is open to all" }], "id": "eso9" }, { "text": "Should religious leaders ever withhold truths from the public for their own good?", "options": [{ "text": "Yes, most people cannot handle the truth" }, { "text": "Yes, some truths are dangerous" }, { "text": "Yes, but only temporarily" }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only in pastoral situations with individuals" }, { "text": "Rarely, if ever" }, { "text": "No, never" }], "id": "eso10" }] }, { "id": "eth", "title": "Utilitarian vs Deontological vs Virtue Ethics", "short": "Moral Framework", "poles": ["Virtue Ethics", "Utilitarian", "Deontological"], "questions": [{ "text": "Is it ever right to lie to protect someone?", "options": [{ "text": "Yes, whenever it produces a better outcome", "to": [1] }, { "text": "Yes, to protect an innocent life", "to": [1] }, { "text": "Yes, if a good person would do so", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only by withholding information, not by stating falsehoods", "to": [2] }, { "text": "No, but it may be forgivable", "to": [2, 0] }, { "text": "No, lying is always wrong", "to": [2] }], "id": "eth1" }, { "text": "May a starving person steal food to feed their family?", "options": [{ "text": "Yes, whenever it prevents more suffering than it causes", "to": [1] }, { "text": "Yes, the good done outweighs the harm to the owner", "to": [1] }, { "text": "Yes, a good and desperate person would, and no one could rightly blame them", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, but only when there is no other way, since need gives a claim on what others have to spare", "to": [2, 0] }, { "text": "No, but the guilt is greatly lessened", "to": [2] }, { "text": "No, stealing is always wrong", "to": [2] }], "id": "eth2" }, { "text": "Is an action good if it produces good results from bad motives?", "options": [{ "text": "Yes, results are all that matter", "to": [1] }, { "text": "Yes, mostly", "to": [1] }, { "text": "The action is good, but the person is not", "to": [1, 0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only partially good", "to": [2, 0] }, { "text": "No, motive determines moral worth", "to": [2] }, { "text": "No, it reveals bad character", "to": [0] }], "id": "eth3" }, { "text": "May a doctor give a dying patient enough pain relief to ease their suffering, knowing it may hasten their death?", "options": [{ "text": "Yes, easing suffering is what matters most", "to": [1] }, { "text": "Yes, and a patient may also choose to end their life", "to": [1] }, { "text": "Yes, a compassionate doctor would", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, if the aim is relief of pain and not the death itself", "to": [2] }, { "text": "Only if there is no other way to ease the pain", "to": [2, 0] }, { "text": "No, a doctor may never do anything that shortens a life", "to": [2] }], "id": "eth4" }, { "text": "Can someone of good character commit a serious wrong and still be of good character?", "options": [{ "text": "Goodness is about acts, not people", "to": [1, 2] }, { "text": "Yes, if the overall consequences of his life are good", "to": [1] }, { "text": "Yes, if it is out of character and he repents", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, if the act was minor", "to": [0] }, { "text": "Only if done in ignorance", "to": [2] }, { "text": "No", "to": [2] }], "id": "eth5" }, { "text": "May a Christian ever kill in war?", "options": [{ "text": "Yes, whenever it brings the war to an end sooner", "to": [1] }, { "text": "Yes, if the war is likely to do more good than harm", "to": [1] }, { "text": "Yes, if a good person would defend the innocent this way", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, but only if the war meets strict conditions (just cause, last resort, proportionate force)", "to": [2, 1] }, { "text": "No, but defending others with limited force may be tolerated", "to": [2, 0] }, { "text": "No, killing is always wrong", "to": [2] }], "id": "eth6" }, { "text": "Are some actions wrong regardless of consequences?", "options": [{ "text": "No, consequences determine everything", "to": [1] }, { "text": "No, but some rules are almost always beneficial", "to": [1] }, { "text": "Yes, actions a virtuous person would never do", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Yes, but only a few extreme acts", "to": [2, 0] }, { "text": "Yes, many actions", "to": [2] }, { "text": "Yes, any violation of moral duty", "to": [2] }], "id": "eth7" }, { "text": "Is moral character more important than individual actions?", "options": [{ "text": "No, only actions and their results matter", "to": [1, 2] }, { "text": "No, actions matter more", "to": [1, 2] }, { "text": "They are equally important", "to": [1, 2, 0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Character matters because it produces actions", "to": [0] }, { "text": "Yes, mostly", "to": [0] }, { "text": "Yes, character is the essence of morality", "to": [0] }], "id": "eth8" }, { "text": "Should you obey an unjust law?", "options": [{ "text": "Yes, always", "to": [2] }, { "text": "Yes, because disobedience causes greater harm", "to": [1] }, { "text": "Yes, but work to change it", "to": [2, 0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only if disobedience would cause more harm", "to": [1] }, { "text": "No, if it requires you to do wrong", "to": [2] }, { "text": "No, an unjust law is no law at all", "to": [2, 0] }], "id": "eth9" }, { "text": "Are you morally obligated to give away wealth you don't need?", "options": [{ "text": "Yes, all of it, to maximize good", "to": [1] }, { "text": "Yes, a significant portion", "to": [1] }, { "text": "Yes, as an expression of generosity", "to": [0] }, { "text": "I don't know / Answer not present", "idk": true }, { "text": "Only a fixed portion, like a tithe", "to": [2] }, { "text": "No, but it is praiseworthy", "to": [0] }, { "text": "No, your property is yours", "to": [2] }], "id": "eth10" }] }], "matches": [{ "id": "sect", "title": "Sects", "label": "The sect you are closest to", "items": [{ "name": "Roman Catholic", "blurb": "The largest Christian church, led by the pope, with seven sacraments and a living teaching authority (the Magisterium).", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.5, "rel": 0.55, "ort": [0.583, 0.383, 0.033], "eso": 0.567, "eth": [0.35, 0.05, 0.6] }, "picks": { "sal1": 6, "sal2": 5, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 3, "uni2": 3, "uni3": 5, "uni4": 5, "uni5": 3, "uni6": 5, "uni7": 3, "uni8": 3, "uni9": 5, "uni10": 5, "rel1": 3, "rel2": 3, "rel3": 5, "rel4": 5, "rel5": 3, "rel6": 6, "rel7": 5, "rel8": 5, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 5, "eso1": 2, "eso2": 5, "eso3": 3, "eso4": 6, "eso5": 5, "eso6": 5, "eso7": 2, "eso8": 3, "eso9": 7, "eso10": 6, "eth1": 5, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 6, "eth10": 3 } }, { "name": "Eastern Orthodox", "blurb": "Ancient churches of the East, such as the Greek and Russian churches. They stress liturgy, the early councils and theosis, becoming one with God.", "image": "", "pos": { "sal": [0.85, 0.05, 0.1], "uni": 0.5, "rel": 0.65, "ort": [0.583, 0.383, 0.033], "eso": 0.467, "eth": [0.6, 0, 0.4] }, "picks": { "sal1": 6, "sal2": 5, "sal3": 6, "sal4": 6, "sal5": 3, "sal6": 3, "sal7": 5, "sal8": 6, "sal9": 3, "sal10": 5, "uni1": 3, "uni2": 3, "uni3": 5, "uni4": 5, "uni5": 3, "uni6": 5, "uni7": 3, "uni8": 3, "uni9": 5, "uni10": 5, "rel1": 5, "rel2": 5, "rel3": 5, "rel4": 5, "rel5": 5, "rel6": 5, "rel7": 6, "rel8": 5, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 6, "ort6": 5, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 5, "eso1": 2, "eso2": 3, "eso3": 3, "eso4": 6, "eso5": 6, "eso6": 3, "eso7": 2, "eso8": 2, "eso9": 5, "eso10": 6, "eth1": 6, "eth2": 3, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 6, "eth10": 3 } }, { "name": "Oriental Orthodox", "blurb": "The Coptic, Armenian, Ethiopian and Syriac churches, which kept the faith of the first three councils and a rich fasting and liturgical life.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.733, "rel": 0.8, "ort": [0.583, 0.383, 0.033], "eso": 0.533, "eth": [0.4, 0, 0.6] }, "picks": { "sal1": 6, "sal2": 5, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 5, "uni2": 6, "uni3": 6, "uni4": 6, "uni5": 6, "uni6": 5, "uni7": 6, "uni8": 3, "uni9": 6, "uni10": 5, "rel1": 6, "rel2": 5, "rel3": 6, "rel4": 6, "rel5": 6, "rel6": 6, "rel7": 6, "rel8": 6, "rel9": 6, "rel10": 5, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 6, "ort6": 6, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 5, "eso1": 2, "eso2": 5, "eso3": 3, "eso4": 6, "eso5": 6, "eso6": 3, "eso7": 2, "eso8": 3, "eso9": 6, "eso10": 6, "eth1": 6, "eth2": 3, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 6, "eth7": 6, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "Anglican / Episcopal", "blurb": "The Church of England and its worldwide communion: Catholic order and liturgy with Reformation theology, and a wide range of views.", "image": "", "pos": { "sal": [0.65, 0.15, 0.2], "uni": 0.367, "rel": 0.383, "ort": [0.433, 0.283, 0.283], "eso": 0.667, "eth": [0.5, 0.05, 0.45] }, "picks": { "sal1": 3, "sal2": 5, "sal3": 5, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 5, "sal8": 6, "sal9": 3, "sal10": 5, "uni1": 3, "uni2": 3, "uni3": 5, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 3, "rel2": 2, "rel3": 3, "rel4": 3, "rel5": 3, "rel6": 5, "rel7": 3, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 5, "ort3": 3, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 3, "ort10": 5, "eso1": 3, "eso2": 6, "eso3": 5, "eso4": 6, "eso5": 5, "eso6": 5, "eso7": 5, "eso8": 3, "eso9": 6, "eso10": 6, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 5, "eth8": 5, "eth9": 3, "eth10": 3 } }, { "name": "Lutheran", "blurb": "Churches following Martin Luther: salvation by grace through faith alone, the authority of Scripture, and sacraments as God's means of grace.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.767, "rel": 0.917, "ort": [0.75, 0.1, 0.15], "eso": 0.883, "eth": [0.3, 0.05, 0.65] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 6, "uni2": 7, "uni3": 7, "uni4": 6, "uni5": 7, "uni6": 6, "uni7": 2, "uni8": 3, "uni9": 5, "uni10": 7, "rel1": 7, "rel2": 6, "rel3": 6, "rel4": 6, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 5, "rel9": 7, "rel10": 7, "ort1": 7, "ort2": 7, "ort3": 3, "ort4": 1, "ort5": 6, "ort6": 5, "ort7": 5, "ort8": 6, "ort9": 6, "ort10": 5, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 7, "eso6": 5, "eso7": 6, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 3, "eth10": 5 } }, { "name": "Reformed / Presbyterian", "blurb": "Churches in the tradition of John Calvin, stressing God's sovereignty, covenant, confessions and rule by elders.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.833, "rel": 0.917, "ort": [0.583, 0.283, 0.133], "eso": 0.9, "eth": [0.25, 0.05, 0.7] }, "picks": { "sal1": 7, "sal2": 7, "sal3": 7, "sal4": 7, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 7, "sal10": 7, "uni1": 7, "uni2": 7, "uni3": 6, "uni4": 6, "uni5": 7, "uni6": 6, "uni7": 5, "uni8": 6, "uni9": 3, "uni10": 7, "rel1": 7, "rel2": 6, "rel3": 6, "rel4": 6, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 5, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 7, "ort3": 7, "ort4": 3, "ort5": 7, "ort6": 6, "ort7": 5, "ort8": 7, "ort9": 5, "ort10": 6, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 5, "eso7": 6, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 7, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "Methodist", "blurb": "Churches that grew from John Wesley's revival: grace for all, holiness of heart and life, and active concern for the poor.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.367, "rel": 0.633, "ort": [0.333, 0.283, 0.383], "eso": 0.833, "eth": [0.4, 0.15, 0.45] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 6, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 3, "uni2": 3, "uni3": 5, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 6, "rel2": 3, "rel3": 5, "rel4": 5, "rel5": 5, "rel6": 6, "rel7": 5, "rel8": 5, "rel9": 5, "rel10": 3, "ort1": 5, "ort2": 3, "ort3": 7, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 3, "ort10": 3, "eso1": 6, "eso2": 7, "eso3": 6, "eso4": 6, "eso5": 6, "eso6": 5, "eso7": 5, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 5, "eth8": 5, "eth9": 3, "eth10": 2 } }, { "name": "Holiness / Nazarene", "blurb": "Wesleyan churches that teach entire sanctification: a life of perfect love and a high standard of personal holiness.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.633, "rel": 0.9, "ort": [0.583, 0.383, 0.033], "eso": 0.833, "eth": [0.15, 0, 0.85] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 3, "uni2": 5, "uni3": 5, "uni4": 6, "uni5": 5, "uni6": 6, "uni7": 5, "uni8": 3, "uni9": 5, "uni10": 5, "rel1": 6, "rel2": 6, "rel3": 6, "rel4": 6, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 6, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 5, "eso1": 6, "eso2": 7, "eso3": 6, "eso4": 6, "eso5": 6, "eso6": 5, "eso7": 5, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 6, "eth6": 6, "eth7": 6, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "Baptist", "blurb": "Congregations that baptise believers only, hold to Scripture alone and govern themselves, with a strong emphasis on evangelism.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.733, "rel": 0.967, "ort": [0.683, 0.183, 0.133], "eso": 0.867, "eth": [0.25, 0.05, 0.7] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 7, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 7, "uni2": 7, "uni3": 6, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 2, "uni8": 2, "uni9": 3, "uni10": 7, "rel1": 7, "rel2": 6, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 7, "ort3": 2, "ort4": 3, "ort5": 7, "ort6": 6, "ort7": 6, "ort8": 7, "ort9": 5, "ort10": 5, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 5, "eso7": 7, "eso8": 2, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 7, "eth8": 6, "eth9": 3, "eth10": 5 } }, { "name": "Non-denominational evangelical", "blurb": "Independent churches centred on the Bible, personal conversion and a relationship with Jesus, without a denominational structure.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.717, "rel": 0.95, "ort": [0.433, 0.183, 0.383], "eso": 0.9, "eth": [0.35, 0.05, 0.6] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 7, "uni2": 7, "uni3": 6, "uni4": 6, "uni5": 7, "uni6": 6, "uni7": 2, "uni8": 2, "uni9": 3, "uni10": 7, "rel1": 7, "rel2": 6, "rel3": 6, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 6, "ort3": 3, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 7, "ort9": 3, "ort10": 3, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 7, "eso6": 5, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 5, "eth9": 3, "eth10": 3 } }, { "name": "Pentecostal", "blurb": "Churches that expect the gifts of the Spirit today (healing, prophecy, speaking in tongues) and put living experience of God first.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.733, "rel": 0.983, "ort": [0.35, 0.2, 0.45], "eso": 0.717, "eth": [0.35, 0.05, 0.6] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 7, "uni2": 7, "uni3": 6, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 2, "uni8": 2, "uni9": 3, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 5, "ort2": 3, "ort3": 7, "ort4": 6, "ort5": 3, "ort6": 6, "ort7": 6, "ort8": 7, "ort9": 5, "ort10": 2, "eso1": 3, "eso2": 7, "eso3": 6, "eso4": 6, "eso5": 7, "eso6": 3, "eso7": 7, "eso8": 2, "eso9": 5, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 5, "eth9": 3, "eth10": 3 } }, { "name": "Oneness Pentecostal", "blurb": "Pentecostals who hold that God is one person, not three, and that Jesus is the name of the Father, Son and Spirit.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.917, "rel": 1, "ort": [0.583, 0.283, 0.133], "eso": 0.917, "eth": [0.15, 0, 0.85] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 7, "uni2": 7, "uni3": 7, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 7, "uni8": 3, "uni9": 7, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 7, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 7, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 6, "ort7": 6, "ort8": 7, "ort9": 5, "ort10": 5, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 5, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 6, "eth6": 6, "eth7": 7, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "Mennonite / Anabaptist", "blurb": "Heirs of the radical Reformation: adult baptism, a church set apart from the state, nonviolence and community.", "image": "", "pos": { "sal": [0.9, 0.05, 0.05], "uni": 0.4, "rel": 0.65, "ort": [0.3, 0.5, 0.2], "eso": 0.833, "eth": [0.4, 0, 0.6] }, "picks": { "sal1": 6, "sal2": 5, "sal3": 6, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 6, "sal8": 6, "sal9": 3, "sal10": 5, "uni1": 3, "uni2": 5, "uni3": 5, "uni4": 5, "uni5": 3, "uni6": 3, "uni7": 2, "uni8": 2, "uni9": 3, "uni10": 3, "rel1": 6, "rel2": 5, "rel3": 5, "rel4": 5, "rel5": 5, "rel6": 5, "rel7": 3, "rel8": 5, "rel9": 5, "rel10": 5, "ort1": 6, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 3, "ort10": 5, "eso1": 6, "eso2": 7, "eso3": 6, "eso4": 6, "eso5": 6, "eso6": 5, "eso7": 7, "eso8": 3, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 3, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 7, "eth7": 7, "eth8": 5, "eth9": 6, "eth10": 3 } }, { "name": "Amish", "blurb": "Plain-living Anabaptist communities that keep the Ordnung, a shared rule for dress, technology and life, to stay separate from the world.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.867, "rel": 0.917, "ort": [0.45, 0.55, 0], "eso": 0.85, "eth": [0.2, 0, 0.8] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 7, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 7, "uni2": 7, "uni3": 6, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 7, "uni8": 3, "uni9": 5, "uni10": 7, "rel1": 7, "rel2": 6, "rel3": 6, "rel4": 7, "rel5": 7, "rel6": 5, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 6, "ort6": 6, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 5, "eso1": 6, "eso2": 7, "eso3": 6, "eso4": 6, "eso5": 7, "eso6": 6, "eso7": 5, "eso8": 5, "eso9": 7, "eso10": 6, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 6, "eth6": 7, "eth7": 6, "eth8": 5, "eth9": 6, "eth10": 3 } }, { "name": "Quaker (Friends)", "blurb": "A movement built on the Inner Light and silent worship, with no clergy or creed and testimonies of peace, equality and truth.", "image": "", "pos": { "sal": [0.1, 0.8, 0.1], "uni": 0.083, "rel": 0.133, "ort": [0.05, 0.15, 0.8], "eso": 0.633, "eth": [0.4, 0.1, 0.5] }, "picks": { "sal1": 1, "sal2": 1, "sal3": 1, "sal4": 2, "sal5": 2, "sal6": 2, "sal7": 2, "sal8": 3, "sal9": 1, "sal10": 1, "uni1": 2, "uni2": 2, "uni3": 1, "uni4": 2, "uni5": 2, "uni6": 2, "uni7": 1, "uni8": 1, "uni9": 1, "uni10": 1, "rel1": 2, "rel2": 1, "rel3": 2, "rel4": 2, "rel5": 2, "rel6": 2, "rel7": 1, "rel8": 2, "rel9": 2, "rel10": 2, "ort1": 3, "ort2": 3, "ort3": 7, "ort4": 6, "ort5": 1, "ort6": 1, "ort7": 2, "ort8": 7, "ort9": 1, "ort10": 1, "eso1": 3, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 3, "eso6": 2, "eso7": 7, "eso8": 1, "eso9": 5, "eso10": 7, "eth1": 7, "eth2": 3, "eth3": 6, "eth4": 3, "eth5": 3, "eth6": 7, "eth7": 6, "eth8": 6, "eth9": 6, "eth10": 2 } }, { "name": "Seventh-day Adventist", "blurb": "A church that keeps the Saturday Sabbath and awaits Christ's soon return. It teaches that the dead sleep and the lost are finally destroyed.", "image": "", "pos": { "sal": [0, 0.05, 0.95], "uni": 0.567, "rel": 0.917, "ort": [0.583, 0.383, 0.033], "eso": 0.867, "eth": [0.15, 0, 0.85] }, "picks": { "sal1": 5, "sal2": 2, "sal3": 3, "sal4": 5, "sal5": 6, "sal6": 2, "sal7": 3, "sal8": 5, "sal9": 5, "sal10": 2, "uni1": 3, "uni2": 5, "uni3": 5, "uni4": 5, "uni5": 3, "uni6": 6, "uni7": 6, "uni8": 3, "uni9": 3, "uni10": 5, "rel1": 6, "rel2": 6, "rel3": 6, "rel4": 7, "rel5": 7, "rel6": 6, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 5, "eso1": 6, "eso2": 7, "eso3": 6, "eso4": 6, "eso5": 6, "eso6": 5, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 6, "eth6": 6, "eth7": 6, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "Jehovah's Witnesses", "blurb": "A restorationist movement that uses the name Jehovah, rejects the Trinity, and teaches that the wicked cease to exist.", "image": "", "pos": { "sal": [0, 0.15, 0.85], "uni": 0.8, "rel": 1, "ort": [0.583, 0.283, 0.133], "eso": 0.95, "eth": [0.1, 0, 0.9] }, "picks": { "sal1": 5, "sal2": 2, "sal3": 3, "sal4": 3, "sal5": 6, "sal6": 2, "sal7": 3, "sal8": 5, "sal9": 5, "sal10": 2, "uni1": 5, "uni2": 6, "uni3": 6, "uni4": 7, "uni5": 5, "uni6": 6, "uni7": 7, "uni8": 3, "uni9": 7, "uni10": 6, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 7, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 7, "ort3": 7, "ort4": 3, "ort5": 6, "ort6": 6, "ort7": 6, "ort8": 6, "ort9": 6, "ort10": 6, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 7, "eso7": 6, "eso8": 6, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 7, "eth3": 6, "eth4": 5, "eth5": 7, "eth6": 7, "eth7": 7, "eth8": 5, "eth9": 6, "eth10": 5 } }, { "name": "Latter-day Saints", "blurb": "Members of the Church of Jesus Christ of Latter-day Saints, who follow the Book of Mormon and living prophets, and hold that nearly everyone receives some degree of glory.", "image": "", "pos": { "sal": [0.4, 0.45, 0.15], "uni": 0.667, "rel": 0.55, "ort": [0.433, 0.383, 0.183], "eso": 0.417, "eth": [0.35, 0.05, 0.6] }, "picks": { "sal1": 6, "sal2": 3, "sal3": 2, "sal4": 3, "sal5": 2, "sal6": 2, "sal7": 2, "sal8": 7, "sal9": 2, "sal10": 5, "uni1": 5, "uni2": 5, "uni3": 6, "uni4": 5, "uni5": 5, "uni6": 5, "uni7": 6, "uni8": 1, "uni9": 7, "uni10": 5, "rel1": 5, "rel2": 5, "rel3": 3, "rel4": 3, "rel5": 5, "rel6": 6, "rel7": 5, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 5, "ort8": 2, "ort9": 3, "ort10": 3, "eso1": 3, "eso2": 3, "eso3": 6, "eso4": 6, "eso5": 3, "eso6": 3, "eso7": 2, "eso8": 1, "eso9": 2, "eso10": 6, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 5, "eth9": 3, "eth10": 5 } }, { "name": "Churches of Christ", "blurb": "Congregations that aim to follow the pattern of the New Testament church alone, usually with a cappella worship and baptism for forgiveness.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.9, "rel": 0.983, "ort": [0.583, 0.383, 0.033], "eso": 0.95, "eth": [0.1, 0.05, 0.85] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 7, "uni2": 7, "uni3": 7, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 7, "uni8": 2, "uni9": 7, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 7, "ort6": 6, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 6, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 7, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 7, "eth6": 5, "eth7": 7, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "Disciples of Christ", "blurb": "A Stone-Campbell church with 'no creed but Christ', open communion every Sunday and a strong commitment to Christian unity.", "image": "", "pos": { "sal": [0.2, 0.4, 0.4], "uni": 0.3, "rel": 0.283, "ort": [0.183, 0.333, 0.483], "eso": 0.7, "eth": [0.583, 0.133, 0.283] }, "picks": { "sal1": 3, "sal2": 2, "sal3": 3, "sal4": 3, "sal5": 3, "sal6": 3, "sal7": 2, "sal8": 3, "sal9": 3, "sal10": 2, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 2, "uni8": 2, "uni9": 3, "uni10": 3, "rel1": 3, "rel2": 2, "rel3": 3, "rel4": 3, "rel5": 3, "rel6": 3, "rel7": 3, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 2, "ort2": 2, "ort3": 3, "ort4": 3, "ort5": 2, "ort6": 2, "ort7": 2, "ort8": 3, "ort9": 1, "ort10": 3, "eso1": 3, "eso2": 7, "eso3": 7, "eso4": 5, "eso5": 3, "eso6": 5, "eso7": 6, "eso8": 3, "eso9": 6, "eso10": 7, "eth1": 3, "eth2": 3, "eth3": 5, "eth4": 5, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 3, "eth9": 3, "eth10": 2 } }, { "name": "Liberal mainline Protestant", "blurb": "Churches such as the United Church of Christ and many Episcopal and Lutheran congregations that emphasise justice, inclusion and open questioning.", "image": "", "pos": { "sal": [0.1, 0.6, 0.3], "uni": 0.167, "rel": 0.183, "ort": [0.183, 0.333, 0.483], "eso": 0.567, "eth": [0.55, 0.3, 0.15] }, "picks": { "sal1": 3, "sal2": 2, "sal3": 3, "sal4": 2, "sal5": 3, "sal6": 1, "sal7": 2, "sal8": 3, "sal9": 2, "sal10": 1, "uni1": 2, "uni2": 2, "uni3": 2, "uni4": 2, "uni5": 2, "uni6": 2, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 2, "rel1": 2, "rel2": 2, "rel3": 2, "rel4": 2, "rel5": 2, "rel6": 2, "rel7": 2, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 2, "ort2": 2, "ort3": 3, "ort4": 3, "ort5": 2, "ort6": 1, "ort7": 2, "ort8": 3, "ort9": 1, "ort10": 3, "eso1": 2, "eso2": 7, "eso3": 5, "eso4": 3, "eso5": 3, "eso6": 3, "eso7": 5, "eso8": 3, "eso9": 6, "eso10": 7, "eth1": 2, "eth2": 3, "eth3": 2, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 5, "eth8": 5, "eth9": 3, "eth10": 2 } }, { "name": "Unitarian Universalist", "blurb": "A non-creedal community that draws on many traditions and holds that every person has worth and that no one is condemned forever.", "image": "", "pos": { "sal": [0, 0.95, 0.05], "uni": 0, "rel": 0, "ort": [0.05, 0.35, 0.6], "eso": 0.6, "eth": [0.383, 0.433, 0.183] }, "picks": { "sal1": 1, "sal2": 1, "sal3": 1, "sal4": 1, "sal5": 1, "sal6": 1, "sal7": 1, "sal8": 1, "sal9": 1, "sal10": 1, "uni1": 1, "uni2": 1, "uni3": 1, "uni4": 1, "uni5": 1, "uni6": 1, "uni7": 1, "uni8": 1, "uni9": 1, "uni10": 1, "rel1": 1, "rel2": 1, "rel3": 1, "rel4": 1, "rel5": 1, "rel6": 1, "rel7": 1, "rel8": 1, "rel9": 1, "rel10": 1, "ort1": 1, "ort2": 1, "ort3": 6, "ort4": 6, "ort5": 1, "ort6": 1, "ort7": 2, "ort8": 3, "ort9": 1, "ort10": 2, "eso1": 3, "eso2": 7, "eso3": 6, "eso4": 3, "eso5": 1, "eso6": 2, "eso7": 7, "eso8": 3, "eso9": 7, "eso10": 7, "eth1": 2, "eth2": 2, "eth3": 2, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 3, "eth9": 6, "eth10": 2 } }, { "name": "Christian Universalist", "blurb": "Christians who hold that God will, in the end, save every person through Christ.", "image": "", "pos": { "sal": [0, 0.95, 0.05], "uni": 0.167, "rel": 0.25, "ort": [0.183, 0.133, 0.683], "eso": 0.683, "eth": [0.9, 0, 0.1] }, "picks": { "sal1": 1, "sal2": 1, "sal3": 1, "sal4": 1, "sal5": 1, "sal6": 1, "sal7": 1, "sal8": 1, "sal9": 1, "sal10": 1, "uni1": 1, "uni2": 3, "uni3": 3, "uni4": 2, "uni5": 1, "uni6": 3, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 1, "rel1": 3, "rel2": 2, "rel3": 3, "rel4": 2, "rel5": 3, "rel6": 3, "rel7": 2, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 3, "ort2": 3, "ort3": 3, "ort4": 3, "ort5": 2, "ort6": 1, "ort7": 2, "ort8": 3, "ort9": 3, "ort10": 3, "eso1": 3, "eso2": 7, "eso3": 6, "eso4": 5, "eso5": 3, "eso6": 3, "eso7": 7, "eso8": 3, "eso9": 7, "eso10": 7, "eth1": 3, "eth2": 3, "eth3": 7, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 7, "eth10": 3 } }, { "name": "Swedenborgian (New Church)", "blurb": "Followers of Emanuel Swedenborg, who read the Bible for its inner spiritual meaning and hold that heaven and hell are chosen by how we live.", "image": "", "pos": { "sal": [0.9, 0.05, 0.05], "uni": 0.25, "rel": 0.25, "ort": [0.2, 0.5, 0.3], "eso": 0.317, "eth": [0.45, 0.05, 0.5] }, "picks": { "sal1": 6, "sal2": 5, "sal3": 7, "sal4": 6, "sal5": 2, "sal6": 3, "sal7": 6, "sal8": 6, "sal9": 3, "sal10": 5, "uni1": 2, "uni2": 2, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 3, "rel1": 2, "rel2": 2, "rel3": 2, "rel4": 2, "rel5": 3, "rel6": 5, "rel7": 2, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 2, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 3, "ort6": 3, "ort7": 3, "ort8": 6, "ort9": 3, "ort10": 3, "eso1": 1, "eso2": 3, "eso3": 3, "eso4": 2, "eso5": 3, "eso6": 2, "eso7": 5, "eso8": 2, "eso9": 3, "eso10": 5, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 6, "eth6": 5, "eth7": 3, "eth8": 5, "eth9": 3, "eth10": 3 } }, { "name": "Christian Science", "blurb": "A movement founded by Mary Baker Eddy that teaches that spirit is the only reality and that sin and sickness yield to right understanding.", "image": "", "pos": { "sal": [0, 0.95, 0.05], "uni": 0.233, "rel": 0.433, "ort": [0.433, 0.283, 0.283], "eso": 0.417, "eth": [0.5, 0, 0.5] }, "picks": { "sal1": 1, "sal2": 1, "sal3": 1, "sal4": 1, "sal5": 1, "sal6": 1, "sal7": 1, "sal8": 1, "sal9": 1, "sal10": 1, "uni1": 2, "uni2": 3, "uni3": 3, "uni4": 2, "uni5": 3, "uni6": 3, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 2, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 3, "rel5": 5, "rel6": 5, "rel7": 3, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 3, "ort3": 5, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 5, "ort8": 5, "ort9": 3, "ort10": 5, "eso1": 2, "eso2": 3, "eso3": 5, "eso4": 2, "eso5": 3, "eso6": 3, "eso7": 6, "eso8": 2, "eso9": 3, "eso10": 6, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 6, "eth5": 6, "eth6": 6, "eth7": 3, "eth8": 5, "eth9": 6, "eth10": 3 } }, { "name": "Christadelphian", "blurb": "A small Bible-centred group that denies the Trinity and the immortal soul, and waits for Christ to return and set up his kingdom on earth.", "image": "", "pos": { "sal": [0, 0.05, 0.95], "uni": 0.9, "rel": 1, "ort": [0.7, 0.2, 0.1], "eso": 0.95, "eth": [0.1, 0, 0.9] }, "picks": { "sal1": 5, "sal2": 2, "sal3": 3, "sal4": 5, "sal5": 7, "sal6": 2, "sal7": 3, "sal8": 5, "sal9": 5, "sal10": 2, "uni1": 7, "uni2": 7, "uni3": 7, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 7, "uni8": 2, "uni9": 7, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 7, "rel9": 7, "rel10": 7, "ort1": 7, "ort2": 7, "ort3": 7, "ort4": 2, "ort5": 7, "ort6": 6, "ort7": 6, "ort8": 6, "ort9": 6, "ort10": 7, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 7, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 7, "eth6": 7, "eth7": 7, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "Gnostic Christian", "blurb": "Modern groups that revive ancient Gnostic Christianity, in which salvation comes through inner knowledge (gnosis) and the Bible hides deeper truths.", "image": "", "pos": { "sal": [0.1, 0.25, 0.65], "uni": 0.233, "rel": 0.217, "ort": [0.283, 0.133, 0.583], "eso": 0, "eth": [0.8, 0, 0.2] }, "picks": { "sal1": 5, "sal2": 2, "sal3": 3, "sal4": 2, "sal5": 2, "sal6": 2, "sal7": 3, "sal8": 3, "sal9": 5, "sal10": 2, "uni1": 2, "uni2": 2, "uni3": 2, "uni4": 2, "uni5": 3, "uni6": 2, "uni7": 2, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 2, "rel2": 2, "rel3": 2, "rel4": 2, "rel5": 3, "rel6": 3, "rel7": 2, "rel8": 3, "rel9": 2, "rel10": 2, "ort1": 3, "ort2": 3, "ort3": 5, "ort4": 3, "ort5": 5, "ort6": 2, "ort7": 2, "ort8": 6, "ort9": 3, "ort10": 3, "eso1": 1, "eso2": 1, "eso3": 1, "eso4": 1, "eso5": 1, "eso6": 1, "eso7": 1, "eso8": 1, "eso9": 1, "eso10": 1, "eth1": 3, "eth2": 3, "eth3": 6, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }] }, { "id": "figure", "title": "Religious figures", "label": "The religious figure you are closest to", "items": [{ "name": "Origen", "blurb": "3rd-century Alexandrian scholar who read Scripture on several levels and is often read as teaching that all would finally be restored to God, though scholars dispute how far he taught it.", "image": "", "pos": { "sal": [0, 0.85, 0.15], "uni": 0.283, "rel": 0.433, "ort": [0.533, 0.283, 0.183], "eso": 0.217, "eth": [0.75, 0, 0.25] }, "picks": { "sal1": 2, "sal2": 3, "sal3": 2, "sal4": 1, "sal5": 1, "sal6": 2, "sal7": 2, "sal8": 1, "sal9": 1, "sal10": 1, "uni1": 2, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 2, "uni8": 2, "uni9": 3, "uni10": 3, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 3, "rel5": 3, "rel6": 5, "rel7": 5, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 3, "ort3": 5, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 5, "ort10": 5, "eso1": 1, "eso2": 2, "eso3": 2, "eso4": 2, "eso5": 3, "eso6": 2, "eso7": 3, "eso8": 2, "eso9": 3, "eso10": 3, "eth1": 3, "eth2": 3, "eth3": 6, "eth4": 3, "eth5": 3, "eth6": 7, "eth7": 3, "eth8": 5, "eth9": 3, "eth10": 3 } }, { "name": "Clement of Alexandria", "blurb": "Early teacher who held that Greek philosophy prepared the way for Christ, and that deeper knowledge (gnosis) is open to the mature believer.", "image": "", "pos": { "sal": [0, 0.85, 0.15], "uni": 0.4, "rel": 0.433, "ort": [0.383, 0.283, 0.333], "eso": 0.217, "eth": [0.9, 0, 0.1] }, "picks": { "sal1": 2, "sal2": 3, "sal3": 2, "sal4": 3, "sal5": 1, "sal6": 2, "sal7": 2, "sal8": 3, "sal9": 1, "sal10": 1, "uni1": 5, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 5, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 3, "rel5": 3, "rel6": 5, "rel7": 5, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 5, "ort2": 3, "ort3": 5, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 2, "ort9": 3, "ort10": 3, "eso1": 1, "eso2": 2, "eso3": 2, "eso4": 3, "eso5": 3, "eso6": 3, "eso7": 2, "eso8": 2, "eso9": 2, "eso10": 3, "eth1": 3, "eth2": 3, "eth3": 7, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "Gregory of Nyssa", "blurb": "4th-century bishop and mystic, a leading Cappadocian Father, who is often read as teaching that every soul will in the end be restored to God (a reading some dispute).", "image": "", "pos": { "sal": [0, 0.85, 0.15], "uni": 0.283, "rel": 0.433, "ort": [0.283, 0.183, 0.533], "eso": 0.317, "eth": [0.9, 0, 0.1] }, "picks": { "sal1": 1, "sal2": 3, "sal3": 2, "sal4": 2, "sal5": 1, "sal6": 2, "sal7": 2, "sal8": 1, "sal9": 1, "sal10": 1, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 2, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 2, "uni9": 3, "uni10": 2, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 3, "rel5": 3, "rel6": 5, "rel7": 5, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 3, "ort2": 3, "ort3": 3, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 3, "ort10": 3, "eso1": 2, "eso2": 3, "eso3": 2, "eso4": 3, "eso5": 3, "eso6": 2, "eso7": 3, "eso8": 3, "eso9": 3, "eso10": 5, "eth1": 3, "eth2": 3, "eth3": 7, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "Valentinus", "blurb": "2nd-century Gnostic teacher in Rome who taught that salvation comes through secret knowledge of one's divine origin.", "image": "", "pos": { "sal": [0.1, 0.25, 0.65], "uni": 0.583, "rel": 0.517, "ort": [0.433, 0.183, 0.383], "eso": 0, "eth": [0.8, 0, 0.2] }, "picks": { "sal1": 5, "sal2": 2, "sal3": 3, "sal4": 2, "sal5": 2, "sal6": 2, "sal7": 3, "sal8": 3, "sal9": 5, "sal10": 2, "uni1": 6, "uni2": 6, "uni3": 3, "uni4": 3, "uni5": 6, "uni6": 3, "uni7": 5, "uni8": 5, "uni9": 3, "uni10": 5, "rel1": 6, "rel2": 5, "rel3": 3, "rel4": 3, "rel5": 5, "rel6": 5, "rel7": 5, "rel8": 3, "rel9": 3, "rel10": 3, "ort1": 5, "ort2": 3, "ort3": 5, "ort4": 3, "ort5": 5, "ort6": 3, "ort7": 3, "ort8": 6, "ort9": 3, "ort10": 3, "eso1": 1, "eso2": 1, "eso3": 1, "eso4": 1, "eso5": 1, "eso6": 1, "eso7": 1, "eso8": 1, "eso9": 1, "eso10": 1, "eth1": 3, "eth2": 3, "eth3": 6, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "Tertullian", "blurb": "Early Latin writer from Carthage, a fierce defender of the faith who held the church to a strict standard.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.9, "rel": 1, "ort": [0.633, 0.233, 0.133], "eso": 0.917, "eth": [0.1, 0, 0.9] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 7, "sal5": 2, "sal6": 7, "sal7": 7, "sal8": 7, "sal9": 7, "sal10": 7, "uni1": 7, "uni2": 7, "uni3": 7, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 7, "uni8": 2, "uni9": 7, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 7, "rel9": 7, "rel10": 7, "ort1": 7, "ort2": 7, "ort3": 7, "ort4": 3, "ort5": 7, "ort6": 7, "ort7": 7, "ort8": 6, "ort9": 7, "ort10": 6, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 7, "eso7": 5, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 7, "eth6": 7, "eth7": 7, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "Augustine of Hippo", "blurb": "4th-century bishop whose writings on grace, sin and the City of God shaped Western Christianity.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.933, "rel": 0.867, "ort": [0.583, 0.283, 0.133], "eso": 0.6, "eth": [0.5, 0.05, 0.45] }, "picks": { "sal1": 7, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 7, "uni1": 7, "uni2": 7, "uni3": 7, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 7, "uni8": 5, "uni9": 6, "uni10": 7, "rel1": 6, "rel2": 6, "rel3": 5, "rel4": 6, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 5, "rel9": 7, "rel10": 6, "ort1": 7, "ort2": 7, "ort3": 6, "ort4": 3, "ort5": 6, "ort6": 6, "ort7": 6, "ort8": 3, "ort9": 5, "ort10": 3, "eso1": 2, "eso2": 5, "eso3": 3, "eso4": 6, "eso5": 6, "eso6": 3, "eso7": 5, "eso8": 3, "eso9": 7, "eso10": 6, "eth1": 7, "eth2": 5, "eth3": 7, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 7, "eth9": 7, "eth10": 3 } }, { "name": "Thomas Aquinas", "blurb": "13th-century Dominican whose Summa Theologiae joined Aristotle's philosophy to Christian doctrine.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.533, "rel": 0.633, "ort": [0.583, 0.383, 0.033], "eso": 0.567, "eth": [0.4, 0.05, 0.55] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 7, "uni1": 3, "uni2": 3, "uni3": 5, "uni4": 5, "uni5": 3, "uni6": 5, "uni7": 3, "uni8": 5, "uni9": 5, "uni10": 5, "rel1": 3, "rel2": 5, "rel3": 5, "rel4": 5, "rel5": 3, "rel6": 6, "rel7": 6, "rel8": 5, "rel9": 5, "rel10": 5, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 5, "eso1": 2, "eso2": 5, "eso3": 3, "eso4": 6, "eso5": 5, "eso6": 5, "eso7": 2, "eso8": 3, "eso9": 7, "eso10": 6, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 7, "eth10": 3 } }, { "name": "Meister Eckhart", "blurb": "14th-century German Dominican mystic who taught that the soul can be united with the ground of God.", "image": "", "pos": { "sal": [0, 0.9, 0.1], "uni": 0.233, "rel": 0.217, "ort": [0.1, 0.05, 0.85], "eso": 0.067, "eth": [0.85, 0.05, 0.1] }, "picks": { "sal1": 2, "sal2": 1, "sal3": 1, "sal4": 2, "sal5": 1, "sal6": 2, "sal7": 2, "sal8": 3, "sal9": 1, "sal10": 1, "uni1": 3, "uni2": 3, "uni3": 2, "uni4": 2, "uni5": 3, "uni6": 3, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 2, "rel1": 3, "rel2": 2, "rel3": 2, "rel4": 2, "rel5": 3, "rel6": 3, "rel7": 2, "rel8": 2, "rel9": 2, "rel10": 2, "ort1": 3, "ort2": 3, "ort3": 3, "ort4": 6, "ort5": 1, "ort6": 1, "ort7": 2, "ort8": 6, "ort9": 1, "ort10": 1, "eso1": 1, "eso2": 3, "eso3": 1, "eso4": 1, "eso5": 1, "eso6": 1, "eso7": 3, "eso8": 1, "eso9": 1, "eso10": 1, "eth1": 3, "eth2": 3, "eth3": 7, "eth4": 3, "eth5": 3, "eth6": 5, "eth7": 3, "eth8": 7, "eth9": 3, "eth10": 3 } }, { "name": "Julian of Norwich", "blurb": "14th-century English anchoress whose visions led her to write that 'all shall be well'.", "image": "", "pos": { "sal": [0, 0.9, 0.1], "uni": 0.333, "rel": 0.367, "ort": [0.1, 0.1, 0.8], "eso": 0.417, "eth": [0.85, 0.05, 0.1] }, "picks": { "sal1": 1, "sal2": 1, "sal3": 2, "sal4": 2, "sal5": 1, "sal6": 2, "sal7": 2, "sal8": 3, "sal9": 1, "sal10": 1, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 3, "rel5": 3, "rel6": 5, "rel7": 3, "rel8": 3, "rel9": 3, "rel10": 3, "ort1": 3, "ort2": 3, "ort3": 3, "ort4": 6, "ort5": 2, "ort6": 1, "ort7": 2, "ort8": 3, "ort9": 1, "ort10": 1, "eso1": 2, "eso2": 3, "eso3": 3, "eso4": 3, "eso5": 3, "eso6": 2, "eso7": 5, "eso8": 3, "eso9": 5, "eso10": 6, "eth1": 3, "eth2": 3, "eth3": 7, "eth4": 3, "eth5": 3, "eth6": 5, "eth7": 3, "eth8": 7, "eth9": 3, "eth10": 3 } }, { "name": "Francis of Assisi", "blurb": "13th-century friar who embraced poverty and care for the poor, and preached to all creatures.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.433, "rel": 0.533, "ort": [0.15, 0.6, 0.25], "eso": 0.717, "eth": [0.65, 0.1, 0.25] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 3, "uni2": 3, "uni3": 5, "uni4": 3, "uni5": 3, "uni6": 5, "uni7": 3, "uni8": 3, "uni9": 5, "uni10": 3, "rel1": 3, "rel2": 3, "rel3": 5, "rel4": 5, "rel5": 5, "rel6": 5, "rel7": 3, "rel8": 5, "rel9": 5, "rel10": 3, "ort1": 2, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 2, "ort6": 5, "ort7": 5, "ort8": 2, "ort9": 3, "ort10": 3, "eso1": 3, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 5, "eso6": 3, "eso7": 5, "eso8": 3, "eso9": 7, "eso10": 7, "eth1": 6, "eth2": 3, "eth3": 6, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 7, "eth9": 3, "eth10": 1 } }, { "name": "Teresa of \xC1vila", "blurb": "16th-century Spanish Carmelite and mystic who reformed her order and wrote on prayer and the inner life.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.567, "rel": 0.717, "ort": [0.35, 0.3, 0.35], "eso": 0.483, "eth": [0.45, 0.05, 0.5] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 5, "uni1": 3, "uni2": 5, "uni3": 5, "uni4": 5, "uni5": 3, "uni6": 5, "uni7": 5, "uni8": 3, "uni9": 5, "uni10": 5, "rel1": 6, "rel2": 5, "rel3": 5, "rel4": 5, "rel5": 5, "rel6": 6, "rel7": 6, "rel8": 5, "rel9": 5, "rel10": 5, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 6, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 3, "ort10": 3, "eso1": 2, "eso2": 5, "eso3": 3, "eso4": 6, "eso5": 5, "eso6": 2, "eso7": 2, "eso8": 3, "eso9": 5, "eso10": 6, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 7, "eth10": 3 } }, { "name": "Erasmus", "blurb": "Renaissance scholar who called the church back to Scripture and to a simple, moral Christianity, but never left Rome.", "image": "", "pos": { "sal": [0.65, 0.15, 0.2], "uni": 0.333, "rel": 0.467, "ort": [0.15, 0.5, 0.35], "eso": 0.583, "eth": [0.8, 0, 0.2] }, "picks": { "sal1": 3, "sal2": 5, "sal3": 5, "sal4": 6, "sal5": 3, "sal6": 3, "sal7": 5, "sal8": 6, "sal9": 3, "sal10": 5, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 3, "rel5": 5, "rel6": 5, "rel7": 5, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 2, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 3, "ort6": 2, "ort7": 2, "ort8": 3, "ort9": 3, "ort10": 3, "eso1": 3, "eso2": 5, "eso3": 5, "eso4": 5, "eso5": 3, "eso6": 5, "eso7": 5, "eso8": 3, "eso9": 6, "eso10": 5, "eth1": 3, "eth2": 3, "eth3": 7, "eth4": 5, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "Martin Luther", "blurb": "German monk whose stand against indulgences began the Reformation and the teaching of salvation by faith alone.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.767, "rel": 0.967, "ort": [0.7, 0.1, 0.2], "eso": 0.9, "eth": [0.3, 0.15, 0.55] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 6, "uni2": 7, "uni3": 7, "uni4": 6, "uni5": 7, "uni6": 6, "uni7": 2, "uni8": 3, "uni9": 5, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 5, "rel9": 7, "rel10": 7, "ort1": 7, "ort2": 7, "ort3": 2, "ort4": 1, "ort5": 6, "ort6": 5, "ort7": 5, "ort8": 6, "ort9": 3, "ort10": 6, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 7, "eso6": 5, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 2, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 3, "eth10": 5 } }, { "name": "Menno Simons", "blurb": "Dutch priest turned Anabaptist leader, who taught believer's baptism and nonviolence.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.817, "rel": 0.933, "ort": [0.45, 0.45, 0.1], "eso": 0.95, "eth": [0.3, 0, 0.7] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 6, "uni2": 7, "uni3": 6, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 6, "uni8": 2, "uni9": 5, "uni10": 7, "rel1": 7, "rel2": 6, "rel3": 6, "rel4": 7, "rel5": 7, "rel6": 6, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 6, "ort6": 5, "ort7": 5, "ort8": 6, "ort9": 5, "ort10": 6, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 7, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 7, "eth7": 7, "eth8": 5, "eth9": 6, "eth10": 3 } }, { "name": "John Calvin", "blurb": "Genevan Reformer whose Institutes set out God's sovereignty and salvation by grace alone.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.833, "rel": 0.95, "ort": [0.65, 0.25, 0.1], "eso": 0.9, "eth": [0.25, 0.05, 0.7] }, "picks": { "sal1": 7, "sal2": 7, "sal3": 7, "sal4": 7, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 7, "sal10": 7, "uni1": 7, "uni2": 7, "uni3": 6, "uni4": 6, "uni5": 7, "uni6": 6, "uni7": 5, "uni8": 6, "uni9": 3, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 6, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 5, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 7, "ort3": 7, "ort4": 2, "ort5": 7, "ort6": 6, "ort7": 6, "ort8": 7, "ort9": 6, "ort10": 6, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 5, "eso7": 6, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 7, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "George Fox", "blurb": "17th-century founder of the Quakers, who taught that Christ speaks directly to every person.", "image": "", "pos": { "sal": [0.3, 0.45, 0.25], "uni": 0.1, "rel": 0.233, "ort": [0, 0.25, 0.75], "eso": 0.617, "eth": [0.55, 0, 0.45] }, "picks": { "sal1": 3, "sal2": 3, "sal3": 3, "sal4": 2, "sal5": 2, "sal6": 3, "sal7": 3, "sal8": 3, "sal9": 2, "sal10": 3, "uni1": 2, "uni2": 2, "uni3": 1, "uni4": 2, "uni5": 2, "uni6": 2, "uni7": 1, "uni8": 1, "uni9": 1, "uni10": 2, "rel1": 2, "rel2": 2, "rel3": 3, "rel4": 2, "rel5": 3, "rel6": 3, "rel7": 2, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 3, "ort2": 3, "ort3": 7, "ort4": 6, "ort5": 1, "ort6": 2, "ort7": 3, "ort8": 7, "ort9": 1, "ort10": 1, "eso1": 3, "eso2": 7, "eso3": 7, "eso4": 5, "eso5": 3, "eso6": 2, "eso7": 7, "eso8": 1, "eso9": 5, "eso10": 7, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 3, "eth5": 3, "eth6": 7, "eth7": 3, "eth8": 6, "eth9": 6, "eth10": 3 } }, { "name": "Emanuel Swedenborg", "blurb": "18th-century Swedish scientist turned visionary who wrote of the spiritual world and the inner sense of Scripture.", "image": "", "pos": { "sal": [0.9, 0.05, 0.05], "uni": 0.25, "rel": 0.25, "ort": [0.2, 0.5, 0.3], "eso": 0.317, "eth": [0.45, 0.05, 0.5] }, "picks": { "sal1": 6, "sal2": 5, "sal3": 7, "sal4": 6, "sal5": 2, "sal6": 3, "sal7": 6, "sal8": 6, "sal9": 3, "sal10": 5, "uni1": 2, "uni2": 2, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 3, "rel1": 2, "rel2": 2, "rel3": 2, "rel4": 2, "rel5": 3, "rel6": 5, "rel7": 2, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 2, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 3, "ort6": 3, "ort7": 3, "ort8": 6, "ort9": 3, "ort10": 3, "eso1": 1, "eso2": 3, "eso3": 3, "eso4": 2, "eso5": 3, "eso6": 2, "eso7": 5, "eso8": 2, "eso9": 3, "eso10": 5, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 6, "eth6": 5, "eth7": 3, "eth8": 5, "eth9": 3, "eth10": 3 } }, { "name": "Jonathan Edwards", "blurb": "18th-century New England preacher of the Great Awakening and the author of 'Sinners in the Hands of an Angry God'.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.85, "rel": 0.967, "ort": [0.5, 0.25, 0.25], "eso": 0.8, "eth": [0.4, 0.05, 0.55] }, "picks": { "sal1": 7, "sal2": 7, "sal3": 7, "sal4": 7, "sal5": 3, "sal6": 7, "sal7": 7, "sal8": 7, "sal9": 7, "sal10": 7, "uni1": 7, "uni2": 7, "uni3": 6, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 5, "uni8": 6, "uni9": 3, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 7, "rel8": 5, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 7, "ort3": 7, "ort4": 6, "ort5": 5, "ort6": 6, "ort7": 6, "ort8": 7, "ort9": 5, "ort10": 3, "eso1": 6, "eso2": 7, "eso3": 6, "eso4": 7, "eso5": 7, "eso6": 5, "eso7": 6, "eso8": 2, "eso9": 5, "eso10": 7, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "John Wesley", "blurb": "18th-century Anglican priest who founded Methodism, teaching assurance of grace and holy living.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.367, "rel": 0.633, "ort": [0.333, 0.283, 0.383], "eso": 0.833, "eth": [0.4, 0.15, 0.45] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 6, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 3, "uni2": 3, "uni3": 5, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 6, "rel2": 3, "rel3": 5, "rel4": 5, "rel5": 5, "rel6": 6, "rel7": 5, "rel8": 5, "rel9": 5, "rel10": 3, "ort1": 5, "ort2": 3, "ort3": 7, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 3, "ort10": 3, "eso1": 6, "eso2": 7, "eso3": 6, "eso4": 6, "eso5": 6, "eso6": 5, "eso7": 5, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 5, "eth8": 5, "eth9": 3, "eth10": 2 } }, { "name": "S\xF8ren Kierkegaard", "blurb": "19th-century Danish philosopher who held that faith is a personal leap, not a set of proofs.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.7, "rel": 0.9, "ort": [0.2, 0.2, 0.6], "eso": 0.683, "eth": [0.6, 0.05, 0.35] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 5, "uni2": 7, "uni3": 7, "uni4": 7, "uni5": 5, "uni6": 5, "uni7": 5, "uni8": 3, "uni9": 3, "uni10": 5, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 5, "rel7": 7, "rel8": 5, "rel9": 7, "rel10": 5, "ort1": 3, "ort2": 3, "ort3": 7, "ort4": 6, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 7, "ort9": 1, "ort10": 3, "eso1": 3, "eso2": 7, "eso3": 3, "eso4": 5, "eso5": 7, "eso6": 5, "eso7": 7, "eso8": 2, "eso9": 5, "eso10": 7, "eth1": 6, "eth2": 3, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "Friedrich Schleiermacher", "blurb": "Father of modern liberal theology, who defined religion as the feeling of absolute dependence on God.", "image": "", "pos": { "sal": [0, 0.9, 0.1], "uni": 0.167, "rel": 0.2, "ort": [0.1, 0.1, 0.8], "eso": 0.6, "eth": [0.9, 0, 0.1] }, "picks": { "sal1": 1, "sal2": 1, "sal3": 1, "sal4": 2, "sal5": 1, "sal6": 1, "sal7": 2, "sal8": 1, "sal9": 1, "sal10": 1, "uni1": 2, "uni2": 2, "uni3": 2, "uni4": 2, "uni5": 2, "uni6": 2, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 2, "rel1": 3, "rel2": 2, "rel3": 2, "rel4": 2, "rel5": 2, "rel6": 2, "rel7": 2, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 3, "ort2": 3, "ort3": 3, "ort4": 6, "ort5": 1, "ort6": 1, "ort7": 2, "ort8": 3, "ort9": 1, "ort10": 1, "eso1": 3, "eso2": 7, "eso3": 5, "eso4": 5, "eso5": 3, "eso6": 3, "eso7": 5, "eso8": 2, "eso9": 6, "eso10": 7, "eth1": 3, "eth2": 3, "eth3": 7, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "John Henry Newman", "blurb": "Anglican priest turned Catholic cardinal who argued for the development of Christian doctrine.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.55, "rel": 0.683, "ort": [0.633, 0.333, 0.033], "eso": 0.533, "eth": [0.4, 0.05, 0.55] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 7, "uni1": 3, "uni2": 5, "uni3": 5, "uni4": 6, "uni5": 3, "uni6": 5, "uni7": 3, "uni8": 3, "uni9": 5, "uni10": 5, "rel1": 6, "rel2": 5, "rel3": 5, "rel4": 5, "rel5": 3, "rel6": 6, "rel7": 6, "rel8": 5, "rel9": 5, "rel10": 5, "ort1": 7, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 6, "ort7": 6, "ort8": 2, "ort9": 5, "ort10": 5, "eso1": 2, "eso2": 3, "eso3": 3, "eso4": 6, "eso5": 5, "eso6": 5, "eso7": 2, "eso8": 3, "eso9": 7, "eso10": 6, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 7, "eth10": 3 } }, { "name": "Joseph Smith", "blurb": "Founder of the Latter Day Saint movement and translator of the Book of Mormon.", "image": "", "pos": { "sal": [0.4, 0.45, 0.15], "uni": 0.667, "rel": 0.55, "ort": [0.433, 0.383, 0.183], "eso": 0.417, "eth": [0.35, 0.05, 0.6] }, "picks": { "sal1": 6, "sal2": 3, "sal3": 2, "sal4": 3, "sal5": 2, "sal6": 2, "sal7": 2, "sal8": 7, "sal9": 2, "sal10": 5, "uni1": 5, "uni2": 5, "uni3": 6, "uni4": 5, "uni5": 5, "uni6": 5, "uni7": 6, "uni8": 1, "uni9": 7, "uni10": 5, "rel1": 5, "rel2": 5, "rel3": 3, "rel4": 3, "rel5": 5, "rel6": 6, "rel7": 5, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 5, "ort8": 2, "ort9": 3, "ort10": 3, "eso1": 3, "eso2": 3, "eso3": 6, "eso4": 6, "eso5": 3, "eso6": 3, "eso7": 2, "eso8": 1, "eso9": 2, "eso10": 6, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 5, "eth9": 3, "eth10": 5 } }, { "name": "Charles Taze Russell", "blurb": "Founder of the Bible Student movement from which Jehovah's Witnesses came, who read prophecy as a hidden timetable.", "image": "", "pos": { "sal": [0, 0.2, 0.8], "uni": 0.65, "rel": 0.95, "ort": [0.583, 0.333, 0.083], "eso": 0.667, "eth": [0.1, 0, 0.9] }, "picks": { "sal1": 5, "sal2": 2, "sal3": 3, "sal4": 2, "sal5": 6, "sal6": 2, "sal7": 3, "sal8": 5, "sal9": 3, "sal10": 2, "uni1": 5, "uni2": 5, "uni3": 5, "uni4": 5, "uni5": 5, "uni6": 5, "uni7": 5, "uni8": 3, "uni9": 6, "uni10": 5, "rel1": 6, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 6, "rel7": 7, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 5, "ort8": 5, "ort9": 6, "ort10": 6, "eso1": 2, "eso2": 5, "eso3": 5, "eso4": 5, "eso5": 6, "eso6": 5, "eso7": 6, "eso8": 5, "eso9": 5, "eso10": 6, "eth1": 7, "eth2": 6, "eth3": 6, "eth4": 5, "eth5": 7, "eth6": 7, "eth7": 7, "eth8": 6, "eth9": 6, "eth10": 5 } }, { "name": "William Booth", "blurb": "Founder of the Salvation Army, who joined preaching to practical help for the poor.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.717, "rel": 0.917, "ort": [0.25, 0.45, 0.3], "eso": 0.9, "eth": [0.35, 0.45, 0.2] }, "picks": { "sal1": 6, "sal2": 7, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 6, "uni2": 7, "uni3": 7, "uni4": 6, "uni5": 7, "uni6": 6, "uni7": 2, "uni8": 2, "uni9": 3, "uni10": 7, "rel1": 7, "rel2": 6, "rel3": 6, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 5, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 6, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 7, "ort9": 3, "ort10": 3, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 7, "eso6": 5, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 2, "eth2": 3, "eth3": 2, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 5, "eth8": 5, "eth9": 5, "eth10": 2 } }, { "name": "Karl Barth", "blurb": "20th-century Swiss theologian who held that God is known only through Christ, and who leaned toward hope for all.", "image": "", "pos": { "sal": [0.35, 0.45, 0.2], "uni": 0.517, "rel": 0.85, "ort": [0.633, 0.133, 0.233], "eso": 0.9, "eth": [0.35, 0.05, 0.6] }, "picks": { "sal1": 3, "sal2": 5, "sal3": 5, "sal4": 3, "sal5": 3, "sal6": 3, "sal7": 5, "sal8": 3, "sal9": 3, "sal10": 1, "uni1": 3, "uni2": 5, "uni3": 5, "uni4": 5, "uni5": 3, "uni6": 6, "uni7": 5, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 6, "rel2": 5, "rel3": 6, "rel4": 6, "rel5": 7, "rel6": 6, "rel7": 6, "rel8": 5, "rel9": 7, "rel10": 7, "ort1": 7, "ort2": 6, "ort3": 2, "ort4": 3, "ort5": 7, "ort6": 5, "ort7": 5, "ort8": 7, "ort9": 3, "ort10": 6, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 7, "eso6": 6, "eso7": 6, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 6, "eth10": 3 } }, { "name": "Dietrich Bonhoeffer", "blurb": "German pastor who opposed Hitler and wrote on 'costly grace' and discipleship, and was executed in 1945.", "image": "", "pos": { "sal": [0.65, 0.15, 0.2], "uni": 0.783, "rel": 0.8, "ort": [0.45, 0.4, 0.15], "eso": 0.567, "eth": [0.7, 0.05, 0.25] }, "picks": { "sal1": 3, "sal2": 5, "sal3": 5, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 5, "sal8": 6, "sal9": 3, "sal10": 5, "uni1": 6, "uni2": 7, "uni3": 7, "uni4": 7, "uni5": 6, "uni6": 6, "uni7": 5, "uni8": 3, "uni9": 5, "uni10": 5, "rel1": 7, "rel2": 5, "rel3": 5, "rel4": 6, "rel5": 7, "rel6": 6, "rel7": 5, "rel8": 5, "rel9": 7, "rel10": 5, "ort1": 6, "ort2": 6, "ort3": 7, "ort4": 5, "ort5": 6, "ort6": 5, "ort7": 5, "ort8": 5, "ort9": 3, "ort10": 5, "eso1": 3, "eso2": 3, "eso3": 3, "eso4": 6, "eso5": 6, "eso6": 5, "eso7": 3, "eso8": 3, "eso9": 7, "eso10": 5, "eth1": 3, "eth2": 3, "eth3": 3, "eth4": 5, "eth5": 3, "eth6": 3, "eth7": 5, "eth8": 5, "eth9": 6, "eth10": 3 } }, { "name": "Paul Tillich", "blurb": "20th-century theologian who described faith as 'ultimate concern' and God as the ground of being.", "image": "", "pos": { "sal": [0, 0.8, 0.2], "uni": 0.167, "rel": 0.183, "ort": [0.133, 0.133, 0.733], "eso": 0.583, "eth": [0.8, 0, 0.2] }, "picks": { "sal1": 1, "sal2": 2, "sal3": 2, "sal4": 1, "sal5": 1, "sal6": 1, "sal7": 2, "sal8": 1, "sal9": 1, "sal10": 1, "uni1": 2, "uni2": 2, "uni3": 2, "uni4": 2, "uni5": 2, "uni6": 2, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 2, "rel1": 2, "rel2": 2, "rel3": 2, "rel4": 2, "rel5": 2, "rel6": 2, "rel7": 2, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 3, "ort2": 3, "ort3": 3, "ort4": 3, "ort5": 2, "ort6": 1, "ort7": 2, "ort8": 3, "ort9": 1, "ort10": 2, "eso1": 3, "eso2": 7, "eso3": 5, "eso4": 3, "eso5": 3, "eso6": 3, "eso7": 5, "eso8": 3, "eso9": 6, "eso10": 7, "eth1": 3, "eth2": 3, "eth3": 6, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 5, "eth9": 3, "eth10": 3 } }, { "name": "C. S. Lewis", "blurb": "Oxford scholar and author of Mere Christianity and Narnia, a popular defender of 'mere' Christian belief.", "image": "", "pos": { "sal": [0.85, 0.05, 0.1], "uni": 0.333, "rel": 0.533, "ort": [0.533, 0.383, 0.083], "eso": 0.717, "eth": [0.55, 0.05, 0.4] }, "picks": { "sal1": 6, "sal2": 5, "sal3": 6, "sal4": 6, "sal5": 3, "sal6": 3, "sal7": 5, "sal8": 6, "sal9": 3, "sal10": 5, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 5, "rel5": 3, "rel6": 5, "rel7": 5, "rel8": 5, "rel9": 5, "rel10": 5, "ort1": 6, "ort2": 5, "ort3": 7, "ort4": 3, "ort5": 5, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 5, "ort10": 5, "eso1": 3, "eso2": 7, "eso3": 6, "eso4": 6, "eso5": 3, "eso6": 5, "eso7": 6, "eso8": 3, "eso9": 7, "eso10": 7, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "Karl Rahner", "blurb": "Catholic theologian who proposed that people of goodwill can be 'anonymous Christians' saved through Christ.", "image": "", "pos": { "sal": [0.55, 0.25, 0.2], "uni": 0.367, "rel": 0.383, "ort": [0.333, 0.283, 0.383], "eso": 0.5, "eth": [0.5, 0.05, 0.45] }, "picks": { "sal1": 3, "sal2": 5, "sal3": 5, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 5, "sal8": 3, "sal9": 3, "sal10": 5, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 5, "uni10": 3, "rel1": 3, "rel2": 2, "rel3": 3, "rel4": 3, "rel5": 3, "rel6": 5, "rel7": 3, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 3, "ort3": 5, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 3, "ort10": 3, "eso1": 2, "eso2": 5, "eso3": 3, "eso4": 6, "eso5": 3, "eso6": 3, "eso7": 3, "eso8": 3, "eso9": 6, "eso10": 6, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 5, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "Hans Urs von Balthasar", "blurb": "Swiss Catholic theologian who asked whether we may 'dare to hope' that all will be saved.", "image": "", "pos": { "sal": [0.55, 0.25, 0.2], "uni": 0.333, "rel": 0.433, "ort": [0.333, 0.233, 0.433], "eso": 0.5, "eth": [0.55, 0.05, 0.4] }, "picks": { "sal1": 3, "sal2": 5, "sal3": 5, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 5, "sal8": 3, "sal9": 3, "sal10": 5, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 3, "rel5": 3, "rel6": 5, "rel7": 5, "rel8": 3, "rel9": 5, "rel10": 3, "ort1": 6, "ort2": 3, "ort3": 3, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 3, "ort9": 3, "ort10": 3, "eso1": 2, "eso2": 5, "eso3": 3, "eso4": 6, "eso5": 3, "eso6": 3, "eso7": 3, "eso8": 3, "eso9": 6, "eso10": 6, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 3, "eth8": 6, "eth9": 3, "eth10": 3 } }, { "name": "John Stott", "blurb": "Anglican evangelical leader who, with caution, considered annihilation the likelier fate of the lost.", "image": "", "pos": { "sal": [0.1, 0, 0.9], "uni": 0.85, "rel": 0.967, "ort": [0.733, 0.133, 0.133], "eso": 0.9, "eth": [0.3, 0.15, 0.55] }, "picks": { "sal1": 5, "sal2": 2, "sal3": 3, "sal4": 5, "sal5": 5, "sal6": 5, "sal7": 3, "sal8": 5, "sal9": 5, "sal10": 2, "uni1": 7, "uni2": 7, "uni3": 7, "uni4": 7, "uni5": 7, "uni6": 6, "uni7": 7, "uni8": 3, "uni9": 3, "uni10": 7, "rel1": 7, "rel2": 7, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 6, "rel8": 6, "rel9": 7, "rel10": 7, "ort1": 7, "ort2": 7, "ort3": 2, "ort4": 3, "ort5": 5, "ort6": 6, "ort7": 5, "ort8": 6, "ort9": 5, "ort10": 5, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 7, "eso6": 5, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 5, "eth9": 3, "eth10": 2 } }, { "name": "Billy Graham", "blurb": "American evangelist who preached to millions, with a call to personal decision for Christ.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.483, "rel": 0.917, "ort": [0.333, 0.183, 0.483], "eso": 0.917, "eth": [0.4, 0.05, 0.55] }, "picks": { "sal1": 6, "sal2": 6, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 6, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 6, "uni1": 3, "uni2": 3, "uni3": 5, "uni4": 5, "uni5": 3, "uni6": 6, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 5, "rel1": 6, "rel2": 6, "rel3": 7, "rel4": 7, "rel5": 7, "rel6": 7, "rel7": 6, "rel8": 6, "rel9": 7, "rel10": 6, "ort1": 6, "ort2": 3, "ort3": 3, "ort4": 3, "ort5": 3, "ort6": 5, "ort7": 5, "ort8": 7, "ort9": 3, "ort10": 3, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 7, "eso5": 7, "eso6": 5, "eso7": 7, "eso8": 5, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 5, "eth7": 6, "eth8": 5, "eth9": 3, "eth10": 3 } }, { "name": "Mother Teresa", "blurb": "Albanian-born nun who served the dying poor in Calcutta and founded the Missionaries of Charity.", "image": "", "pos": { "sal": [1, 0, 0], "uni": 0.4, "rel": 0.467, "ort": [0.15, 0.6, 0.25], "eso": 0.767, "eth": [0.5, 0.1, 0.4] }, "picks": { "sal1": 6, "sal2": 5, "sal3": 7, "sal4": 6, "sal5": 3, "sal6": 5, "sal7": 7, "sal8": 7, "sal9": 6, "sal10": 5, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 3, "uni5": 3, "uni6": 5, "uni7": 3, "uni8": 3, "uni9": 5, "uni10": 3, "rel1": 3, "rel2": 3, "rel3": 3, "rel4": 3, "rel5": 5, "rel6": 5, "rel7": 3, "rel8": 5, "rel9": 5, "rel10": 3, "ort1": 2, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 2, "ort6": 5, "ort7": 5, "ort8": 2, "ort9": 3, "ort10": 3, "eso1": 6, "eso2": 7, "eso3": 7, "eso4": 6, "eso5": 3, "eso6": 5, "eso7": 5, "eso8": 3, "eso9": 7, "eso10": 7, "eth1": 7, "eth2": 3, "eth3": 6, "eth4": 5, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 6, "eth9": 7, "eth10": 1 } }, { "name": "Rob Bell", "blurb": "American pastor and author of Love Wins, who questions the traditional doctrine of hell.", "image": "", "pos": { "sal": [0.1, 0.8, 0.1], "uni": 0.167, "rel": 0.2, "ort": [0.183, 0.133, 0.683], "eso": 0.733, "eth": [0.65, 0.25, 0.1] }, "picks": { "sal1": 2, "sal2": 1, "sal3": 2, "sal4": 2, "sal5": 3, "sal6": 2, "sal7": 2, "sal8": 3, "sal9": 1, "sal10": 1, "uni1": 2, "uni2": 2, "uni3": 2, "uni4": 2, "uni5": 2, "uni6": 2, "uni7": 2, "uni8": 1, "uni9": 3, "uni10": 2, "rel1": 2, "rel2": 2, "rel3": 2, "rel4": 2, "rel5": 2, "rel6": 3, "rel7": 2, "rel8": 2, "rel9": 3, "rel10": 2, "ort1": 3, "ort2": 3, "ort3": 3, "ort4": 3, "ort5": 2, "ort6": 1, "ort7": 2, "ort8": 3, "ort9": 1, "ort10": 3, "eso1": 3, "eso2": 7, "eso3": 7, "eso4": 5, "eso5": 3, "eso6": 5, "eso7": 7, "eso8": 3, "eso9": 7, "eso10": 7, "eth1": 2, "eth2": 3, "eth3": 3, "eth4": 3, "eth5": 3, "eth6": 6, "eth7": 3, "eth8": 5, "eth9": 3, "eth10": 2 } }, { "name": "Rumi", "blurb": "13th-century Persian Sufi poet who wrote of love as the way back to God. Not a Christian, so the match on the Christ-specific questions is approximate.", "image": "", "pos": { "sal": [0, 0.95, 0.05], "uni": 0, "rel": 0.017, "ort": [0.1, 0.05, 0.85], "eso": 0, "eth": [0.75, 0.15, 0.1] }, "picks": { "sal1": 1, "sal2": 1, "sal3": 1, "sal4": 1, "sal5": 1, "sal6": 1, "sal7": 1, "sal8": 2, "sal9": 1, "sal10": 1, "uni1": 1, "uni2": 1, "uni3": 1, "uni4": 1, "uni5": 1, "uni6": 1, "uni7": 1, "uni8": 1, "uni9": 1, "uni10": 1, "rel1": 1, "rel2": 1, "rel3": 1, "rel4": 1, "rel5": 1, "rel6": 2, "rel7": 1, "rel8": 1, "rel9": 1, "rel10": 1, "ort1": 3, "ort2": 3, "ort3": 3, "ort4": 6, "ort5": 1, "ort6": 1, "ort7": 1, "ort8": 7, "ort9": 1, "ort10": 1, "eso1": 1, "eso2": 1, "eso3": 1, "eso4": 1, "eso5": 1, "eso6": 1, "eso7": 1, "eso8": 1, "eso9": 1, "eso10": 1, "eth1": 3, "eth2": 3, "eth3": 7, "eth4": 3, "eth5": 3, "eth6": 5, "eth7": 3, "eth8": 7, "eth9": 3, "eth10": 2 } }, { "name": "Maimonides", "blurb": "12th-century Jewish philosopher and physician who set out thirteen principles of Jewish faith and wrote his Guide for the perplexed. Not a Christian, so the match on the Christ-specific questions is approximate.", "image": "", "pos": { "sal": [0.1, 0, 0.9], "uni": 0.383, "rel": 0.517, "ort": [0.633, 0.233, 0.133], "eso": 0.4, "eth": [0.25, 0.05, 0.7] }, "picks": { "sal1": 5, "sal2": 2, "sal3": 3, "sal4": 5, "sal5": 5, "sal6": 3, "sal7": 3, "sal8": 5, "sal9": 5, "sal10": 2, "uni1": 3, "uni2": 3, "uni3": 3, "uni4": 6, "uni5": 3, "uni6": 3, "uni7": 3, "uni8": 3, "uni9": 3, "uni10": 3, "rel1": 5, "rel2": 3, "rel3": 6, "rel4": 3, "rel5": 2, "rel6": 3, "rel7": 6, "rel8": 5, "rel9": 5, "rel10": 3, "ort1": 7, "ort2": 7, "ort3": 7, "ort4": 3, "ort5": 7, "ort6": 6, "ort7": 6, "ort8": 6, "ort9": 6, "ort10": 6, "eso1": 2, "eso2": 2, "eso3": 2, "eso4": 6, "eso5": 5, "eso6": 5, "eso7": 3, "eso8": 3, "eso9": 3, "eso10": 3, "eth1": 6, "eth2": 5, "eth3": 6, "eth4": 5, "eth5": 6, "eth6": 5, "eth7": 6, "eth8": 6, "eth9": 3, "eth10": 5 } }, { "name": "Mahatma Gandhi", "blurb": "Indian leader of nonviolent resistance who held that all religions are paths to one truth. Not a Christian, so the match on the Christ-specific questions is approximate.", "image": "", "pos": { "sal": [0, 0.95, 0.05], "uni": 0, "rel": 0.033, "ort": [0.1, 0.5, 0.4], "eso": 0.533, "eth": [0.4, 0.1, 0.5] }, "picks": { "sal1": 1, "sal2": 1, "sal3": 1, "sal4": 1, "sal5": 1, "sal6": 1, "sal7": 1, "sal8": 1, "sal9": 1, "sal10": 1, "uni1": 1, "uni2": 1, "uni3": 1, "uni4": 1, "uni5": 1, "uni6": 1, "uni7": 1, "uni8": 1, "uni9": 1, "uni10": 1, "rel1": 1, "rel2": 1, "rel3": 1, "rel4": 1, "rel5": 1, "rel6": 3, "rel7": 1, "rel8": 1, "rel9": 1, "rel10": 1, "ort1": 2, "ort2": 2, "ort3": 7, "ort4": 5, "ort5": 1, "ort6": 2, "ort7": 2, "ort8": 3, "ort9": 1, "ort10": 3, "eso1": 2, "eso2": 7, "eso3": 5, "eso4": 3, "eso5": 1, "eso6": 3, "eso7": 5, "eso8": 3, "eso9": 6, "eso10": 7, "eth1": 7, "eth2": 3, "eth3": 6, "eth4": 3, "eth5": 3, "eth6": 7, "eth7": 6, "eth8": 6, "eth9": 6, "eth10": 1 } }] }] }];

// worker/index.js
var SESSION_DAYS = 60;
var COOKIE = "atk_session";
var DAY = 864e5;
var LIMITS = {
  username: [3, 24],
  comment: 3e3,
  message: 4e3,
  ask: 500,
  // an anonymous message from the Ask page
  picture: 12e4
  // characters of the data: URL (a 128 px square is ~10–40 k)
};
var USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/;
var RESERVED = ["admin", "administrator", "moderator", "mod", "staff", "support", "system", "root", "deleted", "anonymous", "accordingtoknowledge"];
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var HttpError = class extends Error {
  static {
    __name(this, "HttpError");
  }
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
};
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      if (request.method === "GET" || request.method === "HEAD") {
        const m = url.pathname.match(/^\/(article|community|quiz)\/([a-z0-9-]+)\/?$/);
        if (m) return withPreview(request, env, url, m[1], m[2]).catch(() => env.ASSETS.fetch(request));
      }
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === "/api/ask") return askRequest(request, env, ctx, url);
    if (url.pathname.startsWith("/api/animator/")) return animatorRequest(request, env, ctx, url);
    try {
      if (!env.DB) throw new HttpError(503, "Accounts aren't switched on yet.");
      await ensureSchema(env);
      return await route(request, env, ctx, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...e.extra || {} }, e.status);
      console.error(e && e.stack || e);
      return json({ error: "Something went wrong on the server. Try again in a moment." }, 500);
    }
  }
};
var ROUTES = [
  ["GET", /^\/api\/me$/, me],
  ["POST", /^\/api\/signup$/, signup],
  ["POST", /^\/api\/login$/, login],
  ["POST", /^\/api\/logout$/, logout],
  ["POST", /^\/api\/recover$/, recover],
  ["POST", /^\/api\/account\/password$/, changePassword],
  ["POST", /^\/api\/account\/recovery$/, rotateRecovery],
  ["POST", /^\/api\/account\/avatar$/, chooseAvatar],
  ["POST", /^\/api\/account\/picture$/, requestPicture],
  ["POST", /^\/api\/account\/logout-all$/, logoutAll],
  ["POST", /^\/api\/account\/delete$/, deleteAccount],
  ["GET", /^\/api\/picture\/(\d+)$/, picture],
  ["GET", /^\/api\/comments$/, listComments],
  ["POST", /^\/api\/comments$/, postComment],
  ["POST", /^\/api\/comments\/(\d+)\/delete$/, deleteComment],
  ["GET", /^\/api\/messages$/, myMessages],
  ["POST", /^\/api\/messages$/, sendMessage],
  ["GET", /^\/api\/admin\/overview$/, adminOverview],
  ["POST", /^\/api\/admin\/test-email$/, adminTestEmail],
  ["GET", /^\/api\/admin\/asks$/, adminAsks],
  ["POST", /^\/api\/admin\/asks\/(\d+)$/, adminAsk],
  ["GET", /^\/api\/dict$/, dictAll],
  ["POST", /^\/api\/admin\/dict\/entries$/, adminDictAdd],
  ["POST", /^\/api\/admin\/dict\/entries\/(\d+)$/, adminDictSave],
  ["POST", /^\/api\/admin\/dict\/entries\/(\d+)\/delete$/, adminDictDelete],
  ["POST", /^\/api\/admin\/dict\/sects\/(\d+)$/, adminDictSect],
  ["POST", /^\/api\/admin\/comments\/(\d+)$/, adminComment],
  ["POST", /^\/api\/admin\/pictures\/(\d+)$/, adminPicture],
  ["GET", /^\/api\/admin\/messages\/(\d+)$/, adminThread],
  ["POST", /^\/api\/admin\/messages\/(\d+)$/, adminReply],
  ["GET", /^\/api\/admin\/users$/, adminUsers],
  ["GET", /^\/api\/admin\/words$/, adminWords],
  ["POST", /^\/api\/admin\/words$/, adminSaveWords],
  ["POST", /^\/api\/admin\/users\/(\d+)$/, adminUser],
  // writing
  ["GET", /^\/api\/writing$/, myWriting],
  ["POST", /^\/api\/writing$/, newWriting],
  ["POST", /^\/api\/writing\/import$/, importOfficial],
  ["GET", /^\/api\/writing\/(\d+)$/, getWriting],
  ["POST", /^\/api\/writing\/(\d+)$/, saveWriting],
  ["POST", /^\/api\/writing\/(\d+)\/(submit|withdraw|delete|unpublish|publish|keep|reload)$/, writingAction],
  ["POST", /^\/api\/writer\/request$/, requestToWrite],
  ["GET", /^\/api\/community$/, communityList],
  ["GET", /^\/api\/community\/([a-z0-9-]+)$/, communityArticle],
  ["GET", /^\/api\/people\/([A-Za-z0-9_.-]+)$/, person],
  // quizzes
  ["GET", /^\/api\/quizzes$/, quizList],
  ["GET", /^\/api\/quizzes\/([a-z0-9-]+)$/, quizGet],
  ["GET", /^\/api\/quizzes\/([a-z0-9-]+)\/mine$/, quizMine],
  ["POST", /^\/api\/quizzes\/([a-z0-9-]+)\/result$/, quizSave],
  ["POST", /^\/api\/quizzes\/([a-z0-9-]+)\/share$/, quizShare],
  ["POST", /^\/api\/quizzes\/([a-z0-9-]+)\/forget$/, quizForget],
  ["GET", /^\/api\/quizzes\/([a-z0-9-]+)\/shared\/([A-Za-z0-9_.-]+)$/, quizShared],
  ["GET", /^\/api\/quiz-image\/(\d+)$/, quizImage],
  ["POST", /^\/api\/admin\/quizzes$/, adminQuizSave],
  ["POST", /^\/api\/admin\/quizzes\/([a-z0-9-]+)\/delete$/, adminQuizDelete],
  ["POST", /^\/api\/admin\/quiz-images$/, adminQuizImage],
  ["GET", /^\/api\/admin\/submissions\/(\d+)$/, adminSubmission],
  ["POST", /^\/api\/admin\/submissions\/(\d+)$/, adminReview],
  ["POST", /^\/api\/admin\/writer-requests\/(\d+)$/, adminWriterRequest],
  ["POST", /^\/api\/community\/([a-z0-9-]+)\/delete$/, deleteCommunityArticle],
  ["POST", /^\/api\/admin\/articles\/([a-z0-9-]+)\/delete$/, deleteOfficialArticle]
];
async function route(request, env, ctx, url) {
  const method = request.method === "HEAD" ? "GET" : request.method;
  for (const [m, re, handler] of ROUTES) {
    const match = url.pathname.match(re);
    if (!match) continue;
    if (m !== method) continue;
    if (method !== "GET") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) throw new HttpError(403, "Not allowed from another site.");
      if (!(request.headers.get("Content-Type") || "").includes("application/json")) throw new HttpError(415, "Send JSON.");
    }
    const c = { request, env, ctx, url, params: match.slice(1), body: null, user: null };
    c.user = await currentUser(c);
    if (method !== "GET") c.body = await request.json().catch(() => {
      throw new HttpError(400, "That request wasn't valid JSON.");
    });
    return handler(c);
  }
  throw new HttpError(404, "No such address.");
}
__name(route, "route");
var MIGRATIONS = [
  [
    `CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
      recovery_salt TEXT NOT NULL, recovery_hash TEXT NOT NULL,
      avatar TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', banned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL)`,
    `CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE INDEX sessions_user ON sessions (user_id)`,
    `CREATE TABLE pictures (user_id INTEGER PRIMARY KEY, approved TEXT, pending TEXT, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE comments (id INTEGER PRIMARY KEY, slug TEXT NOT NULL, user_id INTEGER NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX comments_slug ON comments (slug, status, created_at)`,
    `CREATE INDEX comments_status ON comments (status, created_at)`,
    `CREATE INDEX comments_user ON comments (user_id)`,
    `CREATE TABLE messages (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, from_admin INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER)`,
    `CREATE INDEX messages_user ON messages (user_id, created_at)`,
    `CREATE TABLE limits (key TEXT PRIMARY KEY, win INTEGER NOT NULL, count INTEGER NOT NULL, expires INTEGER NOT NULL)`
  ],
  [
    // drafts: Silver's articles for the site ("official") and community writers' ("community")
    `CREATE TABLE writings (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, slug TEXT,
      title TEXT NOT NULL DEFAULT '', subtitle TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
      categories TEXT NOT NULL DEFAULT '[]', html TEXT NOT NULL DEFAULT '', delta TEXT NOT NULL DEFAULT '{"ops":[]}',
      words INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0, source TEXT,
      state TEXT NOT NULL DEFAULT 'draft', note TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, submitted_at INTEGER)`,
    `CREATE INDEX writings_user ON writings (user_id, updated_at)`,
    `CREATE INDEX writings_state ON writings (state, submitted_at)`,
    // what readers see of community articles (a copy made when Silver approves)
    `CREATE TABLE community (
      slug TEXT PRIMARY KEY, writing_id INTEGER NOT NULL UNIQUE, user_id INTEGER NOT NULL,
      title TEXT NOT NULL, subtitle TEXT NOT NULL, summary TEXT NOT NULL, categories TEXT NOT NULL,
      html TEXT NOT NULL, words INTEGER NOT NULL, published_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE INDEX community_user ON community (user_id)`,
    `CREATE INDEX community_published ON community (published_at)`,
    `CREATE TABLE writer_requests (user_id INTEGER PRIMARY KEY, note TEXT NOT NULL, created_at INTEGER NOT NULL)`
  ],
  [
    // for Silver's articles: the published version ("updated" time) a draft started from, so an
    // edit made meanwhile on silverfishstone.com/write isn't quietly overwritten
    `ALTER TABLE writings ADD COLUMN base TEXT`
  ],
  [
    // an article's thumbnail ("" / a new picture as a data: URL / its path in the repo) and which
    // picture link previews use ("thumbnail" or "banner")
    `ALTER TABLE writings ADD COLUMN thumbnail TEXT`,
    `ALTER TABLE writings ADD COLUMN card TEXT`
  ],
  [
    // quizzes (one JSON document each), people's saved answers, and the pictures used in a quiz's result lists
    `CREATE TABLE quizzes (
      slug TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', questions INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE quiz_results (
      user_id INTEGER NOT NULL, slug TEXT NOT NULL, answers TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0, taken_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, slug))`,
    `CREATE INDEX quiz_results_shared ON quiz_results (user_id, shared, taken_at)`,
    `CREATE TABLE quiz_images (id INTEGER PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)`
  ],
  [
    // anonymous messages from the Ask page on silverfishstone.com: nothing is kept about the sender.
    // status is 'new', 'ignored' or 'posted'
    `CREATE TABLE asks (id INTEGER PRIMARY KEY, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at INTEGER NOT NULL)`,
    `CREATE INDEX asks_status ON asks (status, created_at)`
  ],
  [
    // the religiolect dictionary: a term is shared by every denomination that uses it; an entry is one group's
    // meaning of it (its plain explanation); a translation is that meaning explained in another group's terms
    // a group is who uses a term: a religion (blank = Trinitarian Christian), a tradition (Baptist, Pentecostal, Catholic),
    // optionally the exact denomination (PCUSA, RCC) and a location. Any of the last three can be left out of a group
    `CREATE TABLE dict_sects (
      id INTEGER PRIMARY KEY,
      religion TEXT NOT NULL DEFAULT '' COLLATE NOCASE, tradition TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
      denomination TEXT NOT NULL DEFAULT '' COLLATE NOCASE, location TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
      created_at INTEGER NOT NULL, UNIQUE (religion, tradition, denomination, location))`,
    `CREATE TABLE dict_terms (id INTEGER PRIMARY KEY, term TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE dict_entries (
      id INTEGER PRIMARY KEY, term_id INTEGER NOT NULL, sect_id INTEGER NOT NULL, definition TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE (term_id, sect_id))`,
    `CREATE INDEX dict_entries_sect ON dict_entries (sect_id)`,
    `CREATE TABLE dict_translations (entry_id INTEGER NOT NULL, sect_id INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (entry_id, sect_id))`
  ],
  [
    // other ways of saying a term ("On fire for the Lord" for "On fire for God"): listed and searched like terms, and open the same page
    `CREATE TABLE dict_aliases (id INTEGER PRIMARY KEY, term_id INTEGER NOT NULL, alias TEXT NOT NULL UNIQUE COLLATE NOCASE)`,
    `CREATE INDEX dict_aliases_term ON dict_aliases (term_id)`
  ],
  [
    // a meaning of a term can be shared by several groups (Baptist, Pentecostal and Methodist all use it the same way).
    // dict_entry_groups says which; a group has at most one meaning of a term. dict_entries loses its single sect_id
    `CREATE TABLE dict_entry_groups (
      entry_id INTEGER NOT NULL, term_id INTEGER NOT NULL, sect_id INTEGER NOT NULL,
      PRIMARY KEY (entry_id, sect_id), UNIQUE (term_id, sect_id))`,
    `INSERT INTO dict_entry_groups (entry_id, term_id, sect_id) SELECT id, term_id, sect_id FROM dict_entries`,
    `CREATE INDEX dict_entry_groups_sect ON dict_entry_groups (sect_id)`,
    `CREATE TABLE dict_entries_new (id INTEGER PRIMARY KEY, term_id INTEGER NOT NULL, definition TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `INSERT INTO dict_entries_new (id, term_id, definition, created_at, updated_at) SELECT id, term_id, definition, created_at, updated_at FROM dict_entries`,
    `DROP TABLE dict_entries`,
    `ALTER TABLE dict_entries_new RENAME TO dict_entries`,
    `CREATE INDEX dict_entries_term ON dict_entries (term_id)`
  ],
  [
    // photos kept for the 2D animator on silverfishstone.com (sent from a phone, used in the editor on a computer), and the
    // sign-in tokens it holds. A photo is stored as base64 text, the same way pictures are
    `CREATE TABLE animator_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
    `CREATE INDEX animator_tokens_user ON animator_tokens (user_id)`,
    `CREATE TABLE animator_photos (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL)`,
    `CREATE INDEX animator_photos_user ON animator_photos (user_id, created_at)`
  ]
];
var schemaReady = null;
function ensureSchema(env) {
  return schemaReady ||= (async () => {
    const db = env.DB;
    await db.prepare("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)").run();
    const row = await db.prepare("SELECT value FROM meta WHERE key = 'schema'").first();
    const done = row ? Number(row.value) : 0;
    for (let i = done; i < MIGRATIONS.length; i++) {
      await db.batch([
        ...MIGRATIONS[i].map((sql) => db.prepare(sql)),
        db.prepare("INSERT INTO meta (key, value) VALUES ('schema', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1").bind(String(i + 1))
      ]);
    }
    await seedQuizzes(env).catch((e) => console.error("quiz seed failed:", e && e.message));
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
}
__name(ensureSchema, "ensureSchema");
var one = /* @__PURE__ */ __name((env, sql, ...args) => env.DB.prepare(sql).bind(...args).first(), "one");
var all = /* @__PURE__ */ __name(async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [], "all");
var run = /* @__PURE__ */ __name((env, sql, ...args) => env.DB.prepare(sql).bind(...args).run(), "run");
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}
__name(json, "json");
var enc = new TextEncoder();
var hex = /* @__PURE__ */ __name((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), "hex");
var randomHex = /* @__PURE__ */ __name((n) => hex(crypto.getRandomValues(new Uint8Array(n))), "randomHex");
var sha256 = /* @__PURE__ */ __name(async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s))), "sha256");
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(b64url, "b64url");
function sameHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
__name(sameHex, "sameHex");
var hashSecret = /* @__PURE__ */ __name((salt, secret) => sha256(`${salt}:${secret}`), "hashSecret");
function newRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return chars.match(/.{4}/g).join("-");
}
__name(newRecoveryCode, "newRecoveryCode");
var normalCode = /* @__PURE__ */ __name((s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), "normalCode");
function text(v, name, max, min = 1) {
  const s = typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "";
  if (s.length < min) throw new HttpError(400, `${name} can't be empty.`);
  if (s.length > max) throw new HttpError(400, `${name} is too long (${s.length} of ${max} characters).`);
  return s;
}
__name(text, "text");
function prehash(v, what = "password") {
  if (typeof v !== "string" || !/^[0-9a-f]{64}$/.test(v)) throw new HttpError(400, `That ${what} wasn't sent properly. Reload the page and try again.`);
  return v;
}
__name(prehash, "prehash");
async function limit(c, what, max, seconds, who) {
  const now = Date.now(), win = Math.floor(now / 1e3 / seconds);
  const ip = c.request.headers.get("CF-Connecting-IP") || "local";
  const key = `${what}:${who ?? (await sha256("ip:" + ip)).slice(0, 24)}`;
  const row = await one(
    c.env,
    `INSERT INTO limits (key, win, count, expires) VALUES (?1, ?2, 1, ?3)
     ON CONFLICT (key) DO UPDATE SET count = CASE WHEN win = ?2 THEN count + 1 ELSE 1 END, win = ?2, expires = ?3
     RETURNING count`,
    key,
    win,
    (win + 1) * seconds * 1e3
  );
  if (Math.random() < 0.02) await run(c.env, "DELETE FROM limits WHERE expires < ?1", now);
  if (row && row.count > max) throw new HttpError(429, "That's too many tries for now. Wait a little and try again.");
}
__name(limit, "limit");
async function turnstile(c, token) {
  if (!c.env.TURNSTILE_SECRET) return;
  const form = new FormData();
  form.append("secret", c.env.TURNSTILE_SECRET);
  form.append("response", String(token || ""));
  const ip = c.request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then((x) => x.json()).catch(() => null);
  if (!r || !r.success) throw new HttpError(400, `The "are you human" check didn't pass. Try it again.`);
}
__name(turnstile, "turnstile");
async function flaggedList(env) {
  const row = await one(env, "SELECT value FROM meta WHERE key = 'flagged_words'");
  try {
    return row ? JSON.parse(row.value) : [];
  } catch {
    return [];
  }
}
__name(flaggedList, "flaggedList");
var fold = /* @__PURE__ */ __name((s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, ""), "fold");
var escRe = /* @__PURE__ */ __name((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "escRe");
async function flaggedWord(env, textToCheck) {
  const hay = fold(textToCheck);
  for (const entry of await flaggedList(env)) {
    const e = fold(entry).trim();
    if (!e) continue;
    const wild = e.endsWith("*"), core = escRe(wild ? e.slice(0, -1).trim() : e).replace(/\s+/g, "\\s+");
    if (!core) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${core}${wild ? "" : "(?![\\p{L}\\p{N}])"}`, "u");
    if (re.test(hay)) return entry.trim();
  }
  return null;
}
__name(flaggedWord, "flaggedWord");
async function commentable(c, key) {
  if (key.startsWith("c:")) {
    const row = await one(c.env, "SELECT slug, title FROM community WHERE slug = ?1", key.slice(2));
    return row && { title: row.title, path: `/community/${row.slug}` };
  }
  const a = (await articles(c)).get(key);
  return a && { title: a.title, path: `/article/${a.slug}` };
}
__name(commentable, "commentable");
var articleCache = null;
async function articles(c) {
  if (articleCache && articleCache.at > Date.now() - 6e4) return articleCache.map;
  const res = await c.env.ASSETS.fetch(new Request(new URL("/articles/index.json", c.url)));
  const list = res.ok ? await res.json() : [];
  const map = new Map((Array.isArray(list) ? list : []).map((a) => [a.slug, a]));
  articleCache = { at: Date.now(), map };
  return map;
}
__name(articles, "articles");
var avatarCache = null;
async function avatarIds(c) {
  if (avatarCache) return avatarCache;
  const res = await c.env.ASSETS.fetch(new Request(new URL("/assets/avatars/index.json", c.url)));
  const list = res.ok ? await res.json() : [];
  avatarCache = new Set(list.map((a) => a.id));
  return avatarCache;
}
__name(avatarIds, "avatarIds");
function cookieValue(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
__name(cookieValue, "cookieValue");
var sessionCookie = /* @__PURE__ */ __name((token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`, "sessionCookie");
async function currentUser(c) {
  const token = cookieValue(c.request, COOKIE);
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const u = await one(
    c.env,
    `SELECT u.id, u.username, u.avatar, u.role, u.banned, p.updated_at AS picture_at
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN pictures p ON p.user_id = u.id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
    await sha256(token),
    Date.now()
  );
  if (!u || u.banned) return null;
  return u;
}
__name(currentUser, "currentUser");
async function startSession(c, userId) {
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await run(
    c.env,
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
    await sha256(token),
    userId,
    now,
    now + SESSION_DAYS * DAY
  );
  if (Math.random() < 0.05) await run(c.env, "DELETE FROM sessions WHERE expires_at < ?1", now);
  return sessionCookie(token, SESSION_DAYS * 86400);
}
__name(startSession, "startSession");
function need(c, admin = false) {
  if (!c.user) throw new HttpError(401, "Sign in first.");
  if (admin && c.user.role !== "admin") throw new HttpError(403, "Only Silver can do that.");
  return c.user;
}
__name(need, "need");
var publicUser = /* @__PURE__ */ __name((u) => u && {
  id: u.id,
  username: u.username,
  avatar: u.avatar,
  role: u.role === "admin" || u.role === "writer" ? u.role : "user",
  picture: u.avatar === "custom" && u.picture_at ? `/api/picture/${u.id}?v=${u.picture_at}` : null
}, "publicUser");
async function checkPassword(c, userId, given) {
  const row = await one(c.env, "SELECT pass_salt, pass_hash FROM users WHERE id = ?1", userId);
  if (!row || !sameHex(await hashSecret(row.pass_salt, prehash(given)), row.pass_hash)) throw new HttpError(403, "That password isn't right.");
}
__name(checkPassword, "checkPassword");
async function setRecovery(env, userId) {
  const code = newRecoveryCode(), salt = randomHex(16);
  await run(env, "UPDATE users SET recovery_salt = ?1, recovery_hash = ?2 WHERE id = ?3", salt, await hashSecret(salt, normalCode(code)), userId);
  return code;
}
__name(setRecovery, "setRecovery");
async function sendAlert(env, origin, subject, lines) {
  if (!env.EMAIL || !env.ALERT_TO) throw Object.assign(new Error("Email alerts aren't set up (no EMAIL binding)."), { code: "NOT_SET_UP" });
  const from = env.ALERT_FROM || "alerts@accordingtoknowledge.com";
  const text2 = [...lines, "", `Review it: ${origin}/admin`].join("\n");
  const b64 = /* @__PURE__ */ __name((s) => {
    let out = "";
    for (const b of enc.encode(s)) out += String.fromCharCode(b);
    return btoa(out);
  }, "b64");
  const raw = [
    `From: According To Knowledge <${from}>`,
    `To: <${env.ALERT_TO}>`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Date: ${(/* @__PURE__ */ new Date()).toUTCString()}`,
    `Message-ID: <${randomHex(12)}@${from.split("@")[1]}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(text2).replace(/.{76}/g, "$&\r\n")
  ].join("\r\n");
  const errors = [];
  try {
    await env.EMAIL.send(new EmailMessage(from, env.ALERT_TO, raw));
    return "classic";
  } catch (e) {
    errors.push(`classic: ${e && (e.code ? e.code + " " : "") + e.message}`);
  }
  try {
    await env.EMAIL.send({ from: { email: from, name: "According To Knowledge" }, to: env.ALERT_TO, subject, text: text2 });
    return "new";
  } catch (e) {
    errors.push(`new: ${e && (e.code ? e.code + " " : "") + e.message}`);
  }
  throw new Error(errors.join(" | "));
}
__name(sendAlert, "sendAlert");
async function recordEmail(env, status) {
  await run(env, "INSERT INTO meta (key, value) VALUES ('email_status', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1", JSON.stringify(status)).catch(() => {
  });
}
__name(recordEmail, "recordEmail");
function notify(c, subject, lines) {
  if (!c.env.EMAIL || !c.env.ALERT_TO) return;
  c.ctx.waitUntil(sendAlert(c.env, c.url.origin, subject, lines).then((how) => recordEmail(c.env, { ok: true, at: Date.now(), how, subject })).catch((e) => {
    console.error("alert email failed:", e);
    return recordEmail(c.env, { ok: false, at: Date.now(), error: String(e.message || e), subject });
  }));
}
__name(notify, "notify");
var excerpt = /* @__PURE__ */ __name((s, n = 400) => s.length > n ? s.slice(0, n) + "\u2026" : s, "excerpt");
async function me(c) {
  if (!c.user) return json({ user: null });
  const unread = c.user.role === "admin" ? await one(c.env, "SELECT COUNT(*) AS n FROM messages WHERE from_admin = 0 AND read_at IS NULL") : await one(c.env, "SELECT COUNT(*) AS n FROM messages WHERE user_id = ?1 AND from_admin = 1 AND read_at IS NULL", c.user.id);
  const out = { user: publicUser(c.user), unread: unread ? unread.n : 0 };
  if (c.user.role === "admin") {
    const p2 = await one(c.env, "SELECT (SELECT COUNT(*) FROM comments WHERE status = 'pending') AS comments, (SELECT COUNT(*) FROM pictures WHERE pending IS NOT NULL) AS pictures, (SELECT COUNT(*) FROM asks WHERE status = 'new') AS asks");
    out.pending = p2;
  }
  const p = await one(c.env, "SELECT approved IS NOT NULL AS has, pending IS NOT NULL AS waiting, updated_at FROM pictures WHERE user_id = ?1", c.user.id);
  out.pictureWaiting = !!(p && p.waiting);
  if (c.user.role === "user") out.writerRequest = !!await one(c.env, "SELECT 1 AS x FROM writer_requests WHERE user_id = ?1", c.user.id);
  if (c.user.role === "admin") out.pending.writing = (await one(
    c.env,
    "SELECT (SELECT COUNT(*) FROM writings WHERE state = 'submitted') + (SELECT COUNT(*) FROM writer_requests) AS n"
  )).n;
  out.ownPicture = p && p.has ? `/api/picture/${c.user.id}?v=${p.updated_at}` : null;
  return json(out);
}
__name(me, "me");
async function signup(c) {
  const b = c.body;
  const username = String(b.username || "").trim();
  if (!USERNAME_RE.test(username)) throw new HttpError(400, "Usernames are 3 to 24 letters, numbers, dots, dashes or underscores, starting with a letter or number.");
  await limit(c, "signup", 5, 3600);
  await turnstile(c, b.turnstile);
  const isAdmin = c.env.ADMIN_USERNAME && username.toLowerCase() === c.env.ADMIN_USERNAME.toLowerCase();
  if (isAdmin) {
    if (!c.env.ADMIN_CODE) throw new HttpError(403, "That username is taken.");
    if (!b.adminCode) throw new HttpError(403, "That username is reserved. Enter the admin code to claim it.", { needAdminCode: true });
    if (!sameHex(await sha256(String(b.adminCode)), await sha256(c.env.ADMIN_CODE))) throw new HttpError(403, "That admin code isn't right.", { needAdminCode: true });
  } else if (RESERVED.includes(username.toLowerCase())) throw new HttpError(400, "That username is reserved. Pick another.");
  if (!isAdmin && await flaggedWord(c.env, username.replace(/[_.-]+/g, " "))) throw new HttpError(400, "That username isn't allowed. Pick another.");
  const pass = prehash(b.password);
  const avatars = [...await avatarIds(c)];
  const avatar = avatars.includes(b.avatar) ? b.avatar : avatars[0] || "default";
  const salt = randomHex(16), code = newRecoveryCode(), rsalt = randomHex(16);
  const row = await one(
    c.env,
    `INSERT INTO users (username, pass_salt, pass_hash, recovery_salt, recovery_hash, avatar, role, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT (username) DO NOTHING RETURNING id`,
    username,
    salt,
    await hashSecret(salt, pass),
    rsalt,
    await hashSecret(rsalt, normalCode(code)),
    avatar,
    isAdmin ? "admin" : "user",
    Date.now()
  );
  if (!row) throw new HttpError(409, "That username is taken. Pick another.");
  const cookie = await startSession(c, row.id);
  const user = await one(c.env, "SELECT id, username, avatar, role FROM users WHERE id = ?1", row.id);
  return json({ user: publicUser(user), recoveryCode: code }, 200, { "Set-Cookie": cookie });
}
__name(signup, "signup");
async function login(c) {
  const username = String(c.body.username || "").trim();
  await limit(c, "login-ip", 30, 900);
  await limit(c, "login-user", 10, 900, username.toLowerCase().slice(0, 40));
  const u = await one(c.env, "SELECT id, username, avatar, role, banned, pass_salt, pass_hash FROM users WHERE username = ?1", username);
  const given = prehash(c.body.password);
  const ok = sameHex(await hashSecret(u ? u.pass_salt : "none", given), u ? u.pass_hash : "x");
  if (!u || !ok) throw new HttpError(403, "That username and password don't match.");
  if (u.banned) throw new HttpError(403, "This account has been suspended.");
  const cookie = await startSession(c, u.id);
  const full = await currentUserById(c.env, u.id);
  return json({ user: publicUser(full) }, 200, { "Set-Cookie": cookie });
}
__name(login, "login");
var currentUserById = /* @__PURE__ */ __name((env, id) => one(
  env,
  "SELECT u.id, u.username, u.avatar, u.role, u.banned, p.updated_at AS picture_at FROM users u LEFT JOIN pictures p ON p.user_id = u.id WHERE u.id = ?1",
  id
), "currentUserById");
async function logout(c) {
  const token = cookieValue(c.request, COOKIE);
  if (token) await run(c.env, "DELETE FROM sessions WHERE token_hash = ?1", await sha256(token));
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}
__name(logout, "logout");
async function recover(c) {
  const username = String(c.body.username || "").trim();
  await limit(c, "recover-ip", 10, 3600);
  await limit(c, "recover-user", 5, 3600, username.toLowerCase().slice(0, 40));
  const u = await one(c.env, "SELECT id, banned, recovery_salt, recovery_hash FROM users WHERE username = ?1", username);
  const ok = u && sameHex(await hashSecret(u.recovery_salt, normalCode(c.body.code)), u.recovery_hash);
  if (!ok) throw new HttpError(403, "That username and recovery code don't match.");
  if (u.banned) throw new HttpError(403, "This account has been suspended.");
  const pass = prehash(c.body.password, "new password"), salt = randomHex(16);
  await run(c.env, "UPDATE users SET pass_salt = ?1, pass_hash = ?2 WHERE id = ?3", salt, await hashSecret(salt, pass), u.id);
  await run(c.env, "DELETE FROM sessions WHERE user_id = ?1", u.id);
  const code = await setRecovery(c.env, u.id);
  const cookie = await startSession(c, u.id);
  return json({ user: publicUser(await currentUserById(c.env, u.id)), recoveryCode: code }, 200, { "Set-Cookie": cookie });
}
__name(recover, "recover");
async function changePassword(c) {
  const u = need(c);
  await limit(c, "password", 10, 3600, "u" + u.id);
  await checkPassword(c, u.id, c.body.current);
  const pass = prehash(c.body.password, "new password"), salt = randomHex(16);
  await run(c.env, "UPDATE users SET pass_salt = ?1, pass_hash = ?2 WHERE id = ?3", salt, await hashSecret(salt, pass), u.id);
  const token = cookieValue(c.request, COOKIE);
  await run(c.env, "DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2", u.id, await sha256(token || ""));
  return json({ ok: true });
}
__name(changePassword, "changePassword");
async function rotateRecovery(c) {
  const u = need(c);
  await limit(c, "password", 10, 3600, "u" + u.id);
  await checkPassword(c, u.id, c.body.current);
  return json({ recoveryCode: await setRecovery(c.env, u.id) });
}
__name(rotateRecovery, "rotateRecovery");
async function chooseAvatar(c) {
  const u = need(c);
  const id = String(c.body.avatar || "");
  if (id === "custom") {
    const p = await one(c.env, "SELECT approved FROM pictures WHERE user_id = ?1", u.id);
    if (!p || !p.approved) throw new HttpError(400, "Your own picture hasn't been approved yet.");
  } else if (!(await avatarIds(c)).has(id)) throw new HttpError(400, "That picture isn't one of the choices.");
  await run(c.env, "UPDATE users SET avatar = ?1 WHERE id = ?2", id, u.id);
  return json({ user: publicUser(await currentUserById(c.env, u.id)) });
}
__name(chooseAvatar, "chooseAvatar");
async function requestPicture(c) {
  const u = need(c);
  await limit(c, "picture", 5, 86400, "u" + u.id);
  const img = String(c.body.image || "");
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(img)) throw new HttpError(400, "That picture couldn't be read. Try a PNG or JPEG.");
  if (img.length > LIMITS.picture) throw new HttpError(400, "That picture is too big. Try a smaller one.");
  await run(
    c.env,
    `INSERT INTO pictures (user_id, pending, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT (user_id) DO UPDATE SET pending = ?2`,
    u.id,
    img,
    Date.now()
  );
  notify(c, `Picture request from ${u.username}`, [`${u.username} asked to use their own profile picture.`]);
  return json({ ok: true });
}
__name(requestPicture, "requestPicture");
async function logoutAll(c) {
  const u = need(c);
  await run(c.env, "DELETE FROM sessions WHERE user_id = ?1", u.id);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}
__name(logoutAll, "logoutAll");
async function removeUser(env, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM comments WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM messages WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM pictures WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM writings WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM community WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM writer_requests WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM quiz_results WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM animator_tokens WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM animator_photos WHERE user_id = ?1").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(id)
  ]);
}
__name(removeUser, "removeUser");
async function deleteAccount(c) {
  const u = need(c);
  if (u.role === "admin") throw new HttpError(400, "The admin account can't delete itself here.");
  await limit(c, "password", 10, 3600, "u" + u.id);
  await checkPassword(c, u.id, c.body.current);
  await removeUser(c.env, u.id);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}
__name(deleteAccount, "deleteAccount");
async function picture(c) {
  const id = Number(c.params[0]);
  const p = await one(c.env, "SELECT approved, pending FROM pictures WHERE user_id = ?1", id);
  const canSeePending = c.user && (c.user.role === "admin" || c.user.id === id) && c.url.searchParams.get("pending") === "1";
  const src = canSeePending ? p && p.pending : p && p.approved;
  if (!src) throw new HttpError(404, "No picture.");
  const [, mime, data] = src.match(/^data:([^;]+);base64,(.*)$/);
  const bin = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  return new Response(bin, { headers: { "Content-Type": mime, "Cache-Control": canSeePending ? "no-store" : "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
__name(picture, "picture");
var commentRow = /* @__PURE__ */ __name((r, me2) => ({
  id: r.id,
  body: r.body,
  created: r.created_at,
  status: r.status,
  mine: !!me2 && r.user_id === me2.id,
  user: publicUser({ id: r.user_id, username: r.username, avatar: r.avatar, role: r.role, picture_at: r.picture_at })
}), "commentRow");
var COMMENT_SELECT = `SELECT c.id, c.slug, c.body, c.created_at, c.status, c.user_id, u.username, u.avatar, u.role, p.updated_at AS picture_at
  FROM comments c JOIN users u ON u.id = c.user_id LEFT JOIN pictures p ON p.user_id = u.id`;
async function listComments(c) {
  const slug = c.url.searchParams.get("slug") || "";
  const me2 = c.user, admin = me2 && me2.role === "admin";
  const rows = await all(
    c.env,
    `${COMMENT_SELECT} WHERE c.slug = ?1 AND (c.status = 'approved' OR (c.status = 'pending' AND (c.user_id = ?2 OR ?3 = 1)))
     ORDER BY c.created_at`,
    slug,
    me2 ? me2.id : -1,
    admin ? 1 : 0
  );
  return json({ comments: rows.map((r) => commentRow(r, me2)) });
}
__name(listComments, "listComments");
async function postComment(c) {
  const u = need(c);
  const slug = String(c.body.slug || "");
  const art = await commentable(c, slug);
  if (!art) throw new HttpError(404, "That article doesn't exist.");
  const body = text(c.body.body, "Your comment", LIMITS.comment);
  await limit(c, "comment", 10, 3600, "u" + u.id);
  const hit = u.role === "admin" ? null : await flaggedWord(c.env, body);
  const status = hit ? "pending" : "approved";
  const row = await one(
    c.env,
    "INSERT INTO comments (slug, user_id, body, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id",
    slug,
    u.id,
    body,
    status,
    Date.now()
  );
  if (u.role !== "admin") {
    notify(c, hit ? `Comment held for review on \u201C${art.title}\u201D` : `New comment on \u201C${art.title}\u201D`, [
      `${u.username} commented on \u201C${art.title}\u201D${hit ? ` (held because it contains \u201C${hit}\u201D)` : ""}:`,
      "",
      excerpt(body),
      "",
      hit ? "It won't show until you approve it." : `It's live: ${c.url.origin}${art.path}#comments`
    ]);
  }
  const r = await one(c.env, `${COMMENT_SELECT} WHERE c.id = ?1`, row.id);
  return json({ comment: commentRow(r, u) });
}
__name(postComment, "postComment");
async function deleteComment(c) {
  const u = need(c);
  const r = await one(c.env, "SELECT user_id FROM comments WHERE id = ?1", Number(c.params[0]));
  if (!r) throw new HttpError(404, "That comment is already gone.");
  if (r.user_id !== u.id && u.role !== "admin") throw new HttpError(403, "That isn't your comment.");
  await run(c.env, "DELETE FROM comments WHERE id = ?1", Number(c.params[0]));
  return json({ ok: true });
}
__name(deleteComment, "deleteComment");
var messageRow = /* @__PURE__ */ __name((m) => ({ id: m.id, body: m.body, created: m.created_at, fromAdmin: !!m.from_admin, read: !!m.read_at }), "messageRow");
async function myMessages(c) {
  const u = need(c);
  if (u.role === "admin") return json({ admin: true, messages: [] });
  const rows = await all(c.env, "SELECT * FROM messages WHERE user_id = ?1 ORDER BY created_at", u.id);
  await run(c.env, "UPDATE messages SET read_at = ?1 WHERE user_id = ?2 AND from_admin = 1 AND read_at IS NULL", Date.now(), u.id);
  return json({ messages: rows.map(messageRow) });
}
__name(myMessages, "myMessages");
async function sendMessage(c) {
  const u = need(c);
  if (u.role === "admin") throw new HttpError(400, "Reply to people from /admin.");
  const body = text(c.body.body, "Your message", LIMITS.message);
  await limit(c, "message", 20, 86400, "u" + u.id);
  const row = await one(c.env, "INSERT INTO messages (user_id, from_admin, body, created_at) VALUES (?1, 0, ?2, ?3) RETURNING *", u.id, body, Date.now());
  notify(c, `Message from ${u.username}`, [`${u.username} sent you a message:`, "", excerpt(body, 1500)]);
  return json({ message: messageRow(row) });
}
__name(sendMessage, "sendMessage");
var ASK_ORIGINS = ["https://silverfishstone.com", "https://www.silverfishstone.com", "http://localhost:8080"];
async function askRequest(request, env, ctx, url) {
  const origin = request.headers.get("Origin");
  const allowed = !!origin && ASK_ORIGINS.includes(origin);
  const cors = allowed ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" } : { Vary: "Origin" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    if (request.method !== "POST") throw new HttpError(405, "Send a message from the Ask page.");
    if (origin && !allowed && origin !== url.origin) throw new HttpError(403, "Not allowed from another site.");
    if (!env.DB) throw new HttpError(503, "Messages aren't switched on yet.");
    await ensureSchema(env);
    const body = await request.json().catch(() => {
      throw new HttpError(400, "That request wasn't valid JSON.");
    });
    return await sendAsk({ request, env, ctx, url, body, user: null, cors });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra || {} }, e.status, cors);
    console.error(e && e.stack || e);
    return json({ error: "Something went wrong on the server. Try again in a moment." }, 500, cors);
  }
}
__name(askRequest, "askRequest");
async function sendAsk(c) {
  const b = c.body && typeof c.body === "object" ? c.body : {};
  if (typeof b.website === "string" && b.website) return json({ ok: true }, 200, c.cors);
  const body = text(b.body, "Your message", LIMITS.ask);
  await limit(c, "ask", 5, 3600);
  await limit(c, "ask-day", 15, 86400);
  await turnstile(c, b.turnstile);
  await run(c.env, "INSERT INTO asks (body, status, created_at) VALUES (?1, 'new', ?2)", body, Date.now());
  notify(c, "New anonymous message", ["Someone sent you an anonymous message:", "", excerpt(body, 1500)]);
  return json({ ok: true }, 200, c.cors);
}
__name(sendAsk, "sendAsk");
var ANIMATOR_ORIGINS = ASK_ORIGINS;
var ANIMATOR_TOKEN_DAYS = 90;
var ANIMATOR_PHOTO_BYTES = 13e5;
var ANIMATOR_MAX_PHOTOS = 40;
var ANIMATOR_MAX_BYTES = 40 * 1024 * 1024;
var ANIMATOR_TYPES = ["image/jpeg", "image/png", "image/webp"];
var animatorAllowed = /* @__PURE__ */ __name((env, u) => u.role === "admin" || String(env.ANIMATOR_USERS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).includes(u.username.toLowerCase()), "animatorAllowed");
var animatorQuota = /* @__PURE__ */ __name(async (env, userId) => {
  const r = await one(env, "SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM animator_photos WHERE user_id = ?1", userId);
  return { count: r.n, bytes: r.bytes, maxCount: ANIMATOR_MAX_PHOTOS, maxBytes: ANIMATOR_MAX_BYTES, maxPhoto: ANIMATOR_PHOTO_BYTES };
}, "animatorQuota");
async function animatorRequest(request, env, ctx, url) {
  const origin = request.headers.get("Origin");
  const allowed = !!origin && ANIMATOR_ORIGINS.includes(origin);
  const cors = allowed ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400", Vary: "Origin" } : { Vary: "Origin" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    if (origin && !allowed && origin !== url.origin) throw new HttpError(403, "Not allowed from another site.");
    if (!env.DB) throw new HttpError(503, "Accounts aren't switched on yet.");
    await ensureSchema(env);
    const path = url.pathname.slice("/api/animator".length), method = request.method;
    const c = { request, env, ctx, url, params: [], body: null, user: null, cors };
    if (method === "POST") c.body = await request.json().catch(() => {
      throw new HttpError(400, "That request wasn't valid JSON.");
    });
    if (method === "POST" && path === "/login") return await animatorLogin(c);
    c.user = await animatorUser(c);
    if (!c.user) throw new HttpError(401, "Sign in first.");
    let m;
    if (method === "GET" && path === "/me") return json({ user: { id: c.user.id, username: c.user.username }, ...await animatorQuota(env, c.user.id) }, 200, cors);
    if (method === "POST" && path === "/logout") {
      await run(env, "DELETE FROM animator_tokens WHERE token_hash = ?1", c.user.token_hash);
      return json({ ok: true }, 200, cors);
    }
    if (method === "GET" && path === "/photos") {
      const rows = await all(env, "SELECT id, name, size, created_at FROM animator_photos WHERE user_id = ?1 ORDER BY created_at DESC", c.user.id);
      return json({ items: rows.map((r) => ({ id: r.id, name: r.name, size: r.size, created: r.created_at })) }, 200, cors);
    }
    if (method === "POST" && path === "/photos") return await animatorAdd(c);
    if (m = path.match(/^\/photos\/([a-f0-9]{16})$/)) {
      if (method === "GET") {
        const p = await one(env, "SELECT type, data FROM animator_photos WHERE id = ?1 AND user_id = ?2", m[1], c.user.id);
        if (!p) throw new HttpError(404, "That photo isn't there any more.");
        return json({ type: p.type, data: p.data }, 200, { ...cors, "Cache-Control": "private, max-age=3600" });
      }
      if (method === "DELETE") {
        await run(env, "DELETE FROM animator_photos WHERE id = ?1 AND user_id = ?2", m[1], c.user.id);
        return json({ ok: true }, 200, cors);
      }
    }
    throw new HttpError(404, "No such address.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra || {} }, e.status, cors);
    console.error(e && e.stack || e);
    return json({ error: "Something went wrong on the server. Try again in a moment." }, 500, cors);
  }
}
__name(animatorRequest, "animatorRequest");
async function animatorUser(c) {
  const m = (c.request.headers.get("Authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{20,100})$/);
  if (!m) return null;
  const th = await sha256(m[1]);
  const u = await one(
    c.env,
    `SELECT u.id, u.username, u.role, u.banned, t.token_hash FROM animator_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ?1 AND t.expires_at > ?2`,
    th,
    Date.now()
  );
  if (!u || u.banned || !animatorAllowed(c.env, u)) return null;
  return u;
}
__name(animatorUser, "animatorUser");
async function animatorLogin(c) {
  const username = String(c.body.username || "").trim();
  await limit(c, "animator-login-ip", 30, 900);
  await limit(c, "animator-login-user", 10, 900, username.toLowerCase().slice(0, 40));
  const u = await one(c.env, "SELECT id, username, role, banned, pass_salt, pass_hash FROM users WHERE username = ?1", username);
  const given = prehash(c.body.password);
  const ok = sameHex(await hashSecret(u ? u.pass_salt : "none", given), u ? u.pass_hash : "x");
  if (!u || !ok) throw new HttpError(403, "That username and password don't match.");
  if (u.banned) throw new HttpError(403, "This account has been suspended.");
  if (!animatorAllowed(c.env, u)) throw new HttpError(403, "This account can't use the Animator's photo storage.");
  const token = b64url(crypto.getRandomValues(new Uint8Array(32))), now = Date.now();
  await run(c.env, "INSERT INTO animator_tokens (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)", await sha256(token), u.id, now, now + ANIMATOR_TOKEN_DAYS * DAY);
  if (Math.random() < 0.05) await run(c.env, "DELETE FROM animator_tokens WHERE expires_at < ?1", now);
  return json({ token, user: { id: u.id, username: u.username }, ...await animatorQuota(c.env, u.id) }, 200, c.cors);
}
__name(animatorLogin, "animatorLogin");
async function animatorAdd(c) {
  const b = c.body && typeof c.body === "object" ? c.body : {};
  const type = String(b.type || ""), data = typeof b.data === "string" ? b.data : "";
  if (!ANIMATOR_TYPES.includes(type)) throw new HttpError(400, "Only JPEG, PNG or WebP photos can be kept.");
  if (data.length < 24 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpError(400, "That photo wasn't sent properly.");
  const bytes = Math.floor(data.length * 3 / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes > ANIMATOR_PHOTO_BYTES) throw new HttpError(413, `That photo is too big (${(bytes / 1e6).toFixed(1)} MB; the limit is ${(ANIMATOR_PHOTO_BYTES / 1e6).toFixed(1)} MB).`);
  const head = [...atob(data.slice(0, 24))].map((ch) => ch.charCodeAt(0));
  const magic = type === "image/jpeg" ? [255, 216, 255] : type === "image/png" ? [137, 80, 78, 71] : [82, 73, 70, 70];
  if (!magic.every((v, i) => head[i] === v) || type === "image/webp" && String.fromCharCode(...head.slice(8, 12)) !== "WEBP") throw new HttpError(400, "That isn't a valid photo file.");
  await limit(c, "animator-up", 60, 3600, "u" + c.user.id);
  const q = await animatorQuota(c.env, c.user.id);
  if (q.count >= q.maxCount) throw new HttpError(409, `You already have ${q.maxCount} photos here. Delete some from the Animator's photo inbox first.`);
  if (q.bytes + bytes > q.maxBytes) throw new HttpError(409, "That would use more than the photo storage allows. Delete some photos first.");
  const id = randomHex(8);
  let name = String(b.name || "photo").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 100) || "photo";
  await run(c.env, "INSERT INTO animator_photos (id, user_id, name, type, size, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", id, c.user.id, name, type, bytes, data, Date.now());
  return json({ id }, 200, c.cors);
}
__name(animatorAdd, "animatorAdd");
var askRow = /* @__PURE__ */ __name((r) => ({ id: r.id, body: r.body, status: r.status, created: r.created_at }), "askRow");
async function adminAsks(c) {
  need(c, true);
  return json({ asks: (await all(c.env, "SELECT * FROM asks ORDER BY created_at DESC LIMIT 500")).map(askRow) });
}
__name(adminAsks, "adminAsks");
async function adminAsk(c) {
  need(c, true);
  const id = Number(c.params[0]), act = c.body && c.body.action;
  if (act === "delete") {
    await run(c.env, "DELETE FROM asks WHERE id = ?1", id);
    return json({ ok: true });
  }
  const status = { ignore: "ignored", posted: "posted", restore: "new" }[act];
  if (!status) throw new HttpError(400, "That isn't something I can do to a message.");
  await run(c.env, "UPDATE asks SET status = ?1 WHERE id = ?2", status, id);
  return json({ ok: true, status });
}
__name(adminAsk, "adminAsk");
var DICT = { term: 120, part: 60, text: 4e3, translations: 60, aliases: 30, groups: 60 };
var GROUP_FIELDS = ["religion", "tradition", "denomination", "location"];
var dictOpen = /* @__PURE__ */ __name((c) => c.env.DICTIONARY_PUBLIC === "true" || c.user && c.user.role === "admin", "dictOpen");
var oneLine = /* @__PURE__ */ __name((v, name, max) => text(typeof v === "string" ? v.replace(/\s+/g, " ") : "", name, max), "oneLine");
var optLine = /* @__PURE__ */ __name((v, name, max) => typeof v === "string" && v.trim() ? oneLine(v, name, max) : "", "optLine");
function cleanGroup(g) {
  g = g && typeof g === "object" ? g : {};
  const out = {};
  for (const f of GROUP_FIELDS) out[f] = optLine(g[f], f[0].toUpperCase() + f.slice(1), DICT.part);
  if (!out.religion && !out.tradition && !out.denomination && g.all !== true) throw new HttpError(400, "Say the tradition or denomination (or the religion, if it isn't Christian).");
  return out;
}
__name(cleanGroup, "cleanGroup");
var groupKey = /* @__PURE__ */ __name((g) => GROUP_FIELDS.map((f) => g[f].toLowerCase()).join("|"), "groupKey");
var groupName = /* @__PURE__ */ __name((g) => ([g.religion, g.tradition, g.denomination].filter(Boolean).join(" \u203A ") || "all Trinitarian Christians") + (g.location ? ` (${g.location})` : ""), "groupName");
function cleanGroupList(list) {
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, "Say who uses it: add at least one tradition or denomination.");
  if (list.length > DICT.groups) throw new HttpError(400, "That's too many groups for one meaning.");
  const seen = /* @__PURE__ */ new Set(), out = [];
  for (const g of list) {
    const x = cleanGroup(g), k = groupKey(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}
__name(cleanGroupList, "cleanGroupList");
async function dictAll(c) {
  if (!dictOpen(c)) throw new HttpError(c.user ? 403 : 401, "The dictionary isn't open yet.");
  const [sects, terms, entries, trs, aliases, eg] = await Promise.all([
    all(c.env, "SELECT id, religion, tradition, denomination, location FROM dict_sects ORDER BY religion, tradition, denomination, location"),
    all(c.env, "SELECT id, term FROM dict_terms ORDER BY term COLLATE NOCASE"),
    all(c.env, "SELECT id, term_id, definition FROM dict_entries ORDER BY id"),
    all(c.env, "SELECT entry_id, sect_id, body FROM dict_translations"),
    all(c.env, "SELECT term_id, alias FROM dict_aliases ORDER BY alias COLLATE NOCASE"),
    all(c.env, "SELECT entry_id, sect_id FROM dict_entry_groups ORDER BY entry_id, sect_id")
  ]);
  const byEntry = new Map(entries.map((e) => [e.id, { id: e.id, groups: [], definition: e.definition, tr: [] }]));
  for (const g of eg) {
    const e = byEntry.get(g.entry_id);
    if (e) e.groups.push(g.sect_id);
  }
  for (const t of trs) {
    const e = byEntry.get(t.entry_id);
    if (e) e.tr.push({ sect: t.sect_id, body: t.body });
  }
  const byTerm = new Map(terms.map((t) => [t.id, { id: t.id, term: t.term, aliases: [], entries: [] }]));
  for (const a of aliases) {
    const t = byTerm.get(a.term_id);
    if (t) t.aliases.push(a.alias);
  }
  for (const e of entries) {
    const t = byTerm.get(e.term_id);
    if (t) t.entries.push(byEntry.get(e.id));
  }
  return json({ public: c.env.DICTIONARY_PUBLIC === "true", sects, terms: [...byTerm.values()] });
}
__name(dictAll, "dictAll");
async function dictSect(env, g) {
  await run(env, "INSERT INTO dict_sects (religion, tradition, denomination, location, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING", g.religion, g.tradition, g.denomination, g.location, Date.now());
  return (await one(env, "SELECT id FROM dict_sects WHERE religion = ?1 AND tradition = ?2 AND denomination = ?3 AND location = ?4", g.religion, g.tradition, g.denomination, g.location)).id;
}
__name(dictSect, "dictSect");
async function dictAliasFree(env, name, termId) {
  const taken = await one(env, "SELECT t.term FROM dict_aliases a JOIN dict_terms t ON t.id = a.term_id WHERE a.alias = ?1 AND a.term_id != ?2", name, termId);
  if (taken) throw new HttpError(409, `\u201C${name}\u201D is already a synonym of \u201C${taken.term}\u201D.`);
}
__name(dictAliasFree, "dictAliasFree");
async function dictTerm(env, term) {
  const now = Date.now();
  await run(env, "INSERT INTO dict_terms (term, created_at, updated_at) VALUES (?1, ?2, ?2) ON CONFLICT (term) DO NOTHING", term, now);
  return (await one(env, "SELECT id FROM dict_terms WHERE term = ?1", term)).id;
}
__name(dictTerm, "dictTerm");
async function adminDictAdd(c) {
  need(c, true);
  const b = c.body || {};
  const term = oneLine(b.term, "The term", DICT.term), groups = cleanGroupList(b.groups);
  const definition = typeof b.definition === "string" ? text(b.definition, "The explanation", DICT.text, 0) : "";
  const sectIds = [];
  for (const g of groups) sectIds.push(await dictSect(c.env, g));
  const viaAlias = await one(c.env, "SELECT term_id FROM dict_aliases WHERE alias = ?1", term);
  const termId = viaAlias ? viaAlias.term_id : await dictTerm(c.env, term);
  const marks = sectIds.map((_, i) => `?${i + 2}`).join(",");
  const have = await one(c.env, `SELECT entry_id FROM dict_entry_groups WHERE term_id = ?1 AND sect_id IN (${marks}) ORDER BY entry_id LIMIT 1`, termId, ...sectIds);
  if (have) return json({ id: have.entry_id, existed: true });
  const row = await one(c.env, "INSERT INTO dict_entries (term_id, definition, created_at, updated_at) VALUES (?1, ?2, ?3, ?3) RETURNING id", termId, definition, Date.now());
  await c.env.DB.batch(sectIds.map((sid) => c.env.DB.prepare("INSERT INTO dict_entry_groups (entry_id, term_id, sect_id) VALUES (?1, ?2, ?3)").bind(row.id, termId, sid)));
  return json({ id: row.id, existed: false });
}
__name(adminDictAdd, "adminDictAdd");
async function adminDictSave(c) {
  need(c, true);
  const id = Number(c.params[0]), b = c.body || {};
  const entry = await one(c.env, "SELECT e.id, e.term_id, t.term FROM dict_entries e JOIN dict_terms t ON t.id = e.term_id WHERE e.id = ?1", id);
  if (!entry) throw new HttpError(404, "That entry doesn't exist any more.");
  const term = oneLine(b.term, "The term", DICT.term);
  const groups = cleanGroupList(b.groups);
  const definition = typeof b.definition === "string" ? text(b.definition, "The explanation", DICT.text, 0) : "";
  const list = Array.isArray(b.translations) ? b.translations : [];
  if (list.length > DICT.translations) throw new HttpError(400, "That's too many explanations for one entry.");
  const seen = /* @__PURE__ */ new Set(), rows = [];
  for (const t of list) {
    const group = cleanGroup(t && t.group);
    const name = [group.religion, group.tradition, group.denomination].filter(Boolean).join(" ");
    const body = text(t && t.body, `The explanation for ${name}`, DICT.text);
    if (seen.has(groupKey(group))) throw new HttpError(400, `There are two explanations for ${name}. Keep one.`);
    seen.add(groupKey(group));
    rows.push([group, body]);
  }
  if (term.toLowerCase() !== entry.term.toLowerCase()) {
    const clash = await one(c.env, "SELECT id FROM dict_terms WHERE term = ?1 AND id != ?2", term, entry.term_id);
    if (clash) throw new HttpError(409, `\u201C${term}\u201D is already a term of its own. Open it from the list to add this group there.`);
    await dictAliasFree(c.env, term, entry.term_id);
  }
  const aliasList = Array.isArray(b.aliases) ? b.aliases : [];
  if (aliasList.length > DICT.aliases) throw new HttpError(400, "That's too many synonyms for one term.");
  const seenAlias = /* @__PURE__ */ new Set([term.toLowerCase()]), aliases = [];
  for (const a of aliasList) {
    const v = optLine(a, "A synonym", DICT.term);
    if (!v || seenAlias.has(v.toLowerCase())) continue;
    seenAlias.add(v.toLowerCase());
    const other = await one(c.env, "SELECT id FROM dict_terms WHERE term = ?1 AND id != ?2", v, entry.term_id);
    if (other) throw new HttpError(409, `\u201C${v}\u201D is already a term of its own, so it can't be a synonym here.`);
    await dictAliasFree(c.env, v, entry.term_id);
    aliases.push(v);
  }
  const sectIds = [];
  for (const [group] of rows) sectIds.push(await dictSect(c.env, group));
  const groupIds = [];
  for (const g of groups) {
    const sid = await dictSect(c.env, g);
    const other = await one(c.env, "SELECT entry_id FROM dict_entry_groups WHERE term_id = ?1 AND sect_id = ?2 AND entry_id != ?3", entry.term_id, sid, id);
    if (other) throw new HttpError(409, `${groupName(g)} already has its own meaning of this term. Open that meaning, or take it out of this list.`);
    groupIds.push(sid);
  }
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE dict_terms SET term = ?1, updated_at = ?2 WHERE id = ?3").bind(term, now, entry.term_id),
    c.env.DB.prepare("UPDATE dict_entries SET definition = ?1, updated_at = ?2 WHERE id = ?3").bind(definition, now, id),
    c.env.DB.prepare("DELETE FROM dict_aliases WHERE term_id = ?1").bind(entry.term_id),
    ...aliases.map((v) => c.env.DB.prepare("INSERT INTO dict_aliases (term_id, alias) VALUES (?1, ?2)").bind(entry.term_id, v)),
    c.env.DB.prepare("DELETE FROM dict_entry_groups WHERE entry_id = ?1").bind(id),
    ...groupIds.map((sid) => c.env.DB.prepare("INSERT INTO dict_entry_groups (entry_id, term_id, sect_id) VALUES (?1, ?2, ?3)").bind(id, entry.term_id, sid)),
    c.env.DB.prepare("DELETE FROM dict_translations WHERE entry_id = ?1").bind(id),
    ...rows.map(([, body], i) => c.env.DB.prepare("INSERT INTO dict_translations (entry_id, sect_id, body) VALUES (?1, ?2, ?3)").bind(id, sectIds[i], body))
  ]);
  return json({ ok: true });
}
__name(adminDictSave, "adminDictSave");
async function adminDictDelete(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const entry = await one(c.env, "SELECT term_id FROM dict_entries WHERE id = ?1", id);
  if (!entry) return json({ ok: true });
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM dict_translations WHERE entry_id = ?1").bind(id),
    c.env.DB.prepare("DELETE FROM dict_entry_groups WHERE entry_id = ?1").bind(id),
    c.env.DB.prepare("DELETE FROM dict_entries WHERE id = ?1").bind(id),
    c.env.DB.prepare("DELETE FROM dict_aliases WHERE term_id = ?1 AND NOT EXISTS (SELECT 1 FROM dict_entries WHERE term_id = ?1)").bind(entry.term_id),
    c.env.DB.prepare("DELETE FROM dict_terms WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM dict_entries WHERE term_id = ?1)").bind(entry.term_id)
  ]);
  return json({ ok: true });
}
__name(adminDictDelete, "adminDictDelete");
async function adminDictSect(c) {
  need(c, true);
  const id = Number(c.params[0]), b = c.body || {};
  const sect = await one(c.env, "SELECT id FROM dict_sects WHERE id = ?1", id);
  if (!sect) throw new HttpError(404, "That group doesn't exist any more.");
  if (b.action === "delete") {
    const used = await one(c.env, "SELECT (SELECT COUNT(*) FROM dict_entry_groups WHERE sect_id = ?1) + (SELECT COUNT(*) FROM dict_translations WHERE sect_id = ?1) AS n", id);
    if (used.n) throw new HttpError(409, "That group is still used by a meaning or an explanation.");
    await run(c.env, "DELETE FROM dict_sects WHERE id = ?1", id);
    return json({ ok: true });
  }
  const g = cleanGroup(b.group);
  const clash = await one(c.env, "SELECT id FROM dict_sects WHERE religion = ?1 AND tradition = ?2 AND denomination = ?3 AND location = ?4 AND id != ?5", g.religion, g.tradition, g.denomination, g.location, id);
  if (clash) throw new HttpError(409, "There is already a group with exactly those details.");
  await run(c.env, "UPDATE dict_sects SET religion = ?1, tradition = ?2, denomination = ?3, location = ?4 WHERE id = ?5", g.religion, g.tradition, g.denomination, g.location, id);
  return json({ ok: true });
}
__name(adminDictSect, "adminDictSect");
async function adminOverview(c) {
  need(c, true);
  const arts = await articles(c);
  const comments = await all(c.env, `${COMMENT_SELECT} WHERE c.status = 'pending' ORDER BY c.created_at LIMIT 200`);
  const pictures = await all(
    c.env,
    "SELECT p.user_id, p.updated_at, u.username FROM pictures p JOIN users u ON u.id = p.user_id WHERE p.pending IS NOT NULL ORDER BY p.updated_at LIMIT 100"
  );
  const threads = await all(
    c.env,
    `SELECT u.id, u.username, u.avatar, u.role, pic.updated_at AS picture_at, MAX(m.created_at) AS last,
       SUM(CASE WHEN m.from_admin = 0 AND m.read_at IS NULL THEN 1 ELSE 0 END) AS unread,
       (SELECT body FROM messages WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) AS preview
     FROM messages m JOIN users u ON u.id = m.user_id LEFT JOIN pictures pic ON pic.user_id = u.id
     GROUP BY u.id ORDER BY last DESC LIMIT 200`
  );
  const emailRow = await one(c.env, "SELECT value FROM meta WHERE key = 'email_status'");
  let email = null;
  try {
    email = emailRow ? JSON.parse(emailRow.value) : null;
  } catch {
  }
  return json({
    email: { setUp: !!(c.env.EMAIL && c.env.ALERT_TO), last: email },
    comments: await Promise.all(comments.map(async (r) => {
      const where = r.slug.startsWith("c:") ? await commentable(c, r.slug) : null;
      return { ...commentRow(r, null), article: where ? { path: where.path, title: where.title } : { path: `/article/${r.slug}`, title: (arts.get(r.slug) || {}).title || r.slug } };
    })),
    writerRequests: (await all(
      c.env,
      `SELECT r.note, r.created_at, u.id, u.username, u.avatar, u.role, p.updated_at AS picture_at
       FROM writer_requests r JOIN users u ON u.id = r.user_id LEFT JOIN pictures p ON p.user_id = u.id ORDER BY r.created_at`
    )).map((r) => ({ user: publicUser(r), note: r.note, created: r.created_at })),
    submissions: (await all(
      c.env,
      `SELECT w.id, w.title, w.submitted_at, u.id AS uid, u.username, u.avatar, u.role, p.updated_at AS picture_at, cm.slug AS live
       FROM writings w JOIN users u ON u.id = w.user_id LEFT JOIN pictures p ON p.user_id = u.id LEFT JOIN community cm ON cm.writing_id = w.id
       WHERE w.state = 'submitted' ORDER BY w.submitted_at`
    )).map((r) => ({
      id: r.id,
      title: r.title || "Untitled",
      submitted: r.submitted_at,
      update: !!r.live,
      user: publicUser({ id: r.uid, username: r.username, avatar: r.avatar, role: r.role, picture_at: r.picture_at })
    })),
    pictures: pictures.map((p) => ({ user: { id: p.user_id, username: p.username }, url: `/api/picture/${p.user_id}?pending=1&v=${p.updated_at}` })),
    threads: threads.map((t) => ({ user: publicUser(t), last: t.last, unread: t.unread, preview: excerpt(t.preview || "", 140) }))
  });
}
__name(adminOverview, "adminOverview");
async function adminTestEmail(c) {
  need(c, true);
  await limit(c, "test-email", 5, 3600, "admin");
  try {
    const how = await sendAlert(c.env, c.url.origin, "Test alert from According To Knowledge", ["This is a test. If you can read it, email alerts work."]);
    const status = { ok: true, at: Date.now(), how, subject: "Test alert" };
    await recordEmail(c.env, status);
    return json({ ok: true, status });
  } catch (e) {
    const status = { ok: false, at: Date.now(), error: String(e.message || e), subject: "Test alert" };
    await recordEmail(c.env, status);
    return json({ ok: false, status });
  }
}
__name(adminTestEmail, "adminTestEmail");
async function adminComment(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const action = c.body.action;
  if (action === "approve") await run(c.env, "UPDATE comments SET status = 'approved' WHERE id = ?1", id);
  else if (action === "reject") await run(c.env, "DELETE FROM comments WHERE id = ?1", id);
  else throw new HttpError(400, "Approve or reject.");
  return json({ ok: true });
}
__name(adminComment, "adminComment");
async function adminPicture(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const action = c.body.action;
  if (action === "approve") {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE pictures SET approved = pending, pending = NULL, updated_at = ?1 WHERE user_id = ?2 AND pending IS NOT NULL").bind(Date.now(), id),
      c.env.DB.prepare("UPDATE users SET avatar = 'custom' WHERE id = ?1").bind(id)
    ]);
  } else if (action === "reject") await run(c.env, "UPDATE pictures SET pending = NULL WHERE user_id = ?1", id);
  else throw new HttpError(400, "Approve or reject.");
  return json({ ok: true });
}
__name(adminPicture, "adminPicture");
async function adminThread(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const u = await currentUserById(c.env, id);
  if (!u) throw new HttpError(404, "No such account.");
  const rows = await all(c.env, "SELECT * FROM messages WHERE user_id = ?1 ORDER BY created_at", id);
  await run(c.env, "UPDATE messages SET read_at = ?1 WHERE user_id = ?2 AND from_admin = 0 AND read_at IS NULL", Date.now(), id);
  return json({ user: publicUser(u), messages: rows.map(messageRow) });
}
__name(adminThread, "adminThread");
async function adminReply(c) {
  need(c, true);
  const id = Number(c.params[0]);
  if (!await one(c.env, "SELECT id FROM users WHERE id = ?1", id)) throw new HttpError(404, "No such account.");
  const body = text(c.body.body, "Your reply", LIMITS.message);
  const row = await one(c.env, "INSERT INTO messages (user_id, from_admin, body, created_at) VALUES (?1, 1, ?2, ?3) RETURNING *", id, body, Date.now());
  return json({ message: messageRow(row) });
}
__name(adminReply, "adminReply");
async function adminWords(c) {
  need(c, true);
  return json({ words: await flaggedList(c.env) });
}
__name(adminWords, "adminWords");
async function adminSaveWords(c) {
  need(c, true);
  const list = (Array.isArray(c.body.words) ? c.body.words : String(c.body.words || "").split("\n")).map((w) => String(w).trim()).filter(Boolean).slice(0, 1e3).map((w) => w.slice(0, 80));
  const unique = [...new Map(list.map((w) => [fold(w), w])).values()];
  await run(c.env, "INSERT INTO meta (key, value) VALUES ('flagged_words', ?1) ON CONFLICT (key) DO UPDATE SET value = ?1", JSON.stringify(unique));
  return json({ words: unique });
}
__name(adminSaveWords, "adminSaveWords");
async function adminUsers(c) {
  need(c, true);
  const q = (c.url.searchParams.get("q") || "").trim().replace(/[%_\\]/g, (m) => "\\" + m);
  const rows = await all(
    c.env,
    `SELECT u.id, u.username, u.avatar, u.role, u.banned, u.created_at, p.updated_at AS picture_at,
       (SELECT COUNT(*) FROM comments WHERE user_id = u.id) AS comments
     FROM users u LEFT JOIN pictures p ON p.user_id = u.id
     WHERE u.username LIKE ?1 ESCAPE '\\' ORDER BY u.created_at DESC LIMIT 100`,
    `%${q}%`
  );
  return json({ users: rows.map((r) => ({ ...publicUser(r), banned: !!r.banned, created: r.created_at, comments: r.comments })) });
}
__name(adminUsers, "adminUsers");
async function adminUser(c) {
  const me2 = need(c, true);
  const id = Number(c.params[0]);
  const u = await one(c.env, "SELECT id, role FROM users WHERE id = ?1", id);
  if (!u) throw new HttpError(404, "No such account.");
  if (u.id === me2.id || u.role === "admin") throw new HttpError(400, "Not on the admin account.");
  switch (c.body.action) {
    case "recovery":
      return json({ recoveryCode: await setRecovery(c.env, id) });
    case "ban":
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE users SET banned = 1 WHERE id = ?1").bind(id),
        c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(id),
        c.env.DB.prepare("DELETE FROM comments WHERE user_id = ?1 AND status = 'pending'").bind(id)
      ]);
      return json({ ok: true });
    case "unban":
      await run(c.env, "UPDATE users SET banned = 0 WHERE id = ?1", id);
      return json({ ok: true });
    case "picture":
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE pictures SET approved = NULL WHERE user_id = ?1").bind(id),
        c.env.DB.prepare("UPDATE users SET avatar = 'default' WHERE id = ?1 AND avatar = 'custom'").bind(id)
      ]);
      return json({ ok: true });
    case "delete":
      await removeUser(c.env, id);
      return json({ ok: true });
    case "writer":
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE users SET role = 'writer' WHERE id = ?1").bind(id),
        c.env.DB.prepare("DELETE FROM writer_requests WHERE user_id = ?1").bind(id)
      ]);
      return json({ ok: true });
    case "unwriter":
      await run(c.env, "UPDATE users SET role = 'user' WHERE id = ?1 AND role = 'writer'", id);
      return json({ ok: true });
  }
  throw new HttpError(400, "Unknown action.");
}
__name(adminUser, "adminUser");
var W = { title: 150, subtitle: 200, summary: 400, category: 40, categories: 5, html: 8e5, delta: 95e4, perUser: 100 };
var slugify = /* @__PURE__ */ __name((t) => String(t).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, ""), "slugify");
var parseJSON = /* @__PURE__ */ __name((s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}, "parseJSON");
var canWrite = /* @__PURE__ */ __name((u) => !!u && (u.role === "writer" || u.role === "admin"), "canWrite");
function needWriter(c) {
  const u = need(c);
  if (!canWrite(u)) throw new HttpError(403, "Only approved writers can do that.");
  return u;
}
__name(needWriter, "needWriter");
async function ownWriting(c, id) {
  const w = await one(c.env, "SELECT * FROM writings WHERE id = ?1", Number(id));
  if (!w || w.user_id !== c.user.id && c.user.role !== "admin") throw new HttpError(404, "That piece doesn't exist.");
  return w;
}
__name(ownWriting, "ownWriting");
var adminMessage = /* @__PURE__ */ __name((env, userId, body) => run(env, "INSERT INTO messages (user_id, from_admin, body, created_at) VALUES (?1, 1, ?2, ?3)", userId, body, Date.now()), "adminMessage");
function writingOut(w, live) {
  return {
    id: w.id,
    kind: w.kind,
    slug: w.slug,
    title: w.title,
    subtitle: w.subtitle,
    summary: w.summary,
    categories: parseJSON(w.categories, []),
    html: w.html,
    delta: parseJSON(w.delta, { ops: [] }),
    words: w.words,
    pinned: !!w.pinned,
    state: w.state,
    note: w.note,
    created: w.created_at,
    updated: w.updated_at,
    submitted: w.submitted_at,
    base: w.base || null,
    thumbnail: w.thumbnail || "",
    card: w.card || "",
    published: w.kind === "official" ? !!w.slug : !!live,
    live: live ? { slug: live.slug, published: live.published_at, updated: live.updated_at } : null
  };
}
__name(writingOut, "writingOut");
function writingFields(b) {
  const str = /* @__PURE__ */ __name((v, max, name) => {
    const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
    if (s.length > max) throw new HttpError(400, `${name} is too long (${s.length} of ${max} characters).`);
    return s;
  }, "str");
  const cats = [];
  for (const x of Array.isArray(b.categories) ? b.categories : []) {
    const name = String(x).replace(/\s+/g, " ").trim().slice(0, W.category);
    if (name && !cats.some((c) => c.toLowerCase() === name.toLowerCase())) cats.push(name);
  }
  cats.splice(W.categories);
  const html = typeof b.html === "string" ? b.html : "";
  if (html.length > W.html) throw new HttpError(400, "That's too long to save here (the limit is roughly 50,000 words, less with interactives).");
  const delta = b.delta && typeof b.delta === "object" ? JSON.stringify(b.delta) : '{"ops":[]}';
  if (delta.length > W.delta) throw new HttpError(400, "That's too long to save here (the limit is roughly 50,000 words, less with interactives).");
  let thumbnail = typeof b.thumbnail === "string" ? b.thumbnail : "";
  if (thumbnail && !THUMB_PATH.test(thumbnail) && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(thumbnail)) thumbnail = "";
  if (thumbnail.length > 7e5) throw new HttpError(400, "That thumbnail is too big. Try a smaller picture.");
  return {
    thumbnail,
    card: b.card === "banner" || b.card === "thumbnail" ? b.card : "",
    title: str(b.title, W.title, "The title"),
    subtitle: str(b.subtitle, W.subtitle, "The subtitle"),
    summary: str(b.summary, W.summary, "The summary"),
    categories: JSON.stringify(cats),
    html,
    delta,
    words: Math.max(0, Math.min(1e6, Math.floor(Number(b.words) || 0))),
    pinned: b.pinned ? 1 : 0
  };
}
__name(writingFields, "writingFields");
async function myWriting(c) {
  const u = needWriter(c);
  const rows = await all(
    c.env,
    `SELECT w.id, w.kind, w.slug, w.title, w.state, w.note, w.updated_at, w.submitted_at, cm.slug AS live
     FROM writings w LEFT JOIN community cm ON cm.writing_id = w.id WHERE w.user_id = ?1 ORDER BY w.updated_at DESC`,
    u.id
  );
  return json({ writings: rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    state: r.state,
    note: r.note,
    updated: r.updated_at,
    published: r.kind === "official" ? !!r.slug : !!r.live,
    slug: r.kind === "official" ? r.slug : r.live
  })) });
}
__name(myWriting, "myWriting");
async function newWriting(c) {
  const u = needWriter(c);
  const n = await one(c.env, "SELECT COUNT(*) AS n FROM writings WHERE user_id = ?1", u.id);
  if (n.n >= W.perUser) throw new HttpError(400, `You have ${n.n} pieces already. Delete some old drafts first.`);
  await limit(c, "new-writing", 30, 3600, "u" + u.id);
  const now = Date.now();
  const row = await one(
    c.env,
    "INSERT INTO writings (user_id, kind, created_at, updated_at) VALUES (?1, ?2, ?3, ?3) RETURNING id",
    u.id,
    u.role === "admin" ? "official" : "community",
    now
  );
  return json({ id: row.id });
}
__name(newWriting, "newWriting");
async function importOfficial(c) {
  const u = need(c, true);
  const slug = String(c.body.slug || "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new HttpError(400, "That isn't an article address.");
  const have = await one(c.env, "SELECT id FROM writings WHERE kind = 'official' AND slug = ?1 ORDER BY updated_at DESC LIMIT 1", slug);
  if (have) return json({ id: have.id });
  let doc = null, pinned = false;
  if (c.env.GITHUB_TOKEN && c.env.GITHUB_REPO) {
    const f = await ghGet(c.env, `articles/${slug}.json`);
    doc = f && parseJSON(f.text, null);
    const idx = await ghGet(c.env, "articles/index.json");
    pinned = !!(parseJSON(idx ? idx.text : "[]", []).find((a) => a.slug === slug) || {}).pinned;
  } else {
    const res = await c.env.ASSETS.fetch(new Request(new URL(`/articles/${slug}.json`, c.url)));
    doc = res.ok ? await res.json() : null;
    pinned = !!((await articles(c)).get(slug) || {}).pinned;
  }
  if (!doc) throw new HttpError(404, "That article's file is missing from the site.");
  const now = Date.now();
  const row = await one(
    c.env,
    `INSERT INTO writings (user_id, kind, slug, title, subtitle, summary, categories, html, delta, words, pinned, source, created_at, updated_at, base, thumbnail, card)
     VALUES (?1, 'official', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?13, ?14, ?15) RETURNING id`,
    u.id,
    slug,
    doc.title || "",
    doc.subtitle || "",
    doc.summary || "",
    JSON.stringify(Array.isArray(doc.categories) ? doc.categories : []),
    String(doc.html || ""),
    JSON.stringify(doc.delta && doc.delta.ops ? doc.delta : { ops: [] }),
    Number(doc.words) || 0,
    pinned ? 1 : 0,
    doc.source || null,
    now,
    doc.updated || doc.published || null,
    THUMB_PATH.test(doc.thumbnail || "") ? doc.thumbnail : "",
    doc.card || ""
  );
  return json({ id: row.id });
}
__name(importOfficial, "importOfficial");
async function getWriting(c) {
  need(c);
  const w = await ownWriting(c, c.params[0]);
  const live = w.kind === "community" ? await one(c.env, "SELECT slug, published_at, updated_at FROM community WHERE writing_id = ?1", w.id) : null;
  const out = writingOut(w, live);
  if (w.kind === "official" && w.slug) out.site = await siteVersion(c.env, w.slug).catch(() => null);
  return json({ writing: out });
}
__name(getWriting, "getWriting");
async function saveWriting(c) {
  const u = need(c);
  const w = await ownWriting(c, c.params[0]);
  if (w.state === "submitted" && u.role !== "admin") throw new HttpError(409, "It's waiting for review. Withdraw it to make changes.");
  await limit(c, "save", 240, 3600, "u" + u.id);
  const f = writingFields(c.body);
  const now = Date.now();
  await run(
    c.env,
    `UPDATE writings SET title = ?1, subtitle = ?2, summary = ?3, categories = ?4, html = ?5, delta = ?6, words = ?7, pinned = ?8, updated_at = ?9,
       thumbnail = ?11, card = ?12
     WHERE id = ?10`,
    f.title,
    f.subtitle,
    f.summary,
    f.categories,
    f.html,
    f.delta,
    f.words,
    w.kind === "official" ? f.pinned : 0,
    now,
    w.id,
    w.kind === "official" ? f.thumbnail : null,
    w.kind === "official" ? f.card : null
  );
  return json({ updated: now });
}
__name(saveWriting, "saveWriting");
async function writingAction(c) {
  const u = need(c);
  const w = await ownWriting(c, c.params[0]);
  const action = c.params[1];
  const mine = w.user_id === u.id;
  switch (action) {
    case "submit": {
      if (w.kind !== "community" || !mine) throw new HttpError(400, "Only community articles are sent for review.");
      if (!canWrite(u)) throw new HttpError(403, "Only approved writers can do that.");
      if (!w.title.trim()) throw new HttpError(400, "Give it a title first.");
      if (!w.words) throw new HttpError(400, "There's nothing written yet.");
      await limit(c, "submit", 10, 86400, "u" + u.id);
      await run(c.env, "UPDATE writings SET state = 'submitted', submitted_at = ?1, note = NULL WHERE id = ?2", Date.now(), w.id);
      const live = await one(c.env, "SELECT slug FROM community WHERE writing_id = ?1", w.id);
      notify(c, `${live ? "Changes" : "Article"} to review: \u201C${w.title}\u201D`, [
        `${u.username} sent ${live ? "changes to their published article" : "an article"} for review: \u201C${w.title}\u201D (${w.words} words).`
      ]);
      return json({ ok: true });
    }
    case "withdraw":
      await run(c.env, "UPDATE writings SET state = 'draft' WHERE id = ?1", w.id);
      return json({ ok: true });
    case "delete": {
      const live = await one(c.env, "SELECT slug, title FROM community WHERE writing_id = ?1", w.id);
      await removeCommunity(c, w, live);
      return json({ ok: true });
    }
    case "unpublish":
      if (w.kind === "community") {
        await run(c.env, "DELETE FROM community WHERE writing_id = ?1", w.id);
        return json({ ok: true });
      }
      need(c, true);
      if (!w.slug) throw new HttpError(400, "It isn't on the site.");
      await unpublishOfficial(c, w);
      return json({ ok: true });
    case "publish":
      need(c, true);
      if (w.kind !== "official") throw new HttpError(400, "Community articles are published by approving them.");
      return json(await publishOfficial(c, w));
    case "keep": {
      need(c, true);
      const v = String(c.body.version || "");
      if (!v || isNaN(Date.parse(v))) throw new HttpError(400, "That isn't a version.");
      await run(c.env, "UPDATE writings SET base = ?1 WHERE id = ?2", v, w.id);
      return json({ ok: true });
    }
    case "reload": {
      need(c, true);
      if (w.kind !== "official" || !w.slug) throw new HttpError(400, "It isn't on the site.");
      const doc = await publishedDoc(c, w.slug);
      if (!doc) throw new HttpError(404, "That article's file is missing from the site.");
      const now = Date.now();
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO writings (user_id, kind, title, subtitle, summary, categories, html, delta, words, created_at, updated_at)
          SELECT user_id, 'official', title || ' (my earlier draft)', subtitle, summary, categories, html, delta, words, ?1, ?1 FROM writings WHERE id = ?2`).bind(now, w.id),
        c.env.DB.prepare(`UPDATE writings SET title = ?1, subtitle = ?2, summary = ?3, categories = ?4, html = ?5, delta = ?6, words = ?7, source = ?8, base = ?9, updated_at = ?10,
          thumbnail = ?12, card = ?13 WHERE id = ?11`).bind(
          doc.title || "",
          doc.subtitle || "",
          doc.summary || "",
          JSON.stringify(Array.isArray(doc.categories) ? doc.categories : []),
          String(doc.html || ""),
          JSON.stringify(doc.delta && doc.delta.ops ? doc.delta : { ops: [] }),
          Number(doc.words) || 0,
          doc.source || null,
          doc.updated || doc.published || null,
          now,
          w.id,
          THUMB_PATH.test(doc.thumbnail || "") ? doc.thumbnail : "",
          doc.card || ""
        )
      ]);
      return json({ ok: true });
    }
  }
  throw new HttpError(400, "Unknown action.");
}
__name(writingAction, "writingAction");
async function requestToWrite(c) {
  const u = need(c);
  if (canWrite(u)) throw new HttpError(400, "You can already write.");
  const note = text(c.body.note, "Your note", 1e3, 10);
  await limit(c, "writer-request", 3, 86400, "u" + u.id);
  await run(
    c.env,
    "INSERT INTO writer_requests (user_id, note, created_at) VALUES (?1, ?2, ?3) ON CONFLICT (user_id) DO UPDATE SET note = ?2, created_at = ?3",
    u.id,
    note,
    Date.now()
  );
  notify(c, `${u.username} asked to write`, [`${u.username} asked to write for the site:`, "", excerpt(note, 1e3)]);
  return json({ ok: true });
}
__name(requestToWrite, "requestToWrite");
async function removeCommunity(c, w, live) {
  await c.env.DB.batch([
    ...live ? [c.env.DB.prepare("DELETE FROM comments WHERE slug = ?1").bind(`c:${live.slug}`)] : [],
    c.env.DB.prepare("DELETE FROM community WHERE writing_id = ?1").bind(w.id),
    c.env.DB.prepare("DELETE FROM writings WHERE id = ?1").bind(w.id)
  ]);
  if (w.user_id !== c.user.id && w.kind === "community") {
    await adminMessage(c.env, w.user_id, `I've deleted your article \u201C${live && live.title || w.title || "Untitled"}\u201D from the site.`);
  }
}
__name(removeCommunity, "removeCommunity");
async function deleteCommunityArticle(c) {
  const u = need(c);
  const live = await one(c.env, "SELECT slug, title, writing_id, user_id FROM community WHERE slug = ?1", c.params[0]);
  if (!live) throw new HttpError(404, "That article is already gone.");
  if (live.user_id !== u.id && u.role !== "admin") throw new HttpError(403, "Only its writer can delete it.");
  const w = await one(c.env, "SELECT id, user_id, kind, title FROM writings WHERE id = ?1", live.writing_id) || { id: live.writing_id, user_id: live.user_id, kind: "community", title: live.title };
  await removeCommunity(c, w, live);
  return json({ ok: true });
}
__name(deleteCommunityArticle, "deleteCommunityArticle");
async function deleteOfficialArticle(c) {
  need(c, true);
  const slug = c.params[0];
  ghReady(c.env);
  const title = ((await articles(c)).get(slug) || {}).title || slug;
  await removeFromRepo(c.env, slug, title);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM writings WHERE kind = 'official' AND slug = ?1").bind(slug),
    c.env.DB.prepare("DELETE FROM comments WHERE slug = ?1").bind(slug)
  ]);
  articleCache = null;
  return json({ ok: true });
}
__name(deleteOfficialArticle, "deleteOfficialArticle");
var COMMUNITY_SELECT = `SELECT cm.slug, cm.title, cm.subtitle, cm.summary, cm.categories, cm.words, cm.published_at, cm.updated_at,
  u.id, u.username, u.avatar, u.role, p.updated_at AS picture_at
  FROM community cm JOIN users u ON u.id = cm.user_id LEFT JOIN pictures p ON p.user_id = u.id`;
var communityOut = /* @__PURE__ */ __name((r) => ({
  slug: r.slug,
  title: r.title,
  subtitle: r.subtitle,
  summary: r.summary,
  categories: parseJSON(r.categories, []),
  words: r.words,
  published: r.published_at,
  updated: r.updated_at,
  author: publicUser(r)
}), "communityOut");
async function communityList(c) {
  const n = Math.min(200, Math.max(1, Number(c.url.searchParams.get("limit")) || 100));
  const rows = await all(c.env, `${COMMUNITY_SELECT} WHERE u.banned = 0 ORDER BY cm.published_at DESC LIMIT ?1`, n);
  return json({ articles: rows.map(communityOut) });
}
__name(communityList, "communityList");
async function communityArticle(c) {
  const r = await one(c.env, `${COMMUNITY_SELECT.replace("SELECT cm.slug,", "SELECT cm.html, cm.slug,")} WHERE cm.slug = ?1 AND u.banned = 0`, c.params[0]);
  if (!r) throw new HttpError(404, "That article doesn't exist.");
  return json({ article: { ...communityOut(r), html: r.html } });
}
__name(communityArticle, "communityArticle");
async function person(c) {
  const u = await one(
    c.env,
    "SELECT u.id, u.username, u.avatar, u.role, u.banned, u.created_at, p.updated_at AS picture_at FROM users u LEFT JOIN pictures p ON p.user_id = u.id WHERE u.username = ?1",
    c.params[0]
  );
  if (!u || u.banned) throw new HttpError(404, "There's no one here by that name.");
  const rows = await all(c.env, `${COMMUNITY_SELECT} WHERE cm.user_id = ?1 ORDER BY cm.published_at DESC`, u.id);
  const comments = await one(c.env, "SELECT COUNT(*) AS n FROM comments WHERE user_id = ?1 AND status = 'approved'", u.id);
  const quizzes = await all(
    c.env,
    `SELECT r.slug, q.title, r.taken_at FROM quiz_results r JOIN quizzes q ON q.slug = r.slug
     WHERE r.user_id = ?1 AND r.shared = 1 AND q.published = 1 ORDER BY r.taken_at DESC`,
    u.id
  );
  return json({
    person: { ...publicUser(u), joined: u.created_at, comments: comments.n },
    articles: rows.map(communityOut),
    quizzes: quizzes.map((r) => ({ slug: r.slug, title: r.title, taken: r.taken_at }))
  });
}
__name(person, "person");
var QZ = {
  title: 120,
  summary: 300,
  eyebrow: 80,
  intro: 2e3,
  sections: 12,
  poles: 8,
  label: 80,
  question: 400,
  perSection: 60,
  total: 300,
  options: 9,
  option: 400,
  groups: 4,
  items: 150,
  name: 80,
  blurb: 500,
  image: 300,
  json: 6e5,
  picture: 12e4
};
var QUIZ_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
var SECTION_ID = /^[a-z0-9]{1,16}$/;
function qs(v, name, max, min = 0) {
  const s = typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "";
  if (s.length < min) throw new HttpError(400, `${name} can't be empty.`);
  if (s.length > max) throw new HttpError(400, `${name} is too long (${s.length} of ${max} characters).`);
  return s;
}
__name(qs, "qs");
var unit = /* @__PURE__ */ __name((v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}, "unit");
var arr = /* @__PURE__ */ __name((v, name, max, min = 0) => {
  if (!Array.isArray(v) || v.length < min) throw new HttpError(400, `${name}: add at least ${min}.`);
  if (v.length > max) throw new HttpError(400, `${name}: at most ${max} are allowed.`);
  return v;
}, "arr");
function cleanQuiz(raw) {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "That quiz couldn't be read.");
  const ids = /* @__PURE__ */ new Set(), qids = /* @__PURE__ */ new Set(), qmap = /* @__PURE__ */ new Map();
  let questions = 0;
  const sections = arr(raw.sections, "Sections", QZ.sections, 1).map((s, si) => {
    if (!s || typeof s !== "object") throw new HttpError(400, `Section ${si + 1} couldn't be read.`);
    const where = `Section ${si + 1}`;
    let id = typeof s.id === "string" && SECTION_ID.test(s.id) ? s.id : "s" + (si + 1);
    while (ids.has(id)) id += "x";
    ids.add(id);
    const poles = arr(s.poles, `${where}: poles`, QZ.poles, 2).map((p, i) => qs(p, `${where}: pole ${i + 1}'s name`, QZ.label, 1));
    const poly = poles.length >= 3;
    const out = { id, title: qs(s.title, `${where}: title`, QZ.question, 1), short: qs(s.short, `${where}: short name`, QZ.label), poles };
    if (!out.short) out.short = out.title.slice(0, QZ.label);
    if (!poly) out.mid = qs(s.mid, `${where}: middle label`, QZ.label);
    out.questions = arr(s.questions, `${where}: questions`, QZ.perSection, 1).map((q, qi) => {
      const at = `${where}, question ${qi + 1}`;
      if (!q || typeof q !== "object") throw new HttpError(400, `${at} couldn't be read.`);
      questions++;
      let qid = typeof q.id === "string" && SECTION_ID.test(q.id) ? q.id : "q" + questions;
      while (qids.has(qid)) qid += "x";
      qids.add(qid);
      const question = {
        id: qid,
        text: qs(q.text, `${at}: the question`, QZ.question, 1),
        options: arr(q.options, `${at}: answers`, QZ.options, 2).map((o, oi) => {
          if (!o || typeof o !== "object") throw new HttpError(400, `${at}, answer ${oi + 1} couldn't be read.`);
          const opt = { text: qs(o.text, `${at}, answer ${oi + 1}`, QZ.option, 1) };
          if (o.idk) opt.idk = true;
          else if (poly) {
            opt.to = [...new Set((Array.isArray(o.to) ? o.to : []).map(Number))].filter((k) => Number.isInteger(k) && k >= 0 && k < poles.length).sort((a, b) => a - b);
          } else if (typeof o.v === "number" && Number.isFinite(o.v)) opt.v = Math.round(unit(o.v) * 1e3) / 1e3;
          return opt;
        })
      };
      qmap.set(qid, question.options);
      return question;
    });
    return out;
  });
  if (questions > QZ.total) throw new HttpError(400, `That's ${questions} questions; the most a quiz can have is ${QZ.total}.`);
  const matches = arr(raw.matches ?? [], "Result lists", QZ.groups).map((g, gi) => {
    const at = `Result list ${gi + 1}`;
    if (!g || typeof g !== "object") throw new HttpError(400, `${at} couldn't be read.`);
    const label = qs(g.label, `${at}: its heading`, QZ.label, 1);
    return {
      id: typeof g.id === "string" && SECTION_ID.test(g.id) ? g.id : "m" + (gi + 1),
      title: qs(g.title, `${at}: its name`, QZ.label) || label,
      label,
      items: arr(g.items ?? [], `${at}: entries`, QZ.items).map((it, ii) => {
        if (!it || typeof it !== "object") throw new HttpError(400, `${at}, entry ${ii + 1} couldn't be read.`);
        const image = typeof it.image === "string" ? it.image.trim() : "";
        if (image && !/^\/api\/quiz-image\/\d+$/.test(image) && !/^https:\/\/[^\s"'<>]+$/.test(image)) throw new HttpError(400, `${at}, entry ${ii + 1}: the picture address must start with https://.`);
        if (image.length > QZ.image) throw new HttpError(400, `${at}, entry ${ii + 1}: the picture address is too long.`);
        const pos = {};
        sections.forEach((sec) => {
          const v = it.pos && it.pos[sec.id];
          if (sec.poles.length >= 3) {
            if (!Array.isArray(v) || v.length !== sec.poles.length) return;
            const nums = v.map(unit), total = nums.reduce((s, x) => s + x, 0);
            if (total > 0) pos[sec.id] = nums.map((x) => Math.round(x / total * 1e3) / 1e3);
          } else if (v != null && v !== "" && Number.isFinite(Number(v))) pos[sec.id] = Math.round(unit(v) * 1e3) / 1e3;
        });
        const picks = {};
        if (it.picks && typeof it.picks === "object") {
          for (const [k, v] of Object.entries(it.picks)) {
            const opts = qmap.get(k), n = Number(v);
            if (opts && Number.isInteger(n) && n >= 1 && n <= opts.length && !opts[n - 1].idk) picks[k] = n;
          }
        }
        return { name: qs(it.name, `${at}, entry ${ii + 1}: the name`, QZ.name, 1), blurb: qs(it.blurb, `${at}, entry ${ii + 1}: the description`, QZ.blurb), image, pos, picks };
      })
    };
  });
  const quiz = {
    title: qs(raw.title, "The title", QZ.title, 1),
    eyebrow: qs(raw.eyebrow, "The line above the title", QZ.eyebrow),
    intro: qs(raw.intro, "The introduction", QZ.intro),
    sections,
    matches
  };
  if (JSON.stringify(quiz).length > QZ.json) throw new HttpError(400, "That quiz is too big to save.");
  return quiz;
}
__name(cleanQuiz, "cleanQuiz");
function answersFit(quiz, s) {
  if (typeof s !== "string" || !/^[0-9]+$/.test(s)) return false;
  let at = 0;
  for (const sec of quiz.sections) for (const q of sec.questions) {
    if (at >= s.length || Number(s[at++]) > q.options.length) return false;
  }
  return at === s.length;
}
__name(answersFit, "answersFit");
async function seedQuizzes(env) {
  if (await env.DB.prepare("SELECT 1 AS x FROM meta WHERE key = 'quiz_seed'").first()) return;
  const now = Date.now();
  const stmts = [];
  for (const q of quiz_seed_default) {
    try {
      const quiz = cleanQuiz(q);
      stmts.push(env.DB.prepare(
        `INSERT OR IGNORE INTO quizzes (slug, title, summary, questions, published, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
      ).bind(q.slug, quiz.title, qs(q.summary, "summary", QZ.summary), quiz.sections.reduce((n, s) => n + s.questions.length, 0), q.published ? 1 : 0, JSON.stringify(quiz), now));
    } catch (e) {
      console.error("quiz seed skipped:", q.slug, e.message);
    }
  }
  stmts.push(env.DB.prepare("INSERT INTO meta (key, value) VALUES ('quiz_seed', '1') ON CONFLICT (key) DO NOTHING"));
  await env.DB.batch(stmts);
}
__name(seedQuizzes, "seedQuizzes");
var quizRow = /* @__PURE__ */ __name(async (c, slug) => {
  const r = await one(c.env, "SELECT slug, title, summary, questions, published, data, updated_at FROM quizzes WHERE slug = ?1", slug);
  if (!r || !r.published && !(c.user && c.user.role === "admin")) throw new HttpError(404, "That quiz doesn't exist.");
  return r;
}, "quizRow");
async function quizList(c) {
  const admin = c.user && c.user.role === "admin";
  const rows = await all(c.env, `SELECT slug, title, summary, questions, published, updated_at FROM quizzes ${admin ? "" : "WHERE published = 1"} ORDER BY created_at, slug`);
  return json({ quizzes: rows.map((r) => ({ slug: r.slug, title: r.title, summary: r.summary, questions: r.questions, published: !!r.published, updated: r.updated_at })) });
}
__name(quizList, "quizList");
async function quizGet(c) {
  const r = await quizRow(c, c.params[0]);
  return json({ quiz: { slug: r.slug, published: !!r.published, summary: r.summary, updated: r.updated_at, ...JSON.parse(r.data) } });
}
__name(quizGet, "quizGet");
async function quizMine(c) {
  const u = need(c);
  const r = await one(c.env, "SELECT answers, shared, taken_at FROM quiz_results WHERE user_id = ?1 AND slug = ?2", u.id, c.params[0]);
  return json({ result: r ? { answers: r.answers, shared: !!r.shared, taken: r.taken_at } : null });
}
__name(quizMine, "quizMine");
async function quizSave(c) {
  const u = need(c);
  const q = await quizRow(c, c.params[0]);
  const answers = String(c.body.answers || "");
  if (!answersFit(JSON.parse(q.data), answers) || !/[1-9]/.test(answers)) throw new HttpError(400, "Those answers don't fit this quiz. Reload the page and try again.");
  await limit(c, "quiz-save", 40, 3600, "u" + u.id);
  const now = Date.now();
  const r = await one(
    c.env,
    `INSERT INTO quiz_results (user_id, slug, answers, shared, taken_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (user_id, slug) DO UPDATE SET answers = ?3, shared = CASE WHEN ?6 = 1 THEN ?4 ELSE shared END, taken_at = ?5
     RETURNING shared`,
    u.id,
    q.slug,
    answers,
    c.body.shared ? 1 : 0,
    now,
    c.body.shared === void 0 ? 0 : 1
  );
  return json({ result: { answers, shared: !!r.shared, taken: now } });
}
__name(quizSave, "quizSave");
async function quizShare(c) {
  const u = need(c);
  const r = await one(c.env, "UPDATE quiz_results SET shared = ?3 WHERE user_id = ?1 AND slug = ?2 RETURNING shared", u.id, c.params[0], c.body.shared ? 1 : 0);
  if (!r) throw new HttpError(404, "There's no saved result to share yet.");
  return json({ shared: !!r.shared });
}
__name(quizShare, "quizShare");
async function quizForget(c) {
  const u = need(c);
  await run(c.env, "DELETE FROM quiz_results WHERE user_id = ?1 AND slug = ?2", u.id, c.params[0]);
  return json({ ok: true });
}
__name(quizForget, "quizForget");
async function quizShared(c) {
  const r = await one(
    c.env,
    `SELECT u.username, r.answers, r.taken_at FROM quiz_results r JOIN users u ON u.id = r.user_id JOIN quizzes q ON q.slug = r.slug
     WHERE u.username = ?1 AND r.slug = ?2 AND r.shared = 1 AND u.banned = 0 AND q.published = 1`,
    c.params[1],
    c.params[0]
  );
  if (!r) throw new HttpError(404, "That result isn't shared.");
  return json({ username: r.username, answers: r.answers, taken: r.taken_at });
}
__name(quizShared, "quizShared");
async function adminQuizSave(c) {
  need(c, true);
  const slug = String(c.body.slug || "").trim();
  if (!QUIZ_SLUG.test(slug)) throw new HttpError(400, "The address can only use lowercase letters, numbers and dashes.");
  const quiz = cleanQuiz(c.body.quiz);
  const summary = qs(c.body.summary, "The summary", QZ.summary);
  const have = await one(c.env, "SELECT slug FROM quizzes WHERE slug = ?1", slug);
  if (c.body.create && have) throw new HttpError(409, "There's already a quiz at that address. Pick another.");
  const now = Date.now(), n = quiz.sections.reduce((t, s) => t + s.questions.length, 0);
  await run(
    c.env,
    `INSERT INTO quizzes (slug, title, summary, questions, published, data, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
     ON CONFLICT (slug) DO UPDATE SET title = ?2, summary = ?3, questions = ?4, published = ?5, data = ?6, updated_at = ?7`,
    slug,
    quiz.title,
    summary,
    n,
    c.body.published ? 1 : 0,
    JSON.stringify(quiz),
    now
  );
  return json({ slug, updated: now });
}
__name(adminQuizSave, "adminQuizSave");
async function adminQuizDelete(c) {
  need(c, true);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM quiz_results WHERE slug = ?1").bind(c.params[0]),
    c.env.DB.prepare("DELETE FROM quizzes WHERE slug = ?1").bind(c.params[0])
  ]);
  return json({ ok: true });
}
__name(adminQuizDelete, "adminQuizDelete");
async function adminQuizImage(c) {
  need(c, true);
  const img = String(c.body.image || "");
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(img)) throw new HttpError(400, "That picture couldn't be read. Try a PNG or JPEG.");
  if (img.length > QZ.picture) throw new HttpError(400, "That picture is too big. Try a smaller one.");
  const row = await one(c.env, "INSERT INTO quiz_images (data, created_at) VALUES (?1, ?2) RETURNING id", img, Date.now());
  return json({ url: `/api/quiz-image/${row.id}` });
}
__name(adminQuizImage, "adminQuizImage");
async function quizImage(c) {
  const r = await one(c.env, "SELECT data FROM quiz_images WHERE id = ?1", Number(c.params[0]));
  if (!r) throw new HttpError(404, "No picture.");
  const [, mime, data] = r.data.match(/^data:([^;]+);base64,(.*)$/);
  return new Response(
    Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0)),
    { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } }
  );
}
__name(quizImage, "quizImage");
async function adminSubmission(c) {
  need(c, true);
  const w = await one(c.env, "SELECT * FROM writings WHERE id = ?1", Number(c.params[0]));
  if (!w) throw new HttpError(404, "That piece doesn't exist.");
  const author = await currentUserById(c.env, w.user_id);
  const live = await one(c.env, "SELECT * FROM community WHERE writing_id = ?1", w.id);
  return json({
    writing: writingOut(w, live),
    author: publicUser(author),
    liveCopy: live ? { title: live.title, subtitle: live.subtitle, summary: live.summary, html: live.html } : null
  });
}
__name(adminSubmission, "adminSubmission");
async function freeCommunitySlug(env, title) {
  const base = slugify(title) || "article";
  for (let n = 1; n < 200; n++) {
    const cand = n === 1 ? base : `${base}-${n}`;
    if (!await one(env, "SELECT 1 AS x FROM community WHERE slug = ?1", cand)) return cand;
  }
  throw new HttpError(400, "Couldn't find a free address for that title.");
}
__name(freeCommunitySlug, "freeCommunitySlug");
async function adminReview(c) {
  need(c, true);
  const w = await one(c.env, "SELECT * FROM writings WHERE id = ?1", Number(c.params[0]));
  if (!w || w.kind !== "community") throw new HttpError(404, "That piece doesn't exist.");
  if (w.state !== "submitted") throw new HttpError(409, "That isn't waiting for review any more (it may have been withdrawn).");
  const now = Date.now();
  if (c.body.action === "approve") {
    const live = await one(c.env, "SELECT slug FROM community WHERE writing_id = ?1", w.id);
    const slug = live ? live.slug : await freeCommunitySlug(c.env, w.title);
    await c.env.DB.batch([
      live ? c.env.DB.prepare(`UPDATE community SET title = ?1, subtitle = ?2, summary = ?3, categories = ?4, html = ?5, words = ?6, updated_at = ?7 WHERE writing_id = ?8`).bind(w.title, w.subtitle, w.summary, w.categories, w.html, w.words, now, w.id) : c.env.DB.prepare(`INSERT INTO community (slug, writing_id, user_id, title, subtitle, summary, categories, html, words, published_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`).bind(slug, w.id, w.user_id, w.title, w.subtitle, w.summary, w.categories, w.html, w.words, now),
      c.env.DB.prepare("UPDATE writings SET state = 'draft', note = NULL, slug = ?1 WHERE id = ?2").bind(slug, w.id)
    ]);
    await adminMessage(c.env, w.user_id, live ? `I've approved your changes to \u201C${w.title}\u201D. They're live now: ${c.url.origin}/community/${slug}` : `\u201C${w.title}\u201D is published! Here it is: ${c.url.origin}/community/${slug}`);
    return json({ ok: true, slug });
  }
  if (c.body.action === "return") {
    const note = typeof c.body.note === "string" ? c.body.note.trim().slice(0, 2e3) : "";
    await run(c.env, "UPDATE writings SET state = 'draft', note = ?1 WHERE id = ?2", note || null, w.id);
    await adminMessage(c.env, w.user_id, `I've sent \u201C${w.title || "your article"}\u201D back to you${note ? ` with a note:

${note}` : "."}

You can change it and send it again from ${c.url.origin}/write`);
    return json({ ok: true });
  }
  throw new HttpError(400, "Approve or send back.");
}
__name(adminReview, "adminReview");
async function adminWriterRequest(c) {
  need(c, true);
  const id = Number(c.params[0]);
  const r = await one(c.env, "SELECT user_id FROM writer_requests WHERE user_id = ?1", id);
  if (!r) throw new HttpError(404, "That request is gone.");
  if (c.body.action === "approve") {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET role = 'writer' WHERE id = ?1 AND role = 'user'").bind(id),
      c.env.DB.prepare("DELETE FROM writer_requests WHERE user_id = ?1").bind(id)
    ]);
    await adminMessage(c.env, id, `You can write for the site now! Start here: ${c.url.origin}/write

I read every article before it goes up.`);
    return json({ ok: true });
  }
  if (c.body.action === "reject") {
    const note = typeof c.body.note === "string" ? c.body.note.trim().slice(0, 1e3) : "";
    await run(c.env, "DELETE FROM writer_requests WHERE user_id = ?1", id);
    await adminMessage(c.env, id, `Thanks for offering to write for the site. I'm not adding you as a writer right now${note ? `:

${note}` : "."}`);
    return json({ ok: true });
  }
  throw new HttpError(400, "Approve or turn down.");
}
__name(adminWriterRequest, "adminWriterRequest");
var THUMB_PATH = /^articles\/thumbs\/[a-z0-9-]+\.jpg$/;
var SITE_NAME = "According To Knowledge";
async function previewFor(env, url, kind, slug) {
  if (kind === "article") {
    const res = await env.ASSETS.fetch(new Request(new URL(`/articles/${slug}.json`, url)));
    if (!res.ok) return null;
    const d = await res.json();
    const thumb = THUMB_PATH.test(d.thumbnail || "") && d.card !== "banner" ? d.thumbnail : "";
    return { title: d.title || "Untitled", description: d.summary || d.subtitle || "", image: thumb, published: d.published, type: "article" };
  }
  if (!env.DB) return null;
  await ensureSchema(env);
  if (kind === "quiz") {
    const q = await one(env, "SELECT title, summary FROM quizzes WHERE slug = ?1 AND published = 1", slug);
    return q ? { title: q.title, description: q.summary || "A quiz from According To Knowledge.", image: "", type: "website" } : null;
  }
  const r = await one(env, `SELECT cm.title, cm.subtitle, cm.summary, cm.published_at, u.username FROM community cm JOIN users u ON u.id = cm.user_id
    WHERE cm.slug = ?1 AND u.banned = 0`, slug);
  if (!r) return null;
  return {
    title: r.title || "Untitled",
    description: r.summary || r.subtitle || `A community article by ${r.username}.`,
    image: "",
    published: new Date(r.published_at).toISOString(),
    author: r.username,
    type: "article"
  };
}
__name(previewFor, "previewFor");
async function withPreview(request, env, url, kind, slug) {
  const page = await env.ASSETS.fetch(request);
  const p = await previewFor(env, url, kind, slug);
  if (!p || !(page.headers.get("content-type") || "").includes("text/html")) return page;
  const image = new URL(p.image || "/assets/card.png", url.origin).href;
  const pageUrl = `${url.origin}/${kind}/${slug}`;
  const description = p.description.replace(/\s+/g, " ").trim().slice(0, 300);
  const tags = {
    "og:type": p.type || "article",
    "og:site_name": SITE_NAME,
    "og:title": p.title,
    "og:description": description,
    "og:url": pageUrl,
    "og:image": image,
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:image:alt": p.image ? p.title : SITE_NAME,
    "twitter:card": "summary_large_image",
    "twitter:title": p.title,
    "twitter:description": description,
    "twitter:image": image,
    ...p.published ? { "article:published_time": p.published } : {}
  };
  const attr = /* @__PURE__ */ __name((s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"), "attr");
  const head = Object.entries(tags).map(([k, v]) => `<meta ${k.startsWith("og:") || k.startsWith("article:") ? "property" : "name"}="${k}" content="${attr(v)}" />`).join("\n  ") + `
  <link rel="canonical" href="${attr(pageUrl)}" />`;
  const drop = /* @__PURE__ */ __name((el) => el.remove(), "drop");
  return new HTMLRewriter().on("title", { element(el) {
    el.setInnerContent(`${p.title} \xB7 ${SITE_NAME}`);
  } }).on('meta[name="description"]', { element(el) {
    el.setAttribute("content", description || SITE_NAME);
  } }).on('meta[property^="og:"]', { element: drop }).on('meta[name^="twitter:"]', { element: drop }).on("head", { element(el) {
    el.append(head, { html: true });
  } }).transform(page);
}
__name(withPreview, "withPreview");
function ghReady(env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) throw new HttpError(503, "Publishing to the site isn't set up yet: the Worker needs a GITHUB_TOKEN secret.");
}
__name(ghReady, "ghReady");
function ghExplain(status) {
  if (status === 401) return "GitHub rejected the site's token (expired or revoked). Make a new one and update the GITHUB_TOKEN secret.";
  if (status === 403) return "GitHub refused. The token needs \u201CContents: Read and write\u201D on this repo (or GitHub's rate limit was hit).";
  if (status === 404) return "GitHub couldn't find that. Check GITHUB_REPO and that the token can see the repo.";
  if (status === 409 || status === 422) return "GitHub reported a conflict (something changed at the same time). Try again.";
  return `GitHub returned an error (${status}).`;
}
__name(ghExplain, "ghExplain");
async function gh(env, path, { method = "GET", body, raw = false } = {}) {
  let res;
  try {
    res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
      method,
      headers: {
        Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "accordingtoknowledge.com",
        ...body ? { "Content-Type": "application/json" } : {}
      },
      body: body ? JSON.stringify(body) : void 0
    });
  } catch {
    throw new HttpError(502, "Couldn't reach GitHub. Try again in a moment.");
  }
  if (!res.ok) {
    const e = new HttpError(res.status === 404 ? 404 : 502, ghExplain(res.status));
    e.gh = res.status;
    throw e;
  }
  if (raw) return res.text();
  return res.status === 204 ? null : res.json();
}
__name(gh, "gh");
var ghPath = /* @__PURE__ */ __name((p) => "/contents/" + p.split("/").map(encodeURIComponent).join("/"), "ghPath");
var ghBranch = /* @__PURE__ */ __name((env) => env.GITHUB_BRANCH || "main", "ghBranch");
function toB64(str) {
  const bytes = enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(bin);
}
__name(toB64, "toB64");
var fromB64 = /* @__PURE__ */ __name((b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), (ch) => ch.charCodeAt(0))), "fromB64");
async function ghGet(env, path) {
  const where = `${ghPath(path)}?ref=${encodeURIComponent(ghBranch(env))}`;
  try {
    const j = await gh(env, where);
    if (j.encoding === "base64" && j.content) return { sha: j.sha, text: fromB64(j.content) };
    return { sha: j.sha, text: await gh(env, where, { raw: true }) };
  } catch (e) {
    if (e.gh === 404) return null;
    throw e;
  }
}
__name(ghGet, "ghGet");
var ghPut = /* @__PURE__ */ __name((env, path, textBody, message, sha) => gh(env, ghPath(path), { method: "PUT", body: { message, content: toB64(textBody), branch: ghBranch(env), ...sha ? { sha } : {} } }), "ghPut");
var ghPutB64 = /* @__PURE__ */ __name((env, path, b64, message, sha) => gh(env, ghPath(path), { method: "PUT", body: { message, content: b64, branch: ghBranch(env), ...sha ? { sha } : {} } }), "ghPutB64");
async function ghRemove(env, path, message) {
  const f = await gh(env, `${ghPath(path)}?ref=${encodeURIComponent(ghBranch(env))}`).catch((e) => {
    if (e.gh === 404) return null;
    throw e;
  });
  if (f && f.sha) await ghDelete(env, path, f.sha, message);
}
__name(ghRemove, "ghRemove");
var ghDelete = /* @__PURE__ */ __name((env, path, sha, message) => gh(env, ghPath(path), { method: "DELETE", body: { message, sha, branch: ghBranch(env) } }), "ghDelete");
async function ghUpdateList(env, path, mutate, message) {
  for (let attempt = 0; ; attempt++) {
    const f = await ghGet(env, path);
    const list = f ? parseJSON(f.text, null) : [];
    if (!Array.isArray(list)) throw new HttpError(500, `${path} in the repo isn't valid JSON, so nothing was changed. Fix it in the repo first.`);
    const next = mutate(list).sort((a, b) => new Date(b.published) - new Date(a.published));
    try {
      await ghPut(env, path, JSON.stringify(next, null, 2) + "\n", message, f && f.sha);
      return next;
    } catch (e) {
      if ((e.gh === 409 || e.gh === 422) && attempt < 2) continue;
      throw e;
    }
  }
}
__name(ghUpdateList, "ghUpdateList");
async function publishOfficial(c, w) {
  const env = c.env;
  ghReady(env);
  const title = w.title.trim();
  if (!title) throw new HttpError(400, "Give it a title first.");
  if (!w.words) throw new HttpError(400, "There's nothing written yet.");
  let slug = w.slug;
  if (!slug) {
    const idx = await ghGet(env, "articles/index.json");
    const list = parseJSON(idx ? idx.text : "[]", []);
    const base = slugify(title) || "article";
    for (let n = 1; n < 50 && !slug; n++) {
      const cand = n === 1 ? base : `${base}-${n}`;
      if (cand === "index" || cand === "series" || list.some((a) => a.slug === cand)) continue;
      if (!await ghGet(env, `articles/${cand}.json`)) slug = cand;
    }
    if (!slug) throw new HttpError(400, "Couldn't find a free web address for this title. Try a different title.");
  }
  const path = `articles/${slug}.json`;
  const existing = await ghGet(env, path);
  const old = existing ? parseJSON(existing.text, {}) : {};
  const siteAt = Date.parse(old.updated || ""), baseAt = Date.parse(w.base || "");
  if (existing && !c.body.force && !isNaN(siteAt) && !isNaN(baseAt) && siteAt > baseAt + 1e3) {
    throw new HttpError(409, "This article changed on the site since this draft was started.", {
      conflict: { updated: old.updated, words: old.words || 0, title: old.title || title }
    });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const meta = { slug, title, summary: w.summary.trim(), published: old.published || now, updated: now, words: w.words };
  if (w.subtitle.trim()) meta.subtitle = w.subtitle.trim();
  meta.categories = parseJSON(w.categories, []);
  let thumb = w.thumbnail || "";
  if (thumb.startsWith("data:")) {
    const p = `articles/thumbs/${slug}-${Date.now().toString(36)}.jpg`;
    await ghPutB64(env, p, thumb.split(",")[1], `${existing ? "Update" : "Publish"} article thumbnail: ${title}`);
    thumb = p;
  }
  if (!THUMB_PATH.test(thumb)) thumb = "";
  if (thumb) {
    meta.thumbnail = thumb;
    meta.card = w.card === "banner" ? "banner" : "thumbnail";
  }
  const source = old.source || w.source;
  const doc = { ...meta, ...source ? { source } : {}, html: w.html, delta: parseJSON(w.delta, { ops: [] }) };
  const verb = existing ? "Update" : "Publish";
  await ghPut(env, path, JSON.stringify(doc), `${verb} article: ${title}`, existing && existing.sha);
  await ghUpdateList(env, "articles/index.json", (l) => {
    if (w.pinned) l.forEach((a) => {
      if (a.slug !== slug) delete a.pinned;
    });
    const entry = { ...meta, ...w.pinned ? { pinned: true } : {} };
    const i = l.findIndex((a) => a.slug === slug);
    if (i >= 0) l[i] = entry;
    else l.push(entry);
    return l;
  }, `${verb} article index: ${title}`);
  if (THUMB_PATH.test(old.thumbnail || "") && old.thumbnail !== thumb) await ghRemove(env, old.thumbnail, `Remove old article thumbnail: ${title}`).catch(() => {
  });
  await run(env, "UPDATE writings SET slug = ?1, state = 'draft', base = ?2, updated_at = ?3, thumbnail = ?5 WHERE id = ?4", slug, now, Date.now(), w.id, thumb);
  articleCache = null;
  return { ok: true, slug, verb, thumbnail: thumb };
}
__name(publishOfficial, "publishOfficial");
async function publishedDoc(c, slug) {
  if (c.env.GITHUB_TOKEN && c.env.GITHUB_REPO) {
    const f = await ghGet(c.env, `articles/${slug}.json`);
    return f && parseJSON(f.text, null);
  }
  const res = await c.env.ASSETS.fetch(new Request(new URL(`/articles/${slug}.json`, c.url)));
  return res.ok ? res.json() : null;
}
__name(publishedDoc, "publishedDoc");
async function siteVersion(env, slug) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return null;
  const idx = await ghGet(env, "articles/index.json");
  const e = parseJSON(idx ? idx.text : "[]", []).find((a) => a.slug === slug);
  return e ? { updated: e.updated || e.published, words: e.words || 0, title: e.title } : null;
}
__name(siteVersion, "siteVersion");
async function removeFromRepo(env, slug, title, verb = "Delete") {
  const path = `articles/${slug}.json`;
  const f = await ghGet(env, path);
  const thumb = f ? (parseJSON(f.text, {}) || {}).thumbnail : "";
  if (f) await ghDelete(env, path, f.sha, `${verb} article: ${title}`);
  if (THUMB_PATH.test(thumb || "")) await ghRemove(env, thumb, `${verb} article thumbnail: ${title}`).catch(() => {
  });
  await ghUpdateList(env, "articles/index.json", (l) => l.filter((a) => a.slug !== slug), `${verb} article index: ${title}`);
}
__name(removeFromRepo, "removeFromRepo");
async function unpublishOfficial(c, w) {
  const env = c.env;
  ghReady(env);
  await removeFromRepo(env, w.slug, w.title, "Unpublish");
  await run(
    env,
    "UPDATE writings SET slug = NULL, updated_at = ?1, thumbnail = CASE WHEN thumbnail LIKE 'articles/%' THEN '' ELSE thumbnail END WHERE id = ?2",
    Date.now(),
    w.id
  );
  articleCache = null;
}
__name(unpublishOfficial, "unpublishOfficial");

// ../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-188HhS/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-188HhS/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
