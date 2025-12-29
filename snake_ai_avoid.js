const canvas = document.getElementById("glcanvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const gl = canvas.getContext("webgl");
if(!gl){ alert("WebGL не поддерживается"); }

// --- Шейдеры ---
function createShader(gl,type,source){
    const shader = gl.createShader(type);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
        console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

function createProgram(gl,vShader,fShader){
    const program = gl.createProgram();
    gl.attachShader(program,vShader);
    gl.attachShader(program,fShader);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
        console.error(gl.getProgramInfoLog(program));
    }
    return program;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = createProgram(gl, vertexShader, fragmentShader);

const posLoc = gl.getAttribLocation(program,"a_position");
const resLoc = gl.getUniformLocation(program,"u_resolution");
const colLoc = gl.getUniformLocation(program,"u_color");
const posBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,posBuffer);

// --- Настройки ---
const SEGMENT_SIZE = 5;
const SEGMENT_COUNT = 1;
let segments = [];
for(let i=0;i<SEGMENT_COUNT;i++) segments.push({x:200-i*SEGMENT_SIZE, y:200});

let apples = [];
let targetApple = null;
let obstacles = [];
const appleCountInput = document.getElementById("appleCount");
const obstacleCountInput = document.getElementById("obstacleCount");
const obstacleSize = SEGMENT_SIZE;

// --- Спавн яблок и препятствий ---
function spawnApple(){
    apples.push({x: Math.random()*canvas.width, y: Math.random()*canvas.height, age:0, maxAge:400+Math.random()*400});
}
function spawnObstacles(){
    obstacles = [];
    const count = parseInt(obstacleCountInput.value);
    for(let i=0;i<count;i++){
        obstacles.push({x: Math.random()*(canvas.width-obstacleSize), y: Math.random()*(canvas.height-obstacleSize)});
    }
}
function initApplesAndObstacles(){
    apples.length = 0;
    const count = parseInt(appleCountInput.value);
    for(let i=0;i<count;i++) spawnApple();
    spawnObstacles();
}
initApplesAndObstacles();
appleCountInput.addEventListener("change", initApplesAndObstacles);
obstacleCountInput.addEventListener("change", spawnObstacles);

// --- UI ---
let score = 0;
const scoreDiv = document.getElementById("score");
let headAngle = 0;
let baseSpeed = 2.5;
let speed = baseSpeed;
const maxTurn = 0.05;
const checkDistance = SEGMENT_SIZE*1.2;
const speedSlider = document.getElementById("speedSlider");
const speedLabel = document.getElementById("speedLabel");
const normalBtn = document.getElementById("normalSpeedBtn");
speedSlider.addEventListener("input",()=>{
    speed = speedSlider.value/10;
    speedLabel.innerText = "Speed: "+speed.toFixed(1);
});
normalBtn.addEventListener("click",()=>{
    speed = baseSpeed;
    speedSlider.value = baseSpeed*10;
    speedLabel.innerText = "Speed: "+speed.toFixed(1);
});

// --- Управление стрелками ---
let inputAngle = null;
const inputTurn = 0.15;
window.addEventListener("keydown", (e)=>{
    switch(e.key){
        case "ArrowUp": inputAngle = -inputTurn; break;
        case "ArrowDown": inputAngle = inputTurn; break;
        case "ArrowLeft": inputAngle = -inputTurn; break;
        case "ArrowRight": inputAngle = inputTurn; break;
    }
});
window.addEventListener("keyup", (e)=>{
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) inputAngle = null;
});

// --- Общий буфер вершин для оптимизации ---
function getQuadVertices(x,y,size){
    const half = size/2;
    return [x-half, y-half, x+half, y-half, x-half, y+half, x-half, y+half, x+half, y-half, x+half, y+half];
}

// --- Обновление яблок ---
function updateApples(){
    for(let i=0;i<apples.length;i++){
        const a = apples[i];
        a.age++;
        if(a.age >= a.maxAge){
            apples[i] = {x:Math.random()*canvas.width, y:Math.random()*canvas.height, age:0, maxAge:400+Math.random()*400};
            if(targetApple === a) targetApple=null;
        }
    }
}

// --- Выбор цели ---
function chooseTargetApple(){
    if(targetApple && targetApple.age < targetApple.maxAge*0.8) return;
    let freshest = null, minAge = Infinity;
    for(let a of apples) if(a.age < minAge){ freshest=a; minAge=a.age; }
    targetApple = freshest;
}

// --- Проверка еды ---
function checkFood(){
    const head = segments[0];
    for(let a of apples){
        const dx = head.x - a.x, dy = head.y - a.y;
        if(dx*dx+dy*dy < SEGMENT_SIZE*SEGMENT_SIZE){
            const last = segments[segments.length-1];
            segments.push({x:last.x, y:last.y});
            a.x = Math.random()*canvas.width;
            a.y = Math.random()*canvas.height;
            a.age = 0;
            score++;
            scoreDiv.innerText = "Score: "+score;
        }
    }
}

// --- Проверка столкновений ---
function checkCollisions(){
    const head = segments[0];
    for(let i=3;i<segments.length;i++){
        const dx=head.x-segments[i].x, dy=head.y-segments[i].y;
        if(dx*dx+dy*dy<SEGMENT_SIZE*SEGMENT_SIZE*0.8){ resetSnake(); return; }
    }
    for(let o of obstacles){
        const dx=head.x-o.x, dy=head.y-o.y;
        if(Math.abs(dx)<SEGMENT_SIZE && Math.abs(dy)<SEGMENT_SIZE){ resetSnake(); return; }
    }
}

// --- Сброс ---
function resetSnake(){
    segments = [];
    for(let i=0;i<SEGMENT_COUNT;i++) segments.push({x:200-i*SEGMENT_SIZE, y:200});
    headAngle = 0; score=0; scoreDiv.innerText="Score: 0";
}

// --- Логика движения ---
function isPathBlocked(angle){
    const head = segments[0];
    const tx = head.x+Math.cos(angle)*checkDistance, ty=head.y+Math.sin(angle)*checkDistance;
    for(let i=2;i<segments.length;i++){
        const dx=tx-segments[i].x, dy=ty-segments[i].y;
        if(dx*dx+dy*dy < SEGMENT_SIZE*SEGMENT_SIZE*0.8) return true;
    }
    for(let o of obstacles){
        const dx=tx-o.x, dy=ty-o.y;
        if(Math.abs(dx)<SEGMENT_SIZE && Math.abs(dy)<SEGMENT_SIZE) return true;
    }
    return false;
}

function updateLogic(){
    chooseTargetApple();
    if(!targetApple) return;
    const head = segments[0];
    let targetAngle=Math.atan2(targetApple.y-head.y, targetApple.x-head.x);
    if(inputAngle!==null){ headAngle+=inputAngle; }
    else{
        let angleDiff = Math.atan2(Math.sin(targetAngle-headAngle), Math.cos(targetAngle-headAngle));
        if(isPathBlocked(headAngle)){
            const left=headAngle-0.3, right=headAngle+0.3;
            if(!isPathBlocked(left)) headAngle=left;
            else if(!isPathBlocked(right)) headAngle=right;
        }else{
            if(angleDiff>maxTurn) angleDiff=maxTurn;
            if(angleDiff<-maxTurn) angleDiff=-maxTurn;
            headAngle+=angleDiff;
        }
    }
    checkCollisions();
}

// --- Визуальное движение ---
function updateVisual(dt){
    const head=segments[0];
    head.x += Math.cos(headAngle)*speed*dt;
    head.y += Math.sin(headAngle)*speed*dt;
    for(let i=1;i<segments.length;i++){
        const dx=segments[i-1].x-segments[i].x, dy=segments[i-1].y-segments[i].y;
        const angle=Math.atan2(dy,dx);
        segments[i].x=segments[i-1].x-Math.cos(angle)*SEGMENT_SIZE;
        segments[i].y=segments[i-1].y-Math.sin(angle)*SEGMENT_SIZE;
    }
}

// --- Рисование ---
function drawAll(){
    let vertices=[];
    for(let a of apples) vertices.push(...getQuadVertices(a.x,a.y,SEGMENT_SIZE));
    for(let o of obstacles) vertices.push(...getQuadVertices(o.x,o.y,SEGMENT_SIZE));
    for(let s of segments) vertices.push(...getQuadVertices(s.x,s.y,SEGMENT_SIZE));
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    let offset=0;
    // яблоки
    for(let a of apples){
        const t=Math.max(0,1-a.age/a.maxAge);
        gl.uniform4fv(colLoc,[t,0,0,1]);
        gl.drawArrays(gl.TRIANGLES, offset, 6);
        offset+=6;
    }
    // препятствия
    for(let o of obstacles){
        gl.uniform4fv(colLoc,[0.5,0.5,0.5,1]);
        gl.drawArrays(gl.TRIANGLES, offset, 6);
        offset+=6;
    }
    // сегменты
    for(let s of segments){
        gl.uniform4fv(colLoc,[0.2,1,0.2,1]);
        gl.drawArrays(gl.TRIANGLES, offset, 6);
        offset+=6;
    }
}

// --- Анимация ---
let lastLogicTime=0;
const logicFPS=60;
const logicInterval=1000/logicFPS;
let lastTime=0;

function gameLoop(timestamp){
    const dt = (timestamp-lastTime)/16.666; lastTime=timestamp;
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.enableVertexAttribArray(posLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER,posBuffer);
    gl.vertexAttribPointer(posLoc,2,gl.FLOAT,false,0,0);
    gl.uniform2f(resLoc,canvas.width,canvas.height);

    if(timestamp-lastLogicTime>logicInterval){ updateLogic(); lastLogicTime=timestamp; }

    updateVisual(dt);
    updateApples();
    checkFood();
    drawAll();

    requestAnimationFrame(gameLoop);
}

// --- МУЗЫКА (БЕЗ ПЕРЕПИСЫВАНИЯ ИГРЫ) ---
const music = new Audio("music.mp3");
music.loop = true;
music.volume = 0.5;

// браузер разрешит звук только после действия пользователя
window.addEventListener("click", () => {
    if (music.paused) {
        music.play().catch(()=>{});
    }
});

// ползунок громкости
const volumeSlider = document.getElementById("musicVolume");
volumeSlider.addEventListener("input", () => {
    music.volume = volumeSlider.value / 100;
});


requestAnimationFrame(gameLoop);
