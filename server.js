const WebSocket = require('ws');
const http = require('http');

// Конфигурация сервера
const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 50;
const RESPAWN_TIME = 3000; // 3 секунды
const MAP_SIZE = 80;

// Класс для управления игроками
class Player {
    constructor(id, ws) {
        this.id = id;
        this.ws = ws;
        this.position = { x: 0, y: 1.7, z: 5 };
        this.rotation = { yaw: 0, pitch: 0 };
        this.health = 100;
        this.kills = 0;
        this.deaths = 0;
        this.name = `Player_${id.substr(0, 4)}`;
        this.lastUpdate = Date.now();
        this.isAlive = true;
        this.respawnTime = 0;
        this.color = this.generateColor();
    }

    generateColor() {
        const colors = [
            0xff0000, // красный
            0x00ff00, // зеленый
            0x0000ff, // синий
            0xffff00, // желтый
            0xff00ff, // фиолетовый
            0x00ffff, // голубой
            0xff8800, // оранжевый
            0x8800ff  // фиолетовый
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    takeDamage(damage, attackerId) {
        if (!this.isAlive) return false;
        
        this.health -= damage;
        if (this.health <= 0) {
            this.die(attackerId);
            return true;
        }
        return false;
    }

    die(killerId) {
        this.health = 0;
        this.isAlive = false;
        this.deaths++;
        this.respawnTime = Date.now() + RESPAWN_TIME;
        
        // Рандомная позиция для респавна
        const spawnPositions = [
            { x: -20, z: -20 },
            { x: 20, z: -20 },
            { x: -20, z: 20 },
            { x: 20, z: 20 },
            { x: 0, z: 0 }
        ];
        
        const spawn = spawnPositions[Math.floor(Math.random() * spawnPositions.length)];
        this.position = { x: spawn.x, y: 1.7, z: spawn.z };
        
        // Запланировать респавн
        setTimeout(() => {
            this.respawn();
        }, RESPAWN_TIME);
    }

    respawn() {
        this.health = 100;
        this.isAlive = true;
        
        // Сообщить о респавне
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'respawn',
                position: this.position,
                health: this.health
            }));
        }
        
        // Уведомить других игроков
        broadcast({
            type: 'player_update',
            id: this.id,
            position: this.position,
            rotation: this.rotation,
            health: this.health,
            isAlive: this.isAlive
        }, this.id);
    }

    update(data) {
        this.position = data.position || this.position;
        this.rotation = data.rotation || this.rotation;
        this.health = data.health || this.health;
        this.lastUpdate = Date.now();
        
        // Ограничение позиции картой
        this.position.x = Math.max(-MAP_SIZE/2, Math.min(MAP_SIZE/2, this.position.x));
        this.position.z = Math.max(-MAP_SIZE/2, Math.min(MAP_SIZE/2, this.position.z));
    }

    toJSON() {
        return {
            id: this.id,
            position: this.position,
            rotation: this.rotation,
            health: this.health,
            name: this.name,
            kills: this.kills,
            deaths: this.deaths,
            color: this.color,
            isAlive: this.isAlive
        };
    }
}

// Класс для управления игрой
class GameServer {
    constructor() {
        this.players = new Map();
        this.server = http.createServer();
        this.wss = new WebSocket.Server({ server: this.server });
        
        this.setupWebSocket();
        this.startCleanupInterval();
        
        console.log('🎮 FPS Multiplayer Server запущен');
        console.log(`📡 Порт: ${PORT}`);
        console.log('✅ Готов к подключению игроков');
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            // Генерация уникального ID для игрока
            const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const ip = req.socket.remoteAddress;
            
            console.log(`🔗 Новое подключение: ${playerId} (${ip})`);
            
            // Проверка на максимальное количество игроков
            if (this.players.size >= MAX_PLAYERS) {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Сервер переполнен. Попробуйте позже.'
                }));
                ws.close();
                return;
            }

            // Создание нового игрока
            const player = new Player(playerId, ws);
            this.players.set(playerId, player);

            // Отправляем игроку информацию о нем
            ws.send(JSON.stringify({
                type: 'welcome',
                id: playerId,
                players: Array.from(this.players.values()).map(p => p.toJSON()),
                mapSize: MAP_SIZE
            }));

            // Уведомляем других игроков
            this.broadcast({
                type: 'player_join',
                player: player.toJSON()
            }, playerId);

            // Обработка сообщений от игрока
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleMessage(playerId, data);
                } catch (error) {
                    console.error('Ошибка обработки сообщения:', error);
                }
            });

            // Обработка отключения
            ws.on('close', () => {
                console.log(`🔌 Отключение: ${playerId}`);
                this.players.delete(playerId);
                
                // Уведомляем других игроков
                this.broadcast({
                    type: 'player_leave',
                    id: playerId
                });
            });

            ws.on('error', (error) => {
                console.error(`Ошибка WebSocket (${playerId}):`, error);
                this.players.delete(playerId);
            });
        });
    }

    handleMessage(playerId, data) {
        const player = this.players.get(playerId);
        if (!player) return;

        switch (data.type) {
            case 'update':
                player.update(data);
                
                // Рассылаем обновление другим игрокам
                this.broadcast({
                    type: 'player_update',
                    id: playerId,
                    position: player.position,
                    rotation: player.rotation,
                    health: player.health,
                    isAlive: player.isAlive
                }, playerId);
                break;

            case 'shoot':
                // Рассылаем информацию о выстреле (для визуальных эффектов)
                this.broadcast({
                    type: 'player_shoot',
                    id: playerId,
                    position: player.position,
                    rotation: player.rotation
                }, playerId);
                break;

            case 'hit':
                const targetPlayer = this.players.get(data.target);
                if (targetPlayer && targetPlayer.isAlive && player.isAlive) {
                    const killed = targetPlayer.takeDamage(data.damage || 34, playerId);
                    
                    if (killed) {
                        // Игрок убил другого игрока
                        player.kills++;
                        
                        // Отправляем убийце сообщение
                        if (player.ws.readyState === WebSocket.OPEN) {
                            player.ws.send(JSON.stringify({
                                type: 'kill',
                                target: targetPlayer.id,
                                targetName: targetPlayer.name
                            }));
                        }
                        
                        // Отправляем жертве сообщение
                        if (targetPlayer.ws.readyState === WebSocket.OPEN) {
                            targetPlayer.ws.send(JSON.stringify({
                                type: 'death',
                                killer: playerId,
                                killerName: player.name
                            }));
                        }
                        
                        // Уведомляем всех об убийстве
                        this.broadcast({
                            type: 'kill_feed',
                            killer: player.name,
                            victim: targetPlayer.name
                        });
                    }
                    
                    // Рассылаем обновление здоровья цели
                    this.broadcast({
                        type: 'player_hit',
                        target: targetPlayer.id,
                        health: targetPlayer.health,
                        isAlive: targetPlayer.isAlive
                    });
                }
                break;

            case 'chat':
                // Обработка чата
                if (data.message && data.message.trim().length > 0 && data.message.length <= 200) {
                    this.broadcast({
                        type: 'chat',
                        player: player.name,
                        message: data.message.trim(),
                        time: Date.now()
                    });
                }
                break;

            case 'ping':
                // Ответ на пинг
                if (player.ws.readyState === WebSocket.OPEN) {
                    player.ws.send(JSON.stringify({
                        type: 'pong',
                        time: Date.now(),
                        serverTime: Date.now()
                    }));
                }
                break;
        }
    }

    broadcast(message, excludeId = null) {
        const jsonMessage = JSON.stringify(message);
        
        this.players.forEach((player, id) => {
            if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
                try {
                    player.ws.send(jsonMessage);
                } catch (error) {
                    console.error(`Ошибка отправки игроку ${id}:`, error);
                }
            }
        });
    }

    startCleanupInterval() {
        // Очистка неактивных соединений каждые 30 секунд
        setInterval(() => {
            const now = Date.now();
            let disconnected = 0;
            
            this.players.forEach((player, id) => {
                // Если игрок не обновлялся более 60 секунд
                if (now - player.lastUpdate > 60000) {
                    console.log(`🚮 Удаление неактивного игрока: ${id}`);
                    
                    if (player.ws.readyState === WebSocket.OPEN) {
                        player.ws.close();
                    }
                    
                    this.players.delete(id);
                    disconnected++;
                    
                    // Уведомляем других игроков
                    this.broadcast({
                        type: 'player_leave',
                        id: id
                    });
                }
            });
            
            if (disconnected > 0) {
                console.log(`🧹 Удалено неактивных игроков: ${disconnected}`);
            }
        }, 30000);
    }

    getServerInfo() {
        return {
            players: this.players.size,
            maxPlayers: MAX_PLAYERS,
            uptime: process.uptime(),
            mapSize: MAP_SIZE
        };
    }

    start() {
        this.server.listen(PORT, () => {
            console.log(`🚀 Сервер запущен на порту ${PORT}`);
            console.log(`👥 Максимальное количество игроков: ${MAX_PLAYERS}`);
            console.log(`🗺️ Размер карты: ${MAP_SIZE}x${MAP_SIZE}`);
            console.log('⏰ Респавн через: 3 секунды');
            console.log('================================');
        });
    }
}

// HTTP эндпоинты для мониторинга
const gameServer = new GameServer();

// Создаем HTTP сервер для health checks
const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            players: gameServer.players.size,
            uptime: process.uptime(),
            timestamp: Date.now()
        }));
    } else if (req.url === '/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(gameServer.getServerInfo()));
    } else if (req.url === '/players') {
        const playersList = Array.from(gameServer.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            kills: p.kills,
            deaths: p.deaths,
            health: p.health,
            isAlive: p.isAlive
        }));
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            total: playersList.length,
            players: playersList
        }));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('🎯 FPS Multiplayer Server\n\nЭндпоинты:\n/health - проверка состояния\n/info - информация о сервере\n/players - список игроков');
    }
});

// Запускаем HTTP сервер для health checks на порту 8081
httpServer.listen(8081, () => {
    console.log('📊 HTTP мониторинг доступен на порту 8081');
});

// Запускаем игровой сервер
gameServer.start();

// Обработка завершения работы
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершение работы...');
    
    // Отправляем сообщение всем игрокам
    gameServer.broadcast({
        type: 'server_shutdown',
        message: 'Сервер выключается для обслуживания'
    });
    
    // Закрываем все соединения
    setTimeout(() => {
        gameServer.wss.close();
        process.exit(0);
    }, 1000);
});
