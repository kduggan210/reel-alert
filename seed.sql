-- Dummy data so the list pages have something to show. Run ONCE, after schema.sql
-- (running it again would add duplicate rows). Theaters below are made up.
USE reel_alert_db;

-- Owner for the dummy rows. Skipped automatically if user 1 already exists.
-- This account can't be logged into (fake hash); register your own account to test.
INSERT IGNORE INTO users (user_id, username, email, password_hash, home_zip, latitude, longitude, max_travel_radius_mi)
VALUES (1, 'kduggan', 'kduggan@example.com', '$2b$12$DummyHashString', '30127', 33.882500, -84.700300, 50);

INSERT INTO screenings (user_id, movie_title, theater_name, city, show_date, show_time, screen_format, event_type) VALUES
(1, '2001: A Space Odyssey',  'Lumen Revival House',   'Atlanta',   '2026-12-05', '19:30:00', '70mm',          'New restoration'),
(1, 'Blade Runner',           'Marquee Arts Cinema',   'Marietta',  '2026-12-12', '20:00:00', '35mm',          'Extended cut'),
(1, 'Interstellar',           'Grand Horizon Theater', 'Atlanta',   '2026-12-18', '18:45:00', 'IMAX Film',     'Anniversary'),
(1, 'Spirited Away',          'Lumen Revival House',   'Atlanta',   '2026-12-20', '14:00:00', 'Standard Digital', 'New restoration'),
(1, 'Dune',                   'Starlight Dolby Cinema','Kennesaw',  '2027-01-09', '19:00:00', 'Dolby Cinema',  'Double feature');

INSERT INTO format_reports (user_id, theater_name, screen_name, projection_type, picture_rating, sound_rating, comment) VALUES
(1, 'Grand Horizon Theater', 'Screen 1', 'IMAX Film',     5, 5, 'Enormous screen and a sharp, bright image. Worth the drive.'),
(1, 'Starlight Dolby Cinema','Screen 4', 'Dolby Cinema',  5, 4, 'Deep blacks. Sound is strong but a little loud up front.'),
(1, 'Marquee Arts Cinema',   'Screen 2', 'IMAX Digital',  3, 4, 'Bigger than a normal screen but not true IMAX. Fine, not special.');
