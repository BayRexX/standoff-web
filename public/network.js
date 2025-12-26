const Network = {
    socket: null,
    isConnected: false,
    playerId: '',
    
    // Подключение к серверу
    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(CONFIG.SERVER_URL);
                
                this.socket.onopen = () => {
                    this.isConnected = true;
                    console.log('✅ Подключено к серверу');
                    Notification.show('✅ Подключено к серверу!');
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
                    Notification.show('❌ Ошибка подключения');
                    reject(error);
                };
                
                this.socket.onclose = () => {
                    this.isConnected = false;
                    console.log('🔌 Отключено от сервера');
                    Notification.show('🔌 Соединение разорвано');
                    Game.reset();
                };
                
            } catch (error) {
                console.error('Ошибка подключения:', error);
                Notification.show('❌ Не удалось подключиться');
                reject(error);
            }
        });
    },
    
    // Отправка сообщения
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
            return true;
        }
        return false;
    },
    
    // Регистрация игрока
    registerPlayer(name) {
        this.send({
            type: 'join',
            name: name || `Player_${Math.floor(Math.random() * 1000)}`
        });
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
            type: 'hit',
            target: targetId,
            damage: CONFIG.DAMAGE_PER_SHOT
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
                
                // Добавляем других игроков
                if (data.players) {
                    data.players.forEach(p => {
                        Game.addOtherPlayer(p.id, p.position, p.rotation, p.health, p.color, p.name);
                    });
                }
                
                Chat.addMessage('✅ Подключено к серверу!', 'system');
                break;
                
            case 'player_join':
                if (data.player && data.player.id !== this.playerId) {
                    Game.addOtherPlayer(data.player.id, data.player.position, data.player.rotation, 
                                      data.player.health, data.player.color, data.player.name);
                    Chat.addMessage(`👤 ${data.player.name} присоединился`, 'system');
                }
                break;
                
            case 'player_leave':
                Game.removeOtherPlayer(data.id);
                break;
                
            case 'player_update':
                if (data.id !== this.playerId) {
                    Game.updateOtherPlayer(data.id, data.position, data.rotation, data.health);
                }
                break;
                
            case 'player_hit':
                if (data.target === this.playerId) {
                    // Нас ударили
                    Game.player.health = Math.max(0, data.health);
                    Game.updateHealth();
                    
                    // Эффект попадания
                    const hitEffect = document.createElement('div');
                    hitEffect.className = 'hit-effect';
                    document.body.appendChild(hitEffect);
                    setTimeout(() => hitEffect.remove(), 200);
                    
                    if (Game.player.health <= 0) {
                        Notification.show('💀 Вы погибли! Респавн через 3 секунды...');
                    }
                } else {
                    Game.updatePlayerHealth(data.target, data.health);
                }
                break;
                
            case 'kill':
                Game.stats.kills++;
                Game.updateKills();
                Notification.show('🎉 Вы убили игрока! +1 убийство');
                Chat.addMessage(`🎯 Вы убили ${data.targetName || 'игрока'}`, 'kill');
                break;
                
            case 'death':
                Game.stats.deaths++;
                Game.updateDeaths();
                Notification.show(`☠️ Вас убил: ${data.killerName || 'игрок'}`);
                Chat.addMessage(`☠️ Вас убил ${data.killerName || 'игрок'}`, 'kill');
                break;
                
            case 'kill_feed':
                if (data.killer && data.victim) {
                    Chat.addMessage(`⚔️ ${data.killer} убил ${data.victim}`, 'kill');
                }
                break;
                
            case 'player_shoot':
                // Визуальный эффект выстрела другого игрока
                break;
                
            case 'chat':
                if (data.player && data.message) {
                    Chat.addMessage(`${data.player}: ${data.message}`);
                }
                break;
                
            case 'respawn':
                if (data.position) {
                    Game.player.position.set(data.position.x, data.position.y, data.position.z);
                    Game.player.health = data.health || CONFIG.MAX_HEALTH;
                    Game.updateHealth();
                    Notification.show('🔄 Вы возродились!');
                }
                break;
                
            case 'hit_confirm':
                Notification.show('💥 Попадание!');
                break;
                
            case 'shot_missed':
                // Можно добавить звук промаха
                break;
        }
    },
    
    // Отключение
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
            this.isConnected = false;
            this.playerId = '';
        }
    }
};
