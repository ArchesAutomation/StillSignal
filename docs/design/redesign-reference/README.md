# StillSignal: three local desktop directions

Open `index.html` to compare the designs, or open any numbered HTML file directly. Each numbered file contains all its CSS and JavaScript and works without a build step or external assets. Local browser storage is separate for each direction. The review date is fixed at 10 November 2026.

1. **The reading room:** warm paper, lavender and serif typography; sidebar navigation; card-based library and adjacent preview.
2. **The quiet hours:** deep plum sanctuary; pink and sage accents; immersive practice dialog; sidebar navigation.
3. **Your daily space:** sage workspace with lilac welcome; horizontal navigation; list-based library and larger preview.

## Try it

Home → Stillness → inspect a sequence or individual piece → Add to my day → choose Preparation or Done → leave future saving unchecked → Add for today. Undo is offered in the confirmation.

Open the destination, begin the experience, pause/resume or skip steps, then optionally write a reflection. Save to the local journal and inspect the moment. Reload to confirm local persistence. Try two Big 4 filters together, search, customise today's wording, the glass toggle, weekly reflection, and dashboard timeline visibility.

The initial sample includes one Preparation and one Done sequence to make the design visible immediately. New additions are for today by default. Saved future routine choices can be inspected in “Make this space yours”; advancing to a new date is outside this prototype.

## Relationship to the current application

These are standalone interaction prototypes, not a replacement production app or a migration. GitHub main at the reviewed baseline was `d6aa146647e289a8acba104e580e36b45da3d4f3` (PR 77). Signed-in Command Center, Stillness and Daily journal were inspected read-only in this chat.

The design carries forward the existing daily reference, optional check-in, personal Stillness, built-in awareness practices, session timeline, journal moments/evidence, floating capture, weekly reflection and dashboard customisation concepts. Outcome controls live only in Done. Setup is separate from daily preparation. The four support themes are multi-select.

No production source, saved layouts, application providers, shark renderer, Cloudflare deployment or Supabase data was changed. Nick's glass code remains in the original repository. The prototype glass toggle is a lightweight CSS approximation, not his optical renderer.

## Explicit simulation boundaries

- All records are synthetic. Journal text and choices save only in this browser under `stillsignal-design-*` keys.
- Voice is a clearly labelled interaction demo with a sample transcript; it never activates the microphone or records/transcribes audio.
- Image selection shows a filename and attachment marker. Image bytes are not retained or uploaded. Production screenshot/recording behaviour remains in the existing application.
- The timeline is illustrative, not physiological or trading data. It establishes no emotional inference.
- Dashboard editing demonstrates timeline visibility only; the existing drag/resize/dashboard persistence system is not replaced.
- Original sample support copy is a design draft for review, not copied product-library content.

## Editing and checks

Edit `app.js` for shared behaviour/content and `style.css` for the three visual treatments. Run `node build.mjs` to regenerate the numbered standalone HTML files. `index.html` is the comparison page.

Local branch: `codex/local-design-prototypes`, in this separate artifact repository. No remote, push, PR or deployment.

Checks performed:

- `node outputs/stillsignal-designs/build.mjs`: generated all three HTMLs.
- `node --check outputs/stillsignal-designs/app.js`: passed.
- `git -C outputs/stillsignal-designs diff --cached --check`: passed after staging the final source revision.
- Browser: all three Home designs rendered; card and list library layouts inspected. Library → add whole sequence to Done → Undo passed. Preparation → Begin → skip → continue → finish → write → save → Journal passed. Multi-select Impulsiveness + Fear passed. Individual-piece preview → add → save for future → reload → Preparation retained both entries. Additional glass, custom wording and Done controls checked in the browser; limitations above remain simulations.

No production repository test suite was run because no production code was changed. Review the HTML interactions and visual direction before porting selected behaviour into the application. A later implementation must preserve pinned run definitions and legacy profiles, validate shared and generated edge schemas together, and run the repository's local checks before any push.
