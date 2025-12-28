[file name]: chat.js
[file content begin]
const Chat = {
    isVisible: false,
    messages: [],
    maxMessages: 50,
    
    init() {
        // Обработка ввода на ПК
        document.getElementById('chatInput').addEventListener('keydown', (e) => {
            if (!Game.isRunning) return;
            
            if (e.key === 'Enter') {
                this.sendMessage();
                e.preventDefault();
            } else if (e.key === 'Escape') {
                this.toggle();
                e.preventDefault();
            }
        });
        
        // Обработка ввода на мобильных
        const chatInput = document.getElementById('chatInput');
        chatInput.addEventListener('focus', () => {
            if (this.isMobile) {
                // При фокусе на мобильных немного поднимаем поле ввода
                document.getElementById('chatWindow').style.bottom = '200px';
            }
        });
        
        chatInput.addEventListener('blur', () => {
            if (this.isMobile) {
                // Возвращаем обратно
                document.getElementById('chatWindow').style.bottom = '';
            }
        });
    },
    
    toggle() {
        this.isVisible = !this.isVisible;
        const chatWindow = document.getElementById('chatWindow');
        
        if (this.isVisible) {
            chatWindow.style.display = 'flex';
            document.getElementById('chatInput').focus();
            
            // Блокируем управление при открытом чате
            if (Controls.isPC) {
                document.exitPointerLock();
            }
        } else {
            chatWindow.style.display = 'none';
            document.getElementById('chatInput').blur();
            document.getElementById('chatInput').value = '';
            
            // Восстанавливаем управление
            if (Controls.isPC && Game.isRunning) {
                const canvas = document.getElementById('gameCanvas');
                canvas.requestPointerLock();
            }
        }
    },
    
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && Network.isConnected) {
            Network.sendChat(message);
            input.value = '';
            
            // Автоматически закрываем чат на мобильных после отправки
            if (Controls.isMobile) {
                setTimeout(() => this.toggle(), 100);
            }
        }
    },
    
    addMessage(text, type = 'normal', sender = '') {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = type;
        
        let displayText = text;
        if (sender) {
            displayText = `<strong>${sender}:</strong> ${text}`;
        }
        
        messageDiv.innerHTML = displayText;
        chatMessages.appendChild(messageDiv);
        
        // Лимит сообщений
        this.messages.push({ text, type, sender });
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
            if (chatMessages.firstChild) {
                chatMessages.removeChild(chatMessages.firstChild);
            }
        }
        
        // Автопрокрутка
        chatMessages.scrollTop = chatMessages.scrollHeight;
    },
    
    addSystemMessage(text) {
        this.addMessage(text, 'system');
    },
    
    addKillMessage(killer, victim) {
        this.addMessage(`${killer} убил ${victim}`, 'kill');
    },
    
    clear() {
        document.getElementById('chatMessages').innerHTML = '';
        this.messages = [];
    }
};

// Инициализация чата при загрузке
window.addEventListener('DOMContentLoaded', () => {
    Chat.init();
});
[file content end]
