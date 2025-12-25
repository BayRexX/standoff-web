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
            version: '1.0.0',
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

// Создаем WebSocket сервер
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true
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
        position: { x: Math.random() * 40 - 20, y: 1.7, z: Math.random() * 40 - 20 },
        rotation: { yaw: 0, pitch: 0 },
        health: 100,
        kills: 0,
        deaths: 0,
        color: getRandomColor(),
        lastUpdate: Date.now(),
        isAlive: true
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
    
    // Обработка сообщений от игрока
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            handleMessage(playerId, data);
        } catch (error) {
            console.error('❌ Ошибка парсинга сообщения:', error);
        }
    });
    
    // Обработка отключения
    ws.on('close', () => {
        console.log(`🔌 Отключение: ${playerId} (${player.name})`);
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
        } else {
            clearInterval(pingInterval);
        }
    }, 30000);
});

// Обработка сообщений
function handleMessage(playerId, data) {
    const player = players.get(playerId);
    if (!player) return;
    
    player.lastUpdate = Date.now();
    
    switch (data.type) {
        case 'update':
            // Обновление позиции и поворота
            if (data.position) {
                player.position = data.position;
            }
            if (data.rotation) {
                player.rotation = data.rotation;
            }
            if (data.health !== undefined) {
                player.health = data.health;
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
            // Игрок стреляет
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
                const damage = data.damage || 25;
                target.health -= damage;
                
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
                    
                    // Респавн через 3 секунды
                    setTimeout(() => {
                        target.health = 100;
                        target.isAlive = true;
                        target.position = { x: Math.random() * 40 - 20, y: 1.7, z: Math.random() * 40 - 20 };
                        
                        sendToPlayer(target.ws, {
                            type: 'respawn',
                            position: target.position,
                            health: target.health
                        });
                        
                        broadcast({
                            type: 'player_respawn',
                            id: target.id,
                            position: target.position,
                            health: target.health
                        });
                    }, 3000);
                }
                
                // Обновляем здоровье цели
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
                broadcast({
                    type: 'chat',
                    playerId: playerId,
                    playerName: player.name,
                    message: data.message.trim(),
                    time: Date.now()
                });
            }
            break;
            
        case 'ping':
            // Ответ на пинг
            sendToPlayer(player.ws, {
                type: 'pong',
                serverTime: Date.now()
            });
            break;
    }
}

// Вспомогательные функции
function getRandomColor() {
    const colors = [
        0xff0000, 0x00ff00, 0x0000ff, 0xffff00,
        0xff00ff, 0x00ffff, 0xff8800, 0x8800ff
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

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

function sendToPlayer(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(data, excludeId = null) {
    const message = JSON.stringify(data);
    
    players.forEach((player, id) => {
        if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    });
}

// Запускаем сервер
server.listen(PORT, () => {
    console.log('🚀 =================================');
    console.log('🎯 FPS Multiplayer Server запущен!');
    console.log(`📡 Порт: ${PORT}`);
    console.log(`🌐 WebSocket: wss://[your-domain].onrender.com`);
    console.log(`🩺 Health check: https://[your-domain].onrender.com/health`);
    console.log(`👤 Максимум игроков: 50`);
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
        if (now - player.lastUpdate > 1800000) { // 30 минут
            console.log(`🧹 Очистка неактивного игрока: ${id}`);
            player.ws.close();
            players.delete(id);
            cleaned++;
        }
    });
    
    if (cleaned > 0) {
        serverStats.currentPlayers = players.size;
        console.log(`🗑️ Удалено неактивных игроков: ${cleaned}`);
    }
}, 60000); // Проверка каждую минуту

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершение работы...');
    
    broadcast({
        type: 'server_shutdown',
        message: 'Сервер выключается. Спасибо за игру!',
        time: 30
    });
    
    setTimeout(() => {
        wss.close();
        server.close();
        console.log('✅ Сервер остановлен');
        process.exit(0);
    }, 5000);
});
