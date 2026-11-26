-- Dummy data so the list pages have something to show. Run ONCE, after schema.sql
-- (running it again would add duplicate screenings and reports). Theaters below are made up,
-- so their coordinates are only approximate spots in the Atlanta area.
USE reel_alert_db;

-- Owner for the dummy rows. Skipped automatically if user 1 already exists.
-- This account can't be logged into (fake hash); register your own account to test.
INSERT IGNORE INTO users (user_id, username, email, password_hash, home_zip, latitude, longitude, max_travel_radius_mi)
VALUES (1, 'kduggan', 'kduggan@example.com', '$2b$12$DummyHashString', '30127', 33.882500, -84.700300, 50);

-- Theaters (skipped if the same name + city already exists)
INSERT IGNORE INTO theaters (name, city, state, latitude, longitude, created_by) VALUES
('Lumen Revival House',    'Atlanta',  'GA', 33.775000, -84.396000, 1),
('Grand Horizon Theater',  'Atlanta',  'GA', 33.848000, -84.373000, 1),
('Marquee Arts Cinema',    'Marietta', 'GA', 33.952600, -84.549900, 1),
('Starlight Dolby Cinema', 'Kennesaw', 'GA', 34.023400, -84.615500, 1);

-- Screenings: each row looks its theater up by name and city
INSERT INTO screenings (user_id, theater_id, movie_title, show_date, show_time, screen_format, event_type)
SELECT 1, t.theater_id, d.movie_title, d.show_date, d.show_time, d.screen_format, d.event_type
FROM (
  SELECT '2001: A Space Odyssey' AS movie_title, 'Lumen Revival House' AS tname, 'Atlanta' AS city, '2026-12-05' AS show_date, '19:30:00' AS show_time, '70mm' AS screen_format, 'New restoration' AS event_type
  UNION ALL SELECT 'Blade Runner',  'Marquee Arts Cinema',    'Marietta', '2026-12-12', '20:00:00', '35mm',             'Extended cut'
  UNION ALL SELECT 'Interstellar',  'Grand Horizon Theater',  'Atlanta',  '2026-12-18', '18:45:00', 'IMAX Film',        'Anniversary'
  UNION ALL SELECT 'Spirited Away', 'Lumen Revival House',    'Atlanta',  '2026-12-20', '14:00:00', 'Standard Digital', 'New restoration'
  UNION ALL SELECT 'Dune',          'Starlight Dolby Cinema', 'Kennesaw', '2027-01-09', '19:00:00', 'Dolby Cinema',     'Double feature'
) d JOIN theaters t ON t.name = d.tname AND t.city = d.city;

INSERT INTO format_reports (user_id, theater_id, screen_name, projection_type, picture_rating, sound_rating, comment)
SELECT 1, t.theater_id, d.screen_name, d.projection_type, d.picture_rating, d.sound_rating, d.comment
FROM (
  SELECT 'Grand Horizon Theater' AS tname, 'Atlanta' AS city, 'Screen 1' AS screen_name, 'IMAX Film' AS projection_type, 5 AS picture_rating, 5 AS sound_rating, 'Enormous screen and a sharp, bright image. Worth the drive.' AS comment
  UNION ALL SELECT 'Starlight Dolby Cinema', 'Kennesaw', 'Screen 4', 'Dolby Cinema', 5, 4, 'Deep blacks. Sound is strong but a little loud up front.'
  UNION ALL SELECT 'Marquee Arts Cinema',    'Marietta', 'Screen 2', 'IMAX Digital', 3, 4, 'Bigger than a normal screen but not true IMAX. Fine, not special.'
) d JOIN theaters t ON t.name = d.tname AND t.city = d.city;
