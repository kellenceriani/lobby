# Emotion Images for Round 4 AI Evaluator

This folder should contain 7 PNG emotion images for the Round 4 AI evaluation screen.

## Required Images

You need to add the following 7 PNG files to this directory:

1. **mad.png** - Angry/mad emoji (😠 style)
2. **disappointed.png** - Disappointed/sad emoji (😞 style)
3. **confused.png** - Confused emoji (😕 style)
4. **neutral.png** - Neutral face emoji (😐 style)
5. **happy.png** - Happy/smiling emoji (😊 style)
6. **amazed.png** - Surprised/amazed emoji (😲 style)
7. **mindBlown.png** - Mind-blown emoji (🤯 style)

## Image Specifications

- **Size**: 300×300px (or larger, will be scaled to 80-120px in display)
- **Format**: PNG with transparent background
- **File size**: <50KB each recommended
- **Style**: Cartoon/emoji style reactions

## Where to Get Images

### Option 1: Use Unicode Emoji (Quick Start)
Convert Unicode emojis to PNG using:
- https://emoji.aranja.com/ (download as PNG)
- https://emojipedia.org/ (right-click and save emoji images)

### Option 2: Free Icon Sites
- https://www.flaticon.com/ (search "emoji reactions")
- https://www.freepik.com/ (search "cartoon reaction face")
- https://openmoji.org/ (open-source emoji library)

### Option 3: Create Your Own
Use Canva, Figma, or similar tools to create simple reaction face illustrations.

## Quick Setup (Windows)

1. Download/create the 7 PNG files
2. Rename them exactly as shown above (case-sensitive)
3. Place all 7 files in this `public/img/emotions/` folder
4. Verify all files are present: `dir` (should show all 7 .png files)

## Licensing Note

If using images from free icon sites:
- Check license requirements (most free sites require attribution)
- For personal/educational use, most licenses are permissive
- For commercial deployment, verify license compatibility

## Fallback Plan

If you can't get images immediately, the app will still run but display broken image icons. The evaluation logic will work; only the visuals will be missing.
