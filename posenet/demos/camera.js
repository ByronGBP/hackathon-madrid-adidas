/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licnses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
import dat from 'dat.gui';
import Stats from 'stats.js';
import * as posenet from '../src';

import {drawKeypoints, drawSkeleton} from './demo_util';
const maxVideoSize = 500;
const canvasSize = 600;
const stats = new Stats();

async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(({kind}) => kind === 'videoinput');
}

let currentStream = null;
let stopCamera = false;

function stopCurrentVideoStream() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => {
      track.stop();
    });
  }
}


function loadVideo(cameraId) {
  return new Promise((resolve, reject) => {
    stopCurrentVideoStream();

    const video = document.getElementById('video');

    video.width = maxVideoSize;
    video.height = maxVideoSize;

    if (navigator.getUserMedia) {
      navigator.getUserMedia({
        video: {
          width: maxVideoSize,
          height: maxVideoSize,
          deviceId: {exact: cameraId},
        },
      }, handleVideo, videoError);
    }

    function handleVideo(stream) {
      currentStream = stream;
      video.srcObject = stream;

      resolve(video);
    }

    function videoError(e) {
      // do something
      reject(e);
    }
  });
}

const guiState = {
  algorithm: 'single-pose',
  input: {
    mobileNetArchitecture: '1.01',
    outputStride: 16,
    imageScaleFactor: 0.5,
  },
  singlePoseDetection: {
    minPoseConfidence: 0.1,
    minPartConfidence: 0.5,
  },
  multiPoseDetection: {
    maxPoseDetections: 2,
    minPoseConfidence: 0.1,
    minPartConfidence: 0.3,
    nmsRadius: 20.0,
  },
  output: {
    showVideo: true,
    showSkeleton: true,
    showPoints: true,
  },
  net: null,
};

function setupGui(cameras, net) {

  guiState.net = net;

  if (stopCamera) {
  currentStream = true
  stopCurrentVideoStream()
  console.log('Cameraaaaa stoped')
}


  if (cameras.length > 0) {
    guiState.camera = cameras[0].deviceId;
  }

  const cameraOptions = cameras.reduce((result, {label, deviceId}) => {
    result[label] = deviceId;
    return result;
  }, {});

  const gui = new dat.GUI({width: 300});

  gui.add(guiState, 'camera', cameraOptions).onChange((deviceId) => {
    loadVideo(deviceId);
  });
  const algorithmController = gui.add(
    guiState, 'algorithm', ['single-pose', 'multi-pose'] );

  let input = gui.addFolder('Input');
  const architectureController =
    input.add(guiState.input, 'mobileNetArchitecture', ['1.01', '1.00', '0.75', '0.50']);
  input.add(guiState.input, 'outputStride', [8, 16, 32]);
  input.add(guiState.input, 'imageScaleFactor').min(0.2).max(1.0);
  input.open();

  let single = gui.addFolder('Single Pose Detection');
  single.add(guiState.singlePoseDetection, 'minPoseConfidence', 0.0, 1.0);
  single.add(guiState.singlePoseDetection, 'minPartConfidence', 0.0, 1.0);
  single.open();

  let multi = gui.addFolder('Multi Pose Detection');
  multi.add(
    guiState.multiPoseDetection, 'maxPoseDetections').min(1).max(20).step(1);
  multi.add(guiState.multiPoseDetection, 'minPoseConfidence', 0.0, 1.0);
  multi.add(guiState.multiPoseDetection, 'minPartConfidence', 0.0, 1.0);
  multi.add(guiState.multiPoseDetection, 'nmsRadius').min(0.0).max(40.0);

  let output = gui.addFolder('Output');
  output.add(guiState.output, 'showVideo');
  output.add(guiState.output, 'showSkeleton');
  output.add(guiState.output, 'showPoints');
  output.open();


  architectureController.onChange(function(architecture) {
    guiState.changeToArchitecture = architecture;
  });

  algorithmController.onChange(function(value) {
    switch (guiState.algorithm) {
    case 'single-pose':
      multi.close();
      single.open();
      break;
    case 'multi-pose':
      single.close();
      multi.open();
      break;
    }
  });
}

function setupFPS() {
  stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
  document.body.appendChild(stats.dom);
}

let data = []
let movement = {};
let previousValue = 0;
let initMovement = false;
let startWatching = false;

function detectPoseInRealTime(video, net) {
  const canvas = document.getElementById('output');
  const ctx = canvas.getContext('2d');
  const flipHorizontal = true;

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  async function poseDetectionFrame() {
    if (guiState.changeToArchitecture) {
      guiState.net.dispose();

      guiState.net = await posenet.load(Number(guiState.changeToArchitecture));

      guiState.changeToArchitecture = null;
    }

    stats.begin();

    const imageScaleFactor = guiState.input.imageScaleFactor;
    const outputStride = Number(guiState.input.outputStride);
    let indexValue = 0
    let poses = [];
    let minPoseConfidence;
    let minPartConfidence;
    switch (guiState.algorithm) {
    case 'single-pose':
      const pose = await guiState.net.estimateSinglePose(video, imageScaleFactor, flipHorizontal, outputStride);
      poses.push(pose);

      minPoseConfidence = Number(
        guiState.singlePoseDetection.minPoseConfidence);
      minPartConfidence = Number(
        guiState.singlePoseDetection.minPartConfidence);
      break;
    case 'multi-pose':
      poses = await guiState.net.estimateMultiplePoses(video, imageScaleFactor, flipHorizontal, outputStride,
        guiState.multiPoseDetection.maxPoseDetections,
        guiState.multiPoseDetection.minPartConfidence,
        guiState.multiPoseDetection.nmsRadius);

      minPoseConfidence = Number(guiState.multiPoseDetection.minPoseConfidence);
      minPartConfidence = Number(guiState.multiPoseDetection.minPartConfidence);
      break;
    }

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    if (guiState.output.showVideo) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvasSize*-1, canvasSize);
      ctx.restore();
    }

    const scale = canvasSize / video.width;

    const div = document.getElementById('test')
    let currentValue = Math.floor(poses[0].keypoints[9].position.y)
    // let values = []
    

    poses.forEach(({score, keypoints}, i) => {
      console.log('index   ',i)
      const chosenPart = 9
      currentValue = poses[indexValue].keypoints[chosenPart].position.y;
      

      if (score >= minPoseConfidence) {
        if (guiState.output.showPoints) {
          drawKeypoints(keypoints, minPartConfidence, ctx, scale);

          //Debugging
          
          div.innerText =` ${keypoints[chosenPart].part}
          X = ${(keypoints[chosenPart].position.x).toFixed(2)}
          Y = ${(keypoints[chosenPart].position.y).toFixed(2)}
          ${keypoints[chosenPart].score}
          `
          div.style.fontSize = '35px'
          div.style.fontWeight = 'bold'
          keypoints[chosenPart].score > 0.5 ? div.style.color = 'red' : div.style.color = 'black'

          //algorithm
          let startPoint = 250
          

          if (keypoints[chosenPart].position.x > startPoint + 100 && keypoints[chosenPart].score > 0.5) { startWatching = true}

          
          


          if (startWatching) {
            // console.log('indexValue is ',indexValue)
            // console.log('Previous ', previousValue )
            // console.log('Current Real', currentValue)
            // console.log('Current ', currentValue)
            if(currentValue > previousValue ) {
              initMovement = true
              if(initMovement) {
                div.style.color = 'green'
                console.log('STARTING MOVEMENT')
                movement.timestamp = Date.now()
                movement.track = keypoints[chosenPart].position
                data.push(movement)
              }
            }
            if (keypoints[chosenPart].position.x < startPoint) {
              if(currentValue > previousValue ) {
                console.log('ENDING MOVEMENT')
                div.style.color = 'yellow'
                initMovement = false
                startWatching = false
                stopCamera = true
                movement.end = true
                data.push(movement)

                document.getElementById('output').remove()
                document.getElementById('video').remove()
              }                          
            }          
          }

          indexValue = indexValue + 1
          previousValue = poses[indexValue - 1].keypoints[chosenPart].position.y;
        }
        if (guiState.output.showSkeleton) {
          drawSkeleton(keypoints, minPartConfidence, ctx, scale);
        }
      }
    });
    for (const object of data){
      if (object.end) {
        console.log(object)
      }
    }
    

    
    stats.end();

    requestAnimationFrame(poseDetectionFrame);
  }

  poseDetectionFrame();
}


export async function bindPage() {
  const net = await posenet.load();

  document.getElementById('loading').style.display = 'none';
  document.getElementById('main').style.display = 'block';

  const cameras = await getCameras();

  if (cameras.length === 0) {
    alert('No webcams available.  Reload the page when a webcam is available.');
    return;
  }

  const video = await loadVideo(cameras[0].deviceId);

  setupGui(cameras, net);
  setupFPS();
  detectPoseInRealTime(video, net);
}

navigator.getUserMedia = navigator.getUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.mozGetUserMedia;
bindPage();
