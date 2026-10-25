/**
 * Reading 110 — The Thief on the Cross. Content only: the beats. The pipeline
 * lives in skills/bible/scripts/deck (see skills/bible/references/decks.md).
 *
 *   bun build_manifest.ts
 */
import { dirname } from "node:path"
import { type Beat, writeManifest } from "../../../../../skills/bible/scripts/deck/manifest.ts"
import { describe } from "../../../../../skills/bible/scripts/deck/series.ts"

const JESUS = describe("jesus")

const beats: ReadonlyArray<Beat> = [
  // 1. At Calvary
  { ref: "Luke 23:32-33", section: "At Calvary", character: "jesus", concept: `three crosses raised on the bare skull-shaped hill of Calvary under a darkening sky, ${JESUS} on the middle cross, a malefactor on either side, a crowd of soldiers, priests and onlookers at the foot, seen from a little distance`, note: "\"On either side one, and Jesus in the midst.\" DA 751.4: His place between the thieves was to indicate that He was the greatest criminal of the three. Isaiah 53:12 fulfilled: numbered with the transgressors." },
  { ref: "Luke 23:39", section: "At Calvary", concept: "a hardened dark-bearded criminal nailed to a rough wooden cross on a hilltop, twisting his head toward the centre cross and shouting with a bitter sneering face, storm clouds gathering behind, harsh low light", note: "Both men at first railed on Him (Matt 27:44). DA 749.3: one under his suffering only became more desperate and defiant." },
  { ref: "Luke 23:40-41", section: "At Calvary", character: "jesus", concept: `a younger repentant criminal on a rough wooden cross in the foreground, his face turned in grief and rebuke toward the other condemned man on the far cross, ${JESUS} crowned with thorns on the centre cross between them, head bowed in silent suffering, dust and grey light`, note: "\"We indeed justly ... but this man hath done nothing amiss.\" He owns his guilt and confesses Christ's innocence in one breath. DA 749.3: he had seen and heard Jesus, and had been convicted by His teaching." },
  { ref: "Luke 23:42", section: "At Calvary", character: "jesus", concept: `close view of the penitent thief on his cross, his face lifted with hope mingled with anguish toward ${JESUS} crowned with thorns on the centre cross beside him, a single shaft of light breaking through the dark clouds onto them both`, note: "He asks to be remembered when Christ comes into His kingdom, a day yet ahead. DA 750.1: the helpless, dying soul casts himself upon a dying Saviour." },
  { ref: "Luke 23:43", section: "At Calvary", character: "jesus", concept: `${JESUS} on the cross crowned with thorns, turning his face with tender compassion toward the penitent thief beside him, the dark cloud over Calvary pierced by a bright living light falling on them both`, note: "DA 750.2 renders it: \"Verily I say unto thee today, Thou shalt be with Me in paradise.\" DA 751.2: the dark cloud that seemed to enshroud the cross was pierced by a bright and living light." },

  // 2. The King mocked
  { ref: "Luke 19:12", section: "The King Mocked", concept: "a nobleman in a travelling cloak setting out at dawn on a long road toward a far country, looking back toward the city he will return to rule, his servants watching from the gate", note: "Christ's own parable: the kingdom is received far away, and the King returns with it. The thief asked for that day." },
  { ref: "Matthew 27:29", section: "The King Mocked", character: "jesus", concept: `${JESUS} seated and bound in a torchlit stone guardroom, a crown of thorns on his head, a reed in his right hand, a faded scarlet robe on his shoulders, Roman soldiers bowing the knee in mockery around him, his face patient and silent`, note: "The world crowned Him with thorns. Every sign said His kingdom had failed." },
  { ref: "Matthew 27:42", section: "The King Mocked", concept: "priests and rulers in rich robes standing at the foot of the crosses on Calvary, pointing upward and laughing in scorn, their faces lit harshly from below, the crosses dark against a heavy sky", note: "\"Himself he cannot save.\" DA 750.3: while the leading Jews deny Him, and even the disciples doubt His divinity, the poor thief calls Jesus Lord." },

  // 3. Where is Paradise?
  { ref: "Revelation 2:7", section: "Where Is Paradise?", concept: "the tree of life standing in a radiant garden, laden with golden fruit, its great branches spreading over a glowing river, soft heavenly light, no figures", note: "Scripture defines Paradise for us: where the tree of life grows." },
  { ref: "Revelation 22:1-2", section: "Where Is Paradise?", concept: "a pure river of water of life, clear as crystal, flowing from a distant radiant throne down the golden street of the holy city, the tree of life growing on either side of the river, glorious light, no figures", note: "The tree of life grows by the river that proceeds from the throne of God. Paradise is where the Father's throne is." },
  { ref: "2 Corinthians 12:2, 4", lookupRefs: ["2 Corinthians 12:2", "2 Corinthians 12:4"], section: "Where Is Paradise?", concept: "the apostle Paul as an older bearded man kneeling in prayer in a dim room at night, his face lifted and lit by a vision of light opening far above him into the heavens", note: "The third heaven and paradise are the same place in Paul's account: caught up, not down." },

  // 4. Not yet ascended
  { ref: "1 Corinthians 15:3-4", section: "Not Yet Ascended", concept: "a rock-hewn garden tomb at the first light of the third day, the great round stone rolled aside, the grave clothes lying folded in the empty tomb, dew on the garden", note: "Died, buried, rose the third day. Friday night and the Sabbath He lay in Joseph's tomb." },
  { ref: "John 20:17", section: "Not Yet Ascended", character: "jesus", concept: `the risen ${JESUS} in the garden at dawn beside the open tomb, one hand gently raised, speaking to Mary Magdalene who kneels before him in wonder, olive trees and early morning mist`, note: "Sunday morning: \"I am not yet ascended to my Father.\" DA 751.3: He Himself did not go that day to Paradise. He slept in the tomb." },
  { ref: "Titus 1:2", section: "Not Yet Ascended", concept: "a great ancient scroll of promise lying open on a stone table in a shaft of steady golden light, an hourglass beside it, the dim sweep of ages suggested in the background", note: "God cannot lie. Christ's words to the thief and to Mary stand together, once the comma stands where He put the emphasis." },

  // 5. "Today"
  { ref: "Zechariah 9:12", section: "\"Today\"", concept: "prisoners in ragged clothes turning from a dark dungeon toward a strong fortress on a hill lit by the morning sun, hope rising in their faces", note: "\"Even to day do I declare\": the day the promise is spoken, not the day it is kept. DA 751.3: on the day of the crucifixion, the day of apparent defeat and darkness, the promise was given." },
  { ref: "Deuteronomy 30:19", section: "\"Today\"", concept: "Moses as an aged white-bearded leader standing on a rise before the vast camp of Israel, both arms raised toward the open sky and the distant hills, the people listening below, clear evening light", note: "\"This day\" again marks the day of speaking. Moses calls heaven and earth to witness the words spoken now." },

  // 6. When with Christ?
  { ref: "John 14:3", section: "When With Christ?", character: "jesus", concept: `${JESUS} seated at the supper table in a lamplit upper room, speaking tenderly to his troubled disciples, one hand open toward a window where a far light glows`, note: "\"I will come again, and receive you.\" The meeting is fixed at His coming, not at our death." },
  { ref: "1 Thessalonians 4:16-17", section: "When With Christ?", sourceImage: "../reading-105/images/s34-1-thessalonians-4-16-17.png", note: "The dead in Christ rise first. The thief is among them, and so shall he ever be with the Lord." },
  { ref: "Revelation 22:12", section: "When With Christ?", concept: "the sky over the whole earth parting in a vast blaze of glory at the coming of the King, a radiant cloud descending with countless angels, the people below looking up, no single face of Christ shown", note: "The reward comes with Him. The thief's paradise and ours arrive on the same day." },

  // 7. The sleep of the dead
  { ref: "Ecclesiastes 9:5-6", section: "The Sleep of the Dead", sourceImage: "../reading-105/images/s06-ecclesiastes-9-5-6.png", note: "The dead know not any thing. The thief has had no waiting to endure." },
  { ref: "Psalm 146:4", section: "The Sleep of the Dead", sourceImage: "../reading-105/images/s07-psalm-146-4.png", note: "In that very day his thoughts perish. His next thought will be the voice of Christ calling him." },
  { ref: "John 11:11", section: "The Sleep of the Dead", sourceImage: "../reading-105/images/s09-john-11-11.png", note: "Christ's own word for death is sleep, and His errand is to awake. To the thief, paradise will seem to come that very day." },

  // 8. By grace through faith
  { ref: "Ephesians 2:8-9", section: "By Grace Through Faith", concept: "a pair of empty open hands, rough and wounded from labour, raised upward in a dark place to receive a single gift of light falling from above", note: "No baptism, no works, no restitution possible. Only faith, and Christ received him fully. DA 751.2: it is His royal right to save unto the uttermost all who come unto God by Him." },

  // 9. Appeal
  { ref: "Luke 23:42", section: "Appeal", sourceImage: "images/s04-luke-23-42.png", note: "The same Saviour hears the same prayer today. \"Lord, remember me when thou comest into thy kingdom.\"" },
]

await writeManifest(dirname(import.meta.path), {
  title: "The Thief on the Cross",
  subtitle: "Bible Readings — Chapter 110 — A Scripture Narrative",
  deckName: "Reading 110 - The Thief on the Cross",
  titleConcept: "three crosses on the hill of Calvary seen from far off under a dark storm sky, a single bright shaft of living light breaking through the clouds onto the centre cross and the cross beside it, a faint dawn glow on the far horizon, no visible faces",
  beats,
})
