// Labels printed on the question paper, in Afrikaans and English.
// lang is 'af', 'en' or 'bi' (bilingual: "Afrikaans / English").

export const PL = {
  question:   { af: 'VRAAG', en: 'QUESTION' },
  section:    { af: 'AFDELING', en: 'SECTION' },
  total:      { af: 'TOTAAL', en: 'TOTAL' },
  marks:      { af: 'PUNTE', en: 'MARKS' },
  grade:      { af: 'Graad', en: 'Grade' },
  term:       { af: 'Kwartaal', en: 'Term' },
  form:       { af: 'Vorm van Assessering', en: 'Form of Assessment' },
  task:       { af: 'Taak Nr.', en: 'Task No.' },
  time:       { af: 'Tyd', en: 'Time' },
  name:       { af: 'Naam & Van', en: 'Name and Surname' },
  date:       { af: 'Datum', en: 'Date' },
  educators:  { af: 'Onderwysers', en: 'Educators' },
  educator:   { af: 'Onderwyser', en: 'Educator' },
  moderator:  { af: 'Moderator', en: 'Moderator' },
  colA:       { af: 'KOLOM A', en: 'COLUMN A' },
  colB:       { af: 'KOLOM B', en: 'COLUMN B' },
  answer:     { af: 'ANTWOORD', en: 'ANSWER' },
  true:       { af: 'WAAR', en: 'TRUE' },
  false:      { af: 'ONWAAR', en: 'FALSE' },
  memo:       { af: 'MEMORANDUM', en: 'MEMORANDUM' },
  source:     { af: 'BRON', en: 'SOURCE' },
  text:       { af: 'TEKS', en: 'TEXT' },
  sources:    { af: 'BRONNE', en: 'SOURCES' },
  addendum:   { af: 'BYLAAG', en: 'ADDENDUM' },
  rubric:     { af: 'Rubriek', en: 'Rubric' },
  criteria:   { af: 'Kriteria', en: 'Criteria' },
  points:     { af: 'Punte', en: 'Marks' },
  mark:       { af: 'PUNT', en: 'MARK' },
  analysis:   { af: 'KOGNITIEWE VLAKKE-ANALISE', en: "COGNITIVE LEVELS ANALYSIS (BLOOM'S)" },
  page:       { af: 'Bladsy', en: 'Page' },
  hour:       { af: 'uur', en: 'hour' },
  hours:      { af: 'uur', en: 'hours' },
  min:        { af: 'min', en: 'min' }
};

// Plain text label: "VRAAG" / "QUESTION" / "VRAAG / QUESTION"
export function t(key, lang) {
  const e = PL[key];
  if (!e) return key;
  if (lang === 'bi') return e.af === e.en ? e.af : `${e.af} / ${e.en}`;
  return e[lang] || e.en;
}

// HTML label for header fields: "Datum / <i>Date</i>"
export function th(key, lang) {
  const e = PL[key];
  if (lang === 'bi') return e.af === e.en ? e.af : `${e.af} / <i>${e.en}</i>`;
  return e[lang] || e.en;
}

export const FORMS = [
  { af: 'Toets', en: 'Test' },
  { af: 'Klastoets', en: 'Class Test' },
  { af: 'Kontroletoets', en: 'Controlled Test' },
  { af: 'Eksamen', en: 'Examination' },
  { af: 'Werkopdrag', en: 'Assignment' },
  { af: 'Projek', en: 'Project' },
  { af: 'Ondersoek', en: 'Investigation' },
  { af: 'Mondelinge Assessering', en: 'Oral Assessment' }
];

export function formatDuration(min, lang) {
  min = Number(min) || 0;
  const one = l => {
    const h = Math.floor(min / 60), m = min % 60;
    const hw = l === 'af' ? 'uur' : (h === 1 ? 'hour' : 'hours');
    if (!h) return `${m} min`;
    return m ? `${h} ${hw} ${m} min` : `${h} ${hw}`;
  };
  if (lang === 'bi') return `${one('af')} / ${one('en')}`;
  return one(lang);
}

// Default instructions for each question type.
export const DEFAULT_INSTR = {
  mcq:       { af: 'Kies die korrekte antwoord. Omkring slegs die korrekte LETTER.', en: 'Choose the correct answer. Circle only the correct LETTER.' },
  tf:        { af: 'Dui aan of die volgende stellings WAAR of ONWAAR is.', en: 'Indicate whether the following statements are TRUE or FALSE.' },
  tfcorrect: { af: 'Die volgende stellings is onwaar. Skryf die stellings oor om dit waar te maak.', en: 'The following statements are false. Rewrite the statements to make them true.' },
  short:     { af: 'Beantwoord die volgende vrae.', en: 'Answer the following questions.' },
  paragraph: { af: "Skryf 'n paragraaf oor die volgende onderwerp.", en: 'Write a paragraph on the following topic.' },
  matching:  { af: 'Pas die term in Kolom A by die korrekte beskrywing in Kolom B. Skryf slegs die letter in die antwoordblokkie.', en: 'Match the term in Column A with the correct description in Column B. Write only the letter in the answer block.' },
  fill:      { af: 'Vul die ontbrekende woorde in.', en: 'Fill in the missing words.' }
};

export const TYPE_INFO = {
  mcq:       { label: 'Multiple Choice', icon: 'mcq' },
  tf:        { label: 'True / False', icon: 'tf' },
  short:     { label: 'Short Answer', icon: 'short' },
  paragraph: { label: 'Paragraph', icon: 'paragraph' },
  matching:  { label: 'Matching', icon: 'matching' },
  fill:      { label: 'Fill in the Blank', icon: 'fill' }
};
