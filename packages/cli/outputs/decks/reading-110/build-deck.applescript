set rootPath to "/Users/cvr/Developer/personal/manna/packages/cli/outputs/decks/reading-110"
set savePath to "/Users/cvr/Developer/personal/manna/packages/cli/outputs/decks/reading-110/Reading 110 - The Thief on the Cross.key"
tell application "Keynote Creator Studio"
  activate
  set theDoc to make new document with properties {document theme:theme "Basic Black", width:1920, height:1080}
  save theDoc in POSIX file savePath
  tell theDoc
    set base slide of slide 1 to master slide "Blank"
    tell slide 1
      make new image with properties {file:(POSIX file (rootPath & "/images/title-full.png")), description:"deck:title", position:{0, 0}, width:1920, height:1080}
      set titleItem to make new text item with properties {object text:"The Thief on the Cross", position:{140, 820}, width:1640, height:100}
      set the font of the object text of titleItem to "Helvetica Neue Light"
      set the size of the object text of titleItem to 66
      set the color of the object text of titleItem to {65535, 65535, 65535}
      set subItem to make new text item with properties {object text:"Bible Readings — Chapter 110 — A Scripture Narrative", position:{145, 925}, width:1500, height:60}
      set the font of the object text of subItem to "Helvetica Neue"
      set the size of the object text of subItem to 30
      set the color of the object text of subItem to {65535, 65535, 65535}
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-luke-23-32-33-full.png")), description:"deck:s01-luke-23-32-33 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "\"On either side one, and Jesus in the midst.\" DA 751.4: His place between the thieves was to indicate that He was the greatest criminal of the three. Isaiah 53:12 fulfilled: numbered with the transgressors."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s01-luke-23-32-33-panel.png")), description:"deck:s01-luke-23-32-33 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And there were also two other, malefactors, led with him to be put to death. And when they were come to the place, which is called Calvary, there they crucified him, and the malefactors, one on the right hand, and the other on the left.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 23:32-33", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "\"On either side one, and Jesus in the midst.\" DA 751.4: His place between the thieves was to indicate that He was the greatest criminal of the three. Isaiah 53:12 fulfilled: numbered with the transgressors."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-luke-23-39-full.png")), description:"deck:s02-luke-23-39 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Both men at first railed on Him (Matt 27:44). DA 749.3: one under his suffering only became more desperate and defiant."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s02-luke-23-39-panel.png")), description:"deck:s02-luke-23-39 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And one of the malefactors which were hanged railed on him, saying, If thou be Christ, save thyself and us.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 23:39", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Both men at first railed on Him (Matt 27:44). DA 749.3: one under his suffering only became more desperate and defiant."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-luke-23-40-41-full.png")), description:"deck:s03-luke-23-40-41 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "\"We indeed justly ... but this man hath done nothing amiss.\" He owns his guilt and confesses Christ's innocence in one breath. DA 749.3: he had seen and heard Jesus, and had been convicted by His teaching."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s03-luke-23-40-41-panel.png")), description:"deck:s03-luke-23-40-41 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"But the other answering rebuked him, saying, Dost not thou fear God, seeing thou art in the same condemnation? And we indeed justly; for we receive the due reward of our deeds: but this man hath done nothing amiss.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 23:40-41", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "\"We indeed justly ... but this man hath done nothing amiss.\" He owns his guilt and confesses Christ's innocence in one breath. DA 749.3: he had seen and heard Jesus, and had been convicted by His teaching."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-luke-23-42-full.png")), description:"deck:s04-luke-23-42 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "He asks to be remembered when Christ comes into His kingdom, a day yet ahead. DA 750.1: the helpless, dying soul casts himself upon a dying Saviour."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s04-luke-23-42-panel.png")), description:"deck:s04-luke-23-42 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he said unto Jesus, Lord, remember me when thou comest into thy kingdom.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 23:42", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "He asks to be remembered when Christ comes into His kingdom, a day yet ahead. DA 750.1: the helpless, dying soul casts himself upon a dying Saviour."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-luke-23-43-full.png")), description:"deck:s05-luke-23-43 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "DA 750.2 renders it: \"Verily I say unto thee today, Thou shalt be with Me in paradise.\" DA 751.2: the dark cloud that seemed to enshroud the cross was pierced by a bright and living light."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s05-luke-23-43-panel.png")), description:"deck:s05-luke-23-43 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And Jesus said unto him, Verily I say unto thee, To day shalt thou be with me in paradise.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 23:43", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "DA 750.2 renders it: \"Verily I say unto thee today, Thou shalt be with Me in paradise.\" DA 751.2: the dark cloud that seemed to enshroud the cross was pierced by a bright and living light."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-luke-19-12-full.png")), description:"deck:s06-luke-19-12 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ's own parable: the kingdom is received far away, and the King returns with it. The thief asked for that day."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s06-luke-19-12-panel.png")), description:"deck:s06-luke-19-12 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"He said therefore, A certain nobleman went into a far country to receive for himself a kingdom, and to return.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 19:12", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Christ's own parable: the kingdom is received far away, and the King returns with it. The thief asked for that day."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-matthew-27-29-full.png")), description:"deck:s07-matthew-27-29 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The world crowned Him with thorns. Every sign said His kingdom had failed."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s07-matthew-27-29-panel.png")), description:"deck:s07-matthew-27-29 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And when they had platted a crown of thorns, they put it upon his head, and a reed in his right hand: and they bowed the knee before him, and mocked him, saying, Hail, King of the Jews!", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 27:29", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The world crowned Him with thorns. Every sign said His kingdom had failed."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-matthew-27-42-full.png")), description:"deck:s08-matthew-27-42 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "\"Himself he cannot save.\" DA 750.3: while the leading Jews deny Him, and even the disciples doubt His divinity, the poor thief calls Jesus Lord."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s08-matthew-27-42-panel.png")), description:"deck:s08-matthew-27-42 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"He saved others; himself he cannot save. If he be the King of Israel, let him now come down from the cross, and we will believe him.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Matthew 27:42", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "\"Himself he cannot save.\" DA 750.3: while the leading Jews deny Him, and even the disciples doubt His divinity, the poor thief calls Jesus Lord."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-revelation-2-7-full.png")), description:"deck:s09-revelation-2-7 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Scripture defines Paradise for us: where the tree of life grows."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s09-revelation-2-7-panel.png")), description:"deck:s09-revelation-2-7 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"He that hath an ear, let him hear what the Spirit saith unto the churches; To him that overcometh will I give to eat of the tree of life, which is in the midst of the paradise of God.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 2:7", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Scripture defines Paradise for us: where the tree of life grows."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-revelation-22-1-2-full.png")), description:"deck:s10-revelation-22-1-2 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The tree of life grows by the river that proceeds from the throne of God. Paradise is where the Father's throne is."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s10-revelation-22-1-2-panel.png")), description:"deck:s10-revelation-22-1-2 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he shewed me a pure river of water of life, clear as crystal, proceeding out of the throne of God and of the Lamb. In the midst of the street of it, and on either side of the river, was there the tree of life, which bare twelve manner of fruits, and yielded her fruit every month: and the leaves of the tree were for the healing of the nations.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 22:1-2", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The tree of life grows by the river that proceeds from the throne of God. Paradise is where the Father's throne is."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-2-corinthians-12-2-4-full.png")), description:"deck:s11-2-corinthians-12-2-4 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The third heaven and paradise are the same place in Paul's account: caught up, not down."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s11-2-corinthians-12-2-4-panel.png")), description:"deck:s11-2-corinthians-12-2-4 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"I knew a man in Christ above fourteen years ago, (whether in the body, I cannot tell; or whether out of the body, I cannot tell: God knoweth;) such an one caught up to the third heaven. ... How that he was caught up into paradise, and heard unspeakable words, which it is not lawful for a man to utter.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"2 Corinthians 12:2, 4", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The third heaven and paradise are the same place in Paul's account: caught up, not down."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-1-corinthians-15-3-4-full.png")), description:"deck:s12-1-corinthians-15-3-4 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Died, buried, rose the third day. Friday night and the Sabbath He lay in Joseph's tomb."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s12-1-corinthians-15-3-4-panel.png")), description:"deck:s12-1-corinthians-15-3-4 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For I delivered unto you first of all that which I also received, how that Christ died for our sins according to the scriptures; And that he was buried, and that he rose again the third day according to the scriptures:", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"1 Corinthians 15:3-4", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "Died, buried, rose the third day. Friday night and the Sabbath He lay in Joseph's tomb."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-john-20-17-full.png")), description:"deck:s13-john-20-17 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Sunday morning: \"I am not yet ascended to my Father.\" DA 751.3: He Himself did not go that day to Paradise. He slept in the tomb."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s13-john-20-17-panel.png")), description:"deck:s13-john-20-17 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Jesus saith unto her, Touch me not; for I am not yet ascended to my Father: but go to my brethren, and say unto them, I ascend unto my Father, and your Father; and to my God, and your God.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"John 20:17", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "Sunday morning: \"I am not yet ascended to my Father.\" DA 751.3: He Himself did not go that day to Paradise. He slept in the tomb."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-titus-1-2-full.png")), description:"deck:s14-titus-1-2 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "God cannot lie. Christ's words to the thief and to Mary stand together, once the comma stands where He put the emphasis."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s14-titus-1-2-panel.png")), description:"deck:s14-titus-1-2 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"In hope of eternal life, which God, that cannot lie, promised before the world began;", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Titus 1:2", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "God cannot lie. Christ's words to the thief and to Mary stand together, once the comma stands where He put the emphasis."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-zechariah-9-12-full.png")), description:"deck:s15-zechariah-9-12 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "\"Even to day do I declare\": the day the promise is spoken, not the day it is kept. DA 751.3: on the day of the crucifixion, the day of apparent defeat and darkness, the promise was given."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s15-zechariah-9-12-panel.png")), description:"deck:s15-zechariah-9-12 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"Turn you to the strong hold, ye prisoners of hope: even to day do I declare that I will render double unto thee;", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Zechariah 9:12", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "\"Even to day do I declare\": the day the promise is spoken, not the day it is kept. DA 751.3: on the day of the crucifixion, the day of apparent defeat and darkness, the promise was given."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-deuteronomy-30-19-full.png")), description:"deck:s16-deuteronomy-30-19 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "\"This day\" again marks the day of speaking. Moses calls heaven and earth to witness the words spoken now."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s16-deuteronomy-30-19-panel.png")), description:"deck:s16-deuteronomy-30-19 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"I call heaven and earth to record this day against you, that I have set before you life and death, blessing and cursing: therefore choose life, that both thou and thy seed may live:", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 40
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Deuteronomy 30:19", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "\"This day\" again marks the day of speaking. Moses calls heaven and earth to witness the words spoken now."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-john-14-3-full.png")), description:"deck:s17-john-14-3 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "\"I will come again, and receive you.\" The meeting is fixed at His coming, not at our death."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s17-john-14-3-panel.png")), description:"deck:s17-john-14-3 panel", position:{1037, 75}, width:750, height:903}
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
      set presenter notes to "\"I will come again, and receive you.\" The meeting is fixed at His coming, not at our death."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-1-thessalonians-4-16-17-full.png")), description:"deck:s18-1-thessalonians-4-16-17 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The dead in Christ rise first. The thief is among them, and so shall he ever be with the Lord."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s18-1-thessalonians-4-16-17-panel.png")), description:"deck:s18-1-thessalonians-4-16-17 panel", position:{133, 75}, width:750, height:903}
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
      set presenter notes to "The dead in Christ rise first. The thief is among them, and so shall he ever be with the Lord."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-revelation-22-12-full.png")), description:"deck:s19-revelation-22-12 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The reward comes with Him. The thief's paradise and ours arrive on the same day."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s19-revelation-22-12-panel.png")), description:"deck:s19-revelation-22-12 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And, behold, I come quickly; and my reward is with me, to give every man according as his work shall be.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Revelation 22:12", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "The reward comes with Him. The thief's paradise and ours arrive on the same day."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-ecclesiastes-9-5-6-full.png")), description:"deck:s20-ecclesiastes-9-5-6 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The dead know not any thing. The thief has had no waiting to endure."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s20-ecclesiastes-9-5-6-panel.png")), description:"deck:s20-ecclesiastes-9-5-6 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For the living know that they shall die: but the dead know not any thing, neither have they any more a reward; for the memory of them is forgotten. Also their love, and their hatred, and their envy, is now perished; neither have they any more a portion for ever in any thing that is done under the sun.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 34
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ecclesiastes 9:5-6", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The dead know not any thing. The thief has had no waiting to endure."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s21-psalm-146-4-full.png")), description:"deck:s21-psalm-146-4 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "In that very day his thoughts perish. His next thought will be the voice of Christ calling him."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s21-psalm-146-4-panel.png")), description:"deck:s21-psalm-146-4 panel", position:{1037, 75}, width:750, height:903}
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
      set presenter notes to "In that very day his thoughts perish. His next thought will be the voice of Christ calling him."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s22-john-11-11-full.png")), description:"deck:s22-john-11-11 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "Christ's own word for death is sleep, and His errand is to awake. To the thief, paradise will seem to come that very day."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s22-john-11-11-panel.png")), description:"deck:s22-john-11-11 panel", position:{133, 75}, width:750, height:903}
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
      set presenter notes to "Christ's own word for death is sleep, and His errand is to awake. To the thief, paradise will seem to come that very day."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s23-ephesians-2-8-9-full.png")), description:"deck:s23-ephesians-2-8-9 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "No baptism, no works, no restitution possible. Only faith, and Christ received him fully. DA 751.2: it is His royal right to save unto the uttermost all who come unto God by Him."
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s23-ephesians-2-8-9-panel.png")), description:"deck:s23-ephesians-2-8-9 panel", position:{1037, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"For by grace are ye saved through faith; and that not of yourselves: it is the gift of God: Not of works, lest any man should boast.", position:{131, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Ephesians 2:8-9", position:{131, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {131, verseY}
      set position of refItem to {131, verseY + verseHeight + 40}
      set presenter notes to "No baptism, no works, no restitution possible. Only faith, and Christ received him fully. DA 751.2: it is His royal right to save unto the uttermost all who come unto God by Him."
    end tell
    set fb to make new slide at end with properties {base slide:master slide "Blank"}
    tell fb
      make new image with properties {file:(POSIX file (rootPath & "/images/s24-luke-23-42-full.png")), description:"deck:s24-luke-23-42 full", position:{0, 0}, width:1920, height:1080}
      set presenter notes to "The same Saviour hears the same prayer today. \"Lord, remember me when thou comest into thy kingdom.\""
    end tell
    set sp to make new slide at end with properties {base slide:master slide "Blank"}
    tell sp
      make new image with properties {file:(POSIX file (rootPath & "/images/s24-luke-23-42-panel.png")), description:"deck:s24-luke-23-42 panel", position:{133, 75}, width:750, height:903}
      set verseItem to make new text item with properties {object text:"And he said unto Jesus, Lord, remember me when thou comest into thy kingdom.", position:{984, 300}, width:805}
      set the font of the object text of verseItem to "Helvetica Neue Light"
      set the size of the object text of verseItem to 48
      set the color of the object text of verseItem to {65535, 65535, 65535}
      set refItem to make new text item with properties {object text:"Luke 23:42", position:{984, 700}, width:805, height:55}
      set the font of the object text of refItem to "Helvetica Neue"
      set the size of the object text of refItem to 30
      set the color of the object text of refItem to {39321, 39321, 39321}
      set verseHeight to height of verseItem
      set verseY to (1080 - verseHeight - 95) div 2
      set position of verseItem to {984, verseY}
      set position of refItem to {984, verseY + verseHeight + 40}
      set presenter notes to "The same Saviour hears the same prayer today. \"Lord, remember me when thou comest into thy kingdom.\""
    end tell
    save theDoc
  end tell
  return "Built " & (count of slides of theDoc) & " slides at " & savePath
end tell
