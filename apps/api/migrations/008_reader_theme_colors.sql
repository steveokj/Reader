PRAGMA foreign_keys = ON;

ALTER TABLE reader_settings ADD COLUMN theme_light_ink TEXT NOT NULL DEFAULT '#1f1c16';
ALTER TABLE reader_settings ADD COLUMN theme_light_paper TEXT NOT NULL DEFAULT '#f6f1e9';
ALTER TABLE reader_settings ADD COLUMN theme_sepia_ink TEXT NOT NULL DEFAULT '#3b2f24';
ALTER TABLE reader_settings ADD COLUMN theme_sepia_paper TEXT NOT NULL DEFAULT '#f3e6d6';
ALTER TABLE reader_settings ADD COLUMN theme_dark_ink TEXT NOT NULL DEFAULT '#e2e1de';
ALTER TABLE reader_settings ADD COLUMN theme_dark_paper TEXT NOT NULL DEFAULT '#424547';
