var rubixbutton = document.getElementById('rubix-button');

var rubixface = document.querySelector('.rubix-face');
var rubixcells = rubixface.children;
console.log(rubixcells);

function getRandomColor() {
    var colors = [
        '#0082df', // Blue
        '#ffff00', // Yellow
        '#ff0000', // Red
        '#00ff00', // Green
        '#ff7f00', // Orange
        '#ffffff', // White
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

//Also run this code when the website loads
window.onload = function () {
    for (var i = 0; i < rubixcells.length; i++) {
        rubixcells[i].style.backgroundColor = getRandomColor();
        rubixcells[i].style.transition = '1s'; // Add transition for smooth color change
    }
};

// Add event listener to the button
rubixbutton.addEventListener(
    'click',
    function () {
        for (var i = 0; i < rubixcells.length; i++) {
            rubixcells[i].style.backgroundColor = getRandomColor();
        }
    }
);

var contactForm = document.getElementById('contact-form');
var contactEmail = document.getElementById('contact-email');
var contactMessage = document.getElementById('contact-message');
var contanctSubmit = document.getElementById('contact-submit');
contactForm.addEventListener('submit', function (event) {
    event.preventDefault(); // Prevent form submission

    // Validate email
    if (!contactEmail.value || !contactMessage.value) {
        alert('Please fill in all fields.');
        return;
    }

    // Simulate sending an email
    alert('Email sent successfully!');

    // Clear the form
    contactEmail.value = '';
    contactMessage.value = '';
});

// Open email client
window.open('ezraclintoct@gmail.com?subject=subject&body=body');

