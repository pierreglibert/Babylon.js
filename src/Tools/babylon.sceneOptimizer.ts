module BABYLON {
    // Standard optimizations
    export class SceneOptimization {
        public apply = (scene: Scene): boolean => {
            return true; // Return true if everything that can be done was applied
        };

        constructor(public priority: number = 0) {
        }
    }

    export class TextureOptimization extends SceneOptimization {
        constructor(public priority: number = 0, public maximumSize: number = 1024) {
            super(priority);
        }

        public apply = (scene: Scene): boolean => {

            var allDone = true;
            for (var index = 0; index < scene.textures.length; index++) {
                var texture = scene.textures[index];

                if (!texture.canRescale || (<any>texture).getContext) {
                    continue;
                }

                var currentSize = texture.getSize();
                var maxDimension = Math.max(currentSize.width, currentSize.height);

                if (maxDimension > this.maximumSize) {
                    texture.scale(0.5);
                    allDone = false;
                }
            }

            return allDone;
        }
    }

    export class HardwareScalingOptimization extends SceneOptimization {
        private _currentScale = 1;

        constructor(public priority: number = 0, public maximumScale: number = 2) {
            super(priority);
        }

        public apply = (scene: Scene): boolean => {
            this._currentScale++;

            scene.getEngine().setHardwareScalingLevel(this._currentScale);

            return this._currentScale >= this.maximumScale;
        };
    }

    export class ShadowsOptimization extends SceneOptimization {
        public apply = (scene: Scene): boolean => {
            scene.shadowsEnabled = false;
            return true;
        };
    }

    export class PostProcessesOptimization extends SceneOptimization {
        public apply = (scene: Scene): boolean => {
            scene.postProcessesEnabled = false;
            return true;
        };
    }

    export class LensFlaresOptimization extends SceneOptimization {
        public apply = (scene: Scene): boolean => {
            scene.lensFlaresEnabled = false;
            return true;
        };
    }

    export class ParticlesOptimization extends SceneOptimization {
        public apply = (scene: Scene): boolean => {
            scene.particlesEnabled = false;
            return true;
        };
    }

    export class RenderTargetsOptimization extends SceneOptimization {
        public apply = (scene: Scene): boolean => {
            scene.renderTargetsEnabled = false;
            return true;
        };
    }

    export class MergeMeshesOptimization extends SceneOptimization {
        static _UpdateSelectionTree = false;

        public static get UpdateSelectionTree(): boolean {
            return MergeMeshesOptimization._UpdateSelectionTree;
        }

        public static set UpdateSelectionTree(value: boolean) {
            MergeMeshesOptimization._UpdateSelectionTree = value;
        }

        private _canBeMerged = (abstractMesh: AbstractMesh): boolean => {
            if (!(abstractMesh instanceof Mesh)) {
                return false;
            }

            var mesh = <Mesh>abstractMesh;

            if (!mesh.isVisible || !mesh.isEnabled()) {
                return false;
            }

            if (mesh.instances.length > 0) {
                return false;
            }

            if (mesh.skeleton || mesh.hasLODLevels) {
                return false;
            }

            if (mesh.parent) {
                return false;
            }

            return true;
        }

        public apply = (scene: Scene, updateSelectionTree?: boolean): boolean => {

            var globalPool = scene.meshes.slice(0);
            var globalLength = globalPool.length;

            for (var index = 0; index < globalLength; index++) {
                var currentPool = new Array<Mesh>();
                var current = globalPool[index];

                // Checks
                if (!this._canBeMerged(current)) {
                    continue;
                }

                currentPool.push(<Mesh>current);

                // Find compatible meshes
                for (var subIndex = index + 1; subIndex < globalLength; subIndex++) {
                    var otherMesh = globalPool[subIndex];

                    if (!this._canBeMerged(otherMesh)) {
                        continue;
                    }

                    if (otherMesh.material !== current.material) {
                        continue;
                    }

                    if (otherMesh.checkCollisions !== current.checkCollisions) {
                        continue;
                    }

                    currentPool.push(<Mesh>otherMesh);
                    globalLength--;

                    globalPool.splice(subIndex, 1);

                    subIndex--;
                }

                if (currentPool.length < 2) {
                    continue;
                }

                // Merge meshes
                Mesh.MergeMeshes(currentPool);
            }

            if (updateSelectionTree != undefined) {
                if (updateSelectionTree) {
                    scene.createOrUpdateSelectionOctree();
                }
            }
            else if (MergeMeshesOptimization.UpdateSelectionTree) {
                scene.createOrUpdateSelectionOctree();
            }

            return true;
        };
    }

    // Options
    export class SceneOptimizerOptions {
        public optimizations = new Array<SceneOptimization>();

        constructor(public targetFrameRate: number = 60, public trackerDuration: number = 2000) {
        }

        public static LowDegradationAllowed(targetFrameRate?: number): SceneOptimizerOptions {
            var result = new SceneOptimizerOptions(targetFrameRate);

            var priority = 0;
            result.optimizations.push(new MergeMeshesOptimization(priority));
            result.optimizations.push(new ShadowsOptimization(priority));
            result.optimizations.push(new LensFlaresOptimization(priority));

            // Next priority
            priority++;
            result.optimizations.push(new PostProcessesOptimization(priority));
            result.optimizations.push(new ParticlesOptimization(priority));

            // Next priority
            priority++;
            result.optimizations.push(new TextureOptimization(priority, 1024));

            return result;
        }

        public static ModerateDegradationAllowed(targetFrameRate?: number): SceneOptimizerOptions {
            var result = new SceneOptimizerOptions(targetFrameRate);

            var priority = 0;
            result.optimizations.push(new MergeMeshesOptimization(priority));
            result.optimizations.push(new ShadowsOptimization(priority));
            result.optimizations.push(new LensFlaresOptimization(priority));

            // Next priority
            priority++;
            result.optimizations.push(new PostProcessesOptimization(priority));
            result.optimizations.push(new ParticlesOptimization(priority));

            // Next priority
            priority++;
            result.optimizations.push(new TextureOptimization(priority, 512));

            // Next priority
            priority++;
            result.optimizations.push(new RenderTargetsOptimization(priority));

            // Next priority
            priority++;
            result.optimizations.push(new HardwareScalingOptimization(priority, 2));

            return result;
        }

        public static HighDegradationAllowed(targetFrameRate?: number): SceneOptimizerOptions {
            var result = new SceneOptimizerOptions(targetFrameRate);

            var priority = 0;
            result.optimizations.push(new MergeMeshesOptimization(priority));
            result.optimizations.push(new ShadowsOptimization(priority));
            result.optimizations.push(new LensFlaresOptimization(priority));

            // Next priority
            priority++;
            result.optimizations.push(new PostProcessesOptimization(priority));
            result.optimizations.push(new ParticlesOptimization(priority));

            // Next priority
            priority++;
            result.optimizations.push(new TextureOptimization(priority, 256));

            // Next priority
            priority++;
            result.optimizations.push(new RenderTargetsOptimization(priority));

            // Next priority
            priority++;
            result.optimizations.push(new HardwareScalingOptimization(priority, 4));

            return result;
        }
    }


    // Scene optimizer tool
    export class SceneOptimizer {

        static _CheckCurrentState(scene: Scene, options: SceneOptimizerOptions, currentPriorityLevel: number, onSuccess?: () => void, onFailure?: () => void) {
            // TODO: add an epsilon
            if (scene.getEngine().getFps() >= options.targetFrameRate) {
                if (onSuccess) {
                    onSuccess();
                }

                return;
            }

            // Apply current level of optimizations
            var allDone = true;
            var noOptimizationApplied = true;
            for (var index = 0; index < options.optimizations.length; index++) {
                var optimization = options.optimizations[index];

                if (optimization.priority === currentPriorityLevel) {
                    noOptimizationApplied = false;
                    allDone = allDone && optimization.apply(scene);
                }
            }

            // If no optimization was applied, this is a failure :(
            if (noOptimizationApplied) {
                if (onFailure) {
                    onFailure();
                }

                return;
            }

            // If all optimizations were done, move to next level
            if (allDone) {
                currentPriorityLevel++;
            }

            // Let's the system running for a specific amount of time before checking FPS
            scene.executeWhenReady(() => {
                setTimeout(() => {
                    SceneOptimizer._CheckCurrentState(scene, options, currentPriorityLevel, onSuccess, onFailure);
                }, options.trackerDuration);
            });
        }

        public static OptimizeAsync(scene: Scene, options?: SceneOptimizerOptions, onSuccess?: () => void, onFailure?: () => void): void {
            if (!options) {
                options = SceneOptimizerOptions.ModerateDegradationAllowed();
            }

            // Let's the system running for a specific amount of time before checking FPS
            scene.executeWhenReady(() => {
                setTimeout(() => {
                    SceneOptimizer._CheckCurrentState(scene, options, 0, onSuccess, onFailure);
                }, options.trackerDuration);
            });
        }
    }



    /**
     * ***********************************
     * New proposition for scene optimizer
     * ***********************************
     */



    // class to controle optimizations
    export class renderGradingSceneOptimizer {

      // grade : preset options to optimize scene (ex : low, medium, hight)
      public grades: Array<any> = new Array();

      // to know on wich grade we are.
      private _currentGrade: number = 0;

      // to know the step of evaluation :
      // 1. try to upgrading.
      // 2. if fps not reached, dowgrading.
      private _currentGradingStep: string = "upGrading";

      // result of all fps evaluation to set a level of hardware performance
      private _hardwareEval: number = 0;

      /**
       * @param scene : BABYLON.Scene
       * @param frameToReach : fps to reach
       * @param trackerDuration : duration between two fps evaluation
       * @param starterGrade : on wich grade renderGradingSceneOptimizer need to start.
       * @param autoRunDelay : run automaticaly fps evaluation every 'x' ms. 0 mean desactived
       */
      constructor (scene : Scene, public frameToReach: number = 59, public trackerDuration: number = 1000, private starterGrade: string, private autoRunDelay: number = 0) {

        // update scene with starterGrade before render
        scene.registerBeforeRender(() => {
          this.updateSceneByGrade(starterGrade);
        });
      }

      // add a new grade to renderGradingSceneOptimizer
      public addGrade(newGrade: grade) {
        this.grades.push(newGrade);
      }

      // start to evaluate fps and update scene if necessary
      public run(scene : Scene) {

      }

      // update scene by render grade name
      public updateSceneByGrade(gradeName : string) {

      }

      // force downgrade by 1
      public downgrade() {

      }

      // force upgrade by 1
      public upgrade() {

      }

      // get hardware evaluation
      public getHardwareEvaluation(scene: Scene) {

        // get fps
        var fps = scene.getEngine().getFps();

        if (fps <= this.frameToReach) {

        }
      }

    }



    // class to customize grade
    export class grade {

      // asset we need for dynamic loading by grade and distance if AssetGeolocalisation is enabled in gradingAsset class
      public gradingAssets: Array<gradingAsset> = new Array();

      // priority of grade
      private _priority: number;


      /**
       * @param name : name of grade
       * @param upGradingTask : task to do when this grade is enabled
       * @param downGradingTask : task to do when this grade is desabled
       * @param activeDynamicAssetsLoad : active dynamic loading
       */
      constructor (public name: string, public upGradingTask: Function, public downGradingTask: Function, public activeDynamicGradingAssetsLoad: boolean = false) {

      }

      // add entire scene asset we need to show in scene for this grade
      public addSceneGradingAsset(sceneGradingAsset: sceneGradingAsset) {
        this.gradingAssets.push(sceneGradingAsset);
      }

      // add mesh grading asset we need to show in scene for this grade
      public addMeshGradingAsset(meshGradingAsset: meshGradingAsset) {
        this.gradingAssets.push(meshGradingAsset);
      }

      // export & split original file, by gradingAsset, in separate file ( usefull to generate file on node server )
      public splitAsset(sceneAndMeshExtention: 'babylon' | 'gltf', textureExtention : 'webFormat' | 'GPUFormat', zipCompression? : boolean) {

      }

      // add asset to scene
      private _upgradeAsset() {

      }

      // remove asset to scene
      private _downgradeAsset() {

      }
    }



    // exemple of mesh asset to load by grade and distance
    export class meshGradingAsset {

      // list of LOD meshes
      public LODMeshes: Array<any>;

      // list of LOD textures
      public LODTextures: Array<any>;

      // list of LOD animation > exemple : load light version with 12key/s then add all other key to make a 60key/s animation.
      public LODAnimation: Array<any>;


      /**
       * @param name : name of asset
       * @param url : link
       * @param onloading : on loading callback
       * @param onloaded : on loaded callback
       * @param bundingBox : if dynamic load is actived on grade class, load this asset when BoundingBox is in frustrum of the camera.
       *                     ps : not calculate on distance between center of two object because it's not the good way for big object. That's why we need a virtual box (BoundingBox)
       * @param meshAssetGeolocalisation : list of all copy of this asset/
       */
      constructor (public name: string, public url: string, onloading: Function, onloaded: Function, public bundingBox?: BoundingBox, public meshAssetGeolocalisation?: Array<duplicatedAssetGeolocalisation>) {
      }

      // add LOD animation
      addLODAnimationAsset(url: string, extention: 'babylon' | 'gltf', distance: number, zipCompression? : boolean) {

      }

      // add LOD mesh version
      addLODMesh(url: string, extention: 'babylon' | 'gltf', distance: number, zipCompression? : boolean) {

      }

      // add LOD texture version
      addLODTextureAsset(url: string, extention: 'webFormat' | 'GPUFormat', distance: number, zipCompression? : boolean) {

      }
    }



    // duplicate and place mesh or scene asset and apply transform.
    export class duplicatedAssetGeolocalisation {

      /**
       * @param copyType : create an instance or clone
       */
      constructor (public copyType : 'clone' | 'instance', public position: Vector3 = new Vector3(0, 0, 0), public rotation: Vector3 = new Vector3(1, 1, 1), public scale: Vector3 = new Vector3(1, 1, 1)) {
      }
    }

}
