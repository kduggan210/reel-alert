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
  { key: "reports", href: "/reports", text: "Format reports" },
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
                <a class="btn btn-quiet" href="/reports">Format reports</a>
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
            <h2>The Project</h2>
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

// ---------- Screenings ----------

// List of all screenings. options: { rows, notice }
// Every logged-in user sees every row, but Edit and Delete buttons only appear on rows the
// current user added. (The server checks ownership again, so hiding buttons is just convenience.)
function screeningsPage(user, options) {
  const o = options || {};
  const rows = o.rows || [];

  const table = rows.length === 0
    ? `<p>No screenings yet. <a href="/screenings/new">Add the first one.</a></p>`
    : `<div class="table-wrap">
            <table class="data">
                <thead>
                    <tr><th>Date</th><th>Time</th><th>Movie</th><th>Theater</th><th>Format</th><th>Added by</th><th>Actions</th></tr>
                </thead>
                <tbody>
${rows.map(function (r) {
  const note = `<div class="note">${escapeHtml(r.event_type)}</div>`;   // grey event-type line under the title
  const mine = Number(r.user_id) === Number(user.user_id);
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
                        <td>${escapeHtml(r.theater_name)}<div class="note">${escapeHtml(r.city)}</div></td>
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
            <div class="field">
                <label for="theater_name">Theater</label>
                <input type="text" name="theater_name" id="theater_name" value="${escapeHtml(v.theater_name || "")}" maxlength="100" required>
            </div>
            <div class="field">
                <label for="city">City</label>
                <input type="text" name="city" id="city" value="${escapeHtml(v.city || "")}" maxlength="80" required>
            </div>
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

// Shown when someone tries to change a row that belongs to another user
function forbiddenPage(user, text) {
  const body = `        <h1>Not allowed</h1>
        <p>${escapeHtml(text)}</p>
        <p><a href="/screenings">Back to screenings</a></p>`;
  return layout({ title: "Not allowed", user, active: "screenings", body });
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

module.exports = { FORMATS, EVENT_TYPES, escapeHtml, layout, homePage, aboutPage, loginPage, registerPage, screeningsPage, screeningFormPage, forbiddenPage, comingSoonPage, notFoundPage };
