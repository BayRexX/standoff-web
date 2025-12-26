const Chat = {
    isVisible: false,
    messages: [],
    
    // Переключение видимости чата
    toggle() {
        this.isVisible = !this.isVisible;
        const chatWindow = document.getElementById('chatWindow');
        
        if (this.isVisible) {
            chatWindow.style.display = 'flex';
            document.getElementById('chatInput').focus();
        } else {
            chatWindow.style.display = 'none';
            document.getElementById('chatInput').blur();
        }
    },
    
    // Добавление сообщения
    addMessage(text, type = 'normal') {
        const chatMessagesDiv = document.getElementById('chatMessages');
        
        // Создаем элемент сообщения
        const messageDiv = document.createElement('div');
        messageDiv.className = type;
        messageDiv.textContent = text;
        
        // Добавляем в начало для правильного порядка
        chatMessagesDiv.insertBefore(messageDiv, chatMessagesDiv.firstChild);
        
        // Сохраняем сообщение
        this.messages.unshift({ text, type, time: Date.now() });
        
        // Ограничиваем количество сообщений
        if (this.messages.length > 50) {
            this.messages.pop();
            if (chatMessagesDiv.children.length > 50) {
                chatMessagesDiv.removeChild(chatMessagesDiv.lastChild);
            }
        }
    },
    
    // Обработка нажатия клавиш в чате
    handleKeyPress(e) {
        if (e.key === 'Enter') {
            this.sendMessage();
        } else if (e.key === 'Escape') {
            this.toggle();
            e.preventDefault();
        }
    },
    
    // Отправка сообщения
    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && Network.isConnected) {
            Network.sendChatMessage(message);
            this.addMessage(`Вы: ${message}`, 'player');
            input.value = '';
        }
    },
    
    // Очистка чата
    clear() {
        const chatMessagesDiv = document.getElementById('chatMessages');
        chatMessagesDiv.innerHTML = '';
        this.messages = [];
        document.getElementById('chatInput').value = '';
    },
    
    // Инициализация чата
    init() {
        const chatInput = document.getElementById('chatInput');
        chatInput.addEventListener('keypress', (e) => this.handleKeyPress(e));
        
        // Добавляем системное сообщение
        this.addMessage('💬 Чат игры. Напишите сообщение и нажмите Enter', 'system');
    }
};

// Инициализация чата при загрузке
Chat.init();
