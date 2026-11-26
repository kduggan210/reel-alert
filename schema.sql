-- Reel Alert schema. Safe to run more than once: nothing is dropped, so existing users are kept.
-- Needs MySQL 8.0.16 or newer (CHECK constraints are enforced from that version).
CREATE DATABASE IF NOT EXISTS reel_alert_db;
USE reel_alert_db;

-- ---- users ----
-- Same table as before. Location columns are nullable so a person can register with only
-- a username, e-mail and password and fill in their location later on the profile page.
CREATE TABLE IF NOT EXISTS users (
  user_id              INT NOT NULL AUTO_INCREMENT,
  username             VARCHAR(50)  NOT NULL,
  email                VARCHAR(100) NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,
  home_zip             VARCHAR(10)  NULL,
  latitude             DECIMAL(9,6) NULL,
  longitude            DECIMAL(9,6) NULL,
  max_travel_radius_mi INT DEFAULT 25,
  created_at           TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY username (username),
  UNIQUE KEY email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- If users already existed with NOT NULL location columns, loosen them. Harmless to repeat.
ALTER TABLE users
  MODIFY home_zip  VARCHAR(10)  NULL,
  MODIFY latitude  DECIMAL(9,6) NULL,
  MODIFY longitude DECIMAL(9,6) NULL;

-- ---- user_format_preferences (unchanged) ----
CREATE TABLE IF NOT EXISTS user_format_preferences (
  user_id          INT NOT NULL,
  preferred_format VARCHAR(50) NOT NULL,
  PRIMARY KEY (user_id, preferred_format),
  CONSTRAINT user_format_preferences_ibfk_1
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---- theaters ----
-- One row per theater, shared by everyone. Screenings and format reports point to a theater instead of
-- repeating its name. latitude/longitude are filled in once (the "near me" step) and then reused.
-- created_by is just a record of who added it; deleting that user keeps the theater.
CREATE TABLE IF NOT EXISTS theaters (
  theater_id INT NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  address    VARCHAR(150) NULL,
  city       VARCHAR(80)  NOT NULL,
  state      CHAR(2)      NULL,
  zip        VARCHAR(10)  NULL,
  latitude   DECIMAL(9,6) NULL,
  longitude  DECIMAL(9,6) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (theater_id),
  UNIQUE KEY uq_theater_name_city (name, city),
  CONSTRAINT fk_theaters_user
    FOREIGN KEY (created_by) REFERENCES users (user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---- screenings (CRUD area 1) ----
-- One row per special screening a user tracks. user_id is the owner: the server will only
-- let the owner update or delete a row. Deleting a user deletes their screenings.
-- (A database built before theaters existed is converted by migrate_theaters.sql, not by this file.)
CREATE TABLE IF NOT EXISTS screenings (
  screening_id  INT NOT NULL AUTO_INCREMENT,
  user_id       INT NOT NULL,
  theater_id    INT NOT NULL,
  movie_title   VARCHAR(150) NOT NULL,
  show_date     DATE NOT NULL,
  show_time     TIME NOT NULL,
  screen_format VARCHAR(30) NOT NULL,
  event_type    VARCHAR(30) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (screening_id),
  KEY idx_screenings_date (show_date),
  CONSTRAINT fk_screenings_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_screenings_theater
    FOREIGN KEY (theater_id) REFERENCES theaters (theater_id),
  CONSTRAINT chk_screenings_format CHECK (screen_format IN
    ('35mm','70mm','IMAX Film','IMAX Digital','Dolby Cinema','Standard Digital')),
  CONSTRAINT chk_screenings_event CHECK (event_type IN
    ('Re-release','Anniversary','New restoration','Extended cut','Special guest','Double feature'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---- format_reports (CRUD area 2) ----
-- A user's quality report on one screen: how it looked and sounded. Same ownership rule.
CREATE TABLE IF NOT EXISTS format_reports (
  report_id       INT NOT NULL AUTO_INCREMENT,
  user_id         INT NOT NULL,
  theater_id      INT NOT NULL,
  screen_name     VARCHAR(50)  NOT NULL,
  projection_type VARCHAR(30)  NOT NULL,
  picture_rating  TINYINT NOT NULL,
  sound_rating    TINYINT NOT NULL,
  comment         VARCHAR(1000) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (report_id),
  CONSTRAINT fk_reports_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_theater
    FOREIGN KEY (theater_id) REFERENCES theaters (theater_id),
  CONSTRAINT chk_reports_projection CHECK (projection_type IN
    ('35mm','70mm','IMAX Film','IMAX Digital','Dolby Cinema','Standard Digital')),
  CONSTRAINT chk_reports_picture CHECK (picture_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_reports_sound   CHECK (sound_rating   BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---- rerelease_candidates ----
-- A cache of older films returning to US theaters, filled by the "re-release radar" job (rereleases.js) from TMDB.
-- Nobody edits these rows; the job replaces them once a day. Safe to run on an existing database (nothing is dropped).
CREATE TABLE IF NOT EXISTS rerelease_candidates (
  tmdb_id        INT NOT NULL,
  title          VARCHAR(200) NOT NULL,
  original_date  DATE NOT NULL,
  rerelease_date DATE NOT NULL,
  note           VARCHAR(200) NULL,
  poster_path    VARCHAR(100) NULL,
  fetched_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tmdb_id),
  KEY idx_rerelease_date (rerelease_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---- fathom_releases ----
-- A cache of special showings read from Fathom Events' public series pages by the same daily job (fathom.js).
-- Fathom's pages give a title and dates but no year or film id, so the key is the page name ("slug").
-- Nobody edits these rows; the job replaces them once a day. Safe to run on an existing database (nothing is dropped).
CREATE TABLE IF NOT EXISTS fathom_releases (
  slug        VARCHAR(120) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  movie       VARCHAR(150) NOT NULL,
  label       VARCHAR(40)  NULL,
  series      VARCHAR(80)  NOT NULL,
  url         VARCHAR(300) NOT NULL,
  poster_url  VARCHAR(300) NULL,
  dates       VARCHAR(400) NOT NULL,
  last_date   DATE NOT NULL,
  fetched_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (slug),
  KEY idx_fathom_last (last_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
