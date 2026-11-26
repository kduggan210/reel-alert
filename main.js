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
// Profile is a placeholder and is built in a later step.
app.get("/profile", requireLogin, function (req, res) {
  res.send(views.comingSoonPage(req.session.user, "Profile", "profile",
    "You are logged in as " + req.session.user.username + "."));
});
// ---- Screenings: list (Read) ----
app.get("/screenings", requireLogin, function (req, res) {
  // join users so each row can show who added it
  const sql = `select s.screening_id, s.movie_title, s.theater_name, s.city, s.show_date, s.show_time,
                      s.screen_format, s.event_type, s.user_id, u.username
               from screenings s join users u on u.user_id = s.user_id
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
// Must stay above any /screenings/:id route added later, or "new" would be read as an id.
app.get("/screenings/new", requireLogin, function (req, res) {
  res.send(views.screeningFormPage(req.session.user, {
    title: "Add a screening", action: "/screenings", submitText: "Add screening", values: {}
  }));
});

// Checks the form data. Returns { values } with cleaned data, or { values, error } if something is wrong.
function readScreeningForm(body) {
  const b = body || {};
  const values = {
    movie_title: (b.movie_title || "").trim(),
    theater_name: (b.theater_name || "").trim(),
    city: (b.city || "").trim(),
    show_date: (b.show_date || "").trim(),
    show_time: (b.show_time || "").trim(),
    screen_format: (b.screen_format || "").trim(),
    event_type: (b.event_type || "").trim()
  };

  if (!values.movie_title || !values.theater_name || !values.city) return { values, error: "Movie, theater and city are required." };
  if (values.movie_title.length > 150 || values.theater_name.length > 100 || values.city.length > 80)
    return { values, error: "Movie (max 150), theater (max 100) or city (max 80) is too long." };

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
  const result = readScreeningForm(req.body);
  if (result.error) {
    return res.status(400).send(views.screeningFormPage(req.session.user, {
      title: "Add a screening", action: "/screenings", submitText: "Add screening",
      values: result.values, error: result.error
    }));
  }

  const v = result.values;
  // The owner always comes from the session, never from the form, so nobody can add a row as someone else
  const sql = `insert into screenings (user_id, movie_title, theater_name, city, show_date, show_time, screen_format, event_type)
               values (?,?,?,?,?,?,?,?)`;
  const params = [req.session.user.user_id, v.movie_title, v.theater_name, v.city, v.show_date, v.show_time, v.screen_format, v.event_type];
  conn.query(sql, params, function (err) {
    if (err) {
      console.log("Error inserting screening", err);
      return res.status(500).send(views.screeningFormPage(req.session.user, {
        title: "Add a screening", action: "/screenings", submitText: "Add screening",
        values: v, error: "Something went wrong. Please try again."
      }));
    }
    res.redirect("/screenings?added=1");
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
    res.send(views.screeningFormPage(req.session.user, {
      title: "Edit screening", action: "/screenings/" + row.screening_id, submitText: "Save changes", values: row
    }));
  });
});

// Update: same checks as creating, then saves the changes
app.post("/screenings/:id", requireLogin, function (req, res) {
  withOwnedScreening(req, res, function (row) {
    const result = readScreeningForm(req.body);
    const action = "/screenings/" + row.screening_id;
    if (result.error) {
      return res.status(400).send(views.screeningFormPage(req.session.user, {
        title: "Edit screening", action, submitText: "Save changes", values: result.values, error: result.error
      }));
    }

    const v = result.values;
    // "and user_id = ?" repeats the ownership check inside the query itself. The owner is never taken from the form.
    const sql = `update screenings set movie_title = ?, theater_name = ?, city = ?, show_date = ?, show_time = ?,
                        screen_format = ?, event_type = ?
                 where screening_id = ? and user_id = ?`;
    const params = [v.movie_title, v.theater_name, v.city, v.show_date, v.show_time, v.screen_format, v.event_type,
                    row.screening_id, req.session.user.user_id];
    conn.query(sql, params, function (err) {
      if (err) {
        console.log("Error updating screening", err);
        return res.status(500).send(views.screeningFormPage(req.session.user, {
          title: "Edit screening", action, submitText: "Save changes", values: v, error: "Something went wrong. Please try again."
        }));
      }
      res.redirect("/screenings?updated=1");
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
  const sql = `select r.report_id, r.theater_name, r.screen_name, r.projection_type, r.picture_rating,
                      r.sound_rating, r.comment, r.user_id, u.username
               from format_reports r join users u on u.user_id = r.user_id
               order by r.theater_name, r.screen_name, r.report_id`;
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
  res.send(views.reportFormPage(req.session.user, {
    title: "Add a format report", action: "/reports", submitText: "Add report", values: {}
  }));
});

// Checks the form data. Returns { values } with cleaned data, or { values, error } if something is wrong.
function readReportForm(body) {
  const b = body || {};
  const values = {
    theater_name: (b.theater_name || "").trim(),
    screen_name: (b.screen_name || "").trim(),
    projection_type: (b.projection_type || "").trim(),
    picture_rating: (b.picture_rating || "").trim(),
    sound_rating: (b.sound_rating || "").trim(),
    comment: (b.comment || "").trim()
  };

  if (!values.theater_name || !values.screen_name) return { values, error: "Theater and screen are required." };
  if (values.theater_name.length > 100 || values.screen_name.length > 50)
    return { values, error: "Theater (max 100) or screen (max 50) is too long." };
  if (!views.FORMATS.includes(values.projection_type)) return { values, error: "Choose one of the listed formats." };
  if (!/^[1-5]$/.test(values.picture_rating) || !/^[1-5]$/.test(values.sound_rating))
    return { values, error: "Ratings must be whole numbers from 1 to 5." };
  if (values.comment.length > 1000) return { values, error: "Comment is too long (max 1000 characters)." };

  return { values };
}

// ---- Reports: create ----
app.post("/reports", requireLogin, function (req, res) {
  const result = readReportForm(req.body);
  if (result.error) {
    return res.status(400).send(views.reportFormPage(req.session.user, {
      title: "Add a format report", action: "/reports", submitText: "Add report",
      values: result.values, error: result.error
    }));
  }

  const v = result.values;
  // The owner always comes from the session, never from the form
  const sql = `insert into format_reports (user_id, theater_name, screen_name, projection_type, picture_rating, sound_rating, comment)
               values (?,?,?,?,?,?,?)`;
  const params = [req.session.user.user_id, v.theater_name, v.screen_name, v.projection_type,
                  Number(v.picture_rating), Number(v.sound_rating), v.comment === "" ? null : v.comment];
  conn.query(sql, params, function (err) {
    if (err) {
      console.log("Error inserting report", err);
      return res.status(500).send(views.reportFormPage(req.session.user, {
        title: "Add a format report", action: "/reports", submitText: "Add report",
        values: v, error: "Something went wrong. Please try again."
      }));
    }
    res.redirect("/reports?added=1");
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
    res.send(views.reportFormPage(req.session.user, {
      title: "Edit format report", action: "/reports/" + row.report_id, submitText: "Save changes", values: row
    }));
  });
});

// ---- Reports: update ----
app.post("/reports/:id", requireLogin, function (req, res) {
  withOwnedReport(req, res, function (row) {
    const result = readReportForm(req.body);
    const action = "/reports/" + row.report_id;
    if (result.error) {
      return res.status(400).send(views.reportFormPage(req.session.user, {
        title: "Edit format report", action, submitText: "Save changes", values: result.values, error: result.error
      }));
    }

    const v = result.values;
    // "and user_id = ?" repeats the ownership check inside the query itself
    const sql = `update format_reports set theater_name = ?, screen_name = ?, projection_type = ?,
                        picture_rating = ?, sound_rating = ?, comment = ?
                 where report_id = ? and user_id = ?`;
    const params = [v.theater_name, v.screen_name, v.projection_type, Number(v.picture_rating), Number(v.sound_rating),
                    v.comment === "" ? null : v.comment, row.report_id, req.session.user.user_id];
    conn.query(sql, params, function (err) {
      if (err) {
        console.log("Error updating report", err);
        return res.status(500).send(views.reportFormPage(req.session.user, {
          title: "Edit format report", action, submitText: "Save changes", values: v, error: "Something went wrong. Please try again."
        }));
      }
      res.redirect("/reports?updated=1");
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
