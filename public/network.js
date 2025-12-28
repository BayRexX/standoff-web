[file name]: network.js
[file content begin]
const Network = {
    socket: null,
    isConnected: false,
    playerId: '',
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    
    // Подключение к серверу
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                console.log(`🔗 Подключение к: ${CONFIG.SERVER_URL}`);
                
                this.socket = new WebSocket(CONFIG.SERVER_URL);
                
                this.socket.onopen = () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    console.log('✅ Подключено к серверу');
                    Notification.show('✅ Подключено к серверу!');
                    
                    // Пинг серверу
                    this.startPingInterval();
                    resolve();
                };
                
                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('Ошибка парсинга:', error);
                    }
                };
                
                this.socket.onerror = (error) => {
                    console.error('WebSocket ошибка:', error);
                    if (!this.isConnected) {
                        Notification.show('❌ Ошибка подключения к серверу');
                        reject(error);
                    }
                };
                
                this.socket.onclose = (event) => {
                    console.log(`🔌 Отключено от сервера. Код: ${event.code}`);
                    this.isConnected = false;
                    this.playerId = '';
                    
                    // Останавливаем пинг
                    this.stopPingInterval();
                    
                    // Автопереподключение
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = Math.min(5000, this.reconnectAttempts * 1000);
                        console.log(`♻️ Переподключение через ${delay}мс...`);
                        
                        setTimeout(() => {
                            this.connect().catch(console.error);
                        }, delay);
                    } else {
                        Notification.show('🔌 Соединение разорвано');
                        if (Game.isRunning) {
                            Game.reset();
                        }
                    }
                };
                
            } catch (error) {
                console.error('Ошибка подключения:', error);
                Notification.show('❌ Не удалось подключиться');
                reject(error);
            }
        });
    },
    
    // Пинг интервал
    startPingInterval() {
        this.pingInterval = setInterval(() => {
            if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
                this.send({
                    type: 'ping',
                    time: Date.now()
                });
            }
        }, 30000); // Каждые 30 секунд
    },
    
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    },
    
    // Отправка сообщения
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(data));
                return true;
            } catch (error) {
                console.error('Ошибка отправки:', error);
                return false;
            }
        }
        console.warn('WebSocket не подключен для отправки:', data.type);
        return false;
    },
    
    // Регистрация игрока
    registerPlayer() {
        const name = `Player_${Math.floor(Math.random() * 1000)}`;
        this.send({
            type: 'join',
            name: name
        });
        return name;
    },
    
    // Отправка обновления позиции
    sendUpdate(position, rotation, health) {
        this.send({
            type: 'update',
            position: position,
            rotation: rotation,
            health: health
        });
    },
    
    // Отправка выстрела
    sendShoot(position, rotation) {
        this.send({
            type: 'shoot',
            position: position,
            rotation: rotation
        });
    },
    
    // Отправка попадания
    sendHit(targetId) {
        this.send({
            type: 'shoot', // На сервере ожидается 'shoot', не 'hit'
            targetId: targetId
        });
    },
    
    // Отправка прыжка
    sendJump() {
        this.send({
            type: 'jump'
        });
    },
    
    // Отправка сообщения в чат
    sendChatMessage(message) {
        this.send({
            type: 'chat',
            message: message.substring(0, 100)
        });
    },
    
    // Обработка входящих сообщений
    handleMessage(data) {
        switch (data.type) {
            case 'welcome':
                this.playerId = data.id;
                Game.player.id = data.id;
                Game.player.name = data.name;
                Game.player.color = data.color;
                Game.player.health = data.health;
                Game.updateHealth();
                Game.updatePlayersCount();
                
                // Добавляем других игроков
                if (data.players && Array.isArray(data.players)) {
                    data.players.forEach(p => {
                        Game.addOtherPlayer(
                            p.id, 
                            p.position, 
                            p.rotation, 
                            p.health || 100, 
                            p.color || 0x0000ff, 
                            p.name || 'Player'
                        );
                    });
                }
                
                Chat.addMessage('✅ Подключено к серверу!', 'system');
                Notification.show(`Добро пожаловать, ${data.name}!`);
                break;
                
            case 'player_join':
                if (data.player && data.player.id !== this.playerId) {
                    Game.addOtherPlayer(
                        data.player.id, 
                        data.player.position, 
                        data.player.rotation, 
                        data.player.health || 100, 
                        data.player.color || 0x0000ff, 
                        data.player.name || 'Player'
                    );
                    Chat.addMessage(`👤 ${data.player.name} присоединился`, 'system');
                }
                break;
                
            case 'player_leave':
                Game.removeOtherPlayer(data.id);
                Chat.addMessage('👤 Игрок покинул игру', 'system');
                break;
                
            case 'player_update':
                if (data.id !== this.playerId && Game.otherPlayers.has(data.id)) {
                    Game.updateOtherPlayer(
                        data.id, 
                        data.position || {x: 0, y: 1.7, z: 0}, 
                        data.rotation || {yaw: 0, pitch: 0}, 
                        data.health || 100
                    );
                }
                break;
                
            case 'player_hit':
                if (data.target === this.playerId) {
                    // Нас ударили
                    const damage = data.damage || CONFIG.DAMAGE_PER_SHOT;
                    Game.player.health = Math.max(0, Game.player.health - damage);
                    Game.updateHealth();
                    
                    // Эффект попадания
                    const hitEffect = document.createElement('div');
                    hitEffect.className = 'hit-effect';
                    document.body.appendChild(hitEffect);
                    setTimeout(() => hitEffect.remove(), 200);
                    
                    if (Game.player.health <= 0) {
                        Game.stats.deaths++;
                        Game.updateDeaths();
                        Notification.show('💀 Вы погибли! Респавн через 3 секунды...');
                    }
                } else if (Game.otherPlayers.has(data.target)) {
                    // Другого игрока ударили
                    Game.updatePlayerHealth(data.target, data.health || 0);
                }
                break;
                
            case 'kill':
                if (data.target && data.target !== this.playerId) {
                    Game.stats.kills++;
                    Game.updateKills();
                    Notification.show(`🎉 Вы убили ${data.targetName || 'игрока'}!`);
                    Chat.addMessage(`🎯 Вы убили ${data.targetName || 'игрока'}`, 'kill');
                }
                break;
                
            case 'death':
                if (data.killer && data.killer !== this.playerId) {
                    Game.stats.deaths++;
                    Game.updateDeaths();
                    Notification.show(`☠️ Вас убил: ${data.killerName || 'игрок'}`);
                    Chat.addMessage(`☠️ Вас убил ${data.killerName || 'игрок'}`, 'kill');
                }
                break;
                
            case 'kill_feed':
                if (data.killer && data.victim) {
                    Chat.addMessage(`⚔️ ${data.killer} убил ${data.victim}`, 'kill');
                }
                break;
                
            case 'player_shoot':
                // Визуальный эффект выстрела другого игрока
                if (data.id !== this.playerId && Game.otherPlayers.has(data.id)) {
                    // Можно добавить звук выстрела другого игрока
                }
                break;
                
            case 'chat':
                if (data.player && data.message && data.player !== Game.player.name) {
                    Chat.addMessage(`${data.player}: ${data.message}`);
                }
                break;
                
            case 'respawn':
                if (data.position) {
                    Game.player.position.set(
                        data.position.x || 0, 
                        data.position.y || CONFIG.PLAYER_HEIGHT, 
                        data.position.z || 0
                    );
                    Game.player.health = data.health || CONFIG.MAX_HEALTH;
                    Game.updateHealth();
                    Notification.show('🔄 Вы возродились!');
                }
                break;
                
            case 'player_respawn':
                if (data.id !== this.playerId) {
                    Game.updateOtherPlayer(
                        data.id, 
                        data.position || {x: 0, y: 1.7, z: 0}, 
                        data.rotation || {yaw: 0, pitch: 0}, 
                        data.health || 100
                    );
                }
                break;
                
            case 'hit_confirm':
                // Подтверждение попадания
                Game.stats.hits++;
                Notification.show('💥 Попадание!');
                break;
                
            case 'shot_missed':
                // Промах
                console.log('Промах');
                break;
                
            case 'pong':
                // Ответ на пинг
                console.log('Pong получен');
                break;
                
            default:
                console.log('Неизвестное сообщение:', data);
        }
    },
    
    // Проверка подключения к серверу
    async checkServerHealth() {
        try {
            const response = await fetch('https://fps-game-server-raki.onrender.com/health', {
                method: 'GET',
                mode: 'cors'
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Статус сервера:', data);
                return data;
            }
        } catch (error) {
            console.log('Не удалось проверить сервер:', error);
        }
        return null;
    },
    
    // Отключение
    disconnect() {
        this.stopPingInterval();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        this.isConnected = false;
        this.playerId = '';
        this.reconnectAttempts = 0;
    }
};
[file content end]
