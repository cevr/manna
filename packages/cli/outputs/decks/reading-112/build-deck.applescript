set rootPath to "/Users/cvr/Developer/personal/manna/packages/cli/outputs/decks/reading-112"
set savePath to "/Users/cvr/Developer/personal/manna/packages/cli/outputs/decks/reading-112/Reading 112 - Absent from the Body.key"
tell application "Keynote Creator Studio"
  activate
  set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
  save theDoc in POSIX file savePath
  tell theDoc
    set base slide of slide 1 to master slide "Blank"
    tell slide 1
      make new image with properties {file:(POSIX file (rootPath & "/images/title-full.png")), description:"deck:title", position:{0, 0}, width:1920, height:1080}
      set titleItem to make new text item with properties {object text:"Absent from the Body", position:{140, 820}, width:1640, height:100}
      set the font of the object text of titleItem to "Helvetica Neue Light"
      set the size of the object text of titleItem to 66
      set the color of the object text of titleItem to {65535, 65535, 65535}
      set subItem to make new text item with properties {object text:"Bible Readings — Chapter 112 — Understanding Paul's Hope", position:{145, 925}, width:1500, height:60}
      set the font of the object text of subItem to "Helvetica Neue"
      set the size of the object text of subItem to 30
      set the color of the object text of subItem to {65535, 65535, 65535}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-2-corinthians-5-1-full.png")), description:"deck:s01-2-corinthians-5-1 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "First state: clothed with the earthly house. \"Tabernacle\" (skenos): a tent, a temporary dwelling, set against the permanent building of God."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-2-corinthians-5-1-panel.png")), description:"deck:s01-2-corinthians-5-1 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For we know that if our earthly house of this tabernacle were dissolved, we have a building of God, an house not made with hands, eternal in the heavens.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 5:1", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "First state: clothed with the earthly house. \"Tabernacle\" (skenos): a tent, a temporary dwelling, set against the permanent building of God."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-2-corinthians-5-3-full.png")), description:"deck:s02-2-corinthians-5-3 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Second state: unclothed, naked. Death: the body in the grave, the person without conscious existence."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-2-corinthians-5-3-panel.png")), description:"deck:s02-2-corinthians-5-3 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"If so be that being clothed we shall not be found naked.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 5:3", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Second state: unclothed, naked. Death: the body in the grave, the person without conscious existence."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-2-corinthians-5-4-full.png")), description:"deck:s03-2-corinthians-5-4 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Third state: clothed upon. Not unclothed, but clothed upon, that mortality might be swallowed up of life: the resurrection body."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-2-corinthians-5-4-panel.png")), description:"deck:s03-2-corinthians-5-4 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For we that are in this tabernacle do groan, being burdened: not for that we would be unclothed, but clothed upon, that mortality might be swallowed up of life.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 5:4", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Third state: clothed upon. Not unclothed, but clothed upon, that mortality might be swallowed up of life: the resurrection body."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-2-corinthians-5-2-full.png")), description:"deck:s04-2-corinthians-5-2 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "His earnest desire was to be clothed upon: not a naked, disembodied spirit, but the glorified resurrection body."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-2-corinthians-5-2-panel.png")), description:"deck:s04-2-corinthians-5-2 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For in this we groan, earnestly desiring to be clothed upon with our house which is from heaven:", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 5:2", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "His earnest desire was to be clothed upon: not a naked, disembodied spirit, but the glorified resurrection body."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-2-corinthians-5-6-full.png")), description:"deck:s05-2-corinthians-5-6 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "At home in the body, absent from the Lord: a pilgrim on the way, not yet at the destination."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-2-corinthians-5-6-panel.png")), description:"deck:s05-2-corinthians-5-6 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Therefore we are always confident, knowing that, whilst we are at home in the body, we are absent from the Lord:", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 5:6", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "At home in the body, absent from the Lord: a pilgrim on the way, not yet at the destination."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-2-corinthians-5-8-full.png")), description:"deck:s06-2-corinthians-5-8 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Two states set side by side: this groaning mortal life and the glorified life with the Lord. The unclothed state between them Paul expressly does not desire; his hope leaps over death to the resurrection morning."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-2-corinthians-5-8-panel.png")), description:"deck:s06-2-corinthians-5-8 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"We are confident, I say, and willing rather to be absent from the body, and to be present with the Lord.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 5:8", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Two states set side by side: this groaning mortal life and the glorified life with the Lord. The unclothed state between them Paul expressly does not desire; his hope leaps over death to the resurrection morning."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-romans-8-23-full.png")), description:"deck:s07-romans-8-23 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Same longing, same event: we groan (2 Cor 5) / we groan within ourselves; clothed upon / the redemption of our body; mortality swallowed up of life / the adoption."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-romans-8-23-panel.png")), description:"deck:s07-romans-8-23 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And not only they, but ourselves also, which have the firstfruits of the Spirit, even we ourselves groan within ourselves, waiting for the adoption, to wit, the redemption of our body.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Romans 8:23", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Same longing, same event: we groan (2 Cor 5) / we groan within ourselves; clothed upon / the redemption of our body; mortality swallowed up of life / the adoption."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-1-thessalonians-4-16-full.png")), description:"deck:s08-1-thessalonians-4-16 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Scripture is explicit about when: the Lord descends, and the dead in Christ rise."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-1-thessalonians-4-16-panel.png")), description:"deck:s08-1-thessalonians-4-16 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For the Lord himself shall descend from heaven with a shout, with the voice of the archangel, and with the trump of God: and the dead in Christ shall rise first:", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:16", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Scripture is explicit about when: the Lord descends, and the dead in Christ rise."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-1-corinthians-15-51-52-full.png")), description:"deck:s09-1-corinthians-15-51-52 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The house from heaven, the immortal body, is received at the last trump, not at death. A traveller in a worn tent longs not to be homeless, but to reach his father's house."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-1-corinthians-15-51-52-panel.png")), description:"deck:s09-1-corinthians-15-51-52 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Behold, I shew you a mystery; We shall not all sleep, but we shall all be changed, In a moment, in the twinkling of an eye, at the last trump: for the trumpet shall sound, and the dead shall be raised incorruptible, and we shall be changed.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:51-52", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The house from heaven, the immortal body, is received at the last trump, not at death. A traveller in a worn tent longs not to be homeless, but to reach his father's house."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-1-john-5-11-full.png")), description:"deck:s10-1-john-5-11 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Why call death naked, disclaim it, and groan for the body if the soul is already in glory? We \"have\" a building of God as we \"have\" eternal life: by faith now, in His Son, its fulness at the resurrection."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-1-john-5-11-panel.png")), description:"deck:s10-1-john-5-11 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And this is the record, that God hath given to us eternal life, and this life is in his Son.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 John 5:11", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Why call death naked, disclaim it, and groan for the body if the soul is already in glory? We \"have\" a building of God as we \"have\" eternal life: by faith now, in His Son, its fulness at the resurrection."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-job-18-14-full.png")), description:"deck:s11-job-18-14 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Death, the king of terrors: the enemy's final weapon in the great controversy."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-job-18-14-panel.png")), description:"deck:s11-job-18-14 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"His confidence shall be rooted out of his tabernacle, and it shall bring him to the king of terrors.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Job 18:14", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Death, the king of terrors: the enemy's final weapon in the great controversy."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-1-corinthians-15-26-full.png")), description:"deck:s12-1-corinthians-15-26 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God's answer is the resurrection. The grave is neither the end nor the entrance to glory, but a sleep from which Christ alone awakens."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-1-corinthians-15-26-panel.png")), description:"deck:s12-1-corinthians-15-26 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"The last enemy that shall be destroyed is death.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:26", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "God's answer is the resurrection. The grave is neither the end nor the entrance to glory, but a sleep from which Christ alone awakens."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-genesis-3-4-full.png")), description:"deck:s13-genesis-3-4 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The resurrection morning defeats Satan's lie: ye shall not surely die."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-genesis-3-4-panel.png")), description:"deck:s13-genesis-3-4 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the serpent said unto the woman, Ye shall not surely die:", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 3:4", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The resurrection morning defeats Satan's lie: ye shall not surely die."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-exodus-28-29-full.png")), description:"deck:s14-exodus-28-29 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "On the Day of Atonement the high priest bore Israel's names on his heart into the Most Holy Place; the people waited outside, their fate bound up with his ministry."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-exodus-28-29-panel.png")), description:"deck:s14-exodus-28-29 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And Aaron shall bear the names of the children of Israel in the breastplate of judgment upon his heart, when he goeth in unto the holy place, for a memorial before the LORD continually.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Exodus 28:29", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "On the Day of Atonement the high priest bore Israel's names on his heart into the Most Holy Place; the people waited outside, their fate bound up with his ministry."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-hebrews-9-28-full.png")), description:"deck:s15-hebrews-9-28 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "When Christ comes out from the Most Holy Place He appears the second time, and then His waiting people are clothed upon with immortality."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-hebrews-9-28-panel.png")), description:"deck:s15-hebrews-9-28 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"So Christ was once offered to bear the sins of many; and unto them that look for him shall he appear the second time without sin unto salvation.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Hebrews 9:28", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "When Christ comes out from the Most Holy Place He appears the second time, and then His waiting people are clothed upon with immortality."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-1-john-5-12-full.png")), description:"deck:s16-1-john-5-12 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Paul's confidence rested not on inherent immortality, but on union with Christ. This life is in Him, received by faith."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-1-john-5-12-panel.png")), description:"deck:s16-1-john-5-12 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"He that hath the Son hath life; and he that hath not the Son of God hath not life.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 John 5:12", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Paul's confidence rested not on inherent immortality, but on union with Christ. This life is in Him, received by faith."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-ephesians-1-6-full.png")), description:"deck:s17-ephesians-1-6 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Accepted in the beloved: our destiny secured by His merits, not our own. The resurrection body is the final gift of grace."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-ephesians-1-6-panel.png")), description:"deck:s17-ephesians-1-6 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"To the praise of the glory of his grace, wherein he hath made us accepted in the beloved.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ephesians 1:6", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Accepted in the beloved: our destiny secured by His merits, not our own. The resurrection body is the final gift of grace."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-1-thessalonians-4-13-full.png")), description:"deck:s18-1-thessalonians-4-13 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Our loved ones who sleep in Jesus are not suffering, not in purgatory, not hovering as spirits. We shall see them again."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-1-thessalonians-4-13-panel.png")), description:"deck:s18-1-thessalonians-4-13 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But I would not have you to be ignorant, brethren, concerning them which are asleep, that ye sorrow not, even as others which have no hope.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:13", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Our loved ones who sleep in Jesus are not suffering, not in purgatory, not hovering as spirits. We shall see them again."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-titus-2-13-full.png")), description:"deck:s19-titus-2-13 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "We need not fear death, we must not be deceived by spiritualism, we live by faith, and we long for His return."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-titus-2-13-panel.png")), description:"deck:s19-titus-2-13 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Looking for that blessed hope, and the glorious appearing of the great God and our Saviour Jesus Christ;", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Titus 2:13", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "We need not fear death, we must not be deceived by spiritualism, we live by faith, and we long for His return."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-1-thessalonians-4-17-18-full.png")), description:"deck:s20-1-thessalonians-4-17-18 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Is your hope anchored in Christ and His resurrection? Not a ghostly existence, but this mortal putting on immortality."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-1-thessalonians-4-17-18-panel.png")), description:"deck:s20-1-thessalonians-4-17-18 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Then we which are alive and remain shall be caught up together with them in the clouds, to meet the Lord in the air: and so shall we ever be with the Lord. Wherefore comfort one another with these words.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:17-18", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Is your hope anchored in Christ and His resurrection? Not a ghostly existence, but this mortal putting on immortality."
    end tell
    save theDoc
  end tell
  return "Built " & (count of slides of theDoc) & " slides at " & savePath
end tell
