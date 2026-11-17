/**
 * Reading 111 — Departing and Being with Christ. Content only: the beats. The
 * pipeline lives in skills/bible/scripts/deck (see skills/bible/references/decks.md).
 *
 *   bun build_manifest.ts
 */
import { dirname } from "node:path"
import { type Beat, writeManifest } from "../../../../../skills/bible/scripts/deck/manifest.ts"
import { describe } from "../../../../../skills/bible/scripts/deck/series.ts"

const JESUS = describe("jesus")
const PAUL = describe("paul")

const beats: ReadonlyArray<Beat> = [
  // 1. Paul's earnest dilemma
  { ref: "Philippians 1:21", section: "Paul's Earnest Dilemma", character: "paul", concept: `${PAUL}, chained by the wrist to a Roman soldier in a bare stone prison room, writing on a scroll by the light of a high barred window, his face calm and resolved`, note: "Written from prison. Christ magnified whether by life or by death (v. 20): the gain is for Christ's cause, not merely Paul's comfort." },
  { ref: "Philippians 1:23", section: "Paul's Earnest Dilemma", concept: `${PAUL}, seated alone in a dim Roman prison cell, his chained hands resting on an unfinished scroll, his face lifted toward a shaft of light from a small high window, torn between longing and duty`, note: "\"Strait\" (synechomai): pressed from both sides. \"Depart\" (analyo): loosing a ship from its moorings, striking a tent to move on. The verse does not say when or how he would be with Christ." },
  { ref: "Philippians 1:24", section: "Paul's Earnest Dilemma", character: "paul", concept: `${PAUL} in chains, dictating a letter to a young companion who writes on a scroll, a few believers from Philippi gathered close and listening with love and concern, warm lamplight in a plain stone room`, note: "Paul chose to remain: not because death would be bad for him, but because his ministry was more needful for the church." },

  // 2. When believers meet Christ
  { ref: "1 Thessalonians 4:16-17", section: "When Believers Meet Christ", sourceImage: "../reading-105/images/s34-1-thessalonians-4-16-17.png", note: "Paul's own timeline: Christ descends, the dead in Christ rise first, the living are caught up together with them, and so (houtos, in this manner) shall we ever be with the Lord." },
  { ref: "John 14:3", section: "When Believers Meet Christ", sourceImage: "../reading-110/images/s17-john-14-3.png", note: "Christ names the moment: I will come again, and receive you unto myself." },

  // 3. No lapse of time
  { ref: "Ecclesiastes 9:5", section: "No Lapse of Time", sourceImage: "../reading-105/images/s06-ecclesiastes-9-5-6.png", note: "The dead know not any thing. Whether eight hours or eight hundred years, the sleeper wakes as if it were a moment." },
  { ref: "Psalm 146:4", section: "No Lapse of Time", sourceImage: "../reading-105/images/s07-psalm-146-4.png", note: "In that very day his thoughts perish. Paul's next conscious moment would be the presence of Christ at His coming." },
  { ref: "1 Corinthians 15:52", section: "No Lapse of Time", sourceImage: "../reading-105/images/s36-1-corinthians-15-51-52.png", note: "Two thousand years on earth; for the sleeping saint, the twinkling of an eye. This is why departing is \"far better.\"" },

  // 4. Paul's final testimony
  { ref: "2 Timothy 4:6-7", section: "Paul's Final Testimony", character: "paul", concept: `${PAUL}, older now and in a cold dark Roman dungeon, a worn cloak about his shoulders, writing his last letter by a guttering oil lamp, his face peaceful and ready`, note: "Near the end of his life: the time of my departure is at hand." },
  { ref: "2 Timothy 4:8", section: "Paul's Final Testimony", concept: "a radiant golden crown of righteousness resting on a white cloth upon a stone ledge in a shaft of heavenly light, a great multitude of the redeemed faintly glimpsed in glory beyond, warm golden light", note: "The crown is given \"at that day,\" the day of His appearing, and to Paul together with all them that love His appearing, not before them." },
  { ref: "Revelation 14:13", section: "Paul's Final Testimony", concept: "a quiet hillside burial garden at evening, an old labourer's tools laid down beside a simple sealed tomb, olive trees and long golden shadows, a feeling of deep rest and peace", note: "Death for the believer is rest from labour, not an intermediate state of waiting or uncertainty." },
  { ref: "John 11:11", section: "Paul's Final Testimony", sourceImage: "../reading-105/images/s09-john-11-11.png", note: "Christ's own word for death is sleep, and He goes to awake him." },

  // 5. Satan's ancient lie
  { ref: "Genesis 2:17", section: "Satan's Ancient Lie", concept: "Adam and Eve standing modestly in the garden of Eden before the tree of the knowledge of good and evil, listening reverently as a radiant heavenly light falls on them from above, lush garden and soft morning light, the figures seen from a little distance", note: "God said, Thou shalt surely die." },
  { ref: "Genesis 3:4", section: "Satan's Ancient Lie", sourceImage: "../reading-102/images/s14-gen-3-4-5.png", note: "Satan contradicted: Ye shall not surely die. The lie of the soul's natural immortality opened the door to spiritualism, purgatory and prayers to the dead." },

  // 6. The sanctuary connection
  { ref: "Hebrews 9:28", section: "The Sanctuary Connection", character: "jesus", concept: `${JESUS} coming in great glory upon a bright cloud above the earth, surrounded by a host of shining angels, people on the hills below lifting their faces and hands to him in joy`, note: "Christ ministers in the heavenly sanctuary to prepare a people to meet Him. The reward is given at His appearing, not at death (Rev 22:12; 2 Cor 5:10)." },
  { ref: "Revelation 22:12", section: "The Sanctuary Connection", sourceImage: "../reading-110/images/s19-revelation-22-12.png", note: "My reward is with me: no one receives his final destiny before the verdict is rendered." },

  // 7. Practical application
  { ref: "John 5:28-29", section: "Practical Application", sourceImage: "../reading-105/images/s30-john-5-28-29.png", note: "Our comfort is not that loved ones are looking down, but that they rest securely until Jesus calls them forth." },
  { ref: "1 John 4:1", section: "Practical Application", concept: "a dim candlelit room where a hooded medium leans over a table toward a pale glowing apparition, while in the foreground a grieving widow draws back clutching an open Bible to her breast, its pages catching a clean steady light", note: "If the dead are unconscious, any spirit claiming to be a departed loved one is a demonic deception." },
  { ref: "1 Thessalonians 4:13", section: "Practical Application", sourceImage: "../reading-105/images/s35-1-thessalonians-4-13-14.png", note: "We sorrow, but not as others which have no hope. Our loved ones in Christ are safe in His keeping." },

  // 8. Appeal
  { ref: "Revelation 1:18", section: "Appeal", sourceImage: "../reading-105/images/s57-revelation-1-18.png", note: "He who conquered the grave holds the keys." },
  { ref: "John 11:25", section: "Appeal", sourceImage: "../reading-105/images/s58-john-11-25-26.png", note: "Whether we live until His coming or sleep in death, our next conscious moment of meeting Jesus comes at the same glorious instant." },
  { ref: "1 Thessalonians 4:18", section: "Appeal", concept: "a small group of mourners at an open garden tomb at dawn, an older believer with his arm about a weeping young widow, pointing her gaze to the first light of sunrise breaking over the eastern hills, their faces turning from grief to hope", note: "Comfort one another with these words. Trust Him, live for Him, and look for that blessed hope." },
]

await writeManifest(dirname(import.meta.path), {
  title: "Departing and Being with Christ",
  subtitle: "Bible Readings — Chapter 111",
  deckName: "Reading 111 - Departing and Being with Christ",
  titleConcept: `${PAUL}, seen from a little distance standing at a high barred window of a Roman prison, chained, gazing out toward a dawn sky where the first golden light breaks through the clouds, the room in deep shadow`,
  beats,
})
