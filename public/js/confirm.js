// Asks "are you sure?" before submitting any form marked with data-confirm="message".
// Used for Delete buttons: if the user clicks Cancel, the form is not sent.
document.addEventListener('submit', function (e) {
    const message = e.target.getAttribute('data-confirm');
    if (message && !window.confirm(message)) {
        e.preventDefault();
    }
});
