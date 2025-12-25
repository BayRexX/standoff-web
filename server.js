const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

// Статистика сервера
const serverStats = {
    startTime: Date.now(),
    totalConnections: 0,
    currentPlayers: 0,
    totalKills: 0
};

// Игроки
const players = new Map();

// Функция для генерации случайного цвета
function getRandomColor() {
    const colors = [
        0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
        0xff00ff, 0x00ffff, 0xff8800, 0x8800ff
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Функция для получения списка игроков
function getPlayersList(excludeId = null) {
    return Array.from(players.entries())
        .filter(([id]) => id !== excludeId)
        .map(([id, player]) => ({
            id: id,
            name: player.name,
            position: player.position,
            rotation: player.rotation,
            health: player.health,
            color: player.color,
            kills: player.kills,
            deaths: player.deaths,
            isAlive: player.isAlive
        }));
}

// Функция отправки сообщения игроку
function sendToPlayer(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Функция трансляции сообщения всем игрокам
function broadcast(data, excludeId = null) {
    const message = JSON.stringify(data);
    
    players.forEach((player, id) => {
        if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    });
}

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
    // Health check для Render
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        
        res.end(JSON.stringify({
            status: 'online',
            service: 'FPS Multiplayer Server',
            uptime: Math.floor((Date.now() - serverStats.startTime) / 1000) + 's',
            players: serverStats.currentPlayers,
            totalConnections: serverStats.totalConnections,
            totalKills: serverStats.totalKills,
            timestamp: Date.now(),
            websocket: `wss://${req.headers.host}`
        }));
        return;
    }
    
    // Информация о сервере
    if (req.url === '/info') {
        const playersList = Array.from(players.values()).map(p => ({
            id: p.id,
            name: p.name,
            kills: p.kills || 0,
            deaths: p.deaths || 0,
            health: p.health,
            position: p.position
        }));
        
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        
        res.end(JSON.stringify({
            server: 'FPS Game Server',
            version: '2.0.0',
            map: 'Battle Arena',
            players: playersList,
            maxPlayers: 50,
            stats: serverStats
        }));
        return;
    }
    
    // Статус 404 для других запросов
    res.writeHead(404);
    res.end('Not Found');
});

// Создаем WebSocket сервер с улучшенными настройками
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true,
    perMessageDeflate: {
        zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
    }
});

// Обработка подключений
wss.on('connection', (ws, req) => {
    serverStats.totalConnections++;
    
    // Создаем ID игрока
    const playerId = `player_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const ip = req.socket.remoteAddress;
    
    console.log(`🎮 Новый игрок: ${playerId} (${ip})`);
    
    // Создаем объект игрока
    const player = {
        id: playerId,
        ws: ws,
        name: `Soldier_${Math.floor(Math.random() * 1000)}`,
        position: { 
            x: Math.random() * 40 - 20, 
            y: 1.7, 
            z: Math.random() * 40 - 20 
        },
        rotation: { yaw: 0, pitch: 0 },
        health: 100,
        kills: 0,
        deaths: 0,
        color: getRandomColor(),
        lastUpdate: Date.now(),
        isAlive: true,
        lastPing: Date.now()
    };
    
    players.set(playerId, player);
    serverStats.currentPlayers = players.size;
    
    // Отправляем приветственное сообщение игроку
    const welcomeData = {
        type: 'welcome',
        id: playerId,
        name: player.name,
        position: player.position,
        rotation: player.rotation,
        health: player.health,
        color: player.color,
        players: getPlayersList(playerId)
    };
    
    sendToPlayer(ws, welcomeData);
    
    // Уведомляем всех о новом игроке
    broadcast({
        type: 'player_join',
        player: {
            id: playerId,
            name: player.name,
            position: player.position,
            rotation: player.rotation,
            health: player.health,
            color: player.color
        }
    }, playerId);
    
    // Сообщаем всем о присоединении в чат
    broadcast({
        type: 'chat',
        player: 'Система',
        message: `${player.name} присоединился к игре`
    });
    
    // Обработка сообщений от игрока
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            handleMessage(playerId, data);
            player.lastUpdate = Date.now();
        } catch (error) {
            console.error('❌ Ошибка парсинга сообщения:', error);
        }
    });
    
    // Обработка отключения
    ws.on('close', () => {
        console.log(`🔌 Отключение: ${playerId} (${player.name})`);
        
        // Сообщаем об отключении в чат
        broadcast({
            type: 'chat',
            player: 'Система',
            message: `${player.name} покинул игру`
        });
        
        players.delete(playerId);
        serverStats.currentPlayers = players.size;
        
        broadcast({
            type: 'player_leave',
            id: playerId
        });
    });
    
    ws.on('error', (error) => {
        console.error(`⚠️ Ошибка WebSocket (${playerId}):`, error.message);
    });
    
    // Пинг для поддержания соединения
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
            player.lastPing = Date.now();
        } else {
            clearInterval(pingInterval);
        }
    }, 30000);
    
    // Сохраняем интервал для очистки
    player.pingInterval = pingInterval;
});

// Обработка сообщений
function handleMessage(playerId, data) {
    const player = players.get(playerId);
    if (!player) return;
    
    player.lastUpdate = Date.now();
    
    switch (data.type) {
        case 'join':
            // Обновляем имя игрока
            if (data.name && data.name.trim().length > 0) {
                player.name = data.name.trim().substring(0, 20);
            }
            break;
            
        case 'update':
            // Обновление позиции и поворота
            if (data.position) {
                player.position = data.position;
            }
            if (data.rotation) {
                player.rotation = data.rotation;
            }
            if (data.health !== undefined) {
                player.health = Math.max(0, Math.min(100, data.health));
            }
            
            // Рассылаем обновление другим игрокам
            broadcast({
                type: 'player_update',
                id: playerId,
                position: player.position,
                rotation: player.rotation,
                health: player.health,
                isAlive: player.isAlive
            }, playerId);
            break;
            
        case 'shoot':
            // Игрок стреляет - рассылаем всем для визуальных эффектов
            broadcast({
                type: 'player_shoot',
                id: playerId,
                position: player.position,
                rotation: player.rotation
            }, playerId);
            break;
            
        case 'hit':
            // Игрок попал в кого-то
            const target = players.get(data.target);
            if (target && target.isAlive && player.isAlive) {
                const damage = Math.min(100, Math.max(1, data.damage || 25));
                target.health -= damage;
                
                // Гарантируем что здоровье не уйдет ниже 0
                if (target.health < 0) target.health = 0;
                
                if (target.health <= 0) {
                    // Убийство!
                    target.health = 0;
                    target.isAlive = false;
                    target.deaths++;
                    player.kills++;
                    serverStats.totalKills++;
                    
                    // Сообщение убийце
                    sendToPlayer(player.ws, {
                        type: 'kill',
                        target: target.id,
                        targetName: target.name
                    });
                    
                    // Сообщение жертве
                    sendToPlayer(target.ws, {
                        type: 'death',
                        killer: playerId,
                        killerName: player.name
                    });
                    
                    // Всем об убийстве
                    broadcast({
                        type: 'kill_feed',
                        killer: player.name,
                        victim: target.name,
                        killerId: playerId,
                        victimId: target.id
                    });
                    
                    // Сообщение в чат об убийстве
                    broadcast({
                        type: 'chat',
                        player: 'Система',
                        message: `⚔️ ${player.name} убил ${target.name}`
                    });
                    
                    // Респавн через 3 секунды
                    setTimeout(() => {
                        if (players.has(target.id)) {
                            target.health = 100;
                            target.isAlive = true;
                            target.position = { 
                                x: Math.random() * 40 - 20, 
                                y: 1.7, 
                                z: Math.random() * 40 - 20 
                            };
                            
                            // Сбрасываем вращение при респавне
                            target.rotation = { yaw: 0, pitch: 0 };
                            
                            sendToPlayer(target.ws, {
                                type: 'respawn',
                                position: target.position,
                                health: target.health
                            });
                            
                            broadcast({
                                type: 'player_respawn',
                                id: target.id,
                                position: target.position,
                                rotation: target.rotation,
                                health: target.health
                            });
                            
                            // Сообщение в чат о респавне
                            broadcast({
                                type: 'chat',
                                player: 'Система',
                                message: `🔄 ${target.name} возродился`
                            });
                        }
                    }, 3000);
                }
                
                // Рассылаем обновление здоровья цели
                broadcast({
                    type: 'player_hit',
                    target: target.id,
                    health: target.health,
                    isAlive: target.isAlive
                });
            }
            break;
            
        case 'chat':
            // Сообщение в чат
            if (data.message && data.message.trim().length > 0) {
                const message = data.message.trim().substring(0, 100);
                
                // Рассылаем сообщение всем игрокам
                broadcast({
                    type: 'chat',
                    player: player.name,
                    message: message,
                    time: Date.now()
                });
                
                // Логируем в консоль сервера
                console.log(`💬 ${player.name}: ${message}`);
            }
            break;
            
        case 'ping':
            // Ответ на пинг
            sendToPlayer(player.ws, {
                type: 'pong',
                serverTime: Date.now(),
                players: serverStats.currentPlayers
            });
            break;
    }
}

// Запускаем сервер
server.listen(PORT, () => {
    console.log('🚀 =================================');
    console.log('🎯 FPS Multiplayer Server v2.0 запущен!');
    console.log(`📡 Порт: ${PORT}`);
    console.log(`🌐 WebSocket: wss://[your-domain].onrender.com`);
    console.log(`🩺 Health check: https://[your-domain].onrender.com/health`);
    console.log(`👤 Максимум игроков: 50`);
    console.log(`💬 Поддержка чата: включена`);
    console.log('=================================');
    
    // Лог каждые 5 минут
    setInterval(() => {
        console.log(`📊 Статистика: ${players.size} игроков онлайн, ${serverStats.totalKills} всего убийств`);
    }, 300000);
});

// Очистка неактивных игроков (30 минут неактивности)
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    players.forEach((player, id) => {
        // Если игрок не обновлялся более 30 минут
        if (now - player.lastUpdate > 1800000) {
            console.log(`🧹 Очистка неактивного игрока: ${id} (${player.name})`);
            
            // Очищаем интервал пинга
            if (player.pingInterval) {
                clearInterval(player.pingInterval);
            }
            
            // Закрываем соединение
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.close();
            }
            
            players.delete(id);
            cleaned++;
            
            // Уведомляем других игроков
            broadcast({
                type: 'chat',
                player: 'Система',
                message: `${player.name} отключен за неактивность`
            });
            
            broadcast({
                type: 'player_leave',
                id: id
            });
        }
    });
    
    if (cleaned > 0) {
        serverStats.currentPlayers = players.size;
        console.log(`🗑️ Удалено неактивных игроков: ${cleaned}`);
    }
}, 60000); // Проверка каждую минуту

// Проверка "зомби" соединений (не отвечают на пинг)
setInterval(() => {
    const now = Date.now();
    players.forEach((player, id) => {
        // Если не было пинга более 2 минут
        if (now - player.lastPing > 120000) {
            console.log(`👻 Зомби-соединение: ${id} (${player.name})`);
            
            // Отправляем проверочный пинг
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.ping();
            }
        }
    });
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершение работы...');
    
    // Отправляем сообщение всем игрокам
    broadcast({
        type: 'chat',
        player: 'Система',
        message: '⚠️ Сервер выключается для обслуживания. Спасибо за игру!'
    });
    
    broadcast({
        type: 'server_shutdown',
        message: 'Сервер выключается. Спасибо за игру!',
        time: 30
    });
    
    // Даем время на отправку сообщений
    setTimeout(() => {
        // Закрываем все соединения
        players.forEach((player) => {
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.close();
            }
            if (player.pingInterval) {
                clearInterval(player.pingInterval);
            }
        });
        
        // Закрываем WebSocket сервер
        wss.close(() => {
            console.log('✅ WebSocket сервер остановлен');
        });
        
        // Закрываем HTTP сервер
        server.close(() => {
            console.log('✅ HTTP сервер остановлен');
            console.log('👋 Сервер полностью остановлен');
            process.exit(0);
        });
    }, 5000);
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
    console.error('🔥 Необработанное исключение:', error);
    console.error('📝 Stack trace:', error.stack);
    
    // Не выходим из процесса, продолжаем работу
    console.log('🔄 Продолжаем работу после ошибки...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Необработанный промис:', reason);
});
