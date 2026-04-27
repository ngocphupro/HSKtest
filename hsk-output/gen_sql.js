// Backward-compatible entry point.
// Old gen_sql.js only inserted (chinese, pinyin, meaning), which caused
// short_sentences.hsk_level to fall back to DEFAULT 1 and made HSK4 sentences
// invisible in level-based screens.
//
// Use the unified importer that reads HSK1..HSK4 CSV and writes:
//   - vocab with hsk_level/category
//   - short_sentences with hsk_level/category
// into FINAL_HSK_IMPORT.sql.
require('./convert_hsk');
