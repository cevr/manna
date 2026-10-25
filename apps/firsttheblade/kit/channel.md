# First the Blade: the YouTube channel kit

You set the channel up by hand in YouTube Studio, because YouTube's API can't set the picture or the handle. It takes about five minutes. You need these files from this folder:

| File                   | What it is                                                                              | YouTube's limit                    |
| ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| `avatar-800.png`       | The profile picture: the bare wheat on the night, 800 × 800                             | at least 98 × 98, 4 MB or less     |
| `banner-2560x1440.png` | The banner: the morning field, the wheat and the name in small capitals in the centre   | at least 2048 × 1152, 6 MB or less |
| `banner-crops.png`     | What a TV, a computer and a phone show of the banner                                    |                                    |
| `watermark-150.png`    | The video watermark: the bare wheat, 150 × 150, transparent                             | 150 × 150, 1 MB or less            |
| `thumb-robe.png`       | A thumbnail in the house style: the film's painting, its question in wheat on the night | 1280 × 720, 2 MB or less           |
| `thumb-court.png`      | A second thumbnail in the same style                                                    | 1280 × 720, 2 MB or less           |
| `channel.md`           | This page: the text to paste                                                            |                                    |

The kit is drawn by `bun run kit` in `apps/firsttheblade` (the Moonlit wheat palette and lockup D “Small capitals”; the banner's field is the site's repaint). The same run draws the Facebook Page's cover, `facebook-cover-1640x924.png` (the lockup on the field), and what a computer and a phone show of it, `facebook-cover-crops.png`. The site's moonlit night comes from `kit/art/night.webp` by `bun run kit:night`; that source is 1536 px wide, because no larger night exists, so nothing in this kit is drawn from the night at a larger size.

## The house style

- **Colours:** the Moonlit wheat palette: the wheat `#ffefae` on the night `#12354e`. By day the text is the night's ink `#12354e` on the paper `#fff9e0`, and the darker wheat `#7a6813` carries “the” and the wheat.
- **Type:** Newsreader, weight 500, for the name and every headline. The name is in small capitals; “the” is italic weight 400, not in small capitals, in the darker wheat by day and in the wheat on the night.
- **The mark:** the bare wheat, the same blade as the hymnal's. It stands alone: no disc, no paper behind it.
- **Thumbnails:** the film's own painting fills the frame. The night washes in from the left, and the question sits on it in the wheat, in two short lines at most. Every figure keeps its arms in sleeves.

## The text to paste

### Name

`First the Blade`

### Handle

`@firsttheblade`

### Description

Paste everything from the verse down to "each new film." It is 911 characters long, and YouTube allows 1,000.

"For the earth bringeth forth fruit of herself; first the blade, then the ear, after that the full corn in the ear." Mark 4:28

Jesus said the kingdom of God grows like seed in the ground: first the blade, then the ear, then the full corn. Faith grows the same way. First the Blade makes short films and talks about the Bible, starting with the first things and building from there. They are for any Christian, and for anyone who wants to know what the Bible says.

Four series:

• The Path of the Just: what the Bible teaches, starting at the beginning.

• Dwell in the Land: what the Bible says about living on the land.

• Taught of the Lord: what the Bible says about teaching children, for parents and teachers.

• Health and Cure: sunlight, fresh air, water, rest and the other simple things God gave us for our health.

Every verse is quoted from the King James Version. Subscribe to see each new film.

### Keywords

`Bible, Bible study, King James Bible, KJV, Christian, Christian films, animated Bible, cut paper animation, Jesus, Gospel, faith, discipleship, first principles, Christian education, homeschool, Christian parenting, country living, homesteading, natural remedies, Christian health, family worship, Mark 4:28`

### Link

Add the link only once the site is live, because YouTube shows a dead link on the channel page.

- **Title:** `firsttheblade.com`
- **URL:** `https://firsttheblade.com`

### Contact email

Use `hello@firsttheblade.com`.

- First register firsttheblade.com and forward that address to your inbox.
- Until the address works, leave the field empty. YouTube shows it to anyone who asks for business enquiries.

### Playlists

Create these in series order, each one Public.

| Playlist               | Description                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `The Path of the Just` | What the Bible teaches, starting at the beginning. Each film builds on the ones before it, so start with 01. |
| `Dwell in the Land`    | What the Bible says about living on the land, and how a family can start.                                    |
| `Taught of the Lord`   | What the Bible says about teaching children, for parents and teachers.                                       |
| `Health and Cure`      | Sunlight, fresh air, water, rest and the other simple things God gave us for our health.                     |

## The steps in YouTube Studio

Sign in at studio.youtube.com. Check that the picture at the top right is the First the Blade channel. If it isn't, choose **Switch account**.

Newer versions of Studio merge **Branding** and **Basic info** into one **Profile** tab. The fields are the same.

1. **Customisation → Branding**
   - **Picture:** choose **Upload**, then `avatar-800.png`. Leave the circle over the whole square, then choose **Done**.
   - **Banner image:** choose **Upload**, then `banner-2560x1440.png`. In the preview, check that the wheat and the name sit inside **Viewable on all devices**. Then choose **Done**.
   - **Video watermark:** choose **Upload**, then `watermark-150.png`. Set **Display time** to **Entire video**, then choose **Done**.
2. **Customisation → Basic info**
   - **Name:** `First the Blade`
   - **Handle:** `@firsttheblade`
   - **Description:** paste it from above.
   - **Links:** add the website once it's live.
   - **Contact info:** add the email once it works.
   - Choose **Publish** at the top right. You can change the name and the handle only twice in 14 days, so paste them once.
3. **Content → Playlists → New playlist**
   - Create the four playlists above, in series order, each one Public.
4. **Customisation → Layout**
   - **Video spotlight:** choose a channel trailer for people who haven't subscribed. Use The Path of the Just 01 once it's up.
   - Then choose a featured video for returning subscribers: the latest film.
   - **Featured sections:** choose **Add section → Videos**.
   - Then choose **Add section → Single playlist** four times, in series order: The Path of the Just, Dwell in the Land, Taught of the Lord, Health and Cure.
   - Choose **Publish**.
5. **Settings → Channel → Basic info → Keywords**
   - Paste the keywords, then choose **Save**.
6. **Check the channel:** open youtube.com/@firsttheblade on your phone and on a computer.
   - The picture reads as a blade of wheat on the night.
   - On the phone, the banner shows the wheat and the name whole.
   - The watermark sits in the bottom-right corner of a video.
