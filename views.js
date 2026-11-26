// views.js - builds the HTML for every page.
// Every page goes through layout(), so the header, nav and footer are written once and the nav can change depending on whether someone is logged in.

// Turns characters with special meaning in HTML into harmless text.
// Used on anything user typed (username, e-mail, titles...) before putting it in a page.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The formats a screening can be shown in. The add/edit form and the server's validation both use this list,
// and it matches the CHECK constraint in schema.sql.
const FORMATS = ["35mm", "70mm", "IMAX Film", "IMAX Digital", "Dolby Cinema", "Standard Digital"];

// What kind of special showing it is. Every screening has exactly one. Matches the CHECK constraint in schema.sql.
const EVENT_TYPES = ["Re-release", "Anniversary", "New restoration", "Extended cut", "Special guest", "Double feature"];

// '2026-12-05' -> 'Sat, Dec 5, 2026'. (The database connection returns dates as plain strings.)
function formatDate(s) {
  const parts = String(s).split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2])
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

// '19:30:00' -> '7:30 PM'
function formatTime(t) {
  const parts = String(t).split(":").map(Number);
  const h12 = parts[0] % 12 || 12;
  return h12 + ":" + String(parts[1]).padStart(2, "0") + " " + (parts[0] >= 12 ? "PM" : "AM");
}

// Nav links shown to each kind of visitor. 'key' is matched against the page's 'active' value.
const NAV_LOGGED_OUT = [
  { key: "home", href: "/", text: "Home" },
  { key: "about", href: "/about", text: "About" },
  { key: "login", href: "/login", text: "Log in" },
  { key: "register", href: "/register", text: "Register" }
];
const NAV_LOGGED_IN = [
  { key: "home", href: "/", text: "Home" },
  { key: "screenings", href: "/screenings", text: "Screenings" },
  { key: "rereleases", href: "/rereleases", text: "Re-releases" },
  { key: "reports", href: "/reports", text: "Format Reports" },
  { key: "profile", href: "/profile", text: "Profile" },
  { key: "about", href: "/about", text: "About" }
];

// Wraps page content in the shared layout.
//   title  - page title (plain text)
//   user   - req.session.user, or undefined when logged out
//   active - which nav link to highlight
//   body   - HTML for the page's main content
function layout({ title, user, active, body }) {
  const links = (user ? NAV_LOGGED_IN : NAV_LOGGED_OUT)
    .map(function (l) {
      const current = l.key === active ? ' aria-current="page"' : "";
      return `<li><a href="${l.href}"${current}>${l.text}</a></li>`;
    })
    .join("\n                ");

  // Logged in: show the username and a logout link on every page
  const account = user
    ? `<span class="whoami">Signed in as <strong>${escapeHtml(user.username)}</strong></span>
            <a class="btn btn-quiet" href="/logout">Log out</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - Reel Alert</title>
    <!-- Applies the saved theme before the page paints, so dark mode doesn't flash -->
    <script>
        try {
            if (localStorage.getItem('website_theme') === 'dark_mode') document.documentElement.classList.add('dark_mode');
        } catch (e) {}
    </script>
    <link rel="stylesheet" href="/css/style.css">
    <script src="/js/theme.js" defer></script>
    <script src="/js/confirm.js" defer></script>
</head>
<body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
        <div class="bar">
            <a class="brand" href="/">Reel Alert</a>
            <nav class="site-nav" aria-label="Main">
                <ul>
                ${links}
                </ul>
            </nav>
            <div class="account">
            ${account}
            <button id="theme_toggler" type="button" aria-pressed="false">Dark mode</button>
            </div>
        </div>
    </header>
    <main id="main" class="content">
${body}
    </main>
</body>
</html>`;
}

// ---------- Pages ----------

function homePage(user) {
  // Same format guide for everyone; the top part changes with login state
  const top = user
    ? `<section class="hero">
            <h1>Welcome back, ${escapeHtml(user.username)}.</h1>
            <p class="lede">Browse upcoming special screenings, or add one you've spotted.</p>
            <div class="actions">
                <a class="btn" href="/screenings">Screenings</a>
                <a class="btn btn-quiet" href="/reports">Format Reports</a>
            </div>
        </section>`
    : `<section class="hero">
            <h1>Find screenings tailored to your unique preferences.</h1>
            <p class="lede">Reel Alert tracks re-releases and special showings near you, and tells you which screen is worth the drive.</p>
            <div class="actions">
                <a class="btn" href="/register">Create an account</a>
                <a class="btn btn-quiet" href="/login">Log in</a>
            </div>
        </section>`;

  const body = `        ${top}
        <section class="formats">
            <h2>Not every screen is the same</h2>
            <p class="sub">The format a movie is shown in changes how it looks and sounds.</p>
            <dl>
                <div class="row"><dt>35mm</dt><dd>A real film print. Visible grain, warm color, and the flicker of a physical projector.</dd></div>
                <div class="row"><dt>70mm</dt><dd>About twice the film area of 35mm, so far more detail and much less grain. Now rare.</dd></div>
                <div class="row"><dt>IMAX Film</dt><dd>The original giant-screen system on film. Only a handful of theaters still have one.</dd></div>
                <div class="row"><dt>IMAX Digital</dt><dd>Branded large format, often on a smaller screen than true IMAX. Better than standard, but not the same thing.</dd></div>
                <div class="row"><dt>Dolby Cinema</dt><dd>Digital projection with HDR brightness and Atmos sound.</dd></div>
            </dl>
        </section>`;

  return layout({ title: "Home", user, active: "home", body });
}

function aboutPage(user) {
  const body = `        <section>
            <h1>About</h1>
            <h2>Kyele Duggan</h2>
            <p>
                I am an avid believer that watching a movie in a cinema surrounded by dozens of other people is an experience that cannot be easily replicated anywhere else.
                This is of course true for new releases but especially true for rereleases. The feeling of reliving a cherished experience in this atmosphere, or getting to
                experience these events for the first time is one I hope anyone can find with maximum ease.
            </p>
        </section>
        <section>
            <h2>The project</h2>
            <p>
                In pursuit of making this experience easier to find, I've decided to build a website dedicated to tracking theatrical rereleases and special editions
                that would fly under the radar of most users. Simply going to the main page of any exhibitor's website, you would understandably be met with advertisements for the
                hottest new movies in theaters that week. Without going out of their way to look for it, a user may have no idea that one of their favorite movies is showing on
                the big screen for the first time in years right then! Alternatively, a movie they have been meaning to get around to watching could be rereleasing in a matter of
                weeks, making for the perfect occasion to get that first watch in. To aid fans in making these showings simple to find, my website provides information for
                upcoming rereleases and special edition showings, along with reports on how each theater's screens actually perform.
            </p>
        </section>
        <section>
            <h2>Contact</h2>
            <p><a href="https://github.com/kduggan210">GitHub</a></p>
        </section>
        <section>
            <h2>Credits</h2>
            <p>Re-release information on the Re-releases page comes from <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB. Theater locations use data from the U.S. Census Bureau and Zippopotam.us.</p>
        </section>`;
  return layout({ title: "About", user, active: "about", body });
}

// Login form. options: { error, notice, username } (username is put back in the box after a failed try)
function loginPage(user, options) {
  const o = options || {};
  const body = `        <h1>Log in</h1>
        ${o.notice ? `<p class="notice">${escapeHtml(o.notice)}</p>` : ""}
        ${o.error ? `<p class="error" role="alert">${escapeHtml(o.error)}</p>` : ""}
        <form class="panel" action="/login" method="POST">
            <div class="field">
                <label for="username">Username</label>
                <input type="text" name="username" id="username" value="${escapeHtml(o.username || "")}" autocomplete="username" required>
            </div>
            <div class="field">
                <label for="password">Password</label>
                <input type="password" name="password" id="password" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn">Log in</button>
            <p class="below">Need an account? <a href="/register">Register</a></p>
        </form>`;
  return layout({ title: "Log in", user, active: "login", body });
}

// Registration form. options: { error, username, email }
function registerPage(user, options) {
  const o = options || {};
  const body = `        <h1>Create an account</h1>
        ${o.error ? `<p class="error" role="alert">${escapeHtml(o.error)}</p>` : ""}
        <form class="panel" action="/register" method="POST">
            <div class="field">
                <label for="username">Username</label>
                <input type="text" name="username" id="username" value="${escapeHtml(o.username || "")}" maxlength="50" autocomplete="username" required>
            </div>
            <div class="field">
                <label for="email">E-mail</label>
                <input type="email" name="email" id="email" value="${escapeHtml(o.email || "")}" maxlength="100" autocomplete="email" required>
            </div>
            <div class="field">
                <label for="password">Password</label>
                <input type="password" name="password" id="password" minlength="8" autocomplete="new-password" required>
                <span class="hint">At least 8 characters.</span>
            </div>
            <button type="submit" class="btn">Register</button>
            <p class="below">Already registered? <a href="/login">Log in</a></p>
        </form>`;
  return layout({ title: "Register", user, active: "register", body });
}

// ---------- Theater picker (used on the screening and report forms) ----------
// A dropdown of existing theaters, plus a "Theater not listed?" section for adding a new one.
// The new-theater section opens by itself when something was typed in it, so a failed submit doesn't hide it.
function theaterPicker(theaters, v) {
  const options = (theaters || [])
    .map(function (t) {
      return `<option value="${Number(t.theater_id)}"${String(t.theater_id) === String(v.theater_id) ? " selected" : ""}>${escapeHtml(t.name)}, ${escapeHtml(t.city)}</option>`;
    })
    .join("");
  const typedNew = [v.new_theater_name, v.new_theater_address, v.new_theater_city, v.new_theater_state, v.new_theater_zip].some(Boolean);
  return `            <div class="field">
                <label for="theater_id">Theater</label>
                <select name="theater_id" id="theater_id">
                    <option value="">Choose a theater</option>
                    ${options}
                </select>
            </div>
            <details class="new-theater"${typedNew ? " open" : ""}>
                <summary>Theater not listed? Add it</summary>
                <p class="hint">If you fill in a name here, it is used instead of the dropdown. A theater that already exists with the same name and city is reused.</p>
                <div class="field">
                    <label for="new_theater_name">Theater name</label>
                    <input type="text" name="new_theater_name" id="new_theater_name" value="${escapeHtml(v.new_theater_name || "")}" maxlength="100">
                </div>
                <div class="field">
                    <label for="new_theater_address">Street address (optional)</label>
                    <input type="text" name="new_theater_address" id="new_theater_address" value="${escapeHtml(v.new_theater_address || "")}" maxlength="150" autocomplete="off">
                </div>
                <div class="field-row three">
                    <div class="field">
                        <label for="new_theater_city">City</label>
                        <input type="text" name="new_theater_city" id="new_theater_city" value="${escapeHtml(v.new_theater_city || "")}" maxlength="80">
                    </div>
                    <div class="field">
                        <label for="new_theater_state">State</label>
                        <input type="text" name="new_theater_state" id="new_theater_state" value="${escapeHtml(v.new_theater_state || "")}" maxlength="2" placeholder="GA">
                    </div>
                    <div class="field">
                        <label for="new_theater_zip">ZIP</label>
                        <input type="text" name="new_theater_zip" id="new_theater_zip" value="${escapeHtml(v.new_theater_zip || "")}" maxlength="5" inputmode="numeric" pattern="[0-9]{5}">
                    </div>
                </div>
            </details>`;
}

// ---------- Screenings ----------

// List of all screenings. options: { rows, notice, filters, home, nearUnavailable }
//   filters: { format, event, near, miles }   home: { zip, hasPoint, miles }
// Every logged-in user sees every row, but Edit and Delete buttons only appear on rows the
// current user added. (The server checks ownership again, so hiding buttons is just convenience.)
function screeningsPage(user, options) {
  const o = options || {};
  const rows = o.rows || [];
  const f = o.filters || {};
  const home = o.home || {};
  const filtering = Boolean(f.format || f.event || (f.near && home.hasPoint));

  const formatOptions = FORMATS
    .map(function (x) { return `<option value="${escapeHtml(x)}"${x === f.format ? " selected" : ""}>${escapeHtml(x)}</option>`; })
    .join("");
  const eventOptions = EVENT_TYPES
    .map(function (x) { return `<option value="${escapeHtml(x)}"${x === f.event ? " selected" : ""}>${escapeHtml(x)}</option>`; })
    .join("");
  const miles = Number(f.miles) || home.miles || 25;
  const where = home.zip ? `of ZIP ${escapeHtml(home.zip)}` : `of your home ZIP (<a href="/profile">set it on your profile</a>)`;

  const filterForm = `        <form class="filters" action="/screenings" method="GET">
            <div class="field">
                <label for="f_format">Format</label>
                <select name="format" id="f_format">
                    <option value="">All formats</option>
                    ${formatOptions}
                </select>
            </div>
            <div class="field">
                <label for="f_event">Event type</label>
                <select name="event" id="f_event">
                    <option value="">All types</option>
                    ${eventOptions}
                </select>
            </div>
            <div class="near">
                <label for="f_near" class="check"><input type="checkbox" name="near" id="f_near" value="1"${f.near ? " checked" : ""}> Near me</label>
                <span class="within">within <input type="number" name="miles" id="f_miles" value="${miles}" min="1" max="500" step="1" aria-label="Miles"> miles ${where}</span>
            </div>
            <div class="filter-actions">
                <button type="submit" class="btn btn-small">Apply</button>
                <a class="btn btn-quiet btn-small" href="/screenings">Clear</a>
            </div>
        </form>`;

  const empty = filtering
    ? `<p>No screenings match those filters. <a href="/screenings">Clear the filters.</a></p>`
    : `<p>No screenings yet. <a href="/screenings/new">Add the first one.</a></p>`;

  const table = rows.length === 0
    ? empty
    : `<div class="table-wrap">
            <table class="data">
                <thead>
                    <tr><th>Date</th><th>Time</th><th>Movie</th><th>Theater</th><th>Format</th><th>Added by</th><th>Actions</th></tr>
                </thead>
                <tbody>
${rows.map(function (r) {
  const note = `<div class="note">${escapeHtml(r.event_type)}</div>`;   // grey event-type line under the title
  const mine = Number(r.user_id) === Number(user.user_id);
  const away = r.distance_mi === undefined || r.distance_mi === null ? "" : ` · ${Number(r.distance_mi).toFixed(1)} mi`;
  const actions = mine
    ? `<div class="row-actions">
                                <a class="btn btn-quiet btn-small" href="/screenings/${Number(r.screening_id)}/edit">Edit</a>
                                <form action="/screenings/${Number(r.screening_id)}/delete" method="POST" data-confirm="Delete ${escapeHtml(r.movie_title)} at ${escapeHtml(r.theater_name)}? This can't be undone.">
                                    <button type="submit" class="btn btn-danger btn-small">Delete</button>
                                </form>
                            </div>`
    : "";
  return `                    <tr>
                        <td>${escapeHtml(formatDate(r.show_date))}</td>
                        <td>${escapeHtml(formatTime(r.show_time))}</td>
                        <td><strong>${escapeHtml(r.movie_title)}</strong>${note}</td>
                        <td>${escapeHtml(r.theater_name)}<div class="note">${escapeHtml(r.city)}${away}</div></td>
                        <td>${escapeHtml(r.screen_format)}</td>
                        <td>${escapeHtml(r.username)}</td>
                        <td>${actions}</td>
                    </tr>`;
}).join("\n")}
                </tbody>
            </table>
        </div>`;

  const body = `        <div class="page-head">
            <h1>Screenings</h1>
            <a class="btn" href="/screenings/new">Add a screening</a>
        </div>
        ${o.notice ? `<p class="notice">${escapeHtml(o.notice)}</p>` : ""}
${filterForm}
        ${o.nearUnavailable ? `<p class="notice">Near me needs your home ZIP. <a href="/profile">Set it on your profile</a>, then try again.</p>` : ""}
        ${filtering ? `<p class="sub count">${rows.length} ${rows.length === 1 ? "screening" : "screenings"} found${f.near && home.hasPoint ? ", nearest first. Theaters without a known location are left out." : "."}</p>` : ""}
        ${table}`;
  return layout({ title: "Screenings", user, active: "screenings", body });
}

// Add/edit form for a screening. options: { title, action, submitText, values, error }
// values uses the database column names so the same form can be reused for editing.
function screeningFormPage(user, options) {
  const o = options || {};
  const v = o.values || {};
  const formatOptions = FORMATS
    .map(function (f) { return `<option value="${escapeHtml(f)}"${f === v.screen_format ? " selected" : ""}>${escapeHtml(f)}</option>`; })
    .join("");
  const eventOptions = EVENT_TYPES
    .map(function (t) { return `<option value="${escapeHtml(t)}"${t === v.event_type ? " selected" : ""}>${escapeHtml(t)}</option>`; })
    .join("");

  const body = `        <h1>${escapeHtml(o.title)}</h1>
        ${o.error ? `<p class="error" role="alert">${escapeHtml(o.error)}</p>` : ""}
        <form class="panel wide" action="${escapeHtml(o.action)}" method="POST">
            <div class="field">
                <label for="movie_title">Movie</label>
                <input type="text" name="movie_title" id="movie_title" value="${escapeHtml(v.movie_title || "")}" maxlength="150" required>
            </div>
${theaterPicker(o.theaters, v)}
            <div class="field-row">
                <div class="field">
                    <label for="show_date">Date</label>
                    <input type="date" name="show_date" id="show_date" value="${escapeHtml(v.show_date || "")}" required>
                </div>
                <div class="field">
                    <label for="show_time">Time</label>
                    <input type="time" name="show_time" id="show_time" value="${escapeHtml(String(v.show_time || "").slice(0, 5))}" required>
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <label for="screen_format">Format</label>
                    <select name="screen_format" id="screen_format" required>
                        <option value="">Choose a format</option>
                        ${formatOptions}
                    </select>
                </div>
                <div class="field">
                    <label for="event_type">Event type</label>
                    <select name="event_type" id="event_type" required>
                        <option value="">Choose a type</option>
                        ${eventOptions}
                    </select>
                </div>
            </div>
            <button type="submit" class="btn">${escapeHtml(o.submitText)}</button>
            <a class="btn btn-quiet" href="/screenings">Cancel</a>
        </form>`;
  return layout({ title: o.title, user, active: "screenings", body });
}

// ---------- Format reports ----------

// 4 -> "★★★★☆" (decorative) plus "4/5" text so the rating is readable without the symbols
function stars(n) {
  const k = Math.max(0, Math.min(5, Number(n) || 0));
  return `<span class="stars" aria-hidden="true">${"★".repeat(k)}${"☆".repeat(5 - k)}</span> <span class="rating-num">${k}/5</span>`;
}

// List of all format reports. options: { rows, notice }
// Same rule as screenings: everyone sees every report, Edit and Delete only appear on your own.
function reportsPage(user, options) {
  const o = options || {};
  const rows = o.rows || [];

  const table = rows.length === 0
    ? `<p>No format reports yet. <a href="/reports/new">Write the first one.</a></p>`
    : `<div class="table-wrap">
            <table class="data">
                <thead>
                    <tr><th>Theater</th><th>Format</th><th>Picture</th><th>Sound</th><th>Comment</th><th>Added by</th><th>Actions</th></tr>
                </thead>
                <tbody>
${rows.map(function (r) {
  const mine = Number(r.user_id) === Number(user.user_id);
  const actions = mine
    ? `<div class="row-actions">
                                <a class="btn btn-quiet btn-small" href="/reports/${Number(r.report_id)}/edit">Edit</a>
                                <form action="/reports/${Number(r.report_id)}/delete" method="POST" data-confirm="Delete your report on ${escapeHtml(r.theater_name)}, ${escapeHtml(r.screen_name)}? This can't be undone.">
                                    <button type="submit" class="btn btn-danger btn-small">Delete</button>
                                </form>
                            </div>`
    : "";
  return `                    <tr>
                        <td><strong>${escapeHtml(r.theater_name)}</strong><div class="note">${escapeHtml(r.screen_name)} · ${escapeHtml(r.city)}</div></td>
                        <td>${escapeHtml(r.projection_type)}</td>
                        <td>${stars(r.picture_rating)}</td>
                        <td>${stars(r.sound_rating)}</td>
                        <td class="comment">${r.comment ? escapeHtml(r.comment) : `<span class="note">No comment</span>`}</td>
                        <td>${escapeHtml(r.username)}</td>
                        <td>${actions}</td>
                    </tr>`;
}).join("\n")}
                </tbody>
            </table>
        </div>`;

  const body = `        <div class="page-head">
            <h1>Format Reports</h1>
            <a class="btn" href="/reports/new">Add a report</a>
        </div>
        <p class="sub">How a screen actually looks and sounds, from people who have sat in it.</p>
        ${o.notice ? `<p class="notice">${escapeHtml(o.notice)}</p>` : ""}
        ${table}`;
  return layout({ title: "Format Reports", user, active: "reports", body });
}

// Add/edit form for a report. options: { title, action, submitText, values, error }
function reportFormPage(user, options) {
  const o = options || {};
  const v = o.values || {};
  const formatOptions = FORMATS
    .map(function (f) { return `<option value="${escapeHtml(f)}"${f === v.projection_type ? " selected" : ""}>${escapeHtml(f)}</option>`; })
    .join("");
  const ratingOptions = function (current) {
    return [1, 2, 3, 4, 5]
      .map(function (n) { return `<option value="${n}"${String(n) === String(current) ? " selected" : ""}>${n}</option>`; })
      .join("");
  };

  const body = `        <h1>${escapeHtml(o.title)}</h1>
        ${o.error ? `<p class="error" role="alert">${escapeHtml(o.error)}</p>` : ""}
        <form class="panel wide" action="${escapeHtml(o.action)}" method="POST">
${theaterPicker(o.theaters, v)}
            <div class="field">
                <label for="screen_name">Screen</label>
                <input type="text" name="screen_name" id="screen_name" value="${escapeHtml(v.screen_name || "")}" maxlength="50" placeholder="Screen 1" required>
            </div>
            <div class="field">
                <label for="projection_type">Format</label>
                <select name="projection_type" id="projection_type" required>
                    <option value="">Choose a format</option>
                    ${formatOptions}
                </select>
            </div>
            <div class="field-row">
                <div class="field">
                    <label for="picture_rating">Picture (1 to 5)</label>
                    <select name="picture_rating" id="picture_rating" required>
                        <option value="">Rate the picture</option>
                        ${ratingOptions(v.picture_rating)}
                    </select>
                </div>
                <div class="field">
                    <label for="sound_rating">Sound (1 to 5)</label>
                    <select name="sound_rating" id="sound_rating" required>
                        <option value="">Rate the sound</option>
                        ${ratingOptions(v.sound_rating)}
                    </select>
                </div>
            </div>
            <div class="field">
                <label for="comment">Comment (optional)</label>
                <textarea name="comment" id="comment" rows="4" maxlength="1000">${escapeHtml(v.comment || "")}</textarea>
                <span class="hint">Seating, screen size, brightness, anything worth knowing. Up to 1000 characters.</span>
            </div>
            <button type="submit" class="btn">${escapeHtml(o.submitText)}</button>
            <a class="btn btn-quiet" href="/reports">Cancel</a>
        </form>`;
  return layout({ title: o.title, user, active: "reports", body });
}

// ---------- Re-release radar ----------

// Older films returning to US theaters. options: { rows, zip, configured, updated }
// This is a heads-up, not a showtime list: it says a re-release is coming, and each row links to
// "Find showtimes" (a web search) and "Add a screening" (the add form, pre-filled with the film and date).
function rereleasesPage(user, options) {
  const o = options || {};
  const rows = o.rows || [];

  const list = rows.length === 0
    ? `<p>${o.configured
        ? "No re-releases found yet. The list refreshes about once a day, so check back soon."
        : "The re-release radar isn't set up yet. The site's owner needs to add a TMDB token to turn it on."}</p>`
    : `<ul class="rr-list">
${rows.map(function (r) {
  const title = String(r.title);
  const year = String(r.original_date).slice(0, 4);
  const addUrl = "/screenings/new?movie=" + encodeURIComponent(title) + "&date=" + encodeURIComponent(String(r.rerelease_date).slice(0, 10));
  const searchUrl = "https://www.google.com/search?q=" + encodeURIComponent((title + " " + year + " showtimes " + (o.zip || "")).trim());
  const poster = r.poster_path
    ? `<img class="rr-poster" src="https://image.tmdb.org/t/p/w185${escapeHtml(r.poster_path)}" alt="Poster for ${escapeHtml(title)}" width="92" height="138" loading="lazy">`
    : `<div class="rr-poster rr-none" aria-hidden="true"></div>`;
  return `            <li class="rr-item">
                ${poster}
                <div class="rr-body">
                    <h2>${escapeHtml(title)} <span class="rr-year">(${escapeHtml(year)})</span></h2>
                    <p class="rr-when">Returns ${escapeHtml(formatDate(r.rerelease_date))}</p>
                    ${r.note ? `<p class="note">${escapeHtml(r.note)}</p>` : ""}
                    <div class="row-actions">
                        <a class="btn btn-small" href="${escapeHtml(addUrl)}">Add a screening</a>
                        <a class="btn btn-quiet btn-small" href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener noreferrer">Find showtimes</a>
                    </div>
                </div>
            </li>`;
}).join("\n")}
        </ul>`;

  const body = `        <div class="page-head">
            <h1>Re-Release Radar</h1>
        </div>
        <p class="sub">Older films returning to US theaters in the next three months. Find a showing near you, then add it to the Screenings list.</p>
        ${o.updated ? `<p class="sub count">Last updated ${escapeHtml(formatDate(String(o.updated).slice(0, 10)))}.</p>` : ""}
        ${list}
        <p class="credit">This product uses the TMDB API but is not endorsed or certified by TMDB. <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">themoviedb.org</a></p>`;
  return layout({ title: "Re-Release Radar", user, active: "rereleases", body });
}

// ---------- Profile ----------

// Profile page: four separate forms (account, location, password, delete account).
// options: { account: {username, email}, location: {home_zip, max_travel_radius_mi}, created_at,
//            notice, errors: { account, location, password, delete } }
// Each form shows its own error, so a mistake in one never wipes what was typed in another.
function profilePage(user, options) {
  const o = options || {};
  const a = o.account || {};
  const l = o.location || {};
  const errors = o.errors || {};
  const err = function (key) { return errors[key] ? `<p class="error" role="alert">${escapeHtml(errors[key])}</p>` : ""; };

  const body = `        <h1>Profile</h1>
        <p class="sub">Signed in as ${escapeHtml(user.username)}.${o.created_at ? ` Member since ${escapeHtml(formatDate(String(o.created_at).slice(0, 10)))}.` : ""}</p>
        ${o.notice ? `<p class="notice">${escapeHtml(o.notice)}</p>` : ""}

        <form class="panel wide" action="/profile/account" method="POST">
            <h2>Account</h2>
            ${err("account")}
            <div class="field-row">
                <div class="field">
                    <label for="username">Username</label>
                    <input type="text" name="username" id="username" value="${escapeHtml(a.username || "")}" maxlength="50" autocomplete="username" required>
                </div>
                <div class="field">
                    <label for="email">E-mail</label>
                    <input type="email" name="email" id="email" value="${escapeHtml(a.email || "")}" maxlength="100" autocomplete="email" required>
                </div>
            </div>
            <button type="submit" class="btn">Save account</button>
        </form>

        <form class="panel wide" action="/profile/location" method="POST">
            <h2>Home location</h2>
            <p class="hint">Used to find screenings near you. Leave the ZIP blank to clear it.</p>
            ${err("location")}
            <div class="field-row">
                <div class="field">
                    <label for="home_zip">Home ZIP</label>
                    <input type="text" name="home_zip" id="home_zip" value="${escapeHtml(l.home_zip || "")}" maxlength="5" inputmode="numeric" pattern="[0-9]{5}" placeholder="30301" autocomplete="postal-code">
                </div>
                <div class="field">
                    <label for="max_travel_radius_mi">Travel radius (miles)</label>
                    <input type="number" name="max_travel_radius_mi" id="max_travel_radius_mi" value="${escapeHtml(l.max_travel_radius_mi === undefined || l.max_travel_radius_mi === null ? 25 : l.max_travel_radius_mi)}" min="1" max="500" step="1" required>
                </div>
            </div>
            <button type="submit" class="btn">Save location</button>
        </form>

        <form class="panel wide" action="/profile/password" method="POST">
            <h2>Change password</h2>
            ${err("password")}
            <div class="field">
                <label for="current_password">Current password</label>
                <input type="password" name="current_password" id="current_password" autocomplete="current-password" required>
            </div>
            <div class="field-row">
                <div class="field">
                    <label for="new_password">New password</label>
                    <input type="password" name="new_password" id="new_password" minlength="8" autocomplete="new-password" required>
                    <span class="hint">At least 8 characters.</span>
                </div>
                <div class="field">
                    <label for="confirm_password">Confirm new password</label>
                    <input type="password" name="confirm_password" id="confirm_password" minlength="8" autocomplete="new-password" required>
                </div>
            </div>
            <button type="submit" class="btn">Change password</button>
        </form>

        <form class="panel wide danger-zone" action="/profile/delete" method="POST" data-confirm="Delete your account? Your screenings and format reports will be deleted too. This can't be undone.">
            <h2>Delete account</h2>
            <p class="hint">This removes your account along with every screening and format report you added.</p>
            ${err("delete")}
            <div class="field">
                <label for="delete_password">Enter your password to confirm</label>
                <input type="password" name="password" id="delete_password" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn btn-danger">Delete my account</button>
        </form>`;
  return layout({ title: "Profile", user, active: "profile", body });
}

// Shown when someone tries to change a row that belongs to another user.
// back = { href, label } for the link underneath; defaults to the screenings list.
function forbiddenPage(user, text, back) {
  const b = back || { href: "/screenings", label: "Back to screenings" };
  const body = `        <h1>Not allowed</h1>
        <p>${escapeHtml(text)}</p>
        <p><a href="${escapeHtml(b.href)}">${escapeHtml(b.label)}</a></p>`;
  return layout({ title: "Not allowed", user, active: b.href.indexOf("/reports") === 0 ? "reports" : "screenings", body });
}

// Simple page for sections that are built in a later step
function comingSoonPage(user, title, active, text) {
  const body = `        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(text)}</p>`;
  return layout({ title, user, active, body });
}

function notFoundPage(user) {
  const body = `        <h1>Page not found</h1>
        <p>That page doesn't exist. <a href="/">Go home</a>.</p>`;
  return layout({ title: "Not found", user, active: "", body });
}

module.exports = { FORMATS, EVENT_TYPES, escapeHtml, layout, homePage, aboutPage, loginPage, registerPage, screeningsPage, screeningFormPage, reportsPage, reportFormPage, rereleasesPage, profilePage, forbiddenPage, comingSoonPage, notFoundPage };
