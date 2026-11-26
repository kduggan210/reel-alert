// main.js - Reel Alert server.
// shared layout, login-aware navigation, registration, login (sessions), logout, and screenings (list, create, edit, delete).

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
  port: process.env.DB_PORT,
  dateStrings: true   // return DATE/TIME columns as plain text like '2026-12-05' instead of JavaScript Date objects
});
conn.connect(function (err) {
  if (err) console.log("Couldnt connect to MySQL", err);
  else console.log("Database connection established");
});

const SALT_ROUNDS = 12; // bcrypt cost: higher is slower to guess; the salt is stored inside the hash

// ---------- Access control ----------
// Logged-out visitors can't use these routes. Page views (GET) are redirected to the login page;
// anything that tries to change data (POST) is refused with a 401 error, so nothing can be added,
// edited or deleted without logging in.
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  if (req.method === "GET") return res.redirect("/login?need=1");
  res.status(401).send(views.loginPage(undefined, { error: "You must be logged in to do that." }));
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
  if (req.query.deleted) notice = "Your account has been deleted.";
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

// ---------- Profile (logged in) ----------
// Four small forms, each with its own route. Every one works on req.session.user.user_id only,
// so a person can never change someone else's account, whatever the form contains.
const PROFILE_NOTICES = {
  account: "Account saved.", location: "Location saved.", password: "Password changed."
};

// Loads the current user's row, then calls done(row). Redirects to login if the account no longer exists.
function withProfile(req, res, done) {
  const sql = "select user_id, username, email, home_zip, max_travel_radius_mi, created_at from users where user_id = ?";
  conn.query(sql, [req.session.user.user_id], function (err, rows) {
    if (err) {
      console.log("Profile lookup error", err);
      return res.status(500).send(views.forbiddenPage(req.session.user, "Something went wrong. Please try again.", { href: "/", label: "Back to home" }));
    }
    if (rows.length === 0) return res.redirect("/logout");
    done(rows[0]);
  });
}

// Shows the profile page again with data from the database, plus any extras (errors, typed values).
function showProfile(req, res, row, extra) {
  const x = extra || {};
  res.status(x.status || 200).send(views.profilePage(req.session.user, {
    account: x.account || row, location: x.location || row, created_at: row.created_at,
    notice: x.notice, errors: x.errors
  }));
}

app.get("/profile", requireLogin, function (req, res) {
  withProfile(req, res, function (row) {
    // ?saved=... only selects a fixed message, never user text
    showProfile(req, res, row, { notice: PROFILE_NOTICES[req.query.saved] });
  });
});

// Update username and e-mail
app.post("/profile/account", requireLogin, function (req, res) {
  withProfile(req, res, function (row) {
    const b = req.body || {};
    const account = { username: (b.username || "").trim(), email: (b.email || "").trim() };
    const fail = function (msg, status) { showProfile(req, res, row, { account, errors: { account: msg }, status: status || 400 }); };

    if (!account.username || !account.email) return fail("Username and e-mail are required.");
    if (account.username.length > 50 || account.email.length > 100) return fail("Username (max 50) or e-mail (max 100) is too long.");

    conn.query("update users set username = ?, email = ? where user_id = ?",
      [account.username, account.email, req.session.user.user_id], function (err) {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") return fail("That username or e-mail is already taken.");
          console.log("Error updating account", err);
          return fail("Something went wrong. Please try again.", 500);
        }
        req.session.user.username = account.username;   // so the header shows the new name straight away
        res.redirect("/profile?saved=account");
      });
  });
});

// Update home ZIP and travel radius
app.post("/profile/location", requireLogin, function (req, res) {
  withProfile(req, res, function (row) {
    const b = req.body || {};
    const location = { home_zip: (b.home_zip || "").trim(), max_travel_radius_mi: (b.max_travel_radius_mi || "").trim() };
    const fail = function (msg, status) { showProfile(req, res, row, { location, errors: { location: msg }, status: status || 400 }); };

    if (location.home_zip !== "" && !/^\d{5}$/.test(location.home_zip)) return fail("Enter a 5-digit ZIP code, or leave it blank.");
    if (!/^\d+$/.test(location.max_travel_radius_mi) || +location.max_travel_radius_mi < 1 || +location.max_travel_radius_mi > 500)
      return fail("Travel radius must be a whole number from 1 to 500.");

    // The saved coordinates belonged to the old ZIP, so they are cleared whenever the ZIP is saved
    // (the "near me" step fills them in again from the new ZIP).
    const zip = location.home_zip === "" ? null : location.home_zip;
    conn.query("update users set home_zip = ?, latitude = null, longitude = null, max_travel_radius_mi = ? where user_id = ?",
      [zip, Number(location.max_travel_radius_mi), req.session.user.user_id], function (err) {
        if (err) {
          console.log("Error updating location", err);
          return fail("Something went wrong. Please try again.", 500);
        }
        res.redirect("/profile?saved=location");
      });
  });
});

// Change password: needs the current one, so a borrowed logged-in browser can't lock the owner out
app.post("/profile/password", requireLogin, function (req, res) {
  const b = req.body || {};
  const current = b.current_password || "", next = b.new_password || "", confirm = b.confirm_password || "";
  conn.query("select password_hash from users where user_id = ?", [req.session.user.user_id], function (err, rows) {
    withProfile(req, res, async function (row) {
      const fail = function (msg, status) { showProfile(req, res, row, { errors: { password: msg }, status: status || 400 }); };
      if (err || rows.length === 0) return fail("Something went wrong. Please try again.", 500);
      if (next.length < 8) return fail("New password must be at least 8 characters.");
      if (next !== confirm) return fail("The new passwords do not match.");
      try {
        if (!(await bcrypt.compare(current, rows[0].password_hash))) return fail("Your current password is incorrect.");
        const hash = await bcrypt.hash(next, SALT_ROUNDS);
        conn.query("update users set password_hash = ? where user_id = ?", [hash, req.session.user.user_id], function (err2) {
          if (err2) { console.log("Error changing password", err2); return fail("Something went wrong. Please try again.", 500); }
          res.redirect("/profile?saved=password");
        });
      } catch (e) {
        console.log("Password change error", e);
        fail("Something went wrong. Please try again.", 500);
      }
    });
  });
});

// Delete the account. Foreign keys with ON DELETE CASCADE remove the user's screenings and reports too.
app.post("/profile/delete", requireLogin, function (req, res) {
  const password = (req.body || {}).password || "";
  conn.query("select password_hash from users where user_id = ?", [req.session.user.user_id], function (err, rows) {
    withProfile(req, res, async function (row) {
      const fail = function (msg, status) { showProfile(req, res, row, { errors: { delete: msg }, status: status || 400 }); };
      if (err || rows.length === 0) return fail("Something went wrong. Please try again.", 500);
      try {
        if (!(await bcrypt.compare(password, rows[0].password_hash))) return fail("That password is incorrect, so nothing was deleted.");
        conn.query("delete from users where user_id = ?", [req.session.user.user_id], function (err2) {
          if (err2) { console.log("Error deleting account", err2); return fail("Something went wrong. Please try again.", 500); }
          req.session.destroy(function () {
            res.clearCookie("connect.sid");
            res.redirect("/login?deleted=1");
          });
        });
      } catch (e) {
        console.log("Account delete error", e);
        fail("Something went wrong. Please try again.", 500);
      }
    });
  });
});

// ---------- Theaters (shared by screenings and format reports) ----------
// A screening or report points at a theater row. On the add/edit forms the person either picks an existing
// theater from the list or opens "Theater not listed?" and types a new one.

// Loads the theater list for the picker, then renders a form page. Used for every add/edit form render.
function sendForm(res, builder, user, options, status) {
  conn.query("select theater_id, name, city from theaters order by name, city", function (err, theaters) {
    if (err) { console.log("Theater list error", err); theaters = []; }
    options.theaters = theaters;
    res.status(status || 200).send(builder(user, options));
  });
}

// Works out which theater a form chose. Calls done(errorMessage, theaterId); errorMessage is null when it worked.
//   - "new theater" fields filled in -> validate them, then reuse a theater with the same name + city or create one
//   - otherwise the dropdown value must be the id of an existing theater
function resolveTheater(body, userId, done) {
  const b = body || {};
  const name = (b.new_theater_name || "").trim();

  if (name === "") {
    if (!/^\d+$/.test(String(b.theater_id || ""))) return done("Choose a theater, or add a new one.");
    return conn.query("select theater_id from theaters where theater_id = ?", [b.theater_id], function (err, rows) {
      if (err) { console.log("Theater lookup error", err); return done("Something went wrong. Please try again."); }
      if (rows.length === 0) return done("That theater doesn't exist. Choose one from the list.");
      done(null, rows[0].theater_id);
    });
  }

  const city = (b.new_theater_city || "").trim();
  const address = (b.new_theater_address || "").trim();
  const state = (b.new_theater_state || "").trim().toUpperCase();
  const zip = (b.new_theater_zip || "").trim();
  if (!city) return done("A new theater needs a city.");
  if (name.length > 100 || city.length > 80 || address.length > 150) return done("New theater name (max 100), city (max 80) or address (max 150) is too long.");
  if (state !== "" && !/^[A-Z]{2}$/.test(state)) return done("State must be two letters, like GA.");
  if (zip !== "" && !/^\d{5}$/.test(zip)) return done("Theater ZIP must be 5 digits.");

  const find = function () {
    conn.query("select theater_id from theaters where name = ? and city = ?", [name, city], function (err, rows) {
      if (err || rows.length === 0) { console.log("Theater find error", err); return done("Something went wrong. Please try again."); }
      done(null, rows[0].theater_id);
    });
  };
  conn.query("insert into theaters (name, address, city, state, zip, created_by) values (?,?,?,?,?,?)",
    [name, address || null, city, state || null, zip || null, userId], function (err, result) {
      if (!err) return done(null, result.insertId);
      if (err.code === "ER_DUP_ENTRY") return find();   // already exists: use it instead of making a duplicate
      console.log("Error inserting theater", err);
      done("Something went wrong. Please try again.");
    });
}

// The typed "new theater" fields, put back into the form if something is wrong
function newTheaterValues(body) {
  const b = body || {};
  return { new_theater_name: b.new_theater_name || "", new_theater_address: b.new_theater_address || "",
           new_theater_city: b.new_theater_city || "", new_theater_state: b.new_theater_state || "", new_theater_zip: b.new_theater_zip || "" };
}

// ---------- Screenings (first CRUD area) ----------

// ---- Screenings: list (Read) ----
app.get("/screenings", requireLogin, function (req, res) {
  // join users (who added it) and theaters (where it is shown)
  const sql = `select s.screening_id, s.movie_title, t.name as theater_name, t.city, s.show_date, s.show_time,
                      s.screen_format, s.event_type, s.user_id, u.username
               from screenings s
               join users u on u.user_id = s.user_id
               join theaters t on t.theater_id = s.theater_id
               order by s.show_date, s.show_time`;
  conn.query(sql, function (err, rows) {
    if (err) {
      console.log("Screenings query error", err);
      return res.status(500).send(views.comingSoonPage(req.session.user, "Screenings", "screenings", "Something went wrong loading screenings."));
    }
    // ?added=1 only selects a fixed message, never user text
    let notice;
    if (req.query.added) notice = "Screening added.";
    if (req.query.updated) notice = "Screening updated.";
    if (req.query.deleted) notice = "Screening deleted.";
    res.send(views.screeningsPage(req.session.user, { rows, notice }));
  });
});

// ---- Screenings: add form ----
// Must stay above any /screenings/:id route, or "new" would be read as an id.
app.get("/screenings/new", requireLogin, function (req, res) {
  sendForm(res, views.screeningFormPage, req.session.user, {
    title: "Add a screening", action: "/screenings", submitText: "Add screening", values: {}
  });
});

// Checks the form data. Returns { values } with cleaned data, or { values, error } if something is wrong.
// (The theater is checked separately by resolveTheater.)
function readScreeningForm(body) {
  const b = body || {};
  const values = {
    theater_id: (b.theater_id || "").trim(),
    ...newTheaterValues(b),
    movie_title: (b.movie_title || "").trim(),
    show_date: (b.show_date || "").trim(),
    show_time: (b.show_time || "").trim(),
    screen_format: (b.screen_format || "").trim(),
    event_type: (b.event_type || "").trim()
  };

  if (!values.movie_title) return { values, error: "Movie is required." };
  if (values.movie_title.length > 150) return { values, error: "Movie title is too long (max 150)." };

  // Date must look like 2026-12-05 and be a real calendar day (rejects things like 2026-02-31)
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(values.show_date);
  const realDate = d && new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).toISOString().slice(0, 10) === values.show_date;
  if (!realDate) return { values, error: "Enter a valid date." };

  const t = /^(\d{2}):(\d{2})$/.exec(values.show_time);
  if (!t || +t[1] > 23 || +t[2] > 59) return { values, error: "Enter a valid time." };

  if (!views.FORMATS.includes(values.screen_format)) return { values, error: "Choose one of the listed formats." };
  if (!views.EVENT_TYPES.includes(values.event_type)) return { values, error: "Choose one of the listed event types." };

  return { values };
}

// ---- Screenings: create ----
app.post("/screenings", requireLogin, function (req, res) {
  const page = { title: "Add a screening", action: "/screenings", submitText: "Add screening" };
  const result = readScreeningForm(req.body);
  if (result.error) {
    return sendForm(res, views.screeningFormPage, req.session.user, { ...page, values: result.values, error: result.error }, 400);
  }

  const v = result.values;
  resolveTheater(req.body, req.session.user.user_id, function (theaterError, theaterId) {
    if (theaterError) return sendForm(res, views.screeningFormPage, req.session.user, { ...page, values: v, error: theaterError }, 400);

    // The owner always comes from the session, never from the form, so nobody can add a row as someone else
    const sql = `insert into screenings (user_id, theater_id, movie_title, show_date, show_time, screen_format, event_type)
                 values (?,?,?,?,?,?,?)`;
    const params = [req.session.user.user_id, theaterId, v.movie_title, v.show_date, v.show_time, v.screen_format, v.event_type];
    conn.query(sql, params, function (err) {
      if (err) {
        console.log("Error inserting screening", err);
        return sendForm(res, views.screeningFormPage, req.session.user, { ...page, values: v, error: "Something went wrong. Please try again." }, 500);
      }
      res.redirect("/screenings?added=1");
    });
  });
});

// ---- Screenings: edit / update / delete ----
// Finds the screening named in the URL and checks that the logged-in user owns it.
//   - id isn't a number, or no such screening -> 404 page
//   - screening belongs to someone else        -> 403 page (nothing is changed)
// Only when it is yours does it call done(row).
function withOwnedScreening(req, res, done) {
  const user = req.session.user;
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).send(views.notFoundPage(user));
  }
  conn.query("select * from screenings where screening_id = ?", [req.params.id], function (err, rows) {
    if (err) {
      console.log("Screening lookup error", err);
      return res.status(500).send(views.forbiddenPage(user, "Something went wrong. Please try again."));
    }
    if (rows.length === 0) return res.status(404).send(views.notFoundPage(user));
    if (Number(rows[0].user_id) !== Number(user.user_id)) {
      return res.status(403).send(views.forbiddenPage(user, "You can only change screenings you added."));
    }
    done(rows[0]);
  });
}

// Edit form, filled in with the current values
app.get("/screenings/:id/edit", requireLogin, function (req, res) {
  withOwnedScreening(req, res, function (row) {
    sendForm(res, views.screeningFormPage, req.session.user, {
      title: "Edit screening", action: "/screenings/" + row.screening_id, submitText: "Save changes", values: row
    });
  });
});

// Update: same checks as creating, then saves the changes
app.post("/screenings/:id", requireLogin, function (req, res) {
  withOwnedScreening(req, res, function (row) {
    const page = { title: "Edit screening", action: "/screenings/" + row.screening_id, submitText: "Save changes" };
    const result = readScreeningForm(req.body);
    if (result.error) {
      return sendForm(res, views.screeningFormPage, req.session.user, { ...page, values: result.values, error: result.error }, 400);
    }

    const v = result.values;
    resolveTheater(req.body, req.session.user.user_id, function (theaterError, theaterId) {
      if (theaterError) return sendForm(res, views.screeningFormPage, req.session.user, { ...page, values: v, error: theaterError }, 400);

      // "and user_id = ?" repeats the ownership check inside the query itself. The owner is never taken from the form.
      const sql = `update screenings set theater_id = ?, movie_title = ?, show_date = ?, show_time = ?,
                          screen_format = ?, event_type = ?
                   where screening_id = ? and user_id = ?`;
      const params = [theaterId, v.movie_title, v.show_date, v.show_time, v.screen_format, v.event_type,
                      row.screening_id, req.session.user.user_id];
      conn.query(sql, params, function (err) {
        if (err) {
          console.log("Error updating screening", err);
          return sendForm(res, views.screeningFormPage, req.session.user, { ...page, values: v, error: "Something went wrong. Please try again." }, 500);
        }
        res.redirect("/screenings?updated=1");
      });
    });
  });
});

// Delete (a POST, so a link or page refresh can never delete anything by accident)
app.post("/screenings/:id/delete", requireLogin, function (req, res) {
  withOwnedScreening(req, res, function (row) {
    conn.query("delete from screenings where screening_id = ? and user_id = ?",
      [row.screening_id, req.session.user.user_id], function (err) {
        if (err) {
          console.log("Error deleting screening", err);
          return res.status(500).send(views.forbiddenPage(req.session.user, "Something went wrong. Please try again."));
        }
        res.redirect("/screenings?deleted=1");
      });
  });
});

// ---------- Format reports (second CRUD area) ----------
// Same rules as screenings: login for everything, and only the owner can edit or delete a report.
const REPORTS_BACK = { href: "/reports", label: "Back to format reports" };

// ---- Reports: list (Read) ----
app.get("/reports", requireLogin, function (req, res) {
  const sql = `select r.report_id, t.name as theater_name, t.city, r.screen_name, r.projection_type, r.picture_rating,
                      r.sound_rating, r.comment, r.user_id, u.username
               from format_reports r
               join users u on u.user_id = r.user_id
               join theaters t on t.theater_id = r.theater_id
               order by t.name, r.screen_name, r.report_id`;
  conn.query(sql, function (err, rows) {
    if (err) {
      console.log("Reports query error", err);
      return res.status(500).send(views.forbiddenPage(req.session.user, "Something went wrong loading reports.", REPORTS_BACK));
    }
    // ?added=1 only selects a fixed message, never user text
    let notice;
    if (req.query.added) notice = "Report added.";
    if (req.query.updated) notice = "Report updated.";
    if (req.query.deleted) notice = "Report deleted.";
    res.send(views.reportsPage(req.session.user, { rows, notice }));
  });
});

// ---- Reports: add form (must stay above /reports/:id routes) ----
app.get("/reports/new", requireLogin, function (req, res) {
  sendForm(res, views.reportFormPage, req.session.user, {
    title: "Add a format report", action: "/reports", submitText: "Add report", values: {}
  });
});

// Checks the form data. Returns { values } with cleaned data, or { values, error } if something is wrong.
function readReportForm(body) {
  const b = body || {};
  const values = {
    theater_id: (b.theater_id || "").trim(),
    ...newTheaterValues(b),
    screen_name: (b.screen_name || "").trim(),
    projection_type: (b.projection_type || "").trim(),
    picture_rating: (b.picture_rating || "").trim(),
    sound_rating: (b.sound_rating || "").trim(),
    comment: (b.comment || "").trim()
  };

  if (!values.screen_name) return { values, error: "Screen is required." };
  if (values.screen_name.length > 50) return { values, error: "Screen name is too long (max 50)." };
  if (!views.FORMATS.includes(values.projection_type)) return { values, error: "Choose one of the listed formats." };
  if (!/^[1-5]$/.test(values.picture_rating) || !/^[1-5]$/.test(values.sound_rating))
    return { values, error: "Ratings must be whole numbers from 1 to 5." };
  if (values.comment.length > 1000) return { values, error: "Comment is too long (max 1000 characters)." };

  return { values };
}

// ---- Reports: create ----
app.post("/reports", requireLogin, function (req, res) {
  const page = { title: "Add a format report", action: "/reports", submitText: "Add report" };
  const result = readReportForm(req.body);
  if (result.error) {
    return sendForm(res, views.reportFormPage, req.session.user, { ...page, values: result.values, error: result.error }, 400);
  }

  const v = result.values;
  resolveTheater(req.body, req.session.user.user_id, function (theaterError, theaterId) {
    if (theaterError) return sendForm(res, views.reportFormPage, req.session.user, { ...page, values: v, error: theaterError }, 400);

    // The owner always comes from the session, never from the form
    const sql = `insert into format_reports (user_id, theater_id, screen_name, projection_type, picture_rating, sound_rating, comment)
                 values (?,?,?,?,?,?,?)`;
    const params = [req.session.user.user_id, theaterId, v.screen_name, v.projection_type,
                    Number(v.picture_rating), Number(v.sound_rating), v.comment === "" ? null : v.comment];
    conn.query(sql, params, function (err) {
      if (err) {
        console.log("Error inserting report", err);
        return sendForm(res, views.reportFormPage, req.session.user, { ...page, values: v, error: "Something went wrong. Please try again." }, 500);
      }
      res.redirect("/reports?added=1");
    });
  });
});

// Finds the report named in the URL and checks that the logged-in user owns it.
//   - id isn't a number, or no such report -> 404 page
//   - report belongs to someone else        -> 403 page (nothing is changed)
// Only when it is yours does it call done(row).
function withOwnedReport(req, res, done) {
  const user = req.session.user;
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(404).send(views.notFoundPage(user));
  }
  conn.query("select * from format_reports where report_id = ?", [req.params.id], function (err, rows) {
    if (err) {
      console.log("Report lookup error", err);
      return res.status(500).send(views.forbiddenPage(user, "Something went wrong. Please try again.", REPORTS_BACK));
    }
    if (rows.length === 0) return res.status(404).send(views.notFoundPage(user));
    if (Number(rows[0].user_id) !== Number(user.user_id)) {
      return res.status(403).send(views.forbiddenPage(user, "You can only change reports you added.", REPORTS_BACK));
    }
    done(rows[0]);
  });
}

// ---- Reports: edit form, filled in with the current values ----
app.get("/reports/:id/edit", requireLogin, function (req, res) {
  withOwnedReport(req, res, function (row) {
    sendForm(res, views.reportFormPage, req.session.user, {
      title: "Edit format report", action: "/reports/" + row.report_id, submitText: "Save changes", values: row
    });
  });
});

// ---- Reports: update ----
app.post("/reports/:id", requireLogin, function (req, res) {
  withOwnedReport(req, res, function (row) {
    const page = { title: "Edit format report", action: "/reports/" + row.report_id, submitText: "Save changes" };
    const result = readReportForm(req.body);
    if (result.error) {
      return sendForm(res, views.reportFormPage, req.session.user, { ...page, values: result.values, error: result.error }, 400);
    }

    const v = result.values;
    resolveTheater(req.body, req.session.user.user_id, function (theaterError, theaterId) {
      if (theaterError) return sendForm(res, views.reportFormPage, req.session.user, { ...page, values: v, error: theaterError }, 400);

      // "and user_id = ?" repeats the ownership check inside the query itself
      const sql = `update format_reports set theater_id = ?, screen_name = ?, projection_type = ?,
                          picture_rating = ?, sound_rating = ?, comment = ?
                   where report_id = ? and user_id = ?`;
      const params = [theaterId, v.screen_name, v.projection_type, Number(v.picture_rating), Number(v.sound_rating),
                      v.comment === "" ? null : v.comment, row.report_id, req.session.user.user_id];
      conn.query(sql, params, function (err) {
        if (err) {
          console.log("Error updating report", err);
          return sendForm(res, views.reportFormPage, req.session.user, { ...page, values: v, error: "Something went wrong. Please try again." }, 500);
        }
        res.redirect("/reports?updated=1");
      });
    });
  });
});

// ---- Reports: delete (a POST, so a link or refresh can never delete anything) ----
app.post("/reports/:id/delete", requireLogin, function (req, res) {
  withOwnedReport(req, res, function (row) {
    conn.query("delete from format_reports where report_id = ? and user_id = ?",
      [row.report_id, req.session.user.user_id], function (err) {
        if (err) {
          console.log("Error deleting report", err);
          return res.status(500).send(views.forbiddenPage(req.session.user, "Something went wrong. Please try again.", REPORTS_BACK));
        }
        res.redirect("/reports?deleted=1");
      });
  });
});

// Anything else
app.use(function (req, res) {
  res.status(404).send(views.notFoundPage(req.session.user));
});

app.listen(3000, function () {
  console.log("Server is running on port 3000");
});
