require("dotenv").config();                     // loads .env values into process.env
const express = require("express");
const session = require("express-session");     // stores data per visitor on the server between requests
const cookieParser = require("cookie-parser");  // reads cookies
const bcrypt = require("bcryptjs");             // hashes and checks passwords
const mysql = require("mysql2");

// Session cookie is signed with a secret so it can't be forged. 
if (!process.env.SESSION_SECRET) {
  console.log("Missing SESSION_SECRET in .env. Add one and restart.");
  process.exit(1);
}

const app = express();
// Allows form data sent by register and login forms to be read
app.use(express.urlencoded({ extended: true }));
// Serves everything in public/ folder
app.use(express.static("public"));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET, // signs the session ID cookie
  resave: false,                      // don't resave a session that hasn't changed
  saveUninitialized: false,           // don't create sessions for visitors hwo never log in
  cookie: {
    maxAge: 60000 * 60,               // cookie expires after 1 hour
    httpOnly: true,                   // JavaScript in the page can't read the cookie
    sameSite: "lax",                  // browser won't send the cookie on most cross-site requests
    secure: false                     // set to true once the site is served over HTTPS
  }
}));

// Connection details are stored in .env for security
const conn = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

conn.connect(function (err) {
  if (err)
    console.log("Couldnt connect to MySQL", err);
  else
    console.log("Database connection established");
});

const SALT_ROUNDS = 12; // bcrypt stores the salt inside the hash, so no salt column is needed

// Turns characters that have special meaning in HTML into harmless text. Used on user typed inputs before being put in a page
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Wraps a message in the same layout as the static pages so every response matches the site.
// 'message' is passed as fixed text or user data run through escapeHtml() and 'links' is a list following: [{href: "/login.html", text: "Login" }]
function messagePage(title, message, links) {
  const linkHtml = links
    .map(function (l) { return `<a href="${l.href}">${l.text}</a>`; })
    .join(" &nbsp;|&nbsp; ");
 
  return `<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" type="text/css" href="/css/stylesheet.css">
        <link rel="stylesheet" type="text/css" href="/css/forms.css">
        <title>${title}</title>
        <script src="/js/theme.js" defer></script>
    </head>
    <body>
        <script>
            try {
                var savedTheme = localStorage.getItem('website_theme');
                if (savedTheme) document.body.classList.add(savedTheme);
            } catch (e) {}
        </script>
        <div class="page auth-page">
            <header class="site-header">
                <h1>${title}</h1>
                <button id="theme_toggler" type="button" aria-label="Toggle Dark Mode">Toggle Dark Mode</button>
            </header>
            <nav class="site-nav">
                <ul>
                    <li><a href="/about.html">About</a></li>
                    <li><a href="/register.html">Register</a></li>
                    <li><a href="/login.html">Login</a></li>
                    <li><a href="/profile">Profile</a></li>
                </ul>
            </nav>
            <main class="site-content">
                <p class="message">${message}</p>
                <p>${linkHtml}</p>
            </main>
            <footer class="site-footer">
                <img src="/images/templogo.png" alt="Website logo.">
            </footer>
        </div>
    </body>
</html>`;
}


// Receives the register form, hashes the password, and saves the new user
app.post("/register", async function (req, res) {
  const body = req.body || {};
  const username = (body.username || "").trim();
  const email = (body.email || "").trim();
  const plainPass = body.password || "";
 
  // Basic checks before touching the database
  if (!username || !email || !plainPass) {
    return res.send(messagePage("Register", "All fields are required.", [{ href: "/register.html", text: "Back to register" }]));
  }
  if (username.length > 50 || email.length > 100) {
    return res.send(messagePage("Register", "Username (max 50) or e-mail (max 100) is too long.", [{ href: "/register.html", text: "Back to register" }]));
  }
 
  try {
    // Store password hash
    const hash = await bcrypt.hash(plainPass, SALT_ROUNDS);
 
    // ? placeholders keep user input out of the SQL text, which prevents SQL injection
    const sql = "insert into users (username, email, password_hash) values (?,?,?)";
    conn.query(sql, [username, email, hash], function (err) {
      if (err) {
        // UNIQUE keys on username and email make MySQL reject duplicates 
        if (err.code === "ER_DUP_ENTRY")
          return res.send(messagePage("Register", "That username or e-mail is already taken.", [{ href: "/register.html", text: "Try again" }]));
        console.log("Error inserting user", err);
        return res.send(messagePage("Register", "Something went wrong. Please try again.", [{ href: "/register.html", text: "Back to register" }]));
      }
      res.send(messagePage("Register", "You have successfully registered.", [{ href: "/login.html", text: "Login" }]));
    });
  } catch (e) {
    console.log("Hashing error", e);
    res.send(messagePage("Register", "Something went wrong. Please try again.", [{ href: "/register.html", text: "Back to register" }]));
  }
});


// Checks the credentials and, if they are correct, stores the user in the session.
app.post("/login", function (req, res) {
  const body = req.body || {};
  const username = (body.username || "").trim();
  const plainPass = body.password || "";
 
  const sql = "select user_id, username, password_hash from users where username = ?";
  conn.query(sql, [username], async function (err, rows) {
    if (err) {
      console.log("Login query error", err);
      return res.send(messagePage("Login", "Something went wrong. Please try again.", [{ href: "/login.html", text: "Back to login" }]));
    }
 
    // Compare the typed password with the stored hash. An unknown username and a wrong password both end up as ok = false, so the message doesn't reveal which was wrong.
    let ok = false;
    if (rows.length === 1) {
      try {
        ok = await bcrypt.compare(plainPass, rows[0].password_hash);
      } catch (e) {
        ok = false; // a malformed hash
      }
    }
 
    if (!ok) {
      return res.send(messagePage("Login", "The login credentials were incorrect.", [{ href: "/login.html", text: "Back to login" }]));
    }
 
    // Credentials are correct. Start a brand-new session, then remember who logged in.
    req.session.regenerate(function (err) {
      if (err) {
        console.log("Session error", err);
        return res.send(messagePage("Login", "Something went wrong. Please try again.", [{ href: "/login.html", text: "Back to login" }]));
      }
 
      // The session variable. Store the username exactly as it is in the database.
      req.session.user = {
        user_id: rows[0].user_id,
        username: rows[0].username
      };
 
      // Make sure the session is saved before response
      req.session.save(function (err) {
        if (err) {
          console.log("Session save error", err);
          return res.send(messagePage("Login", "Something went wrong. Please try again.", [{ href: "/login.html", text: "Back to login" }]));
        }
        res.send(messagePage("Login", "You have logged in successfully", [{ href: "/profile", text: "Visit your profile" }]));
      });
    });
  });
});


// Shows the logged in username, read from the session
app.get("/profile", function (req, res) {
  // No user in the session meaning the visitor isn't logged in
  if (!req.session.user) {
    return res.send(messagePage("Profile", "You are not logged in.", [{ href: "/login.html", text: "Login" }]));
  }

  // Username came from user input at registration, so escape before showing it.
  const name = escapeHtml(req.session.user.username);
  res.send(messagePage("Profile", `Hello ${name}. You are logged in.`, [{ href: "/logout", text: "Logout" }]));
});


// Destroys the session, which removes the stored user, then confirms.
app.get("/logout", function (req, res) {
  req.session.destroy(function (err) {
    if (err) {
      console.log("Logout error", err);
      return res.send(messagePage("Logout", "Error logging out.", [{ href: "/profile", text: "Back to profile" }]));
    }
    res.clearCookie("connect.sid");  // also remove the session cookie from the browser
    res.send(messagePage("Logout", "Logged out successfully.", [{ href: "/login.html", text: "Login" }]));
  });
});

app.listen(3000, function () {
  console.log("Server is running on port 3000");
});
