# Kathu Primary School Paper Builder

A web app for compiling test and exam papers with a live **Bloom's taxonomy** check.
Teachers sign up with their **@kathuonline.com** email, build papers from question
blocks, and print the paper, memorandum and a Bloom's analysis grid as a PDF.

- **Hosting:** GitHub Pages (free, static — no build step)
- **Accounts & data:** Firebase Authentication + Cloud Firestore (free Spark plan)
- **Demo mode:** until you add your Firebase settings, the app runs entirely in the browser so you can try it out

---

## What it does

| Area | Features |
|---|---|
| **Create Paper** | Multiple choice, True/False (or "rewrite the false statement"), Short answer, Paragraph (with marking rubric), Matching (Column A/B, auto-shuffled, distractors), Fill in the blank, Section headings, Passages/Sources, Images. Edit, drag-to-move (or ↑/↓), duplicate and delete. |
| **Bloom's balance** | Every item gets a Bloom's level (1 Remember → 6 Create). The toolbar shows lower/middle/higher order % against the subject's target, how many marks to add or remove, and marks without a level. The app suggests a level from the question's command word (English and Afrikaans verbs). |
| **Printing** | A4 layout modelled on the school's existing tests: header box with emblem, subject, grade, mark circle, form of assessment, task no., time, date, educators and moderator; `VRAAG 1` headings, `(2)` item marks, `[12]` question totals, answer lines, `TOTAAL` line. Language per paper: **Afrikaans**, **English** or **Bilingual (Afr / Eng)**. Also prints a **memorandum** and a **Bloom's analysis grid** with sign-off lines for the HOD/moderator. Use *Print → Save as PDF*. |
| **Saved Papers** | Your papers and all school papers (read-only for colleagues — use *Copy* to adapt one). Status badge shows whether each paper is balanced. |
| **Question Bank** | Save any question to a shared bank; filter by subject, grade, type and Bloom's order; insert into any paper. |
| **My Templates** | Save a paper as a reusable template (shared with all staff) and start new papers from it. |
| **Auto Compile** | Paste study material and/or add PDF, Word or photos of textbook pages. Choose subject, grade, language, total marks and question types (optionally **source-based**). The app builds a complete paper — questions, memo answers, rubrics and Bloom's levels — aimed at the subject's lower/middle/higher targets, and opens it in the editor for you to check. |
| **Import Paper** | Upload an existing paper (PDF, Word .docx, or photos/scans of the pages). Choose: **Improve the look** (same wording, school layout), **Improve the look + tidy the language**, or **Rebalance Bloom's levels**. Pictures and maps are cut out of the pages automatically. Then edit it, save & print it, or view its Bloom's analysis. |
| **Sources** | Source blocks for source-based tests: auto-lettered **BRON A / SOURCE A** (or TEKS A / TEXT A), text extracts, **tables** (paste straight from Excel/Word), pictures/maps/cartoons, a reference line, and questions linked to a source (“Refer to SOURCE A and answer…” is printed for you). Optionally print all sources in a separate **addendum / source booklet (BYLAAG)**. Sources can be saved to the question bank. |
| **Settings** | Your name/title and defaults for new papers. Admins set the Bloom's % per subject, how the 6 levels group into lower/middle/higher, and the tolerance. |

### Default Bloom's targets (lower / middle / higher)

These are **starting values only** — an admin should check them against each subject's CAPS
assessment guidelines and the school's policy, then adjust them in **Settings**.

| Subject | Lower | Middle | Higher |
|---|---|---|---|
| Home Languages & First Additional Languages (Eng/Afr) | 40 | 40 | 20 |
| Mathematics | 25 | 45 | 30 |
| Natural Sciences and Technology / Natural Sciences | 50 | 35 | 15 |
| Social Sciences: History / Geography, EMS | 30 | 50 | 20 |
| Technology, Life Skills, Life Orientation, Creative Arts | 40 | 40 | 20 |

Default grouping: **Lower** = Remember, Understand · **Middle** = Apply, Analyse · **Higher** = Evaluate, Create. Tolerance ±5 percentage points.

### AI vs. basic mode

Auto Compile and Import work in two ways:

- **AI mode (recommended)** — uses Google **Gemini** through **Firebase AI Logic** (free tier, no API key in the code). Writes much better questions, reads scanned papers and photos, cuts out pictures, tidies language and can rebalance Bloom's levels. Uploaded files and material are sent to Google to be processed — don't upload learners' personal information.
- **Basic mode** (automatic fallback, e.g. in demo mode) — runs only in the browser. Builds simpler questions (matching, multiple choice, true/false, fill-in, “compare”, “do you agree…”, paragraph) from typed text, Word files and text-based PDFs, and imports papers that use “VRAAG 1 / QUESTION 1”, “1.1” and “(2)” marks. It cannot read photos or scans.

Always review a generated or imported paper before using it.

---

## Set-up (about 20 minutes, once)

### 1. Put the code on GitHub

1. Sign in at <https://github.com> (create a free account if needed).
2. Click **+ → New repository**. Name it e.g. `paper-builder`, choose **Public**, click **Create repository**.
   *(GitHub Pages on a free account needs a public repository. The code contains no passwords — all data is protected by Firebase rules.)*
3. Unzip `kathu-paper-builder.zip`. On the new repository page click **uploading an existing file** and drag in **the contents** of the unzipped folder (`index.html`, `css`, `js`, `assets`, `.nojekyll`, `firestore.rules`, `README.md`) so that `index.html` sits at the top level of the repository. **Commit changes**.
4. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
5. After a minute your app is live at `https://<your-github-username>.github.io/paper-builder/` — it will open in **demo mode**.

### 2. Create the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with a Google account the school controls.
2. **Add project** → name it `kathu-paper-builder` → you can switch off Google Analytics → **Create project**.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
4. **Authentication → Settings → Authorized domains → Add domain:** `<your-github-username>.github.io`
5. **Build → Firestore Database → Create database** → choose a location (e.g. `africa-south1` Johannesburg) → **Start in production mode** → **Create**.
6. **Firestore → Rules:** delete what's there, paste the contents of `firestore.rules`, replace `admin@kathuonline.com` with the real admin email(s), then **Publish**.
7. **Project settings (⚙) → General → Your apps → Web (`</>`)** → nickname `paper-builder` → **Register app**. Copy the `firebaseConfig` values shown.

### 3. Connect the app to Firebase

Edit **`js/config.js`** on GitHub (open the file → pencil icon):

```js
export const FIREBASE_CONFIG = {
  apiKey: "AIza…",
  authDomain: "kathu-paper-builder.firebaseapp.com",
  projectId: "kathu-paper-builder",
  storageBucket: "kathu-paper-builder.appspot.com",
  messagingSenderId: "…",
  appId: "1:…:web:…"
};

export const ADMIN_EMAILS = [
  "your.name@kathuonline.com"     // same list as in firestore.rules
];
```

Commit the change. In a minute the live site switches from demo mode to real accounts.
(The Firebase web `apiKey` is not a secret — it only identifies the project. Security comes from the Firestore rules.)

### 4. Switch on the AI features (about 10 minutes)

1. Firebase Console → **AI Services → AI Logic → Get started** → choose **Gemini Developer API** (free; no Blaze plan needed) → finish the steps.
2. Firebase requires **App Check** for AI Logic. Create a reCAPTCHA key (free on the Spark plan) in Google Cloud **Fraud Defense**:
   <https://console.cloud.google.com/security/recaptcha?project=kathu-paper-builder> → enable the API if asked → **Create key** → type **Website**, domain **`avs-solutions-official.github.io`**, leave **“Use checkbox challenge” unticked** → **Create**. Copy the key ID.
3. Firebase Console → **Security → App Check → Apps** → your web app → **reCAPTCHA Enterprise** → paste the key → Save.
4. In `js/config.js` set:

   ```js
   export const AI = {
     enabled: true,
     model: "gemini-3.5-flash",
     recaptchaSiteKey: "6L…your key…",
     recaptchaType: "enterprise",
     appCheckDebug: false
   };
   ```
5. Commit. Open **Auto Compile** — the purple banner should say “AI is on”.

If Google retires the model, change `model` to a current one listed at <https://firebase.google.com/docs/ai-logic/models> (a “Flash” model that doesn't need the Blaze plan). The free tier has a daily limit; if many teachers use it heavily you may see “quota used up — try again in a minute”.

### 5. First sign-in

1. Open the site and **Create an account** with a `@kathuonline.com` address.
2. Click the link in the verification email (check spam), then **I've verified my email**.
3. The admin opens **Settings** and confirms the Bloom's percentages per subject.

---

## How the @kathuonline.com rule is enforced

1. The sign-up and sign-in forms reject any other domain.
2. Firestore rules only allow reading or writing data when the signed-in user's email ends in
   `@kathuonline.com` **and** has been verified via the emailed link — so even an account created
   some other way cannot see or change any papers.

## Updating the app later

Edit or upload the changed files in the GitHub repository; GitHub Pages republishes automatically.
Papers, templates and the question bank live in Firestore and are not affected.

## Notes & limits

- **Updating an existing site:** upload the changed files over the old ones (GitHub → Add file → Upload files). For this update that is all of `js/`, `css/` and `README.md`.
- Images are resized in the browser and stored inside the paper. A single paper can be up to about 1 MB (roughly 6–8 photos/maps). Use cropped images where possible.
- Printing uses the browser's print dialog. In Chrome/Edge choose **Destination: Save as PDF**, **Paper: A4**, and untick *Headers and footers* for the cleanest result.
- Drag & drop works with a mouse; on tablets and phones use the ↑ / ↓ buttons.

## File overview

```
index.html            app entry
css/app.css           app design (navy & gold, matches the mock-up)
css/paper.css         A4 print layout of the question paper, memo and analysis
js/config.js          ← the only file you need to edit (Firebase, domain, admins)
js/app.js             sign-in, navigation, dashboard, saved papers, templates, bank, settings, print
js/editor.js          paper editor, question toolbar, Bloom's balance, sources
js/auto.js            Auto Compile and Import Paper pages
js/ai.js              Gemini via Firebase AI Logic
js/generate.js        AI prompts, AI-answer → paper conversion, basic generator & importer
js/extract.js         reading Word, PDF and photos in the browser
js/render.js          printable paper / memorandum / Bloom's grid
js/bloom.js           Bloom's levels, verb lists, subject targets, analysis
js/i18n.js            Afrikaans / English labels for printed papers
js/store.js           Firebase and demo-mode storage
js/model.js           paper / question data structures
js/ui.js              icons, dialogs, notifications
firestore.rules       database security rules (paste into Firebase)
assets/emblem.png     school emblem
```
