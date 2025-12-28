const Game = {
    // Основные объекты Three.js
    scene: null,
    camera: null,
    renderer: null,
    
    // Состояние игры
    isRunning: false,
    lastFrameTime: 0,
    lastShootTime: 0,
    lastNetworkUpdate: 0,
    
    // Игровые объекты
    player: {
        id: '',
        name: '',
        position: new THREE.Vector3(0, 0, 0),
        rotation: { yaw: 0, pitch: 0 },
        health: 100,
        color: 0xff0000,
        velocityY: 0,
        isGrounded: true,
        isMoving: false
    },
    
    // Коллекции
    otherPlayers: new Map(),
    walls: [],
    bullets: [],
    
    // Статистика
    stats: {
        kills: 0,
        deaths: 0,
        shots: 0,
        hits: 0
    },
    
    // === ОСНОВНЫЕ МЕТОДЫ ===
    
    // Запуск игры
    async start() {
        try {
            // Скрываем меню
            document.getElementById('menu').classList.add('hidden');
            
            // Показываем игровые элементы
            document.getElementById('ui').style.display = 'flex';
            document.getElementById('crosshair').style.display = 'block';
            document.getElementById('chatBtn').style.display = 'block';
            
            // Инициализация
            this.init();
            Controls.init();
            
            // Подключение к серверу
            await Network.connect();
            Network.registerPlayer();
            
            this.isRunning = true;
            this.lastFrameTime = performance.now();
            this.lastNetworkUpdate = Date.now();
            
            // Запуск игрового цикла
            this.gameLoop();
            
            Notification.show('🎮 Игра началась! Добро пожаловать!');
            
        } catch (error) {
            console.error('Ошибка запуска игры:', error);
            Notification.show('❌ Не удалось запустить игру');
        }
    },
    
    // Инициализация игры
    init() {
        // Создаем сцену
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.03);
        
        // Создаем камеру
        this.camera = new THREE.PerspectiveCamera(
            CONFIG.FOV,
            window.innerWidth / window.innerHeight,
            CONFIG.NEAR_PLANE,
            CONFIG.FAR_PLANE
        );
        
        // Создаем рендерер
        const canvas = document.getElementById('gameCanvas');
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: canvas, 
            antialias: true,
            alpha: true
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Освещение
        this.setupLighting();
        
        // Создаем мир
        this.createWorld();
        
        // Создаем оружие
        this.createWeapon();
        
        // Инициализируем игрока
        this.player.position.set(0, CONFIG.PLAYER_HEIGHT, 5);
        this.player.health = CONFIG.MAX_HEALTH;
        this.player.velocityY = 0;
        this.player.isGrounded = true;
        
        // Обработка изменения размера
        window.addEventListener('resize', () => this.onResize());
    },
    
    // Настройка освещения
    setupLighting() {
        // Ambient light
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        
        // Directional light (солнце)
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = CONFIG.SHADOW_QUALITY;
        sun.shadow.mapSize.height = CONFIG.SHADOW_QUALITY;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        this.scene.add(sun);
    },
    
    // Создание мира
    createWorld() {
        // Пол
        const floorGeometry = new THREE.PlaneGeometry(CONFIG.MAP_SIZE, CONFIG.MAP_SIZE, 50, 50);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x3a5f0b,
            roughness: 0.8,
            metalness: 0.1
        });
        
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        
        // Стены
        this.createWalls();
        
        // Препятствия
        this.createObstacles();
        
        // Небо
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x87CEEB,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
    },
    
    // Создание стен
    createWalls() {
        const wallMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8a8a8a,
            roughness: 0.6,
            metalness: 0.1
        });
        
        // Внешние стены
        const wallPositions = [
            [0, -40, 80, 6],   // Север
            [0, 40, 80, 6],    // Юг
            [-40, 0, 6, 80],   // Запад
            [40, 0, 6, 80]     // Восток
        ];
        
        wallPositions.forEach(pos => {
            const wall = new THREE.Mesh(
                new THREE.BoxGeometry(pos[2], CONFIG.WALL_HEIGHT, pos[3]),
                wallMaterial
            );
            wall.position.set(pos[0], CONFIG.WALL_HEIGHT/2, pos[1]);
            wall.castShadow = true;
            wall.receiveShadow = true;
            this.scene.add(wall);
            this.walls.push(new THREE.Box3().setFromObject(wall));
        });
    },
    
    // Создание препятствий
    createObstacles() {
        const obstacles = [
            [-15, -15, 4, 4, 4],
            [15, -15, 4, 4, 4],
            [-15, 15, 4, 4, 4],
            [15, 15, 4, 4, 4],
            [0, 0, 8, 4, 8]
        ];
        
        obstacles.forEach(obs => {
            const obstacle = new THREE.Mesh(
                new THREE.BoxGeometry(obs[2], obs[3], obs[4]),
                new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 })
            );
            obstacle.position.set(obs[0], obs[3]/2, obs[1]);
            obstacle.castShadow = true;
            obstacle.receiveShadow = true;
            this.scene.add(obstacle);
            this.walls.push(new THREE.Box3().setFromObject(obstacle));
        });
    },
    
    // Создание оружия
    createWeapon() {
        const gunGroup = new THREE.Group();
        
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8),
            new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.8 })
        );
        barrel.rotation.x = Math.PI / 2;
        
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.15, 0.9),
            new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.5 })
        );
        
        const handle = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 0.3, 0.2),
            new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 })
        );
        handle.position.y = -0.2;
        handle.position.z = -0.1;
        
        gunGroup.add(barrel, body, handle);
        gunGroup.position.set(0.4, -0.3, -1);
        
        this.camera.add(gunGroup);
    },
    
    // === ФИЗИКА И ДВИЖЕНИЕ ===
    
    // Обновление физики
    updatePhysics() {
        // Гравитация
        this.player.velocityY -= CONFIG.GRAVITY;
        this.player.position.y += this.player.velocityY;
        
        // Проверка земли
        if (this.player.position.y < CONFIG.PLAYER_HEIGHT) {
            this.player.position.y = CONFIG.PLAYER_HEIGHT;
            this.player.velocityY = 0;
            this.player.isGrounded = true;
        } else {
            this.player.isGrounded = false;
        }
    },
    
    // Проверка коллизий
    checkCollision(position) {
        const playerBox = new THREE.Box3(
            new THREE.Vector3(
                position.x - CONFIG.PLAYER_RADIUS,
                CONFIG.PLAYER_HEIGHT - 1,
                position.z - CONFIG.PLAYER_RADIUS
            ),
            new THREE.Vector3(
                position.x + CONFIG.PLAYER_RADIUS,
                CONFIG.PLAYER_HEIGHT + 1,
                position.z + CONFIG.PLAYER_RADIUS
            )
        );
        
        for (const wall of this.walls) {
            if (playerBox.intersectsBox(wall)) {
                return true;
            }
        }
        
        return false;
    },
    
    // === СТРЕЛЬБА И ПУЛИ ===
    
    // Эффект отдачи оружия
    weaponRecoil() {
        if (this.camera.children[0]) {
            const gun = this.camera.children[0];
            gun.position.z = -0.85;
            gun.rotation.x = 0.1;
            
            setTimeout(() => {
                if (gun) {
                    gun.position.z = -1;
                    gun.rotation.x = 0;
                }
            }, 100);
            
            // Эффект вспышки
            const muzzleFlash = new THREE.PointLight(0xffaa00, 3, 2);
            muzzleFlash.position.set(0, 0, -1.5);
            gun.add(muzzleFlash);
            setTimeout(() => gun.remove(muzzleFlash), 50);
        }
    },
    
    // Создание пули
    createBullet() {
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyEuler(new THREE.Euler(this.player.rotation.pitch, this.player.rotation.yaw, 0, 'YXZ'));
        
        const rayOrigin = this.camera.position.clone();
        const rayDirection = direction.clone().normalize();
        
        const bulletGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        
        bullet.position.copy(rayOrigin);
        bullet.userData.velocity = rayDirection.multiplyScalar(CONFIG.BULLET_SPEED);
        bullet.userData.lifeTime = CONFIG.BULLET_LIFETIME;
        bullet.userData.createdAt = Date.now();
        
        this.scene.add(bullet);
        this.bullets.push(bullet);
    },
    
    // Обновление пуль
    updateBullets() {
        const now = Date.now();
        
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            // Удаляем старые пули
            if (now - bullet.userData.createdAt > bullet.userData.lifeTime) {
                this.scene.remove(bullet);
                this.bullets.splice(i, 1);
                continue;
            }
            
            // Двигаем пулю
            bullet.position.add(bullet.userData.velocity);
            
            // Проверяем столкновения со стенами
            for (const wall of this.walls) {
                const bulletBox = new THREE.Box3().setFromObject(bullet);
                if (bulletBox.intersectsBox(wall)) {
                    this.createBulletHole(bullet.position);
                    this.scene.remove(bullet);
                    this.bullets.splice(i, 1);
                    break;
                }
            }
        }
    },
    
    // Создание следа от пули
    createBulletHole(position) {
        const bulletHole = document.createElement('div');
        bulletHole.className = 'bullet-hole';
        bulletHole.style.left = '50%';
        bulletHole.style.top = '50%';
        document.body.appendChild(bulletHole);
        
        setTimeout(() => bulletHole.remove(), 2000);
    },
    
    // Проверка попадания
    checkHit() {
        if (!this.isRunning || this.otherPlayers.size === 0) return;
        
        const raycaster = new THREE.Raycaster();
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyEuler(new THREE.Euler(this.player.rotation.pitch, this.player.rotation.yaw, 0, 'YXZ'));
        
        raycaster.set(this.camera.position, direction);
        
        let closestHit = null;
        let closestDistance = Infinity;
        
        this.otherPlayers.forEach((otherPlayer, id) => {
            if (!otherPlayer.mesh || !otherPlayer.isAlive) return;
            
            const box = new THREE.Box3().setFromObject(otherPlayer.mesh);
            const intersect = raycaster.intersectBox(box);
            
            if (intersect) {
                const distance = this.camera.position.distanceTo(otherPlayer.position);
                if (distance < closestDistance && distance < CONFIG.MAX_SHOOT_DISTANCE) {
                    closestDistance = distance;
                    closestHit = { id, otherPlayer };
                }
            }
        });
        
        if (closestHit && Network.isConnected) {
            Network.sendHit(closestHit.id);
            this.stats.shots++;
            
            // Визуальная обратная связь
            if (closestHit.otherPlayer.mesh && closestHit.otherPlayer.mesh.children[0]) {
                const originalColor = closestHit.otherPlayer.color;
                closestHit.otherPlayer.mesh.children[0].material.color.setHex(0xff0000);
                setTimeout(() => {
                    if (closestHit.otherPlayer.mesh && closestHit.otherPlayer.mesh.children[0]) {
                        closestHit.otherPlayer.mesh.children[0].material.color.setHex(originalColor);
                    }
                }, 200);
            }
        }
    },
    
    // === ИГРОКИ ===
    
    // Добавление другого игрока
    addOtherPlayer(id, position, rotation, health = 100, color = 0x0000ff, name = 'Player') {
        if (this.otherPlayers.has(id) || id === this.player.id) return;
        
        const mesh = this.createPlayerMesh(color);
        mesh.position.set(position.x, position.y || CONFIG.PLAYER_HEIGHT, position.z);
        mesh.rotation.y = rotation.yaw || 0;
        this.scene.add(mesh);
        
        this.otherPlayers.set(id, {
            mesh,
            position: new THREE.Vector3(position.x, position.y || CONFIG.PLAYER_HEIGHT, position.z),
            rotation: rotation || { yaw: 0, pitch: 0 },
            health: health,
            name: name,
            color: color,
            isAlive: health > 0,
            lastUpdate: Date.now()
        });
        
        this.updatePlayersCount();
        console.log(`Добавлен игрок: ${name} (${id})`);
    },
    
    // Создание меша игрока
    createPlayerMesh(color) {
        const group = new THREE.Group();
        
        // Тело
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: color,
            roughness: 0.7,
            metalness: 0.1
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.6;
        body.castShadow = true;
        
        // Голова
        const headGeometry = new THREE.SphereGeometry(0.25, 8, 8);
        const headMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xf0f0f0,
            roughness: 0.5
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 1.5;
        head.castShadow = true;
        
        group.add(body, head);
        return group;
    },
    
    // Удаление игрока
    removeOtherPlayer(id) {
        if (this.otherPlayers.has(id)) {
            this.scene.remove(this.otherPlayers.get(id).mesh);
            this.otherPlayers.delete(id);
            this.updatePlayersCount();
            console.log(`Удален игрок: ${id}`);
        }
    },
    
    // Обновление данных игрока
    updateOtherPlayer(id, position, rotation, health) {
        if (this.otherPlayers.has(id)) {
            const otherPlayer = this.otherPlayers.get(id);
            otherPlayer.position.set(position.x, position.y || CONFIG.PLAYER_HEIGHT, position.z);
            otherPlayer.rotation = rotation || otherPlayer.rotation;
            otherPlayer.health = health;
            otherPlayer.isAlive = health > 0;
            otherPlayer.lastUpdate = Date.now();
        }
    },
    
    // Обновление здоровья игрока
    updatePlayerHealth(id, health) {
        if (this.otherPlayers.has(id)) {
            const otherPlayer = this.otherPlayers.get(id);
            otherPlayer.health = health;
            otherPlayer.isAlive = health > 0;
        }
    },
    
    // Интерполяция других игроков
    interpolatePlayers() {
        const now = Date.now();
        
        this.otherPlayers.forEach(otherPlayer => {
            if (otherPlayer.mesh) {
                // Удаляем игроков, которые не обновлялись 10 секунд
                if (now - otherPlayer.lastUpdate > 10000) {
                    this.scene.remove(otherPlayer.mesh);
                    this.otherPlayers.delete(otherPlayer.id);
                    return;
                }
                
                // Плавная интерполяция
                otherPlayer.mesh.position.lerp(otherPlayer.position, 0.2);
                otherPlayer.mesh.position.y = CONFIG.PLAYER_HEIGHT - 1.2;
                
                // Плавный поворот
                const targetRotation = otherPlayer.rotation.yaw || 0;
                const currentRotation = otherPlayer.mesh.rotation.y;
                const rotationDiff = targetRotation - currentRotation;
                
                // Нормализуем разницу
                if (rotationDiff > Math.PI) {
                    otherPlayer.mesh.rotation.y += rotationDiff - Math.PI * 2;
                } else if (rotationDiff < -Math.PI) {
                    otherPlayer.mesh.rotation.y += rotationDiff + Math.PI * 2;
                } else {
                    otherPlayer.mesh.rotation.y += rotationDiff * 0.1;
                }
            }
        });
    },
    
    // Анимация оружия при движении
    animateWeapon() {
        if (this.camera.children[0]) {
            const gun = this.camera.children[0];
            const time = performance.now() * 0.01;
            
            // Дыхание (постоянное легкое движение)
            gun.position.x = 0.4 + Math.sin(time * 0.5) * 0.005;
            gun.position.y = -0.3 + Math.cos(time * 1) * 0.003;
            
            // Дополнительное движение при ходьбе
            if (this.player.isMoving) {
                gun.position.x += Math.sin(time * 8) * 0.01;
                gun.position.y += Math.cos(time * 16) * 0.005;
                gun.rotation.z = Math.sin(time * 4) * 0.02;
            }
        }
    },
    
    // Обновление камеры
    updateCamera() {
        this.camera.position.copy(this.player.position);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.player.rotation.yaw;
        this.camera.rotation.x = this.player.rotation.pitch;
    },
    
    // === ИГРОВОЙ ЦИКЛ ===
    
    // Главный игровой цикл
    gameLoop() {
        if (!this.isRunning) return;
        
        const currentTime = performance.now();
        const deltaTime = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = currentTime;
        
        // Обновление физики
        this.updatePhysics();
        
        // Обновление управления
        Controls.update(deltaTime);
        
        // Обновление пуль
        this.updateBullets();
        
        // Обновление камеры
        this.updateCamera();
        
        // Интерполяция других игроков
        this.interpolatePlayers();
        
        // Анимация оружия
        this.animateWeapon();
        
        // Отправка обновления на сервер (каждые 100мс)
        if (Network.isConnected && Date.now() - this.lastNetworkUpdate > 100) {
            Network.sendUpdate(
                {
                    x: this.player.position.x,
                    y: this.player.position.y,
                    z: this.player.position.z
                },
                this.player.rotation,
                this.player.health
            );
            this.lastNetworkUpdate = Date.now();
        }
        
        // Рендеринг
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
        
        // Следующий кадр
        requestAnimationFrame(() => this.gameLoop());
    },
    
    // Обработка изменения размера окна
    onResize() {
        if (!this.camera || !this.renderer) return;
        
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    },
    
    // === ИНТЕРФЕЙС ===
    
    // Обновление здоровья
    updateHealth() {
        const healthPercent = (this.player.health / CONFIG.MAX_HEALTH) * 100;
        document.getElementById('healthText').textContent = Math.round(this.player.health);
        document.getElementById('healthFill').style.width = healthPercent + '%';
        
        // Изменение цвета в зависимости от здоровья
        const healthFill = document.getElementById('healthFill');
        if (healthPercent > 50) {
            healthFill.style.background = 'linear-gradient(to right, #00ff00, #ffff00)';
        } else if (healthPercent > 25) {
            healthFill.style.background = 'linear-gradient(to right, #ffff00, #ff9900)';
        } else {
            healthFill.style.background = 'linear-gradient(to right, #ff9900, #ff0000)';
        }
    },
    
    // Обновление счетчика игроков
    updatePlayersCount() {
        document.getElementById('playersText').textContent = this.otherPlayers.size + 1;
    },
    
    // Обновление убийств
    updateKills() {
        document.getElementById('killsText').textContent = this.stats.kills;
    },
    
    // Обновление смертей
    updateDeaths() {
        document.getElementById('deathsText').textContent = this.stats.deaths;
    },
    
    // Сброс игры
    reset() {
        this.isRunning = false;
        
        // Очистка сцены
        if (this.scene) {
            this.otherPlayers.forEach(otherPlayer => {
                this.scene.remove(otherPlayer.mesh);
            });
            this.otherPlayers.clear();
            
            this.bullets.forEach(bullet => {
                this.scene.remove(bullet);
            });
            this.bullets = [];
            
            // Удаляем оружие с камеры
            if (this.camera && this.camera.children[0]) {
                this.camera.remove(this.camera.children[0]);
            }
        }
        
        // Сброс игрока
        this.player = {
            id: '',
            name: '',
            position: new THREE.Vector3(0, 0, 0),
            rotation: { yaw: 0, pitch: 0 },
            health: CONFIG.MAX_HEALTH,
            color: 0xff0000,
            velocityY: 0,
            isGrounded: true,
            isMoving: false
        };
        
        // Сброс статистики
        this.stats = { kills: 0, deaths: 0, shots: 0, hits: 0 };
        this.lastShootTime = 0;
        this.lastNetworkUpdate = 0;
        
        // Сброс управления
        Controls.reset();
        
        // Отключение от сервера
        Network.disconnect();
        
        // Показываем меню
        document.getElementById('menu').classList.remove('hidden');
        document.getElementById('ui').style.display = 'none';
        document.getElementById('crosshair').style.display = 'none';
        document.getElementById('chatBtn').style.display = 'none';
        document.getElementById('mobileControls').style.display = 'none';
        document.getElementById('pcControls').style.display = 'none';
        
        // Очистка чата
        Chat.clear();
        
        console.log('Игра сброшена');
    }
};

// Глобальная функция для запуска игры
window.startGame = function() {
    Game.start();
};

// Уведомления
const Notification = {
    // Показать уведомление
    show(text, duration = 3000) {
        const notification = document.getElementById('notification');
        notification.textContent = text;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, duration);
    },
    
    // Показать ошибку
    error(text) {
        this.show(`❌ ${text}`);
    },
    
    // Показать успех
    success(text) {
        this.show(`✅ ${text}`);
    },
    
    // Показать предупреждение
    warning(text) {
        this.show(`⚠️ ${text}`);
    }
};
