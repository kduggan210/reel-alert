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

-- ---- screenings (CRUD area 1) ----
-- One row per special screening a user tracks. user_id is the owner: the server will only
-- let the owner update or delete a row. Deleting a user deletes their screenings.
CREATE TABLE IF NOT EXISTS screenings (
  screening_id INT NOT NULL AUTO_INCREMENT,
  user_id      INT NOT NULL,
  movie_title  VARCHAR(150) NOT NULL,
  theater_name VARCHAR(100) NOT NULL,
  city         VARCHAR(80)  NOT NULL,
  show_date    DATE NOT NULL,
  show_time    TIME NOT NULL,
  screen_format VARCHAR(30) NOT NULL,
  event_type   VARCHAR(30) NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (screening_id),
  KEY idx_screenings_date (show_date),
  CONSTRAINT fk_screenings_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
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
  theater_name    VARCHAR(100) NOT NULL,
  screen_name     VARCHAR(50)  NOT NULL,
  projection_type VARCHAR(30)  NOT NULL,
  picture_rating  TINYINT NOT NULL,
  sound_rating    TINYINT NOT NULL,
  comment         VARCHAR(1000) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (report_id),
  KEY idx_reports_theater (theater_name),
  CONSTRAINT fk_reports_user
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT chk_reports_projection CHECK (projection_type IN
    ('35mm','70mm','IMAX Film','IMAX Digital','Dolby Cinema','Standard Digital')),
  CONSTRAINT chk_reports_picture CHECK (picture_rating BETWEEN 1 AND 5),
  CONSTRAINT chk_reports_sound   CHECK (sound_rating   BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
