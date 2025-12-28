[file name]: controls.js
[file content begin]
const Controls = {
    // Параметры управления
    isPC: false,
    isMobile: false,
    
    // Состояние управления ПК
    keys: {
        w: false, a: false, s: false, d: false,
        space: false, shift: false
    },
    
    // Состояние управления мобильных
    touch: {
        isMoving: false,
        moveX: 0,
        moveY: 0,
        isRotating: false,
        lastTouchX: 0,
        lastTouchY: 0,
        touchId: null,
        isJumping: false,
        isShooting: false
    },
    
    // Инициализация управления
    init() {
        this.detectPlatform();
        
        if (this.isPC) {
            this.setupPCControls();
            document.getElementById('pcControls').style.display = 'block';
        } else {
            this.setupMobileControls();
            document.getElementById('mobileControls').style.display = 'block';
        }
    },
    
    // Определение платформы
    detectPlatform() {
        this.isMobile = 'ontouchstart' in window && window.innerWidth <= 768;
        this.isPC = !this.isMobile;
        
        console.log(`Платформа: ${this.isPC ? 'ПК' : 'Мобильный'}`);
    },
    
    // === УПРАВЛЕНИЕ ДЛЯ ПК ===
    setupPCControls() {
        // Обработка клавиш
        document.addEventListener('keydown', (e) => {
            if (!Game.isRunning || Chat.isVisible) return;
            
            const key = e.key.toLowerCase();
            if (key in this.keys) {
                this.keys[key] = true;
                e.preventDefault();
            }
            
            // Прыжок
            if (key === ' ') {
                this.jump();
                e.preventDefault();
            }
            
            // Чат
            if (key === 'enter') {
                if (!Chat.isVisible) {
                    Chat.toggle();
                    e.preventDefault();
                }
            }
            
            // Выход из чата
            if (key === 'escape' && Chat.isVisible) {
                Chat.toggle();
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (!Game.isRunning) return;
            
            const key = e.key.toLowerCase();
            if (key in this.keys) {
                this.keys[key] = false;
            }
        });
        
        // Обработка мыши
        const canvas = document.getElementById('gameCanvas');
        
        // Стрельба по ЛКМ
        canvas.addEventListener('mousedown', (e) => {
            if (!Game.isRunning || Chat.isVisible || e.button !== 0) return;
            this.shoot();
        });
        
        // Автострельба при зажатии
        canvas.addEventListener('mousemove', (e) => {
            if (!Game.isRunning || Chat.isVisible) return;
            this.handleMouseMove(e.movementX, e.movementY);
        });
        
        // Блокировка курсора
        canvas.addEventListener('click', () => {
            if (this.isPC && document.pointerLockElement !== canvas) {
                canvas.requestPointerLock();
            }
        });
        
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === canvas) {
                // Курсор заблокирован
            } else {
                // Курсор разблокирован
            }
        });
    },
    
    // Обработка движения мыши
    handleMouseMove(deltaX, deltaY) {
        if (!Game.isRunning || Chat.isVisible) return;
        
        Game.player.rotation.yaw -= deltaX * CONFIG.ROTATION_SPEED;
        Game.player.rotation.pitch -= deltaY * CONFIG.ROTATION_SPEED * 0.5;
        Game.player.rotation.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, Game.player.rotation.pitch));
    },
    
    // === УПРАВЛЕНИЕ ДЛЯ МОБИЛЬНЫХ ===
    setupMobileControls() {
        const joystick = document.getElementById('moveJoystickContainer');
        
        // Джойстик движения
        joystick.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.touch.isMoving = true;
        }, { passive: false });
        
        joystick.addEventListener('touchmove', (e) => {
            if (!this.touch.isMoving || !Game.isRunning) return;
            
            e.preventDefault();
            const touch = e.touches[0];
            const rect = joystick.getBoundingClientRect();
            
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            this.touch.moveX = (touch.clientX - centerX) / (rect.width / 2);
            this.touch.moveY = (touch.clientY - centerY) / (rect.height / 2);
            
            // Ограничение окружностью
            const length = Math.sqrt(this.touch.moveX * this.touch.moveX + this.touch.moveY * this.touch.moveY);
            if (length > 1) {
                this.touch.moveX /= length;
                this.touch.moveY /= length;
            }
            
            // Обновление визуала джойстика
            const inner = document.getElementById('moveJoystickInner');
            inner.style.transform = `translate(${this.touch.moveX * 30}px, ${this.touch.moveY * 30}px)`;
            
        }, { passive: false });
        
        joystick.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.touch.moveX = 0;
            this.touch.moveY = 0;
            this.touch.isMoving = false;
            
            const inner = document.getElementById('moveJoystickInner');
            inner.style.transform = 'translate(0, 0)';
        }, { passive: false });
        
        joystick.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.touch.moveX = 0;
            this.touch.moveY = 0;
            this.touch.isMoving = false;
            
            const inner = document.getElementById('moveJoystickInner');
            inner.style.transform = 'translate(0, 0)';
        }, { passive: false });
        
        // Поворот камеры (правая часть экрана)
        document.addEventListener('touchstart', (e) => {
            if (!Game.isRunning || Chat.isVisible) return;
            
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                
                // Проверяем, что тач не на элементах управления
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                if (target && (
                    target.closest('#moveJoystickContainer') || 
                    target.closest('#shootBtn') || 
                    target.closest('#jumpBtn') ||
                    target.closest('#mobileChatBtn') ||
                    target.closest('#cameraSwitchBtn') ||
                    target.closest('#chatWindow')
                )) {
                    continue;
                }
                
                // Используем правую часть экрана для поворота
                if (touch.clientX > window.innerWidth / 3 && !this.touch.isRotating) {
                    this.touch.isRotating = true;
                    this.touch.touchId = touch.identifier;
                    this.touch.lastTouchX = touch.clientX;
                    this.touch.lastTouchY = touch.clientY;
                    break;
                }
            }
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (!Game.isRunning || Chat.isVisible || !this.touch.isRotating) return;
            
            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                if (touch.identifier === this.touch.touchId) {
                    const deltaX = touch.clientX - this.touch.lastTouchX;
                    const deltaY = touch.clientY - this.touch.lastTouchY;
                    
                    Game.player.rotation.yaw -= deltaX * CONFIG.ROTATION_SPEED * 2;
                    Game.player.rotation.pitch -= deltaY * CONFIG.ROTATION_SPEED;
                    Game.player.rotation.pitch = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, Game.player.rotation.pitch));
                    
                    this.touch.lastTouchX = touch.clientX;
                    this.touch.lastTouchY = touch.clientY;
                    e.preventDefault();
                    break;
                }
            }
        }, { passive: false });
        
        document.addEventListener('touchend', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.touch.touchId) {
                    this.touch.isRotating = false;
                    this.touch.touchId = null;
                    break;
                }
            }
        });
        
        // Обработка кнопок
        document.getElementById('jumpBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startJump();
        }, { passive: false });
        
        document.getElementById('jumpBtn').addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopJump();
        }, { passive: false });
        
        document.getElementById('shootBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startShooting();
        }, { passive: false });
        
        document.getElementById('shootBtn').addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopShooting();
        }, { passive: false });
    },
    
    // === ОБЩИЕ ФУНКЦИИ ===
    
    // Начать прыжок
    startJump() {
        this.touch.isJumping = true;
        if (Game.player.isGrounded) {
            this.jump();
        }
    },
    
    // Остановить прыжок
    stopJump() {
        this.touch.isJumping = false;
    },
    
    // Прыжок
    jump() {
        if (!Game.isRunning || !Game.player.isGrounded) return;
        
        Game.player.velocityY = CONFIG.JUMP_FORCE;
        Game.player.isGrounded = false;
        
        Network.sendJump();
    },
    
    // Стрельба
    shoot() {
        if (!Game.isRunning || !Network.isConnected) return;
        
        const now = Date.now();
        if (now - Game.lastShootTime < CONFIG.SHOOT_COOLDOWN) return;
        
        Game.lastShootTime = now;
        
        // Анимация отдачи
        Game.weaponRecoil();
        
        // Отправка на сервер
        Network.sendShoot(
            {
                x: Game.player.position.x,
                y: Game.player.position.y + 1.5,
                z: Game.player.position.z
            },
            Game.player.rotation
        );
        
        // Создание пули
        Game.createBullet();
        
        // Проверка попадания
        Game.checkHit();
    },
    
    // Начать стрельбу
    startShooting() {
        this.touch.isShooting = true;
        this.shoot();
        
        // Интервал для автострельбы
        this.shootInterval = setInterval(() => {
            if (this.touch.isShooting && Game.isRunning) {
                this.shoot();
            }
        }, CONFIG.SHOOT_COOLDOWN);
    },
    
    // Остановить стрельбу
    stopShooting() {
        this.touch.isShooting = false;
        if (this.shootInterval) {
            clearInterval(this.shootInterval);
        }
    },
    
    // Переключение режима камеры (опционально)
    toggleCameraMode() {
        // Можно добавить переключение между от первого и третьего лица
        Notification.show('Режим камеры переключен');
    },
    
    // Получение вектора движения
    getMovementVector() {
        const move = new THREE.Vector3(0, 0, 0);
        
        if (this.isPC) {
            // Движение на ПК
            const forward = new THREE.Vector3(0, 0, -1);
            forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), Game.player.rotation.yaw);
            
            const right = new THREE.Vector3(1, 0, 0);
            right.applyAxisAngle(new THREE.Vector3(0, 1, 0), Game.player.rotation.yaw);
            
            if (this.keys.w) move.add(forward);
            if (this.keys.s) move.add(forward.clone().multiplyScalar(-1));
            if (this.keys.a) move.add(right.clone().multiplyScalar(-1));
            if (this.keys.d) move.add(right);
            
            // Нормализация диагонального движения
            if (move.length() > 0) {
                move.normalize().multiplyScalar(CONFIG.PC_MOVE_SPEED);
                Game.player.isMoving = true;
            } else {
                Game.player.isMoving = false;
            }
            
        } else {
            // Движение на мобильных
            if (this.touch.isMoving && (Math.abs(this.touch.moveX) > 0.1 || Math.abs(this.touch.moveY) > 0.1)) {
                // Используем абсолютные направления относительно камеры
                const forward = new THREE.Vector3(0, 0, -1);
                forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), Game.player.rotation.yaw);
                
                const right = new THREE.Vector3(1, 0, 0);
                right.applyAxisAngle(new THREE.Vector3(0, 1, 0), Game.player.rotation.yaw);
                
                // Смешиваем движения вперед/назад и влево/вправо
                move.add(forward.clone().multiplyScalar(-this.touch.moveY));
                move.add(right.clone().multiplyScalar(this.touch.moveX));
                
                if (move.length() > 0) {
                    move.normalize().multiplyScalar(CONFIG.MOBILE_MOVE_SPEED);
                    Game.player.isMoving = true;
                }
            } else {
                Game.player.isMoving = false;
            }
            
            // Обработка прыжка при удержании кнопки
            if (this.touch.isJumping && Game.player.isGrounded) {
                this.jump();
            }
        }
        
        return move;
    },
    
    // Обновление управления
    update(deltaTime) {
        if (!Game.isRunning) return;
        
        // Получаем вектор движения
        const move = this.getMovementVector();
        
        // Применяем движение
        if (move.length() > 0) {
            const newPos = Game.player.position.clone().add(move);
            if (!Game.checkCollision(newPos)) {
                Game.player.position.copy(newPos);
            }
        }
    },
    
    // Сброс управления
    reset() {
        this.keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
        this.touch = {
            isMoving: false,
            moveX: 0,
            moveY: 0,
            isRotating: false,
            lastTouchX: 0,
            lastTouchY: 0,
            touchId: null,
            isJumping: false,
            isShooting: false
        };
        
        if (this.shootInterval) {
            clearInterval(this.shootInterval);
            this.shootInterval = null;
        }
        
        // Сброс визуала джойстика
        const inner = document.getElementById('moveJoystickInner');
        if (inner) {
            inner.style.transform = 'translate(0, 0)';
        }
    }
};
[file content end]
