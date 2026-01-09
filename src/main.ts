import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Minimal aliases to avoid pulling full WebXR TypeScript types
type XRHitTestSource = any;
type XRFrame = any;

// Core globals for this simple setup
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let renderer: THREE.WebGLRenderer;
let controller: THREE.Group;

let reticle: THREE.Mesh;
let hitTestSource: XRHitTestSource | null = null;
let hitTestSourceRequested = false;

let engineModel: THREE.Object3D | null = null;
let isPlaced = false;

const MODEL_URL = '3d_printable_radial_pneumatic_engine.glb';

function setupScene() {
  const container = document.createElement('div');
  container.id = 'three-container';
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  hemiLight.position.set(0.5, 1, 0.25);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 5, 5);
  scene.add(dirLight);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);
}

async function startARSession() {
  const uiOverlay = document.getElementById('ui-overlay') as HTMLElement | null;

  if (!(navigator as any).xr) {
    console.warn('WebXR not available on this browser.');
    if (uiOverlay) {
      uiOverlay.innerHTML =
        '<p id="instruction"><b>WebXR AR not supported.</b><br/>Open on a compatible mobile browser (Chrome on Android) to use AR.</p>';
    }
    return;
  }

  try {
    const xr = (navigator as any).xr;

    // Optional: check support first
    if (xr.isSessionSupported) {
      const supported = await xr.isSessionSupported('immersive-ar');
      if (!supported) {
        console.warn('immersive-ar session not supported.');
        if (uiOverlay) {
          uiOverlay.innerHTML =
            '<p id="instruction"><b>AR not supported.</b><br/>This device/browser does not support immersive AR.</p>';
        }
        return;
      }
    }

    const sessionInit: XRSessionInit = {
      requiredFeatures: ['hit-test', 'local-floor'],
    } as any;

    const session: any = await xr.requestSession('immersive-ar', sessionInit);

    // Let three.js manage the reference space as 'local-floor'
    (renderer.xr as any).setReferenceSpaceType('local-floor');
    renderer.xr.setSession(session);

    // Reset hit-test for this session
    hitTestSource = null;
    hitTestSourceRequested = false;

    console.log('AR session started');
  } catch (err) {
    console.error('Failed to start AR session', err);
    if (uiOverlay) {
      uiOverlay.innerHTML =
        '<p id="instruction"><b>Failed to start AR.</b><br/>See console for details.</p>';
    }
  }
}

// We no longer rely on a manual button; AR starts automatically on load.
// This helper is kept in case we later want a manual trigger again.
function setupStartButton() {
  const startButton = document.getElementById('enter-ar');
  if (startButton) {
    startButton.style.display = 'none';
  }
}

function loadEngineModel() {
  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf: GLTF) => {
      engineModel = gltf.scene;
      engineModel.scale.set(0.2, 0.2, 0.2);
      engineModel.visible = false;
      scene.add(engineModel);
      console.log('Engine model loaded');
    },
    undefined,
    (error: unknown) => {
      console.error('Error loading engine model', error);
      const instructionEl = document.getElementById('instruction');
      if (instructionEl) {
        instructionEl.innerHTML =
          '<b>Error:</b> Could not load engine model. Check console for details.';
      }
    }
  );
}

function setupReticleAndController() {
  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.12, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);
}

function setupResizeHandling() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function setupTouchRotation() {
  let startX: number | null = null;

  window.addEventListener('touchstart', (e: TouchEvent) => {
    if (!isPlaced || e.touches.length !== 1) return;
    startX = e.touches[0].pageX;
  });

  window.addEventListener('touchmove', (e: TouchEvent) => {
    if (!isPlaced || !engineModel || e.touches.length !== 1 || startX === null) return;
    const deltaX = e.touches[0].pageX - startX;
    engineModel.rotation.y += deltaX * 0.01;
    startX = e.touches[0].pageX;
  });

  window.addEventListener('touchend', () => {
    startX = null;
  });
}

function onSelect() {
  if (!reticle.visible || !engineModel) return;

  engineModel.position.setFromMatrixPosition(reticle.matrix);
  engineModel.visible = true;
  isPlaced = true;

  const instructionEl = document.getElementById('instruction');
  if (instructionEl) {
    instructionEl.innerHTML =
      '<b>Step 1 Complete:</b> Engine placed. Drag your finger horizontally to rotate it.';
  }
}

function render(_timestamp: number, frame?: XRFrame) {
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (session && !hitTestSourceRequested) {
      (session as any)
        .requestReferenceSpace('viewer')
        .then((refSpace: any) => {
          return (session as any).requestHitTestSource({ space: refSpace });
        })
        .then((source: XRHitTestSource) => {
          hitTestSource = source;
          console.log('Hit test source created');
        })
        .catch((err: unknown) => {
          console.error('Hit test source error', err);
        });

      hitTestSourceRequested = true;
    }

    if (hitTestSource && referenceSpace) {
      const hitTestResults = (frame as any).getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix as unknown as number[]);
        }
      } else {
        reticle.visible = false;
      }
    }
  }

  renderer.render(scene, camera);
}

function start() {
  setupScene();
  setupStartButton();
  loadEngineModel();
  setupReticleAndController();
  setupResizeHandling();
  setupTouchRotation();

  // Start AR session immediately on load
  startARSession();

  renderer.setAnimationLoop(render);
}

start();
