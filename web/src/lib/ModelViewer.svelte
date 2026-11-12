<!-- web/src/lib/ModelViewer.svelte -->

<script lang="ts">
  // Orbitable preview of a .glb or .gltf. Loaded lazily by Preview.svelte so
  // three.js only downloads on model pages.

  import { onMount } from "svelte";
  import * as THREE from "three";
  import { DRACO_GLTF_CONFIG, DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
  import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

  let { src, name }: { src: string; name: string } = $props();

  let host: HTMLDivElement;
  let status = $state("Loading model…");
  let failed = $state(false);
  let spinning = $state(true);
  let resetView = () => {};

  onMount(() => {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const environment = new THREE.PMREMGenerator(renderer);
    scene.environment = environment.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 1.5;

    // Stop the idle spin as soon as someone grabs the model
    controls.addEventListener("start", () => {
      spinning = false;
    });

    function resize() {
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    // Point the camera at the model's bounding sphere, whatever its scale
    function frame(object: THREE.Object3D) {
      const sphere = new THREE.Box3()
        .setFromObject(object)
        .getBoundingSphere(new THREE.Sphere());
      const radius = sphere.radius || 1;
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));

      camera.near = distance / 100;
      camera.far = distance * 100;
      camera.position
        .copy(sphere.center)
        .add(new THREE.Vector3(0.6, 0.4, 1).normalize().multiplyScalar(distance));
      camera.updateProjectionMatrix();

      controls.target.copy(sphere.center);
      controls.update();
    }

    let mixer: THREE.AnimationMixer | undefined;
    // The glTF-only decoder that ships with three; Vite bundles it into /_app/
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_GLTF_CONFIG);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setDRACOLoader(draco);

    loader.load(
      src,
      (gltf) => {
        scene.add(gltf.scene);
        resetView = () => frame(gltf.scene);
        resetView();

        // Play the first animation, if the file has any
        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          mixer.clipAction(gltf.animations[0]).play();
        }
        status = "";
      },
      (progress) => {
        if (progress.total > 0) {
          status = `Loading model… ${Math.round((progress.loaded / progress.total) * 100)}%`;
        }
      },
      (error) => {
        console.error(error);
        failed = true;
        status = "Couldn't load this model. Download it instead.";
      },
    );

    // Pauses while the tab is hidden, so animations don't jump on return
    const timer = new THREE.Timer();
    timer.connect(document);

    renderer.setAnimationLoop((timestamp) => {
      timer.update(timestamp);
      controls.autoRotate = spinning;
      controls.update();
      mixer?.update(timer.getDelta());
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      timer.dispose();
      observer.disconnect();
      controls.dispose();
      draco.dispose();
      environment.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  });
</script>

<div class="model" bind:this={host} role="img" aria-label={`3D model: ${name}`}>
  {#if status}
    <p class="empty model-status">{status}</p>
  {/if}
  {#if !failed}
    <div class="model-tools">
      <button class="btn" type="button" onclick={() => (spinning = !spinning)}>
        {spinning ? "Stop spin" : "Spin"}
      </button>
      <button class="btn" type="button" onclick={() => resetView()}>Reset view</button>
    </div>
  {/if}
</div>
