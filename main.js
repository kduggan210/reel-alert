require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

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

function messagePage(title, message, linkHref, linkText) {
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
                </ul>
            </nav>
            <main class="site-content">
                <p class="message">${message}</p>
                <p><a href="${linkHref}">${linkText}</a></p>
            </main>
            <footer class="site-footer">
                <img src="/images/templogo.png" alt="Website logo.">
            </footer>
        </div>
    </body>
</html>`;
}

app.post("/register", async function (req, res) {
  const body = req.body || {};
  const username = (body.username || "").trim();
  const email = (body.email || "").trim();
  const plainPass = body.password || "";

  if (!username || !email || !plainPass) {
    return res.send('<p>All fields are required. <a href="register.html">Back to register</a></p>');
  }
  if (username.length > 50 || email.length > 100) {
    return res.send('<p>Username (max 50) or e-mail (max 100) is too long. <a href="register.html">Back to register</a></p>');
  }

  try {
    const hash = await bcrypt.hash(plainPass, SALT_ROUNDS);
    const sql = "insert into users (username, email, password_hash) values (?,?,?)";
    conn.query(sql, [username, email, hash], function (err) {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res.send('<p>That username or e-mail is already taken. <a href="register.html">Try again</a></p>');
        console.log("Error inserting user", err);
        return res.send("<p>Something went wrong. Please try again.</p>");
      }
      res.send('<p>You have successfully registered. <a href="login.html">Login</a> here</p>');
    });
  } catch (e) {
    console.log("Hashing error", e);
    res.send("<p>Something went wrong. Please try again.</p>");
  }
});

app.post("/login", function (req, res) {
  const body = req.body || {};
  const username = (body.username || "").trim();
  const plainPass = body.password || "";

  const sql = "select password_hash from users where username = ?";
  conn.query(sql, [username], async function (err, rows) {
    if (err) {
      console.log("Login query error", err);
      return res.send("<p>Something went wrong. Please try again.</p>");
    }

    let ok = false;
    if (rows.length === 1) {
      try {
        ok = await bcrypt.compare(plainPass, rows[0].password_hash);
      } catch (e) {
        ok = false; // e.g. a malformed hash like the dummy seed row
      }
    }

    if (ok)
      res.send("<p>You have logged in successfully</p>");
    else
      res.send('<p>The login credentials were incorrect. <a href="login.html">Back to login</a></p>');
  });
});

app.listen(3000, function () {
  console.log("Server is running on port 3000");
});
