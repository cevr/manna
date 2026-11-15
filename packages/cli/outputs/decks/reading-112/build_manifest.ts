/**
 * Reading 112 — Absent from the Body: Understanding Paul's Hope. Content only:
 * the beats. The pipeline lives in skills/bible/scripts/deck (see
 * skills/bible/references/decks.md).
 *
 *   bun build_manifest.ts
 */
import { dirname } from "node:path"
import { type Beat, writeManifest } from "../../../../../skills/bible/scripts/deck/manifest.ts"
import { describe } from "../../../../../skills/bible/scripts/deck/series.ts"

const JESUS = describe("jesus")
const PAUL = describe("paul")

const beats: ReadonlyArray<Beat> = [
  // 1. The three states
  { ref: "2 Corinthians 5:1", section: "The Three States", concept: "a worn, patched goatskin tent pitched on a barren hillside at dusk, its ropes fraying and one pole leaning, while far above in the glowing clouds the faint shining outline of a great heavenly dwelling of light appears, not made with hands", note: "First state: clothed with the earthly house. \"Tabernacle\" (skenos): a tent, a temporary dwelling, set against the permanent building of God." },
  { ref: "2 Corinthians 5:3", section: "The Three States", concept: "an empty stone tomb in a quiet garden at night, its entrance sealed, a simple folded burial shroud lying on the ledge before it, cold moonlight and deep still shadow", note: "Second state: unclothed, naked. Death: the body in the grave, the person without conscious existence." },
  { ref: "2 Corinthians 5:4", section: "The Three States", concept: "the redeemed rising from opened graves at dawn, clothed in shining white garments, their faces lifted upward in wonder and joy as golden light floods over the hillside cemetery, figures seen from a little distance", note: "Third state: clothed upon. Not unclothed, but clothed upon, that mortality might be swallowed up of life: the resurrection body." },

  // 2. What Paul desired
  { ref: "2 Corinthians 5:2", section: "What Paul Desired", character: "paul", concept: `${PAUL}, kneeling in prayer on a rocky hillside at sunset beside a small tent, his hands raised and his face lifted with earnest longing toward a glowing sky`, note: "His earnest desire was to be clothed upon: not a naked, disembodied spirit, but the glorified resurrection body." },
  { ref: "2 Corinthians 5:6", section: "What Paul Desired", character: "paul", concept: `${PAUL}, a travelling pilgrim with staff and cloak, walking a long dusty road through a dry land toward distant hills where a warm light breaks on the horizon`, note: "At home in the body, absent from the Lord: a pilgrim on the way, not yet at the destination." },
  { ref: "2 Corinthians 5:8", section: "What Paul Desired", character: "jesus", concept: `the redeemed caught up in white garments into the shining clouds to meet ${JESUS}, who comes in glory with outstretched arms, a host of angels around them, the earth far below`, note: "Two states set side by side: this groaning mortal life and the glorified life with the Lord. The unclothed state between them Paul expressly does not desire; his hope leaps over death to the resurrection morning." },

  // 3. The parallel in Romans 8
  { ref: "Romans 8:23", section: "The Parallel in Romans 8", concept: "a small band of early believers gathered in prayer by lamplight in a humble house church at night, an old man and a weary mother among them, their faces turned upward with patient longing, a faint dawn glow at the window", note: "Same longing, same event: we groan (2 Cor 5) / we groan within ourselves; clothed upon / the redemption of our body; mortality swallowed up of life / the adoption." },

  // 4. When the change comes
  { ref: "1 Thessalonians 4:16", section: "When the Change Comes", sourceImage: "../reading-105/images/s34-1-thessalonians-4-16-17.png", note: "Scripture is explicit about when: the Lord descends, and the dead in Christ rise." },
  { ref: "1 Corinthians 15:51-52", section: "When the Change Comes", sourceImage: "../reading-105/images/s36-1-corinthians-15-51-52.png", note: "The house from heaven, the immortal body, is received at the last trump, not at death. A traveller in a worn tent longs not to be homeless, but to reach his father's house." },

  // 5. The immortal soul problem
  { ref: "1 John 5:11", section: "The Immortal Soul Problem", concept: "an open Bible on a rough wooden table lit by a single candle, a beam of warm golden light falling on its pages from above, a humble room in shadow", note: "Why call death naked, disclaim it, and groan for the body if the soul is already in glory? We \"have\" a building of God as we \"have\" eternal life: by faith now, in His Son, its fulness at the resurrection." },

  // 6. God's answer to death
  { ref: "Job 18:14", section: "God's Answer to Death", concept: "a lone desert tent torn from its stakes in a night storm, its frightened dweller driven out and led away into a gathering darkness toward a towering cloaked shadow whose face is unseen", note: "Death, the king of terrors: the enemy's final weapon in the great controversy." },
  { ref: "1 Corinthians 15:26", section: "God's Answer to Death", sourceImage: "../reading-105/images/s54-1-corinthians-15-26.png", note: "God's answer is the resurrection. The grave is neither the end nor the entrance to glory, but a sleep from which Christ alone awakens." },
  { ref: "Genesis 3:4", section: "God's Answer to Death", sourceImage: "../reading-102/images/s14-gen-3-4-5.png", note: "The resurrection morning defeats Satan's lie: ye shall not surely die." },

  // 7. Sanctuary connections
  { ref: "Exodus 28:29", section: "Sanctuary Connections", concept: "the high priest Aaron in his sacred robes with the jeweled breastplate of twelve stones upon his heart, standing in incense smoke before the veil of the Most Holy Place, a soft glory of light on his face, the camp of Israel waiting outside", note: "On the Day of Atonement the high priest bore Israel's names on his heart into the Most Holy Place; the people waited outside, their fate bound up with his ministry." },
  { ref: "Hebrews 9:28", section: "Sanctuary Connections", sourceImage: "../reading-111/images/s15-hebrews-9-28.png", note: "When Christ comes out from the Most Holy Place He appears the second time, and then His waiting people are clothed upon with immortality." },

  // 8. Righteousness by faith
  { ref: "1 John 5:12", section: "Righteousness by Faith", character: "jesus", concept: `${JESUS} gently lifting a kneeling, ragged penitent to his feet, a warm light surrounding them both in a quiet hillside place at morning`, note: "Paul's confidence rested not on inherent immortality, but on union with Christ. This life is in Him, received by faith." },
  { ref: "Ephesians 1:6", section: "Righteousness by Faith", character: "jesus", concept: `a returning prodigal in rags embraced and welcomed home by ${JESUS} at the open door of a house full of light, a white robe being brought to cover him`, note: "Accepted in the beloved: our destiny secured by His merits, not our own. The resurrection body is the final gift of grace." },

  // 9. Application
  { ref: "1 Thessalonians 4:13", section: "Application", sourceImage: "../reading-105/images/s35-1-thessalonians-4-13-14.png", note: "Our loved ones who sleep in Jesus are not suffering, not in purgatory, not hovering as spirits. We shall see them again." },
  { ref: "Titus 2:13", section: "Application", concept: "a family of believers standing together on a hilltop at daybreak, gazing toward the eastern sky where a small bright cloud glows with golden light, their faces full of hope", note: "We need not fear death, we must not be deceived by spiritualism, we live by faith, and we long for His return." },

  // 10. Appeal
  { ref: "1 Thessalonians 4:17-18", section: "Appeal", sourceImage: "../what-is-truth/images/day3-v2/d3-g-first-resurrection.png", note: "Is your hope anchored in Christ and His resurrection? Not a ghostly existence, but this mortal putting on immortality." },
]

await writeManifest(dirname(import.meta.path), {
  title: "Absent from the Body",
  subtitle: "Bible Readings — Chapter 112 — Understanding Paul's Hope",
  deckName: "Reading 112 - Absent from the Body",
  titleConcept: "a weathered pilgrim's tent standing alone on a high desert ridge at dawn, its flap open and empty, a long road leading from it toward the horizon where a great golden light breaks through the clouds, no figures",
  beats,
})
