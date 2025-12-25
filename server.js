const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

// Статистика сервера
const serverStats = {
    startTime: Date.now(),
    totalConnections: 0,
    currentPlayers: 0,
    totalKills: 0,
    totalShots: 0,
    totalHits: 0
};

// Игроки
const players = new Map();

// Вспомогательные функции
function getRandomColor() {
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
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

// Функция проверки попадания (ПРЯМАЯ ВИДИМОСТЬ)
function checkHit(shooterPos, shooterRot, targetPos, maxDistance = 50) {
    // Преобразуем позиции в вектора
    const shooterVec = {
        x: shooterPos.x,
        y: shooterPos.y,
        z: shooterPos.z
    };
    
    const targetVec = {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z
    };
    
    // Вычисляем направление выстрела
    const direction = {
        x: -Math.sin(shooterRot.yaw) * Math.cos(shooterRot.pitch),
        y: -Math.sin(shooterRot.pitch),
        z: -Math.cos(shooterRot.yaw) * Math.cos(shooterRot.pitch)
    };
    
    // Вектор от стрелка к цели
    const toTarget = {
        x: targetVec.x - shooterVec.x,
        y: targetVec.y - shooterVec.y,
        z: targetVec.z - shooterVec.z
    };
    
    // Расстояние до цели
    const distance = Math.sqrt(toTarget.x * toTarget.x + toTarget.y * toTarget.y + toTarget.z * toTarget.z);
    
    if (distance > maxDistance) return false;
    
    // Нормализуем вектор к цели
    const length = Math.max(distance, 0.001);
    const toTargetNorm = {
        x: toTarget.x / length,
        y: toTarget.y / length,
        z: toTarget.z / length
    };
    
    // Косинус угла между направлением выстрела и направлением к цели
    const dotProduct = direction.x * toTargetNorm.x + direction.y * toTargetNorm.y + direction.z * toTargetNorm.z;
    
    // Угол должен быть небольшим (прицеливание примерно в цель)
    const hitAngle = Math.acos(dotProduct);
    
    // Максимальный допустимый угол для попадания (примерно 5 градусов)
    const maxHitAngle = 0.087; // 5 градусов в радианах
    
    return hitAngle < maxHitAngle && distance < maxDistance;
}

// Создаем HTTP сервер
const server = http.createServer((req, res) => {
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
            totalShots: serverStats.totalShots,
            totalHits: serverStats.totalHits,
            hitAccuracy: serverStats.totalShots > 0 ? 
                Math.round((serverStats.totalHits / serverStats.totalShots) * 100) : 0,
            timestamp: Date.now()
        }));
        return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
});

// WebSocket сервер
const wss = new WebSocket.Server({ 
    server,
    clientTracking: true
});

// Обработка подключений
wss.on('connection', (ws, req) => {
    serverStats.totalConnections++;
    
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
        canShoot: true,
        lastShootTime: 0,
        shootCooldown: 300 // мс
    };
    
    players.set(playerId, player);
    serverStats.currentPlayers = players.size;
    
    // Приветственное сообщение
    sendToPlayer(ws, {
        type: 'welcome',
        id: playerId,
        name: player.name,
        position: player.position,
        rotation: player.rotation,
        health: player.health,
        color: player.color,
        players: getPlayersList(playerId)
    });
    
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
    
    // Системное сообщение в чат
    broadcast({
        type: 'chat',
        player: 'Система',
        message: `👤 ${player.name} присоединился к игре`
    });
    
    // Обработка сообщений
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            handleMessage(playerId, data);
            player.lastUpdate = Date.now();
        } catch (error) {
            console.error('❌ Ошибка парсинга:', error);
        }
    });
    
    ws.on('close', () => {
        console.log(`🔌 Отключение: ${playerId} (${player.name})`);
        
        broadcast({
            type: 'chat',
            player: 'Система',
            message: `👋 ${player.name} покинул игру`
        });
        
        players.delete(playerId);
        serverStats.currentPlayers = players.size;
        
        broadcast({
            type: 'player_leave',
            id: playerId
        });
    });
    
    ws.on('error', (error) => {
        console.error(`⚠️ Ошибка: ${playerId}`, error.message);
    });
});

// Обработка сообщений
function handleMessage(playerId, data) {
    const player = players.get(playerId);
    if (!player) return;
    
    switch (data.type) {
        case 'join':
            if (data.name && data.name.trim().length > 0) {
                player.name = data.name.trim().substring(0, 20);
            }
            break;
            
        case 'update':
            // Обновление позиции и состояния
            if (data.position) {
                player.position = data.position;
            }
            if (data.rotation) {
                player.rotation = data.rotation;
            }
            if (data.health !== undefined) {
                player.health = Math.max(0, Math.min(100, data.health));
            }
            
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
            serverStats.totalShots++;
            
            broadcast({
                type: 'player_shoot',
                id: playerId,
                position: player.position,
                rotation: player.rotation
            }, playerId);
            
            // Проверяем кд
            const now = Date.now();
            if (now - player.lastShootTime < player.shootCooldown) {
                return;
            }
            player.lastShootTime = now;
            
            // Проверяем попадания по всем игрокам
            let hitDetected = false;
            players.forEach((target, targetId) => {
                if (targetId === playerId || !target.isAlive) return;
                
                // Проверяем попадание
                if (checkHit(player.position, player.rotation, target.position)) {
                    hitDetected = true;
                    serverStats.totalHits++;
                    
                    // Наносим урон
                    const damage = 34;
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
                            target: targetId,
                            targetName: target.name,
                            damage: damage
                        });
                        
                        // Сообщение жертве
                        sendToPlayer(target.ws, {
                            type: 'death',
                            killer: playerId,
                            killerName: player.name,
                            damage: damage
                        });
                        
                        // Всем об убийстве
                        broadcast({
                            type: 'kill_feed',
                            killer: player.name,
                            victim: target.name,
                            killerId: playerId,
                            victimId: targetId
                        });
                        
                        broadcast({
                            type: 'chat',
                            player: 'Система',
                            message: `⚔️ ${player.name} убил ${target.name}`
                        });
                        
                        // Респавн через 3 секунды
                        setTimeout(() => {
                            if (players.has(targetId)) {
                                target.health = 100;
                                target.isAlive = true;
                                target.position = { 
                                    x: Math.random() * 40 - 20, 
                                    y: 1.7, 
                                    z: Math.random() * 40 - 20 
                                };
                                target.rotation = { yaw: 0, pitch: 0 };
                                
                                sendToPlayer(target.ws, {
                                    type: 'respawn',
                                    position: target.position,
                                    health: target.health
                                });
                                
                                broadcast({
                                    type: 'player_respawn',
                                    id: targetId,
                                    position: target.position,
                                    rotation: target.rotation,
                                    health: target.health
                                });
                                
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
                        target: targetId,
                        health: target.health,
                        isAlive: target.isAlive,
                        damage: damage,
                        attacker: playerId
                    });
                    
                    // Отправляем подтверждение попадания стрелку
                    sendToPlayer(player.ws, {
                        type: 'hit_confirm',
                        target: targetId,
                        targetName: target.name,
                        damage: damage,
                        targetHealth: target.health
                    });
                }
            });
            
            // Если не попали ни в кого
            if (!hitDetected) {
                sendToPlayer(player.ws, {
                    type: 'shot_missed'
                });
            }
            break;
            
        case 'chat':
            if (data.message && data.message.trim().length > 0) {
                const message = data.message.trim().substring(0, 100);
                broadcast({
                    type: 'chat',
                    player: player.name,
                    message: message,
                    time: Date.now()
                });
                console.log(`💬 ${player.name}: ${message}`);
            }
            break;
            
        case 'jump':
            // Игрок прыгает
            broadcast({
                type: 'player_jump',
                id: playerId
            });
            break;
            
        case 'ping':
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
    console.log('🎯 FPS Multiplayer Server v3.0');
    console.log(`📡 Порт: ${PORT}`);
    console.log(`🌐 WebSocket: wss://[your-domain].onrender.com`);
    console.log(`🎯 Система попаданий: АКТИВНА`);
    console.log(`👤 Максимум игроков: 50`);
    console.log(`💬 Поддержка чата: включена`);
    console.log('=================================');
    
    setInterval(() => {
        console.log(`📊 Статистика: ${players.size} игроков, ${serverStats.totalShots} выстрелов, ${serverStats.totalHits} попаданий`);
    }, 300000);
});

// Очистка неактивных игроков
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    players.forEach((player, id) => {
        if (now - player.lastUpdate > 1800000) {
            console.log(`🧹 Очистка: ${id} (${player.name})`);
            
            broadcast({
                type: 'chat',
                player: 'Система',
                message: `${player.name} отключен за неактивность`
            });
            
            if (player.ws.readyState === WebSocket.OPEN) {
                player.ws.close();
            }
            players.delete(id);
            cleaned++;
        }
    });
    
    if (cleaned > 0) {
        serverStats.currentPlayers = players.size;
        console.log(`🗑️ Удалено: ${cleaned}`);
    }
}, 60000);

process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершение...');
    
    broadcast({
        type: 'chat',
        player: 'Система',
        message: '⚠️ Сервер выключается. Спасибо за игру!'
    });
    
    setTimeout(() => {
        wss.close();
        server.close();
        console.log('✅ Сервер остановлен');
        process.exit(0);
    }, 3000);
});
