// TOC Toggle Functionality
document.addEventListener('DOMContentLoaded', function() {
    const toc = document.querySelector('.post-single .toc');
    const main = document.querySelector('.main');
    
    if (!toc || !main) return;
    
    const details = toc.querySelector('details');
    if (!details) return;
    
    // Listen for toggle events
    details.addEventListener('toggle', function() {
        if (details.open) {
            // TOC is expanded
            toc.classList.remove('collapsed');
            main.classList.remove('toc-hidden');
        } else {
            // TOC is collapsed
            toc.classList.add('collapsed');
            main.classList.add('toc-hidden');
        }
    });
});