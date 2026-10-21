# Wivoza 1.2.6 — App Store Connect text

Only "What's New" changes for this release. Promotional Text, Description,
Keywords, screenshots and the privacy answers all carry over from
listing-1.2.5.md — check them rather than assuming, but nothing in 1.2.6
was meant to change them.

## What's New in This Version (max 4000)

A clearer Lesson Debrief Summary, and a steadier voice coach.

• Your one focus for next lesson now comes first, said plainly, and reads
  the same everywhere it appears.
• New tiles at a glance, including how often you checked for understanding
  and how your pace compared to a typical lesson.
• Lesson titles are shorter and cut at a natural pause.
• When a recording only caught part of the room, the report says so above
  the numbers rather than leaving you to guess.
• Questioning and content notes only claim what the recording can actually
  support.
• Talk It Through: Coach's voice is calmer by default, starts at a steady
  volume, and no longer stops when the room around you is noisy.

## Release checklist

- [ ] 1.2.6 version record created in App Store Connect (1.2.5's train is closed)
- [ ] Build 1.2.6 (152) finished processing and selected
- [ ] What's New pasted from above
- [ ] Screenshots, Description, Promotional Text, Keywords confirmed from 1.2.5
- [ ] App Privacy answers still accurate (no new data collection in 1.2.6)
- [ ] Age rating and Pricing & Availability unchanged
- [ ] Release option chosen: automatic on approval, or manual
- [ ] Confirm the Apple individual-to-organization migration (case
      102975658200) does not need to settle before submitting

## Notes that affect review

Export compliance is declared in the app itself —
`ITSAppUsesNonExemptEncryption = false` in ClassCoach/Info.plist — so App
Store Connect does not ask at upload time and nothing needs answering here.

Microphone and camera usage strings are present and describe why each is
needed, including that audio is never kept. There is no photo-library
usage string and none is needed: the picker used is PHPicker, which runs
out of process and asks for no library permission.
