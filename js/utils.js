function showMessage(text, duration = 2000) {
    const message = document.createElement('div');
    message.style.position = 'absolute';
    message.style.top = '20px';
    message.style.left = '50%';
    message.style.transform = 'translateX(-50%)';
    message.style.background = 'rgba(0,0,0,0.7)';
    message.style.color = 'white';
    message.style.padding = '10px 20px';
    message.style.borderRadius = '20px';
    message.style.fontWeight = 'bold';
    message.style.zIndex = '1000';
    message.textContent = text;

    document.body.appendChild(message);

    setTimeout(() => {
        message.style.opacity = '0';
        message.style.transition = 'opacity 0.5s';
        setTimeout(() => document.body.removeChild(message), 500);
    }, duration);
}

function getAlivePlayers(players) {
    return Array.from(players.values()).filter(p => p.alive);
}

function shakeScreen(canvas) {
    canvas.style.transform = `translate(${Math.random() * 4 - 2}px, ${Math.random() * 4 - 2}px)`;
    setTimeout(() => {
        canvas.style.transform = 'translate(0, 0)';
    }, 100);
}
