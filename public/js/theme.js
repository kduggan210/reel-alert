// Grabs toggle button from html file
let theme_toggler = document.querySelector('#theme_toggler');

// Applies saved theme found in localStorage to the page
function retrieve_theme() {
    let theme = localStorage.getItem('website_theme');

    // Restores previously used theme if one was selected by user on last visit, does nothing otherwise
    if (theme != null) {
        // Clear old theme classes
        document.body.classList.remove('default', 'dark_mode');
        // Apply correct theme
        document.body.classList.add(theme);
    }
}

// Switch themes on a button click
theme_toggler.addEventListener('click', function () {
    document.body.classList.toggle('dark_mode');

    // Save theme so it is restored on subsequent visits 
    if (document.body.classList.contains('dark_mode')) {
        localStorage.setItem('website_theme', 'dark_mode');
    } else {
        localStorage.setItem('website_theme', 'default');
    }
 });

 // Apply saved theme as page loads
 retrieve_theme();

 // Applies theme changes across multiple open tabs
 window.addEventListener('storage', function () {
    retrieve_theme();
 }, false);
