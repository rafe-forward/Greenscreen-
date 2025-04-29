"use strict";

let canvas, gl;
let quadProgram, sceneProgram;
let videoTexture, fboTexture;
let chromaKeyLoc, thresholdLoc;
let video;
let fbo;
let cubeBuffers = {};
let angle = 0;
//quad verts for vid
const quadVertices = new Float32Array([
    -1.0, -1.0,
    -1.0,  1.0,
     1.0, -1.0,
     1.0, -1.0,
    -1.0,  1.0,
     1.0,  1.0
]);
const quadTexCoords = new Float32Array([
    0.0, 1.0,
    0.0, 0.0,
    1.0, 1.0,
    1.0, 1.0,
    0.0, 0.0,
    1.0, 0.0
]);

//set up the camera
async function setup() {
    video = document.getElementById("webcamVideo");
    try {
        await accessWebcam(video);
    } catch (ex) {
        video = null;
        console.error(ex.message);
    }
}

function accessWebcam(video) {
    return new Promise((resolve, reject) => {
        const mediaConstraints = { audio: false, video: { width: 800, height: 800, brightness: { ideal: 2 } } };
        navigator.mediaDevices.getUserMedia(mediaConstraints).then(mediaStream => {
            video.srcObject = mediaStream;
            video.setAttribute('playsinline', true);
            video.width = 800;
            video.height = 800;
            video.onloadedmetadata = () => {
                video.play();
                resolve(video);
            };
        }).catch(err => {
            reject(err);
        });
    });
}

window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext("webgl2");
    if (!gl) {
        alert("WebGL 2.0 is not available!");
        return;
    }
    //get shaders for each program
    quadProgram = initShaders(gl, "vertex-shader-quad", "fragment-shader-quad");
    sceneProgram = initShaders(gl, "vertex-shader-scene", "fragment-shader-scene");

    initQuad();
    initScene();
    initFBO();

    setup().then(() => {
        setupTextures();
        setupUI();
        requestAnimationFrame(render);
    });
}

function initQuad() {
    //Vertex array object for quad
    const quadVAO = gl.createVertexArray();
    gl.bindVertexArray(quadVAO);

    const quadVBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    const quadPositionLoc = gl.getAttribLocation(quadProgram, "aPosition");
    gl.vertexAttribPointer(quadPositionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(quadPositionLoc);

    const quadTCBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadTCBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadTexCoords, gl.STATIC_DRAW);
    const quadTexCoordLoc = gl.getAttribLocation(quadProgram, "aTexCoord");
    gl.vertexAttribPointer(quadTexCoordLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(quadTexCoordLoc);

    gl.bindVertexArray(null);
    quadProgram.vao = quadVAO;
}

function initScene() {
    //make vao for cube
    cubeBuffers.vao = gl.createVertexArray();
    gl.bindVertexArray(cubeBuffers.vao);


    //bind position buffers
    cubeBuffers.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffers.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(cubeVertices), gl.STATIC_DRAW);
    const positionLoc = gl.getAttribLocation(sceneProgram, "aPosition");
    gl.vertexAttribPointer(positionLoc, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionLoc);


    //bind cube normal buffers
    cubeBuffers.normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffers.normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(cubeNormals), gl.STATIC_DRAW);
    const normalLoc = gl.getAttribLocation(sceneProgram, "aNormal");
    gl.vertexAttribPointer(normalLoc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(normalLoc);

    //bind cube texture buffers
    cubeBuffers.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffers.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(cubeTexCoords), gl.STATIC_DRAW);
    const texCoordLoc = gl.getAttribLocation(sceneProgram, "aTexCoord");
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(texCoordLoc);

    //bind cube index buffers
    cubeBuffers.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeBuffers.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndices), gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    //bind cube texture
    cubeBuffers.texture = gl.createTexture();
    const image = new Image();
    image.src = "brickwalltexture.png";

    //if image works config it
    image.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, cubeBuffers.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    };
    //error
    image.onerror = function() {
        console.error("Failed to load texture image.");
    };
}
//use frame buffer object
function initFBO() {
    fboTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, fboTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height,
                  0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, fboTexture, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function setupTextures() {
    //set up text
    videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 800, 600, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function setupUI() {
    const thresholdSlider = document.getElementById("thresholdSlider");
    const redSlider = document.getElementById("redSlider");
    const greenSlider = document.getElementById("greenSlider");
    const blueSlider = document.getElementById("blueSlider");

    chromaKeyLoc = gl.getUniformLocation(quadProgram, "chromaKey");
    thresholdLoc = gl.getUniformLocation(quadProgram, "threshold");
    //update the key
    function updateChromaKey() {
        const r = parseFloat(redSlider.value);
        const g = parseFloat(greenSlider.value);
        const b = parseFloat(blueSlider.value);
        gl.useProgram(quadProgram);
        gl.uniform3fv(chromaKeyLoc, [r, g, b]);
    }
    //update threshold val
    function updateThreshold() {
        const t = parseFloat(thresholdSlider.value);
        gl.useProgram(quadProgram);
        gl.uniform1f(thresholdLoc, t);
    }
    //on any slider input change update
    redSlider.oninput = updateChromaKey;
    greenSlider.oninput = updateChromaKey;
    blueSlider.oninput = updateChromaKey;
    thresholdSlider.oninput = updateThreshold;
    //update the slider vals
    updateChromaKey();
    updateThreshold();
}

//import normal mat cause it didnt work
function normalMatrix(m, flag){
    if(m.type!='mat4') throw "normalMatrix: input not a mat4";
    var a = inverse(transpose(m));
    if(arguments.length == 1 && flag == false) return a;
    var b = mat3();
    for(var i=0;i<3;i++) 
        for(var j=0; j<3; j++) 
            b[i][j] = a[i][j];
    return b;
}

function render() {
    //bind frime buffer with the fbo
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(sceneProgram);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.5, 0.7, 0.9, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    //calculate normal mat
    const projectionMatrix = perspective(45, canvas.width / canvas.height, 0.1, 100.0);
    const modelViewMatrix = mult(translate(0.0, 0.0, -6.0), rotateY(angle));
    const nMatrix = normalMatrix(modelViewMatrix, true);

    gl.uniformMatrix4fv(gl.getUniformLocation(sceneProgram, "uProjectionMatrix"), false, flatten(projectionMatrix));
    gl.uniformMatrix4fv(gl.getUniformLocation(sceneProgram, "uModelViewMatrix"), false, flatten(modelViewMatrix));
    gl.uniformMatrix3fv(gl.getUniformLocation(sceneProgram, "uNormalMatrix"), false, flatten(nMatrix));


    //using ambient lighting
    gl.uniform3fv(gl.getUniformLocation(sceneProgram, "uLightDirection"), normalize(vec3(0.0, 0.0, 1.0)));
    gl.uniform4fv(gl.getUniformLocation(sceneProgram, "uAmbientLight"), vec4(0.3, 0.3, 0.3, 1.0));


    gl.bindVertexArray(cubeBuffers.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cubeBuffers.texture);
    gl.uniform1i(gl.getUniformLocation(sceneProgram, "uSampler"), 0);
    //draw cubes
    gl.drawElements(gl.TRIANGLES, cubeIndices.length, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);

    //bind the frame buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(quadProgram);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    //if there is a video bind it 
    if (video && video.readyState >= video.HAVE_CURRENT_DATA) {
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }
    //webcam texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.uniform1i(gl.getUniformLocation(quadProgram, "texturevid"), 0);
    //background texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboTexture);
    gl.uniform1i(gl.getUniformLocation(quadProgram, "background"), 1);
    //use cube texture
    gl.bindVertexArray(quadProgram.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    //rotate the cube
    angle += 1.0;
    if (angle > 360.0){
        angle -= 360.0;
    }
    requestAnimationFrame(render);
}
//cub verts
const cubeVertices = [
    vec4(-1.0, -1.0,  1.0, 1.0),
    vec4( 1.0, -1.0,  1.0, 1.0),
    vec4( 1.0,  1.0,  1.0, 1.0),
    vec4(-1.0,  1.0,  1.0, 1.0),
    vec4(-1.0, -1.0, -1.0, 1.0),
    vec4(-1.0,  1.0, -1.0, 1.0),
    vec4( 1.0,  1.0, -1.0, 1.0),
    vec4( 1.0, -1.0, -1.0, 1.0),
    vec4(-1.0,  1.0, -1.0, 1.0),
    vec4(-1.0,  1.0,  1.0, 1.0),
    vec4( 1.0,  1.0,  1.0, 1.0),
    vec4( 1.0,  1.0, -1.0, 1.0),
    vec4(-1.0, -1.0, -1.0, 1.0),
    vec4( 1.0, -1.0, -1.0, 1.0),
    vec4( 1.0, -1.0,  1.0, 1.0),
    vec4(-1.0, -1.0,  1.0, 1.0),
    vec4( 1.0, -1.0, -1.0, 1.0),
    vec4( 1.0,  1.0, -1.0, 1.0),
    vec4( 1.0,  1.0,  1.0, 1.0),
    vec4( 1.0, -1.0,  1.0, 1.0),
    vec4(-1.0, -1.0, -1.0, 1.0),
    vec4(-1.0, -1.0,  1.0, 1.0),
    vec4(-1.0,  1.0,  1.0, 1.0),
    vec4(-1.0,  1.0, -1.0, 1.0)
];
//pre calculated cube normals
const cubeNormals = [
    vec3(0.0, 0.0, 1.0),
    vec3(0.0, 0.0, 1.0),
    vec3(0.0, 0.0, 1.0),
    vec3(0.0, 0.0, 1.0),
    vec3(0.0, 0.0, -1.0),
    vec3(0.0, 0.0, -1.0),
    vec3(0.0, 0.0, -1.0),
    vec3(0.0, 0.0, -1.0),
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, 1.0, 0.0),
    vec3(0.0, -1.0, 0.0),
    vec3(0.0, -1.0, 0.0),
    vec3(0.0, -1.0, 0.0),
    vec3(0.0, -1.0, 0.0),
    vec3(1.0, 0.0, 0.0),
    vec3(1.0, 0.0, 0.0),
    vec3(1.0, 0.0, 0.0),
    vec3(1.0, 0.0, 0.0),
    vec3(-1.0, 0.0, 0.0),
    vec3(-1.0, 0.0, 0.0),
    vec3(-1.0, 0.0, 0.0),
    vec3(-1.0, 0.0, 0.0)
];
//text coords for the cube
const cubeTexCoords = [
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0),
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
    vec2(1.0, 1.0),
    vec2(0.0, 1.0)
];
//indices for cube
const cubeIndices = [
    0, 1, 2,    0, 2, 3,      
    4, 5, 6,    4, 6, 7,       
    8, 9, 10,   8, 10, 11,     
    12, 13, 14,  12, 14, 15,    
    16, 17, 18,  16, 18, 19,    
    20, 21, 22,  20, 22, 23     
];

