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

module.exports = { escapeHtml, layout, homePage, aboutPage, loginPage, registerPage, comingSoonPage, notFoundPage };
