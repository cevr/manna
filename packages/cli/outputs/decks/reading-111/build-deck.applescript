set rootPath to "/Users/cvr/Developer/personal/manna/packages/cli/outputs/decks/reading-111"
set savePath to "/Users/cvr/Developer/personal/manna/packages/cli/outputs/decks/reading-111/Reading 111 - Departing and Being with Christ.key"
tell application "Keynote Creator Studio"
  activate
  set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
  save theDoc in POSIX file savePath
  tell theDoc
    set base slide of slide 1 to master slide "Blank"
    tell slide 1
      make new image with properties {file:(POSIX file (rootPath & "/images/title-full.png")), description:"deck:title", position:{0, 0}, width:1920, height:1080}
      set titleItem to make new text item with properties {object text:"Departing and Being with Christ", position:{140, 820}, width:1640, height:100}
      set the font of the object text of titleItem to "Helvetica Neue Light"
      set the size of the object text of titleItem to 66
      set the color of the object text of titleItem to {65535, 65535, 65535}
      set subItem to make new text item with properties {object text:"Bible Readings — Chapter 111", position:{145, 925}, width:1500, height:60}
      set the font of the object text of subItem to "Helvetica Neue"
      set the size of the object text of subItem to 30
      set the color of the object text of subItem to {65535, 65535, 65535}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-philippians-1-21-full.png")), description:"deck:s01-philippians-1-21 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Written from prison. Christ magnified whether by life or by death (v. 20): the gain is for Christ's cause, not merely Paul's comfort."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-philippians-1-21-panel.png")), description:"deck:s01-philippians-1-21 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For to me to live is Christ, and to die is gain.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Philippians 1:21", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Written from prison. Christ magnified whether by life or by death (v. 20): the gain is for Christ's cause, not merely Paul's comfort."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-philippians-1-23-full.png")), description:"deck:s02-philippians-1-23 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "\"Strait\" (synechomai): pressed from both sides. \"Depart\" (analyo): loosing a ship from its moorings, striking a tent to move on. The verse does not say when or how he would be with Christ."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-philippians-1-23-panel.png")), description:"deck:s02-philippians-1-23 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For I am in a strait betwixt two, having a desire to depart, and to be with Christ; which is far better:", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Philippians 1:23", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "\"Strait\" (synechomai): pressed from both sides. \"Depart\" (analyo): loosing a ship from its moorings, striking a tent to move on. The verse does not say when or how he would be with Christ."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-philippians-1-24-full.png")), description:"deck:s03-philippians-1-24 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Paul chose to remain: not because death would be bad for him, but because his ministry was more needful for the church."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-philippians-1-24-panel.png")), description:"deck:s03-philippians-1-24 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Nevertheless to abide in the flesh is more needful for you.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Philippians 1:24", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Paul chose to remain: not because death would be bad for him, but because his ministry was more needful for the church."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-1-thessalonians-4-16-17-full.png")), description:"deck:s04-1-thessalonians-4-16-17 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Paul's own timeline: Christ descends, the dead in Christ rise first, the living are caught up together with them, and so (houtos, in this manner) shall we ever be with the Lord."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-1-thessalonians-4-16-17-panel.png")), description:"deck:s04-1-thessalonians-4-16-17 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For the Lord himself shall descend from heaven with a shout, with the voice of the archangel, and with the trump of God: and the dead in Christ shall rise first: Then we which are alive and remain shall be caught up together with them in the clouds, to meet the Lord in the air: and so shall we ever be with the Lord.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:16-17", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Paul's own timeline: Christ descends, the dead in Christ rise first, the living are caught up together with them, and so (houtos, in this manner) shall we ever be with the Lord."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-john-14-3-full.png")), description:"deck:s05-john-14-3 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ names the moment: I will come again, and receive you unto myself."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-john-14-3-panel.png")), description:"deck:s05-john-14-3 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And if I go and prepare a place for you, I will come again, and receive you unto myself; that where I am, there ye may be also.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 14:3", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Christ names the moment: I will come again, and receive you unto myself."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-ecclesiastes-9-5-full.png")), description:"deck:s06-ecclesiastes-9-5 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The dead know not any thing. Whether eight hours or eight hundred years, the sleeper wakes as if it were a moment."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-ecclesiastes-9-5-panel.png")), description:"deck:s06-ecclesiastes-9-5 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For the living know that they shall die: but the dead know not any thing, neither have they any more a reward; for the memory of them is forgotten.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ecclesiastes 9:5", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The dead know not any thing. Whether eight hours or eight hundred years, the sleeper wakes as if it were a moment."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-psalm-146-4-full.png")), description:"deck:s07-psalm-146-4 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "In that very day his thoughts perish. Paul's next conscious moment would be the presence of Christ at His coming."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-psalm-146-4-panel.png")), description:"deck:s07-psalm-146-4 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"His breath goeth forth, he returneth to his earth; in that very day his thoughts perish.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Psalm 146:4", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "In that very day his thoughts perish. Paul's next conscious moment would be the presence of Christ at His coming."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-1-corinthians-15-52-full.png")), description:"deck:s08-1-corinthians-15-52 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Two thousand years on earth; for the sleeping saint, the twinkling of an eye. This is why departing is \"far better.\""
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-1-corinthians-15-52-panel.png")), description:"deck:s08-1-corinthians-15-52 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"In a moment, in the twinkling of an eye, at the last trump: for the trumpet shall sound, and the dead shall be raised incorruptible, and we shall be changed.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:52", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Two thousand years on earth; for the sleeping saint, the twinkling of an eye. This is why departing is \"far better.\""
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-2-timothy-4-6-7-full.png")), description:"deck:s09-2-timothy-4-6-7 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Near the end of his life: the time of my departure is at hand."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-2-timothy-4-6-7-panel.png")), description:"deck:s09-2-timothy-4-6-7 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For I am now ready to be offered, and the time of my departure is at hand. I have fought a good fight, I have finished my course, I have kept the faith:", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Timothy 4:6-7", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Near the end of his life: the time of my departure is at hand."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-2-timothy-4-8-full.png")), description:"deck:s10-2-timothy-4-8 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The crown is given \"at that day,\" the day of His appearing, and to Paul together with all them that love His appearing, not before them."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-2-timothy-4-8-panel.png")), description:"deck:s10-2-timothy-4-8 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Henceforth there is laid up for me a crown of righteousness, which the Lord, the righteous judge, shall give me at that day: and not to me only, but unto all them also that love his appearing.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Timothy 4:8", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The crown is given \"at that day,\" the day of His appearing, and to Paul together with all them that love His appearing, not before them."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-revelation-14-13-full.png")), description:"deck:s11-revelation-14-13 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Death for the believer is rest from labour, not an intermediate state of waiting or uncertainty."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-revelation-14-13-panel.png")), description:"deck:s11-revelation-14-13 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And I heard a voice from heaven saying unto me, Write, Blessed are the dead which die in the Lord from henceforth: Yea, saith the Spirit, that they may rest from their labours; and their works do follow them.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 14:13", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Death for the believer is rest from labour, not an intermediate state of waiting or uncertainty."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-john-11-11-full.png")), description:"deck:s12-john-11-11 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ's own word for death is sleep, and He goes to awake him."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-john-11-11-panel.png")), description:"deck:s12-john-11-11 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"These things said he: and after that he saith unto them, Our friend Lazarus sleepeth; but I go, that I may awake him out of sleep.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 11:11", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Christ's own word for death is sleep, and He goes to awake him."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-genesis-2-17-full.png")), description:"deck:s13-genesis-2-17 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God said, Thou shalt surely die."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-genesis-2-17-panel.png")), description:"deck:s13-genesis-2-17 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But of the tree of the knowledge of good and evil, thou shalt not eat of it: for in the day that thou eatest thereof thou shalt surely die.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 2:17", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "God said, Thou shalt surely die."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-genesis-3-4-full.png")), description:"deck:s14-genesis-3-4 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Satan contradicted: Ye shall not surely die. The lie of the soul's natural immortality opened the door to spiritualism, purgatory and prayers to the dead."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-genesis-3-4-panel.png")), description:"deck:s14-genesis-3-4 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And the serpent said unto the woman, Ye shall not surely die:", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Genesis 3:4", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Satan contradicted: Ye shall not surely die. The lie of the soul's natural immortality opened the door to spiritualism, purgatory and prayers to the dead."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-hebrews-9-28-full.png")), description:"deck:s15-hebrews-9-28 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ ministers in the heavenly sanctuary to prepare a people to meet Him. The reward is given at His appearing, not at death (Rev 22:12; 2 Cor 5:10)."
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
      set presenter notes to "Christ ministers in the heavenly sanctuary to prepare a people to meet Him. The reward is given at His appearing, not at death (Rev 22:12; 2 Cor 5:10)."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-revelation-22-12-full.png")), description:"deck:s16-revelation-22-12 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "My reward is with me: no one receives his final destiny before the verdict is rendered."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-revelation-22-12-panel.png")), description:"deck:s16-revelation-22-12 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And, behold, I come quickly; and my reward is with me, to give every man according as his work shall be.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 22:12", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "My reward is with me: no one receives his final destiny before the verdict is rendered."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-john-5-28-29-full.png")), description:"deck:s17-john-5-28-29 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Our comfort is not that loved ones are looking down, but that they rest securely until Jesus calls them forth."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-john-5-28-29-panel.png")), description:"deck:s17-john-5-28-29 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Marvel not at this: for the hour is coming, in the which all that are in the graves shall hear his voice, And shall come forth; they that have done good, unto the resurrection of life; and they that have done evil, unto the resurrection of damnation.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 5:28-29", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Our comfort is not that loved ones are looking down, but that they rest securely until Jesus calls them forth."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-1-john-4-1-full.png")), description:"deck:s18-1-john-4-1 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "If the dead are unconscious, any spirit claiming to be a departed loved one is a demonic deception."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-1-john-4-1-panel.png")), description:"deck:s18-1-john-4-1 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Beloved, believe not every spirit, but try the spirits whether they are of God: because many false prophets are gone out into the world.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 John 4:1", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "If the dead are unconscious, any spirit claiming to be a departed loved one is a demonic deception."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-1-thessalonians-4-13-full.png")), description:"deck:s19-1-thessalonians-4-13 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "We sorrow, but not as others which have no hope. Our loved ones in Christ are safe in His keeping."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-1-thessalonians-4-13-panel.png")), description:"deck:s19-1-thessalonians-4-13 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But I would not have you to be ignorant, brethren, concerning them which are asleep, that ye sorrow not, even as others which have no hope.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:13", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "We sorrow, but not as others which have no hope. Our loved ones in Christ are safe in His keeping."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-revelation-1-18-full.png")), description:"deck:s20-revelation-1-18 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "He who conquered the grave holds the keys."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-revelation-1-18-panel.png")), description:"deck:s20-revelation-1-18 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"I am he that liveth, and was dead; and, behold, I am alive for evermore, Amen; and have the keys of hell and of death.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 1:18", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "He who conquered the grave holds the keys."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s21-john-11-25-full.png")), description:"deck:s21-john-11-25 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Whether we live until His coming or sleep in death, our next conscious moment of meeting Jesus comes at the same glorious instant."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s21-john-11-25-panel.png")), description:"deck:s21-john-11-25 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Jesus said unto her, I am the resurrection, and the life: he that believeth in me, though he were dead, yet shall he live:", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 11:25", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Whether we live until His coming or sleep in death, our next conscious moment of meeting Jesus comes at the same glorious instant."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s22-1-thessalonians-4-18-full.png")), description:"deck:s22-1-thessalonians-4-18 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Comfort one another with these words. Trust Him, live for Him, and look for that blessed hope."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s22-1-thessalonians-4-18-panel.png")), description:"deck:s22-1-thessalonians-4-18 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Wherefore comfort one another with these words.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Thessalonians 4:18", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Comfort one another with these words. Trust Him, live for Him, and look for that blessed hope."
    end tell
    save theDoc
  end tell
  return "Built " & (count of slides of theDoc) & " slides at " & savePath
end tell
