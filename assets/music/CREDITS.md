# Music credits

The recorded music in this folder was made for HORDES with **Google Lyria 3** through the
Gemini API in November 2026, then cut into seamless loops and cues and mastered to -16 LUFS
(96 kbps MP3). Google claims no ownership of generated output. This music is AI-generated:
Google embeds an inaudible SynthID watermark in the audio it generates (whether it survives
the mastering is not documented), and the original takes carried a C2PA content-credentials
manifest naming them as AI-generated. The mastered files here are re-encoded and do not carry
that manifest.

The game picks a file by slot (see src/music_manifest.js). File names carry the first 8 hex
digits of the file's sha256, so a changed file gets a new name. The table below is rewritten
by `node tools/music_import.mjs <picks.json>`.

The procedural chiptune synth in src/audio.js is still there: it plays when a slot has no
file, before a file has loaded, and when the player picks MUSIC: CLASSIC SYNTH.

<!-- slots:begin (generated) -->
| slot | file | kind | bpm | loop (s) | source |
|---|---|---|---|---|---|
| title | title.79895b65.mp3 | loop | 85.0056 | 90.347 | title__t3.mp3 |
| run_wilds | run_wilds.a5ad05dc.mp3 | loop | 130.0117 | 59.072 | run_wilds__t1.mp3 |
| run_ash | run_ash.cdee0dc9.mp3 | loop | 129.9777 | 88.631 | run_ash__t2.mp3 |
| run_bone | run_bone.d8ba5678.mp3 | loop | 132.0001 | 58.182 | run_bone__t4.mp3 |
| run_void | run_void.aea37341.mp3 | loop | 130.0126 | 73.839 | run_void__t5.mp3 |
| boss | boss.b9b55021.mp3 | loop | 131.9832 | 58.189 | boss__t2.mp3 |
| maw | maw.b4c08595.mp3 | loop | 130.0117 | 59.072 | maw__t5.mp3 |
| escape | escape.ad7d4497.mp3 | loop | 159.9374 | 12.005 | escape__t2.mp3 |
| victory | victory.97d507d1.mp3 | cue | - | - | victory__t2.mp3 |
| gameover | gameover.18a74cfd.mp3 | cue | - | - | gameover__t3.mp3 |
| portal | portal.358524f8.mp3 | cue | - | - | portal__t3.mp3 |
<!-- slots:end -->
