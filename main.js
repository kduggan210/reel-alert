// main.js - Reel Alert server.
// shared layout, login-aware navigation, registration, login (sessions) and logout.

require("dotenv").config();               // loads .env values into process.env
const express = require("express");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2");
const views = require("./views");

// The session cookie is signed with a secret; stop early with a clear message if it's missing
if (!process.env.SESSION_SECRET) {
  console.log("Missing SESSION_SECRET in .env. Add one and restart (see .env.example).");
  process.exit(1);
}

const app = express();
app.use(express.urlencoded({ extended: true })); // read form data into req.body
app.use(express.static("public"));               // css/ and js/ files
app.use(cookieParser());

// Sessions: req.session.user is kept on the server; the browser only holds a random ID cookie.
// No maxAge is set, so it is a session cookie: it lasts until the browser is closed or the user logs out.
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,   // page JavaScript can't read the cookie
    sameSite: "lax",  // not sent with most cross-site requests
    secure: false     // set to true once the site is served over HTTPS
  }
}));

// Database connection (values come from .env so the password isn't in the code)
const conn = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});
conn.connect(function (err) {
  if (err) console.log("Couldnt connect to MySQL", err);
  else console.log("Database connection established");
});

const SALT_ROUNDS = 12; // bcrypt cost: higher is slower to guess; the salt is stored inside the hash

// ---------- Access control ----------
// Logged-out visitors are sent to the login page instead.
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/login?need=1");
}

// ---------- Public pages ----------
app.get("/", function (req, res) { res.send(views.homePage(req.session.user)); });
app.get("/about", function (req, res) { res.send(views.aboutPage(req.session.user)); });

// Login page. The ?need and ?registered flags only select fixed messages, never user text.
app.get("/login", function (req, res) {
  if (req.session.user) return res.redirect("/");
  let notice;
  if (req.query.registered) notice = "Account created. You can log in now.";
  if (req.query.need) notice = "Please log in to see that page.";
  if (req.query.loggedout) notice = "You have been logged out.";
  res.send(views.loginPage(undefined, { notice }));
});

app.get("/register", function (req, res) {
  if (req.session.user) return res.redirect("/");
  res.send(views.registerPage(undefined));
});

// ---------- Register ----------
app.post("/register", async function (req, res) {
  const body = req.body || {};
  const username = (body.username || "").trim();
  const email = (body.email || "").trim();
  const plainPass = body.password || "";
  const keep = { username, email };   // put back in the form if something is wrong

  if (!username || !email || !plainPass) {
    return res.send(views.registerPage(undefined, { ...keep, error: "All fields are required." }));
  }
  if (username.length > 50 || email.length > 100) {
    return res.send(views.registerPage(undefined, { ...keep, error: "Username (max 50) or e-mail (max 100) is too long." }));
  }
  if (plainPass.length < 8) {
    return res.send(views.registerPage(undefined, { ...keep, error: "Password must be at least 8 characters." }));
  }

  try {
    const hash = await bcrypt.hash(plainPass, SALT_ROUNDS);   // never store the plain password
    // ? placeholders keep user input out of the SQL text (prevents SQL injection)
    const sql = "insert into users (username, email, password_hash) values (?,?,?)";
    conn.query(sql, [username, email, hash], function (err) {
      if (err) {
        // UNIQUE keys on username and e-mail make MySQL reject duplicates with this code
        if (err.code === "ER_DUP_ENTRY")
          return res.send(views.registerPage(undefined, { ...keep, error: "That username or e-mail is already taken." }));
        console.log("Error inserting user", err);
        return res.send(views.registerPage(undefined, { ...keep, error: "Something went wrong. Please try again." }));
      }
      res.redirect("/login?registered=1");
    });
  } catch (e) {
    console.log("Hashing error", e);
    res.send(views.registerPage(undefined, { ...keep, error: "Something went wrong. Please try again." }));
  }
});

// ---------- Login ----------
app.post("/login", function (req, res) {
  const body = req.body || {};
  const username = (body.username || "").trim();
  const plainPass = body.password || "";

  const sql = "select user_id, username, password_hash from users where username = ?";
  conn.query(sql, [username], async function (err, rows) {
    if (err) {
      console.log("Login query error", err);
      return res.send(views.loginPage(undefined, { username, error: "Something went wrong. Please try again." }));
    }

    // Unknown username and wrong password both end up as ok = false, so the message never reveals which one was wrong.
    let ok = false;
    if (rows.length === 1) {
      try { ok = await bcrypt.compare(plainPass, rows[0].password_hash); } catch (e) { ok = false; }
    }
    if (!ok) {
      return res.send(views.loginPage(undefined, { username, error: "The login credentials were incorrect." }));
    }

    // Correct: start a fresh session (so an old session ID can't be reused), then remember the user
    req.session.regenerate(function (err) {
      if (err) {
        console.log("Session error", err);
        return res.send(views.loginPage(undefined, { username, error: "Something went wrong. Please try again." }));
      }
      req.session.user = { user_id: rows[0].user_id, username: rows[0].username };
      req.session.save(function (err) {
        if (err) {
          console.log("Session save error", err);
          return res.send(views.loginPage(undefined, { username, error: "Something went wrong. Please try again." }));
        }
        res.redirect("/");   // the nav now shows the username and a log out link
      });
    });
  });
});

// ---------- Logout ----------
// Destroys the session, which removes the stored user, then returns to the login page.
app.get("/logout", function (req, res) {
  req.session.destroy(function (err) {
    if (err) {
      console.log("Logout error", err);
      return res.redirect("/");
    }
    res.clearCookie("connect.sid");
    res.redirect("/login?loggedout=1");
  });
});

// ---------- Logged-in pages ----------
// The pages below are placeholders; the next steps fill in screenings and reports.
app.get("/profile", requireLogin, function (req, res) {
  res.send(views.comingSoonPage(req.session.user, "Profile", "profile",
    "You are logged in as " + req.session.user.username + "."));
});
app.get("/screenings", requireLogin, function (req, res) {
  res.send(views.comingSoonPage(req.session.user, "Screenings", "screenings", "Screenings will appear here."));
});
app.get("/reports", requireLogin, function (req, res) {
  res.send(views.comingSoonPage(req.session.user, "Format reports", "reports", "Format reports will appear here."));
});

// Anything else
app.use(function (req, res) {
  res.status(404).send(views.notFoundPage(req.session.user));
});

app.listen(3000, function () {
  console.log("Server is running on port 3000");
});
