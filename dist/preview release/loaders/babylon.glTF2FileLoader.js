/// <reference path="../../../dist/preview release/babylon.d.ts"/>
var BABYLON;
(function (BABYLON) {
    var GLTFLoaderCoordinateSystemMode;
    (function (GLTFLoaderCoordinateSystemMode) {
        // Automatically convert the glTF right-handed data to the appropriate system based on the current coordinate system mode of the scene (scene.useRightHandedSystem).
        // NOTE: When scene.useRightHandedSystem is false, an additional transform will be added to the root to transform the data from right-handed to left-handed.
        GLTFLoaderCoordinateSystemMode[GLTFLoaderCoordinateSystemMode["AUTO"] = 0] = "AUTO";
        // The glTF right-handed data is not transformed in any form and is loaded directly.
        GLTFLoaderCoordinateSystemMode[GLTFLoaderCoordinateSystemMode["PASS_THROUGH"] = 1] = "PASS_THROUGH";
        // Sets the useRightHandedSystem flag on the scene.
        GLTFLoaderCoordinateSystemMode[GLTFLoaderCoordinateSystemMode["FORCE_RIGHT_HANDED"] = 2] = "FORCE_RIGHT_HANDED";
    })(GLTFLoaderCoordinateSystemMode = BABYLON.GLTFLoaderCoordinateSystemMode || (BABYLON.GLTFLoaderCoordinateSystemMode = {}));
    var GLTFFileLoader = (function () {
        function GLTFFileLoader() {
            // V2 options
            this.coordinateSystemMode = GLTFLoaderCoordinateSystemMode.AUTO;
            this.name = "gltf";
            this.extensions = {
                ".gltf": { isBinary: false },
                ".glb": { isBinary: true }
            };
        }
        GLTFFileLoader.prototype.importMeshAsync = function (meshesNames, scene, data, rootUrl, onSuccess, onProgress, onError) {
            var loaderData = GLTFFileLoader._parse(data, onError);
            if (!loaderData) {
                return;
            }
            if (this.onParsed) {
                this.onParsed(loaderData);
            }
            var loader = this._getLoader(loaderData, onError);
            if (!loader) {
                return;
            }
            loader.importMeshAsync(meshesNames, scene, loaderData, rootUrl, onSuccess, onProgress, onError);
        };
        GLTFFileLoader.prototype.loadAsync = function (scene, data, rootUrl, onSuccess, onProgress, onError) {
            var loaderData = GLTFFileLoader._parse(data, onError);
            if (!loaderData) {
                return;
            }
            if (this.onParsed) {
                this.onParsed(loaderData);
            }
            var loader = this._getLoader(loaderData, onError);
            if (!loader) {
                return;
            }
            return loader.loadAsync(scene, loaderData, rootUrl, onSuccess, onProgress, onError);
        };
        GLTFFileLoader.prototype.canDirectLoad = function (data) {
            return ((data.indexOf("scene") !== -1) && (data.indexOf("node") !== -1));
        };
        GLTFFileLoader._parse = function (data, onError) {
            try {
                if (data instanceof ArrayBuffer) {
                    return GLTFFileLoader._parseBinary(data, onError);
                }
                return {
                    json: JSON.parse(data),
                    bin: null
                };
            }
            catch (e) {
                onError(e.message);
                return null;
            }
        };
        GLTFFileLoader.prototype._getLoader = function (loaderData, onError) {
            var loaderVersion = { major: 2, minor: 0 };
            var asset = loaderData.json.asset || {};
            var version = GLTFFileLoader._parseVersion(asset.version);
            if (!version) {
                onError("Invalid version: " + asset.version);
                return null;
            }
            if (asset.minVersion !== undefined) {
                var minVersion = GLTFFileLoader._parseVersion(asset.minVersion);
                if (!minVersion) {
                    onError("Invalid minimum version: " + asset.minVersion);
                    return null;
                }
                if (GLTFFileLoader._compareVersion(minVersion, loaderVersion) > 0) {
                    onError("Incompatible minimum version: " + asset.minVersion);
                    return null;
                }
            }
            var createLoaders = {
                1: GLTFFileLoader.CreateGLTFLoaderV1,
                2: GLTFFileLoader.CreateGLTFLoaderV2
            };
            var createLoader = createLoaders[version.major];
            if (!createLoader) {
                onError("Unsupported version: " + asset.version);
                return null;
            }
            return createLoader(this);
        };
        GLTFFileLoader._parseBinary = function (data, onError) {
            var Binary = {
                Magic: 0x46546C67
            };
            var binaryReader = new BinaryReader(data);
            var magic = binaryReader.readUint32();
            if (magic !== Binary.Magic) {
                onError("Unexpected magic: " + magic);
                return null;
            }
            var version = binaryReader.readUint32();
            switch (version) {
                case 1: return GLTFFileLoader._parseV1(binaryReader, onError);
                case 2: return GLTFFileLoader._parseV2(binaryReader, onError);
            }
            onError("Unsupported version: " + version);
            return null;
        };
        GLTFFileLoader._parseV1 = function (binaryReader, onError) {
            var ContentFormat = {
                JSON: 0
            };
            var length = binaryReader.readUint32();
            if (length != binaryReader.getLength()) {
                onError("Length in header does not match actual data length: " + length + " != " + binaryReader.getLength());
                return null;
            }
            var contentLength = binaryReader.readUint32();
            var contentFormat = binaryReader.readUint32();
            var content;
            switch (contentFormat) {
                case ContentFormat.JSON:
                    content = JSON.parse(GLTFFileLoader._decodeBufferToText(binaryReader.readUint8Array(contentLength)));
                    break;
                default:
                    onError("Unexpected content format: " + contentFormat);
                    return null;
            }
            var bytesRemaining = binaryReader.getLength() - binaryReader.getPosition();
            var body = binaryReader.readUint8Array(bytesRemaining);
            return {
                json: content,
                bin: body
            };
        };
        GLTFFileLoader._parseV2 = function (binaryReader, onError) {
            var ChunkFormat = {
                JSON: 0x4E4F534A,
                BIN: 0x004E4942
            };
            var length = binaryReader.readUint32();
            if (length !== binaryReader.getLength()) {
                onError("Length in header does not match actual data length: " + length + " != " + binaryReader.getLength());
                return null;
            }
            // JSON chunk
            var chunkLength = binaryReader.readUint32();
            var chunkFormat = binaryReader.readUint32();
            if (chunkFormat !== ChunkFormat.JSON) {
                onError("First chunk format is not JSON");
                return null;
            }
            var json = JSON.parse(GLTFFileLoader._decodeBufferToText(binaryReader.readUint8Array(chunkLength)));
            // Look for BIN chunk
            var bin = null;
            while (binaryReader.getPosition() < binaryReader.getLength()) {
                chunkLength = binaryReader.readUint32();
                chunkFormat = binaryReader.readUint32();
                switch (chunkFormat) {
                    case ChunkFormat.JSON:
                        onError("Unexpected JSON chunk");
                        return null;
                    case ChunkFormat.BIN:
                        bin = binaryReader.readUint8Array(chunkLength);
                        break;
                    default:
                        // ignore unrecognized chunkFormat
                        binaryReader.skipBytes(chunkLength);
                        break;
                }
            }
            return {
                json: json,
                bin: bin
            };
        };
        GLTFFileLoader._parseVersion = function (version) {
            if (!version) {
                return null;
            }
            var parts = version.split(".");
            if (parts.length != 2) {
                return null;
            }
            var major = +parts[0];
            if (isNaN(major)) {
                return null;
            }
            var minor = +parts[1];
            if (isNaN(minor)) {
                return null;
            }
            return {
                major: major,
                minor: minor
            };
        };
        GLTFFileLoader._compareVersion = function (a, b) {
            if (a.major > b.major)
                return 1;
            if (a.major < b.major)
                return -1;
            if (a.minor > b.minor)
                return 1;
            if (a.minor < b.minor)
                return -1;
            return 0;
        };
        GLTFFileLoader._decodeBufferToText = function (view) {
            var result = "";
            var length = view.byteLength;
            for (var i = 0; i < length; ++i) {
                result += String.fromCharCode(view[i]);
            }
            return result;
        };
        // V1 options
        GLTFFileLoader.HomogeneousCoordinates = false;
        GLTFFileLoader.IncrementalLoading = true;
        return GLTFFileLoader;
    }());
    BABYLON.GLTFFileLoader = GLTFFileLoader;
    var BinaryReader = (function () {
        function BinaryReader(arrayBuffer) {
            this._arrayBuffer = arrayBuffer;
            this._dataView = new DataView(arrayBuffer);
            this._byteOffset = 0;
        }
        BinaryReader.prototype.getPosition = function () {
            return this._byteOffset;
        };
        BinaryReader.prototype.getLength = function () {
            return this._arrayBuffer.byteLength;
        };
        BinaryReader.prototype.readUint32 = function () {
            var value = this._dataView.getUint32(this._byteOffset, true);
            this._byteOffset += 4;
            return value;
        };
        BinaryReader.prototype.readUint8Array = function (length) {
            var value = new Uint8Array(this._arrayBuffer, this._byteOffset, length);
            this._byteOffset += length;
            return value;
        };
        BinaryReader.prototype.skipBytes = function (length) {
            this._byteOffset += length;
        };
        return BinaryReader;
    }());
    if (BABYLON.SceneLoader) {
        BABYLON.SceneLoader.RegisterPlugin(new GLTFFileLoader());
    }
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=babylon.glTFFileLoader.js.map

/// <reference path="../../../../dist/preview release/babylon.d.ts"/>
var BABYLON;
(function (BABYLON) {
    var GLTF2;
    (function (GLTF2) {
        /**
        * Enums
        */
        var EComponentType;
        (function (EComponentType) {
            EComponentType[EComponentType["BYTE"] = 5120] = "BYTE";
            EComponentType[EComponentType["UNSIGNED_BYTE"] = 5121] = "UNSIGNED_BYTE";
            EComponentType[EComponentType["SHORT"] = 5122] = "SHORT";
            EComponentType[EComponentType["UNSIGNED_SHORT"] = 5123] = "UNSIGNED_SHORT";
            EComponentType[EComponentType["UNSIGNED_INT"] = 5125] = "UNSIGNED_INT";
            EComponentType[EComponentType["FLOAT"] = 5126] = "FLOAT";
        })(EComponentType = GLTF2.EComponentType || (GLTF2.EComponentType = {}));
        var EMeshPrimitiveMode;
        (function (EMeshPrimitiveMode) {
            EMeshPrimitiveMode[EMeshPrimitiveMode["POINTS"] = 0] = "POINTS";
            EMeshPrimitiveMode[EMeshPrimitiveMode["LINES"] = 1] = "LINES";
            EMeshPrimitiveMode[EMeshPrimitiveMode["LINE_LOOP"] = 2] = "LINE_LOOP";
            EMeshPrimitiveMode[EMeshPrimitiveMode["LINE_STRIP"] = 3] = "LINE_STRIP";
            EMeshPrimitiveMode[EMeshPrimitiveMode["TRIANGLES"] = 4] = "TRIANGLES";
            EMeshPrimitiveMode[EMeshPrimitiveMode["TRIANGLE_STRIP"] = 5] = "TRIANGLE_STRIP";
            EMeshPrimitiveMode[EMeshPrimitiveMode["TRIANGLE_FAN"] = 6] = "TRIANGLE_FAN";
        })(EMeshPrimitiveMode = GLTF2.EMeshPrimitiveMode || (GLTF2.EMeshPrimitiveMode = {}));
        var ETextureMagFilter;
        (function (ETextureMagFilter) {
            ETextureMagFilter[ETextureMagFilter["NEAREST"] = 9728] = "NEAREST";
            ETextureMagFilter[ETextureMagFilter["LINEAR"] = 9729] = "LINEAR";
        })(ETextureMagFilter = GLTF2.ETextureMagFilter || (GLTF2.ETextureMagFilter = {}));
        var ETextureMinFilter;
        (function (ETextureMinFilter) {
            ETextureMinFilter[ETextureMinFilter["NEAREST"] = 9728] = "NEAREST";
            ETextureMinFilter[ETextureMinFilter["LINEAR"] = 9729] = "LINEAR";
            ETextureMinFilter[ETextureMinFilter["NEAREST_MIPMAP_NEAREST"] = 9984] = "NEAREST_MIPMAP_NEAREST";
            ETextureMinFilter[ETextureMinFilter["LINEAR_MIPMAP_NEAREST"] = 9985] = "LINEAR_MIPMAP_NEAREST";
            ETextureMinFilter[ETextureMinFilter["NEAREST_MIPMAP_LINEAR"] = 9986] = "NEAREST_MIPMAP_LINEAR";
            ETextureMinFilter[ETextureMinFilter["LINEAR_MIPMAP_LINEAR"] = 9987] = "LINEAR_MIPMAP_LINEAR";
        })(ETextureMinFilter = GLTF2.ETextureMinFilter || (GLTF2.ETextureMinFilter = {}));
        var ETextureWrapMode;
        (function (ETextureWrapMode) {
            ETextureWrapMode[ETextureWrapMode["CLAMP_TO_EDGE"] = 33071] = "CLAMP_TO_EDGE";
            ETextureWrapMode[ETextureWrapMode["MIRRORED_REPEAT"] = 33648] = "MIRRORED_REPEAT";
            ETextureWrapMode[ETextureWrapMode["REPEAT"] = 10497] = "REPEAT";
        })(ETextureWrapMode = GLTF2.ETextureWrapMode || (GLTF2.ETextureWrapMode = {}));
    })(GLTF2 = BABYLON.GLTF2 || (BABYLON.GLTF2 = {}));
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=babylon.glTFLoaderInterfaces.js.map

/// <reference path="../../../../dist/preview release/babylon.d.ts"/>
var BABYLON;
(function (BABYLON) {
    var GLTF2;
    (function (GLTF2) {
        var GLTFLoaderTracker = (function () {
            function GLTFLoaderTracker(onComplete) {
                this._pendingCount = 0;
                this._callback = onComplete;
            }
            GLTFLoaderTracker.prototype._addPendingData = function (data) {
                this._pendingCount++;
            };
            GLTFLoaderTracker.prototype._removePendingData = function (data) {
                if (--this._pendingCount === 0) {
                    this._callback();
                }
            };
            return GLTFLoaderTracker;
        }());
        var GLTFLoader = (function () {
            function GLTFLoader(parent) {
                this._renderReady = false;
                this._disposed = false;
                this._renderReadyObservable = new BABYLON.Observable();
                // Count of pending work that needs to complete before the asset is rendered.
                this._renderPendingCount = 0;
                // Count of pending work that needs to complete before the loader is disposed.
                this._loaderPendingCount = 0;
                this._loaderTrackers = new Array();
                this._parent = parent;
            }
            GLTFLoader.RegisterExtension = function (extension) {
                if (GLTFLoader.Extensions[extension.name]) {
                    BABYLON.Tools.Error("Extension with the same name '" + extension.name + "' already exists");
                    return;
                }
                GLTFLoader.Extensions[extension.name] = extension;
                // Keep the order of registration so that extensions registered first are called first.
                GLTF2.GLTFLoaderExtension._Extensions.push(extension);
            };
            GLTFLoader.prototype.dispose = function () {
                if (this._disposed) {
                    return;
                }
                this._disposed = true;
                // Revoke object urls created during load
                if (this._gltf.textures) {
                    this._gltf.textures.forEach(function (texture) {
                        if (texture.url) {
                            URL.revokeObjectURL(texture.url);
                        }
                    });
                }
                this._gltf = undefined;
                this._babylonScene = undefined;
                this._rootUrl = undefined;
                this._defaultMaterial = undefined;
                this._successCallback = undefined;
                this._errorCallback = undefined;
                this._renderReady = false;
                this._renderReadyObservable.clear();
                this._renderPendingCount = 0;
                this._loaderPendingCount = 0;
            };
            GLTFLoader.prototype.importMeshAsync = function (meshesNames, scene, data, rootUrl, onSuccess, onProgress, onError) {
                var _this = this;
                this._loadAsync(meshesNames, scene, data, rootUrl, function () {
                    onSuccess(_this._getMeshes(), null, _this._getSkeletons());
                }, onProgress, onError);
            };
            GLTFLoader.prototype.loadAsync = function (scene, data, rootUrl, onSuccess, onProgress, onError) {
                this._loadAsync(null, scene, data, rootUrl, onSuccess, onProgress, onError);
            };
            GLTFLoader.prototype._loadAsync = function (nodeNames, scene, data, rootUrl, onSuccess, onProgress, onError) {
                var _this = this;
                this._tryCatchOnError(function () {
                    _this._loadData(data);
                    _this._babylonScene = scene;
                    _this._rootUrl = rootUrl;
                    _this._successCallback = onSuccess;
                    _this._progressCallback = onProgress;
                    _this._errorCallback = onError;
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.accessors);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.animations);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.buffers);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.bufferViews);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.images);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.materials);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.meshes);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.nodes);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.scenes);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.skins);
                    GLTF2.GLTFUtils.AssignIndices(_this._gltf.textures);
                    _this._addPendingData(_this);
                    _this._loadDefaultScene(nodeNames);
                    _this._loadAnimations();
                    _this._removePendingData(_this);
                });
            };
            GLTFLoader.prototype._onError = function (message) {
                if (this._disposed) {
                    return;
                }
                BABYLON.Tools.Error("glTF Loader: " + message);
                if (this._errorCallback) {
                    this._errorCallback(message);
                }
                this.dispose();
            };
            GLTFLoader.prototype._onProgress = function (event) {
                if (this._disposed) {
                    return;
                }
                if (this._progressCallback) {
                    this._progressCallback(event);
                }
            };
            GLTFLoader.prototype._executeWhenRenderReady = function (func) {
                if (this._renderReady) {
                    func();
                }
                else {
                    this._renderReadyObservable.add(func);
                }
            };
            GLTFLoader.prototype._onRenderReady = function () {
                this._rootNode.babylonMesh.setEnabled(true);
                this._startAnimations();
                this._successCallback();
                this._renderReadyObservable.notifyObservers(this);
                if (this._parent.onReady) {
                    this._parent.onReady();
                }
            };
            GLTFLoader.prototype._onComplete = function () {
                if (this._parent.onComplete) {
                    this._parent.onComplete();
                }
                this.dispose();
            };
            GLTFLoader.prototype._loadData = function (data) {
                this._gltf = data.json;
                if (data.bin) {
                    var buffers = this._gltf.buffers;
                    if (buffers && buffers[0] && !buffers[0].uri) {
                        var binaryBuffer = buffers[0];
                        if (binaryBuffer.byteLength != data.bin.byteLength) {
                            BABYLON.Tools.Warn("Binary buffer length (" + binaryBuffer.byteLength + ") from JSON does not match chunk length (" + data.bin.byteLength + ")");
                        }
                        binaryBuffer.loadedData = data.bin;
                    }
                    else {
                        BABYLON.Tools.Warn("Unexpected BIN chunk");
                    }
                }
            };
            GLTFLoader.prototype._getMeshes = function () {
                var meshes = [this._rootNode.babylonMesh];
                var nodes = this._gltf.nodes;
                if (nodes) {
                    nodes.forEach(function (node) {
                        if (node.babylonMesh) {
                            meshes.push(node.babylonMesh);
                        }
                    });
                }
                return meshes;
            };
            GLTFLoader.prototype._getSkeletons = function () {
                var skeletons = new Array();
                var skins = this._gltf.skins;
                if (skins) {
                    skins.forEach(function (skin) {
                        if (skin.babylonSkeleton instanceof BABYLON.Skeleton) {
                            skeletons.push(skin.babylonSkeleton);
                        }
                    });
                }
                return skeletons;
            };
            GLTFLoader.prototype._getAnimationTargets = function () {
                var targets = new Array();
                var animations = this._gltf.animations;
                if (animations) {
                    animations.forEach(function (animation) {
                        targets.push.apply(targets, animation.targets);
                    });
                }
                return targets;
            };
            GLTFLoader.prototype._startAnimations = function () {
                var _this = this;
                this._getAnimationTargets().forEach(function (target) { return _this._babylonScene.beginAnimation(target, 0, Number.MAX_VALUE, true); });
            };
            GLTFLoader.prototype._loadDefaultScene = function (nodeNames) {
                var scene = GLTF2.GLTFUtils.GetArrayItem(this._gltf.scenes, this._gltf.scene || 0);
                if (!scene) {
                    throw new Error("Failed to find scene " + (this._gltf.scene || 0));
                }
                this._loadScene("scenes[" + scene.index + "]", scene, nodeNames);
            };
            GLTFLoader.prototype._loadScene = function (context, scene, nodeNames) {
                this._rootNode = { babylonMesh: new BABYLON.Mesh("__root__", this._babylonScene) };
                switch (this._parent.coordinateSystemMode) {
                    case BABYLON.GLTFLoaderCoordinateSystemMode.AUTO:
                        if (!this._babylonScene.useRightHandedSystem) {
                            this._rootNode.babylonMesh.rotation = new BABYLON.Vector3(0, Math.PI, 0);
                            this._rootNode.babylonMesh.scaling = new BABYLON.Vector3(1, 1, -1);
                        }
                        break;
                    case BABYLON.GLTFLoaderCoordinateSystemMode.PASS_THROUGH:
                        // do nothing
                        break;
                    case BABYLON.GLTFLoaderCoordinateSystemMode.FORCE_RIGHT_HANDED:
                        this._babylonScene.useRightHandedSystem = true;
                        break;
                    default:
                        BABYLON.Tools.Error("Invalid coordinate system mode (" + this._parent.coordinateSystemMode + ")");
                        return;
                }
                var nodeIndices = scene.nodes;
                this._traverseNodes(context, nodeIndices, function (node, parentNode) {
                    node.parent = parentNode;
                    return true;
                }, this._rootNode);
                if (nodeNames) {
                    if (!(nodeNames instanceof Array)) {
                        nodeNames = [nodeNames];
                    }
                    var filteredNodeIndices = new Array();
                    this._traverseNodes(context, nodeIndices, function (node) {
                        if (nodeNames.indexOf(node.name) !== -1) {
                            filteredNodeIndices.push(node.index);
                            return false;
                        }
                        return true;
                    }, this._rootNode);
                    nodeIndices = filteredNodeIndices;
                }
                for (var i = 0; i < nodeIndices.length; i++) {
                    var node = GLTF2.GLTFUtils.GetArrayItem(this._gltf.nodes, nodeIndices[i]);
                    if (!node) {
                        throw new Error(context + ": Failed to find node " + nodeIndices[i]);
                    }
                    this._loadNode("nodes[" + nodeIndices[i] + "]", node);
                }
                // Disable the root mesh until the asset is ready to render.
                this._rootNode.babylonMesh.setEnabled(false);
            };
            GLTFLoader.prototype._loadNode = function (context, node) {
                if (GLTF2.GLTFLoaderExtension.LoadNode(this, context, node)) {
                    return;
                }
                node.babylonMesh = new BABYLON.Mesh(node.name || "mesh" + node.index, this._babylonScene);
                this._loadTransform(node);
                if (node.mesh != null) {
                    var mesh = GLTF2.GLTFUtils.GetArrayItem(this._gltf.meshes, node.mesh);
                    if (!mesh) {
                        throw new Error(context + ": Failed to find mesh " + node.mesh);
                    }
                    this._loadMesh("meshes[" + node.mesh + "]", node, mesh);
                }
                node.babylonMesh.parent = node.parent ? node.parent.babylonMesh : null;
                node.babylonAnimationTargets = node.babylonAnimationTargets || [];
                node.babylonAnimationTargets.push(node.babylonMesh);
                if (node.skin != null) {
                    var skin = GLTF2.GLTFUtils.GetArrayItem(this._gltf.skins, node.skin);
                    if (!skin) {
                        throw new Error(context + ": Failed to find skin " + node.skin);
                    }
                    node.babylonMesh.skeleton = this._loadSkin("skins[" + node.skin + "]", skin);
                }
                if (node.camera != null) {
                    // TODO: handle cameras
                }
                if (node.children) {
                    for (var i = 0; i < node.children.length; i++) {
                        var childNode = GLTF2.GLTFUtils.GetArrayItem(this._gltf.nodes, node.children[i]);
                        if (!childNode) {
                            throw new Error(context + ": Failed to find child node " + node.children[i]);
                        }
                        this._loadNode("nodes[" + node.children[i] + "]", childNode);
                    }
                }
            };
            GLTFLoader.prototype._loadMesh = function (context, node, mesh) {
                node.babylonMesh.name = mesh.name || node.babylonMesh.name;
                var babylonMultiMaterial = new BABYLON.MultiMaterial(node.babylonMesh.name, this._babylonScene);
                node.babylonMesh.material = babylonMultiMaterial;
                var geometry = new BABYLON.Geometry(node.babylonMesh.name, this._babylonScene, null, false, node.babylonMesh);
                var vertexData = new BABYLON.VertexData();
                vertexData.positions = [];
                vertexData.indices = [];
                var subMeshInfos = [];
                var numRemainingPrimitives = mesh.primitives.length;
                for (var index = 0; index < mesh.primitives.length; index++) {
                    var primitive = mesh.primitives[index];
                    this._loadPrimitive(context + "/primitives[" + index + "]", node, mesh, primitive, function (subVertexData, loadMaterial) {
                        subMeshInfos.push({
                            verticesStart: vertexData.positions.length,
                            verticesCount: subVertexData.positions.length,
                            indicesStart: vertexData.indices.length,
                            indicesCount: subVertexData.indices.length,
                            loadMaterial: loadMaterial
                        });
                        vertexData.merge(subVertexData);
                        if (--numRemainingPrimitives === 0) {
                            geometry.setAllVerticesData(vertexData, false);
                            // TODO: optimize this so that sub meshes can be created without being overwritten after setting vertex data.
                            // Sub meshes must be cleared and created after setting vertex data because of mesh._createGlobalSubMesh.
                            node.babylonMesh.subMeshes = [];
                            for (var index = 0; index < subMeshInfos.length; index++) {
                                var info = subMeshInfos[index];
                                new BABYLON.SubMesh(index, info.verticesStart, info.verticesCount, info.indicesStart, info.indicesCount, node.babylonMesh);
                                info.loadMaterial(index);
                            }
                        }
                    });
                }
            };
            GLTFLoader.prototype._loadPrimitive = function (context, node, mesh, primitive, onSuccess) {
                var _this = this;
                var subMaterials = node.babylonMesh.material.subMaterials;
                if (primitive.mode && primitive.mode !== GLTF2.EMeshPrimitiveMode.TRIANGLES) {
                    // TODO: handle other primitive modes
                    throw new Error(context + ": Mode " + primitive.mode + " is not currently supported");
                }
                this._createMorphTargets(node, mesh, primitive);
                this._loadVertexDataAsync(context, mesh, primitive, function (vertexData) {
                    _this._loadMorphTargetsData(context, mesh, primitive, vertexData, node.babylonMesh);
                    var loadMaterial = function (index) {
                        if (primitive.material == null) {
                            subMaterials[index] = _this._getDefaultMaterial();
                        }
                        else {
                            var material = GLTF2.GLTFUtils.GetArrayItem(_this._gltf.materials, primitive.material);
                            if (!material) {
                                throw new Error(context + ": Failed to find material " + primitive.material);
                            }
                            _this._loadMaterial("materials[" + material.index + "]", material, function (babylonMaterial, isNew) {
                                if (isNew && _this._parent.onMaterialLoaded) {
                                    _this._parent.onMaterialLoaded(babylonMaterial);
                                }
                                if (_this._parent.onBeforeMaterialReadyAsync) {
                                    _this._addLoaderPendingData(material);
                                    _this._parent.onBeforeMaterialReadyAsync(babylonMaterial, node.babylonMesh, subMaterials[index] != null, function () {
                                        subMaterials[index] = babylonMaterial;
                                        _this._removeLoaderPendingData(material);
                                    });
                                }
                                else {
                                    subMaterials[index] = babylonMaterial;
                                }
                            });
                        }
                    };
                    onSuccess(vertexData, loadMaterial);
                });
            };
            GLTFLoader.prototype._loadVertexDataAsync = function (context, mesh, primitive, onSuccess) {
                var _this = this;
                var attributes = primitive.attributes;
                if (!attributes) {
                    throw new Error(context + ": Attributes are missing");
                }
                var vertexData = new BABYLON.VertexData();
                var numRemainingAttributes = Object.keys(attributes).length;
                var _loop_1 = function (attribute) {
                    accessor = GLTF2.GLTFUtils.GetArrayItem(this_1._gltf.accessors, attributes[attribute]);
                    if (!accessor) {
                        throw new Error(context + ": Failed to find attribute '" + attribute + "' accessor " + attributes[attribute]);
                    }
                    this_1._loadAccessorAsync("accessors[" + accessor.index + "]", accessor, function (data) {
                        switch (attribute) {
                            case "NORMAL":
                                vertexData.normals = data;
                                break;
                            case "POSITION":
                                vertexData.positions = data;
                                break;
                            case "TANGENT":
                                vertexData.tangents = data;
                                break;
                            case "TEXCOORD_0":
                                vertexData.uvs = data;
                                break;
                            case "TEXCOORD_1":
                                vertexData.uvs2 = data;
                                break;
                            case "JOINTS_0":
                                vertexData.matricesIndices = new Float32Array(Array.prototype.slice.apply(data));
                                break;
                            case "WEIGHTS_0":
                                vertexData.matricesWeights = data;
                                break;
                            case "COLOR_0":
                                vertexData.colors = data;
                                break;
                            default:
                                BABYLON.Tools.Warn("Ignoring unrecognized attribute '" + attribute + "'");
                                break;
                        }
                        if (--numRemainingAttributes === 0) {
                            if (primitive.indices == null) {
                                vertexData.indices = new Uint32Array(vertexData.positions.length / 3);
                                vertexData.indices.forEach(function (v, i) { return vertexData.indices[i] = i; });
                                onSuccess(vertexData);
                            }
                            else {
                                var indicesAccessor = GLTF2.GLTFUtils.GetArrayItem(_this._gltf.accessors, primitive.indices);
                                if (!indicesAccessor) {
                                    throw new Error(context + ": Failed to find indices accessor " + primitive.indices);
                                }
                                _this._loadAccessorAsync("accessors[" + indicesAccessor.index + "]", indicesAccessor, function (data) {
                                    vertexData.indices = data;
                                    onSuccess(vertexData);
                                });
                            }
                        }
                    });
                };
                var this_1 = this, accessor;
                for (var attribute in attributes) {
                    _loop_1(attribute);
                }
            };
            GLTFLoader.prototype._createMorphTargets = function (node, mesh, primitive) {
                var targets = primitive.targets;
                if (!targets) {
                    return;
                }
                if (!node.babylonMesh.morphTargetManager) {
                    node.babylonMesh.morphTargetManager = new BABYLON.MorphTargetManager();
                }
                for (var index = 0; index < targets.length; index++) {
                    var weight = node.weights ? node.weights[index] : mesh.weights ? mesh.weights[index] : 0;
                    node.babylonMesh.morphTargetManager.addTarget(new BABYLON.MorphTarget("morphTarget" + index, weight));
                }
            };
            GLTFLoader.prototype._loadMorphTargetsData = function (context, mesh, primitive, vertexData, babylonMesh) {
                var targets = primitive.targets;
                if (!targets) {
                    return;
                }
                var _loop_2 = function () {
                    var babylonMorphTarget = babylonMesh.morphTargetManager.getTarget(index);
                    attributes = targets[index];
                    var _loop_3 = function (attribute) {
                        accessor = GLTF2.GLTFUtils.GetArrayItem(this_2._gltf.accessors, attributes[attribute]);
                        if (!accessor) {
                            throw new Error(context + "/targets[" + index + "]: Failed to find attribute '" + attribute + "' accessor " + attributes[attribute]);
                        }
                        this_2._loadAccessorAsync("accessors[" + accessor.index + "]", accessor, function (data) {
                            if (accessor.name) {
                                babylonMorphTarget.name = accessor.name;
                            }
                            // glTF stores morph target information as deltas while babylon.js expects the final data.
                            // As a result we have to add the original data to the delta to calculate the final data.
                            var values = data;
                            switch (attribute) {
                                case "NORMAL":
                                    GLTF2.GLTFUtils.ForEach(values, function (v, i) { return values[i] += vertexData.normals[i]; });
                                    babylonMorphTarget.setNormals(values);
                                    break;
                                case "POSITION":
                                    GLTF2.GLTFUtils.ForEach(values, function (v, i) { return values[i] += vertexData.positions[i]; });
                                    babylonMorphTarget.setPositions(values);
                                    break;
                                case "TANGENT":
                                    // Tangent data for morph targets is stored as xyz delta.
                                    // The vertexData.tangent is stored as xyzw.
                                    // So we need to skip every fourth vertexData.tangent.
                                    for (var i = 0, j = 0; i < values.length; i++, j++) {
                                        values[i] += vertexData.tangents[j];
                                        if ((i + 1) % 3 == 0) {
                                            j++;
                                        }
                                    }
                                    babylonMorphTarget.setTangents(values);
                                    break;
                                default:
                                    BABYLON.Tools.Warn("Ignoring unrecognized attribute '" + attribute + "'");
                                    break;
                            }
                        });
                    };
                    for (var attribute in attributes) {
                        _loop_3(attribute);
                    }
                };
                var this_2 = this, attributes, accessor;
                for (var index = 0; index < targets.length; index++) {
                    _loop_2();
                }
            };
            GLTFLoader.prototype._loadTransform = function (node) {
                var position = BABYLON.Vector3.Zero();
                var rotation = BABYLON.Quaternion.Identity();
                var scaling = BABYLON.Vector3.One();
                if (node.matrix) {
                    var mat = BABYLON.Matrix.FromArray(node.matrix);
                    mat.decompose(scaling, rotation, position);
                }
                else {
                    if (node.translation)
                        position = BABYLON.Vector3.FromArray(node.translation);
                    if (node.rotation)
                        rotation = BABYLON.Quaternion.FromArray(node.rotation);
                    if (node.scale)
                        scaling = BABYLON.Vector3.FromArray(node.scale);
                }
                node.babylonMesh.position = position;
                node.babylonMesh.rotationQuaternion = rotation;
                node.babylonMesh.scaling = scaling;
            };
            GLTFLoader.prototype._loadSkin = function (context, skin) {
                var _this = this;
                var skeletonId = "skeleton" + skin.index;
                skin.babylonSkeleton = new BABYLON.Skeleton(skin.name || skeletonId, skeletonId, this._babylonScene);
                if (skin.inverseBindMatrices == null) {
                    this._loadBones(context, skin, null);
                }
                else {
                    var accessor = GLTF2.GLTFUtils.GetArrayItem(this._gltf.accessors, skin.inverseBindMatrices);
                    if (!accessor) {
                        throw new Error(context + ": Failed to find inverse bind matrices attribute " + skin.inverseBindMatrices);
                    }
                    this._loadAccessorAsync("accessors[" + accessor.index + "]", accessor, function (data) {
                        _this._loadBones(context, skin, data);
                    });
                }
                return skin.babylonSkeleton;
            };
            GLTFLoader.prototype._createBone = function (node, skin, parent, localMatrix, baseMatrix, index) {
                var babylonBone = new BABYLON.Bone(node.name || "bone" + node.index, skin.babylonSkeleton, parent, localMatrix, null, baseMatrix, index);
                node.babylonBones = node.babylonBones || {};
                node.babylonBones[skin.index] = babylonBone;
                node.babylonAnimationTargets = node.babylonAnimationTargets || [];
                node.babylonAnimationTargets.push(babylonBone);
                return babylonBone;
            };
            GLTFLoader.prototype._loadBones = function (context, skin, inverseBindMatrixData) {
                var babylonBones = {};
                for (var i = 0; i < skin.joints.length; i++) {
                    var node = GLTF2.GLTFUtils.GetArrayItem(this._gltf.nodes, skin.joints[i]);
                    if (!node) {
                        throw new Error(context + ": Failed to find joint " + skin.joints[i]);
                    }
                    this._loadBone(node, skin, inverseBindMatrixData, babylonBones);
                }
            };
            GLTFLoader.prototype._loadBone = function (node, skin, inverseBindMatrixData, babylonBones) {
                var babylonBone = babylonBones[node.index];
                if (babylonBone) {
                    return babylonBone;
                }
                var boneIndex = skin.joints.indexOf(node.index);
                var baseMatrix = BABYLON.Matrix.Identity();
                if (inverseBindMatrixData && boneIndex !== -1) {
                    baseMatrix = BABYLON.Matrix.FromArray(inverseBindMatrixData, boneIndex * 16);
                    baseMatrix.invertToRef(baseMatrix);
                }
                var babylonParentBone;
                if (node.index !== skin.skeleton && node.parent !== this._rootNode) {
                    babylonParentBone = this._loadBone(node.parent, skin, inverseBindMatrixData, babylonBones);
                    baseMatrix.multiplyToRef(babylonParentBone.getInvertedAbsoluteTransform(), baseMatrix);
                }
                babylonBone = this._createBone(node, skin, babylonParentBone, this._getNodeMatrix(node), baseMatrix, boneIndex);
                babylonBones[node.index] = babylonBone;
                return babylonBone;
            };
            GLTFLoader.prototype._getNodeMatrix = function (node) {
                return node.matrix ?
                    BABYLON.Matrix.FromArray(node.matrix) :
                    BABYLON.Matrix.Compose(node.scale ? BABYLON.Vector3.FromArray(node.scale) : BABYLON.Vector3.One(), node.rotation ? BABYLON.Quaternion.FromArray(node.rotation) : BABYLON.Quaternion.Identity(), node.translation ? BABYLON.Vector3.FromArray(node.translation) : BABYLON.Vector3.Zero());
            };
            GLTFLoader.prototype._traverseNodes = function (context, indices, action, parentNode) {
                if (parentNode === void 0) { parentNode = null; }
                for (var i = 0; i < indices.length; i++) {
                    var node = GLTF2.GLTFUtils.GetArrayItem(this._gltf.nodes, indices[i]);
                    if (!node) {
                        throw new Error(context + ": Failed to find node " + indices[i]);
                    }
                    this._traverseNode(context, node, action, parentNode);
                }
            };
            GLTFLoader.prototype._traverseNode = function (context, node, action, parentNode) {
                if (parentNode === void 0) { parentNode = null; }
                if (GLTF2.GLTFLoaderExtension.TraverseNode(this, context, node, action, parentNode)) {
                    return;
                }
                if (!action(node, parentNode)) {
                    return;
                }
                if (node.children) {
                    this._traverseNodes(context, node.children, action, node);
                }
            };
            GLTFLoader.prototype._loadAnimations = function () {
                var animations = this._gltf.animations;
                if (!animations) {
                    return;
                }
                for (var animationIndex = 0; animationIndex < animations.length; animationIndex++) {
                    var animation = animations[animationIndex];
                    var context = "animations[" + animationIndex + "]";
                    for (var channelIndex = 0; channelIndex < animation.channels.length; channelIndex++) {
                        var channel = GLTF2.GLTFUtils.GetArrayItem(animation.channels, channelIndex);
                        if (!channel) {
                            throw new Error(context + ": Failed to find channel " + channelIndex);
                        }
                        var sampler = GLTF2.GLTFUtils.GetArrayItem(animation.samplers, channel.sampler);
                        if (!sampler) {
                            throw new Error(context + ": Failed to find sampler " + channel.sampler);
                        }
                        this._loadAnimationChannel(animation, context + "/channels[" + channelIndex + "]", channel, context + "/samplers[" + channel.sampler + "]", sampler);
                    }
                }
            };
            GLTFLoader.prototype._loadAnimationChannel = function (animation, channelContext, channel, samplerContext, sampler) {
                var targetNode = GLTF2.GLTFUtils.GetArrayItem(this._gltf.nodes, channel.target.node);
                if (!targetNode) {
                    throw new Error(channelContext + ": Failed to find target node " + channel.target.node);
                }
                var conversion = {
                    "translation": "position",
                    "rotation": "rotationQuaternion",
                    "scale": "scaling",
                    "weights": "influence"
                };
                var targetPath = conversion[channel.target.path];
                if (!targetPath) {
                    throw new Error(channelContext + ": Invalid target path '" + channel.target.path + "'");
                }
                var animationConvertion = {
                    "position": BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
                    "rotationQuaternion": BABYLON.Animation.ANIMATIONTYPE_QUATERNION,
                    "scaling": BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
                    "influence": BABYLON.Animation.ANIMATIONTYPE_FLOAT,
                };
                var animationType = animationConvertion[targetPath];
                var inputData;
                var outputData;
                var checkSuccess = function () {
                    if (!inputData || !outputData) {
                        return;
                    }
                    var outputBufferOffset = 0;
                    var nextOutputConversion = {
                        "position": function () {
                            var value = BABYLON.Vector3.FromArray(outputData, outputBufferOffset);
                            outputBufferOffset += 3;
                            return value;
                        },
                        "rotationQuaternion": function () {
                            var value = BABYLON.Quaternion.FromArray(outputData, outputBufferOffset);
                            outputBufferOffset += 4;
                            return value;
                        },
                        "scaling": function () {
                            var value = BABYLON.Vector3.FromArray(outputData, outputBufferOffset);
                            outputBufferOffset += 3;
                            return value;
                        },
                        "influence": function () {
                            var numTargets = targetNode.babylonMesh.morphTargetManager.numTargets;
                            var value = new Array(numTargets);
                            for (var i = 0; i < numTargets; i++) {
                                value[i] = outputData[outputBufferOffset++];
                            }
                            return value;
                        },
                    };
                    var getNextOutputValue = nextOutputConversion[targetPath];
                    var nextKeyConversion = {
                        "LINEAR": function (frameIndex) { return ({
                            frame: inputData[frameIndex],
                            value: getNextOutputValue()
                        }); },
                        "CUBICSPLINE": function (frameIndex) { return ({
                            frame: inputData[frameIndex],
                            inTangent: getNextOutputValue(),
                            value: getNextOutputValue(),
                            outTangent: getNextOutputValue()
                        }); },
                    };
                    var getNextKey = nextKeyConversion[sampler.interpolation];
                    if (!getNextKey) {
                        throw new Error(samplerContext + ": Invalid interpolation '" + sampler.interpolation + "'");
                    }
                    var keys = new Array(inputData.length);
                    for (var frameIndex = 0; frameIndex < inputData.length; frameIndex++) {
                        keys[frameIndex] = getNextKey(frameIndex);
                    }
                    animation.targets = animation.targets || [];
                    if (targetPath === "influence") {
                        var morphTargetManager = targetNode.babylonMesh.morphTargetManager;
                        for (var targetIndex = 0; targetIndex < morphTargetManager.numTargets; targetIndex++) {
                            var morphTarget = morphTargetManager.getTarget(targetIndex);
                            var animationName = (animation.name || "anim" + animation.index) + "_" + targetIndex;
                            var babylonAnimation = new BABYLON.Animation(animationName, targetPath, 1, animationType);
                            babylonAnimation.setKeys(keys.map(function (key) { return ({
                                frame: key.frame,
                                inTangent: key.inTangent ? key.inTangent[targetIndex] : undefined,
                                value: key.value[targetIndex],
                                outTangent: key.outTangent ? key.outTangent[targetIndex] : undefined
                            }); }));
                            morphTarget.animations.push(babylonAnimation);
                            animation.targets.push(morphTarget);
                        }
                    }
                    else {
                        var animationName = animation.name || "anim" + animation.index;
                        var babylonAnimation = new BABYLON.Animation(animationName, targetPath, 1, animationType);
                        babylonAnimation.setKeys(keys);
                        for (var i = 0; i < targetNode.babylonAnimationTargets.length; i++) {
                            var target = targetNode.babylonAnimationTargets[i];
                            target.animations.push(babylonAnimation.clone());
                            animation.targets.push(target);
                        }
                    }
                };
                var inputAccessor = GLTF2.GLTFUtils.GetArrayItem(this._gltf.accessors, sampler.input);
                if (!inputAccessor) {
                    throw new Error(samplerContext + ": Failed to find input accessor " + sampler.input);
                }
                this._loadAccessorAsync("accessors[" + inputAccessor.index + "]", inputAccessor, function (data) {
                    inputData = data;
                    checkSuccess();
                });
                var outputAccessor = GLTF2.GLTFUtils.GetArrayItem(this._gltf.accessors, sampler.output);
                if (!outputAccessor) {
                    throw new Error(samplerContext + ": Failed to find output accessor " + sampler.output);
                }
                this._loadAccessorAsync("accessors[" + outputAccessor.index + "]", outputAccessor, function (data) {
                    outputData = data;
                    checkSuccess();
                });
            };
            GLTFLoader.prototype._loadBufferAsync = function (context, buffer, onSuccess) {
                var _this = this;
                this._addPendingData(buffer);
                if (buffer.loadedData) {
                    onSuccess(buffer.loadedData);
                    this._removePendingData(buffer);
                }
                else if (buffer.loadedObservable) {
                    buffer.loadedObservable.add(function (buffer) {
                        onSuccess(buffer.loadedData);
                        _this._removePendingData(buffer);
                    });
                }
                else {
                    if (!buffer.uri) {
                        throw new Error(context + ": Uri is missing");
                    }
                    if (GLTF2.GLTFUtils.IsBase64(buffer.uri)) {
                        var data = GLTF2.GLTFUtils.DecodeBase64(buffer.uri);
                        buffer.loadedData = new Uint8Array(data);
                        onSuccess(buffer.loadedData);
                        this._removePendingData(buffer);
                    }
                    else {
                        if (!GLTF2.GLTFUtils.ValidateUri(buffer.uri)) {
                            throw new Error(context + ": Uri '" + buffer.uri + "' is invalid");
                        }
                        buffer.loadedObservable = new BABYLON.Observable();
                        buffer.loadedObservable.add(function (buffer) {
                            onSuccess(buffer.loadedData);
                            _this._removePendingData(buffer);
                        });
                        BABYLON.Tools.LoadFile(this._rootUrl + buffer.uri, function (data) {
                            _this._tryCatchOnError(function () {
                                buffer.loadedData = new Uint8Array(data);
                                buffer.loadedObservable.notifyObservers(buffer);
                                buffer.loadedObservable = null;
                            });
                        }, function (event) {
                            _this._tryCatchOnError(function () {
                                _this._onProgress(event);
                            });
                        }, this._babylonScene.database, true, function (request) {
                            _this._tryCatchOnError(function () {
                                throw new Error(context + ": Failed to load '" + buffer.uri + "'" + (request ? ": " + request.status + " " + request.statusText : ""));
                            });
                        });
                    }
                }
            };
            GLTFLoader.prototype._loadBufferViewAsync = function (context, bufferView, onSuccess) {
                var _this = this;
                var buffer = GLTF2.GLTFUtils.GetArrayItem(this._gltf.buffers, bufferView.buffer);
                if (!buffer) {
                    throw new Error(context + ": Failed to find buffer " + bufferView.buffer);
                }
                this._loadBufferAsync("buffers[" + buffer.index + "]", buffer, function (bufferData) {
                    if (_this._disposed) {
                        return;
                    }
                    try {
                        var data = new Uint8Array(bufferData.buffer, bufferData.byteOffset + (bufferView.byteOffset || 0), bufferView.byteLength);
                    }
                    catch (e) {
                        throw new Error(context + ": " + e.message);
                    }
                    onSuccess(data);
                });
            };
            GLTFLoader.prototype._loadAccessorAsync = function (context, accessor, onSuccess) {
                var _this = this;
                if (accessor.sparse) {
                    throw new Error(context + ": Sparse accessors are not currently supported");
                }
                if (accessor.normalized) {
                    throw new Error(context + ": Normalized accessors are not currently supported");
                }
                var bufferView = GLTF2.GLTFUtils.GetArrayItem(this._gltf.bufferViews, accessor.bufferView);
                if (!bufferView) {
                    throw new Error(context + ": Failed to find buffer view " + accessor.bufferView);
                }
                this._loadBufferViewAsync("bufferViews[" + bufferView.index + "]", bufferView, function (bufferViewData) {
                    var numComponents = _this._getNumComponentsOfType(accessor.type);
                    if (numComponents === 0) {
                        throw new Error(context + ": Invalid type (" + accessor.type + ")");
                    }
                    var data;
                    switch (accessor.componentType) {
                        case GLTF2.EComponentType.BYTE:
                            data = _this._buildArrayBuffer(Float32Array, context, bufferViewData, accessor.byteOffset, accessor.count, numComponents, bufferView.byteStride);
                            break;
                        case GLTF2.EComponentType.UNSIGNED_BYTE:
                            data = _this._buildArrayBuffer(Uint8Array, context, bufferViewData, accessor.byteOffset, accessor.count, numComponents, bufferView.byteStride);
                            break;
                        case GLTF2.EComponentType.SHORT:
                            data = _this._buildArrayBuffer(Int16Array, context, bufferViewData, accessor.byteOffset, accessor.count, numComponents, bufferView.byteStride);
                            break;
                        case GLTF2.EComponentType.UNSIGNED_SHORT:
                            data = _this._buildArrayBuffer(Uint16Array, context, bufferViewData, accessor.byteOffset, accessor.count, numComponents, bufferView.byteStride);
                            break;
                        case GLTF2.EComponentType.UNSIGNED_INT:
                            data = _this._buildArrayBuffer(Uint32Array, context, bufferViewData, accessor.byteOffset, accessor.count, numComponents, bufferView.byteStride);
                            break;
                        case GLTF2.EComponentType.FLOAT:
                            data = _this._buildArrayBuffer(Float32Array, context, bufferViewData, accessor.byteOffset, accessor.count, numComponents, bufferView.byteStride);
                            break;
                        default:
                            throw new Error(context + ": Invalid component type (" + accessor.componentType + ")");
                    }
                    onSuccess(data);
                });
            };
            GLTFLoader.prototype._getNumComponentsOfType = function (type) {
                switch (type) {
                    case "SCALAR": return 1;
                    case "VEC2": return 2;
                    case "VEC3": return 3;
                    case "VEC4": return 4;
                    case "MAT2": return 4;
                    case "MAT3": return 9;
                    case "MAT4": return 16;
                }
                return 0;
            };
            GLTFLoader.prototype._buildArrayBuffer = function (typedArray, context, data, byteOffset, count, numComponents, byteStride) {
                try {
                    var byteOffset = data.byteOffset + (byteOffset || 0);
                    var targetLength = count * numComponents;
                    if (byteStride == null || byteStride === numComponents * typedArray.BYTES_PER_ELEMENT) {
                        return new typedArray(data.buffer, byteOffset, targetLength);
                    }
                    var elementStride = byteStride / typedArray.BYTES_PER_ELEMENT;
                    var sourceBuffer = new typedArray(data.buffer, byteOffset, elementStride * count);
                    var targetBuffer = new typedArray(targetLength);
                    var sourceIndex = 0;
                    var targetIndex = 0;
                    while (targetIndex < targetLength) {
                        for (var componentIndex = 0; componentIndex < numComponents; componentIndex++) {
                            targetBuffer[targetIndex] = sourceBuffer[sourceIndex + componentIndex];
                            targetIndex++;
                        }
                        sourceIndex += elementStride;
                    }
                    return targetBuffer;
                }
                catch (e) {
                    throw new Error(context + ": " + e);
                }
            };
            GLTFLoader.prototype._addPendingData = function (data) {
                if (!this._renderReady) {
                    this._renderPendingCount++;
                }
                this._addLoaderPendingData(data);
            };
            GLTFLoader.prototype._removePendingData = function (data) {
                if (!this._renderReady) {
                    if (--this._renderPendingCount === 0) {
                        this._renderReady = true;
                        this._onRenderReady();
                    }
                }
                this._removeLoaderPendingData(data);
            };
            GLTFLoader.prototype._addLoaderPendingData = function (data) {
                this._loaderPendingCount++;
                this._loaderTrackers.forEach(function (tracker) { return tracker._addPendingData(data); });
            };
            GLTFLoader.prototype._removeLoaderPendingData = function (data) {
                this._loaderTrackers.forEach(function (tracker) { return tracker._removePendingData(data); });
                if (--this._loaderPendingCount === 0) {
                    this._onComplete();
                }
            };
            GLTFLoader.prototype._whenAction = function (action, onComplete) {
                var _this = this;
                var tracker = new GLTFLoaderTracker(function () {
                    _this._loaderTrackers.splice(_this._loaderTrackers.indexOf(tracker));
                    onComplete();
                });
                this._loaderTrackers.push(tracker);
                this._addLoaderPendingData(tracker);
                action();
                this._removeLoaderPendingData(tracker);
            };
            GLTFLoader.prototype._getDefaultMaterial = function () {
                if (!this._defaultMaterial) {
                    var id = "__gltf_default";
                    var material = this._babylonScene.getMaterialByName(id);
                    if (!material) {
                        material = new BABYLON.PBRMaterial(id, this._babylonScene);
                        material.sideOrientation = BABYLON.Material.CounterClockWiseSideOrientation;
                        material.metallic = 1;
                        material.roughness = 1;
                    }
                    this._defaultMaterial = material;
                }
                return this._defaultMaterial;
            };
            GLTFLoader.prototype._loadMaterialMetallicRoughnessProperties = function (context, material) {
                var babylonMaterial = material.babylonMaterial;
                // Ensure metallic workflow
                babylonMaterial.metallic = 1;
                babylonMaterial.roughness = 1;
                var properties = material.pbrMetallicRoughness;
                if (!properties) {
                    return;
                }
                babylonMaterial.albedoColor = properties.baseColorFactor ? BABYLON.Color3.FromArray(properties.baseColorFactor) : new BABYLON.Color3(1, 1, 1);
                babylonMaterial.metallic = properties.metallicFactor == null ? 1 : properties.metallicFactor;
                babylonMaterial.roughness = properties.roughnessFactor == null ? 1 : properties.roughnessFactor;
                if (properties.baseColorTexture) {
                    var texture = GLTF2.GLTFUtils.GetArrayItem(this._gltf.textures, properties.baseColorTexture.index);
                    if (!texture) {
                        throw new Error(context + ": Failed to find base color texture " + properties.baseColorTexture.index);
                    }
                    babylonMaterial.albedoTexture = this._loadTexture("textures[" + texture.index + "]", texture, properties.baseColorTexture.texCoord);
                }
                if (properties.metallicRoughnessTexture) {
                    var texture = GLTF2.GLTFUtils.GetArrayItem(this._gltf.textures, properties.metallicRoughnessTexture.index);
                    if (!texture) {
                        throw new Error(context + ": Failed to find metallic roughness texture " + properties.metallicRoughnessTexture.index);
                    }
                    babylonMaterial.metallicTexture = this._loadTexture("textures[" + texture.index + "]", texture, properties.metallicRoughnessTexture.texCoord);
                    babylonMaterial.useMetallnessFromMetallicTextureBlue = true;
                    babylonMaterial.useRoughnessFromMetallicTextureGreen = true;
                    babylonMaterial.useRoughnessFromMetallicTextureAlpha = false;
                }
                this._loadMaterialAlphaProperties(context, material, properties.baseColorFactor);
            };
            GLTFLoader.prototype._loadMaterial = function (context, material, assign) {
                if (material.babylonMaterial) {
                    assign(material.babylonMaterial, false);
                    return;
                }
                if (GLTF2.GLTFLoaderExtension.LoadMaterial(this, context, material, assign)) {
                    return;
                }
                this._createPbrMaterial(material);
                this._loadMaterialBaseProperties(context, material);
                this._loadMaterialMetallicRoughnessProperties(context, material);
                assign(material.babylonMaterial, true);
            };
            GLTFLoader.prototype._createPbrMaterial = function (material) {
                var babylonMaterial = new BABYLON.PBRMaterial(material.name || "mat" + material.index, this._babylonScene);
                babylonMaterial.sideOrientation = BABYLON.Material.CounterClockWiseSideOrientation;
                material.babylonMaterial = babylonMaterial;
            };
            GLTFLoader.prototype._loadMaterialBaseProperties = function (context, material) {
                var babylonMaterial = material.babylonMaterial;
                babylonMaterial.emissiveColor = material.emissiveFactor ? BABYLON.Color3.FromArray(material.emissiveFactor) : new BABYLON.Color3(0, 0, 0);
                if (material.doubleSided) {
                    babylonMaterial.backFaceCulling = false;
                    babylonMaterial.twoSidedLighting = true;
                }
                if (material.normalTexture) {
                    var texture = GLTF2.GLTFUtils.GetArrayItem(this._gltf.textures, material.normalTexture.index);
                    if (!texture) {
                        throw new Error(context + ": Failed to find normal texture " + material.normalTexture.index);
                    }
                    babylonMaterial.bumpTexture = this._loadTexture("textures[" + texture.index + "]", texture, material.normalTexture.texCoord);
                    babylonMaterial.invertNormalMapX = !this._babylonScene.useRightHandedSystem;
                    babylonMaterial.invertNormalMapY = this._babylonScene.useRightHandedSystem;
                    if (material.normalTexture.scale != null) {
                        babylonMaterial.bumpTexture.level = material.normalTexture.scale;
                    }
                }
                if (material.occlusionTexture) {
                    var texture = GLTF2.GLTFUtils.GetArrayItem(this._gltf.textures, material.occlusionTexture.index);
                    if (!texture) {
                        throw new Error(context + ": Failed to find occlusion texture " + material.occlusionTexture.index);
                    }
                    babylonMaterial.ambientTexture = this._loadTexture("textures[" + texture.index + "]", texture, material.occlusionTexture.texCoord);
                    babylonMaterial.useAmbientInGrayScale = true;
                    if (material.occlusionTexture.strength != null) {
                        babylonMaterial.ambientTextureStrength = material.occlusionTexture.strength;
                    }
                }
                if (material.emissiveTexture) {
                    var texture = GLTF2.GLTFUtils.GetArrayItem(this._gltf.textures, material.emissiveTexture.index);
                    if (!texture) {
                        throw new Error(context + ": Failed to find emissive texture " + material.emissiveTexture.index);
                    }
                    babylonMaterial.emissiveTexture = this._loadTexture("textures[" + texture.index + "]", texture, material.emissiveTexture.texCoord);
                }
            };
            GLTFLoader.prototype._loadMaterialAlphaProperties = function (context, material, colorFactor) {
                var babylonMaterial = material.babylonMaterial;
                var alphaMode = material.alphaMode || "OPAQUE";
                switch (alphaMode) {
                    case "OPAQUE":
                        // default is opaque
                        break;
                    case "MASK":
                        babylonMaterial.alphaCutOff = (material.alphaCutoff == null ? 0.5 : material.alphaCutoff);
                        if (colorFactor) {
                            if (colorFactor[3] == 0) {
                                babylonMaterial.alphaCutOff = 1;
                            }
                            else {
                                babylonMaterial.alphaCutOff /= colorFactor[3];
                            }
                        }
                        if (babylonMaterial.albedoTexture) {
                            babylonMaterial.albedoTexture.hasAlpha = true;
                        }
                        break;
                    case "BLEND":
                        if (colorFactor) {
                            babylonMaterial.alpha = colorFactor[3];
                        }
                        if (babylonMaterial.albedoTexture) {
                            babylonMaterial.albedoTexture.hasAlpha = true;
                            babylonMaterial.useAlphaFromAlbedoTexture = true;
                        }
                        break;
                    default:
                        throw new Error(context + ": Invalid alpha mode '" + material.alphaMode + "'");
                }
            };
            GLTFLoader.prototype._loadTexture = function (context, texture, coordinatesIndex) {
                var _this = this;
                var sampler = (texture.sampler == null ? {} : GLTF2.GLTFUtils.GetArrayItem(this._gltf.samplers, texture.sampler));
                if (!sampler) {
                    throw new Error(context + ": Failed to find sampler " + texture.sampler);
                }
                var noMipMaps = (sampler.minFilter === GLTF2.ETextureMinFilter.NEAREST || sampler.minFilter === GLTF2.ETextureMinFilter.LINEAR);
                var samplingMode = GLTF2.GLTFUtils.GetTextureSamplingMode(sampler.magFilter, sampler.minFilter);
                this._addPendingData(texture);
                var babylonTexture = new BABYLON.Texture(null, this._babylonScene, noMipMaps, false, samplingMode, function () {
                    _this._tryCatchOnError(function () {
                        _this._removePendingData(texture);
                    });
                }, function (message) {
                    _this._tryCatchOnError(function () {
                        throw new Error(context + ": " + message);
                    });
                });
                if (texture.url) {
                    babylonTexture.updateURL(texture.url);
                }
                else if (texture.dataReadyObservable) {
                    texture.dataReadyObservable.add(function (texture) {
                        babylonTexture.updateURL(texture.url);
                    });
                }
                else {
                    texture.dataReadyObservable = new BABYLON.Observable();
                    texture.dataReadyObservable.add(function (texture) {
                        babylonTexture.updateURL(texture.url);
                    });
                    var image = GLTF2.GLTFUtils.GetArrayItem(this._gltf.images, texture.source);
                    if (!image) {
                        throw new Error(context + ": Failed to find source " + texture.source);
                    }
                    this._loadImage("images[" + image.index + "]", image, function (data) {
                        texture.url = URL.createObjectURL(new Blob([data], { type: image.mimeType }));
                        texture.dataReadyObservable.notifyObservers(texture);
                    });
                }
                babylonTexture.coordinatesIndex = coordinatesIndex || 0;
                babylonTexture.wrapU = GLTF2.GLTFUtils.GetTextureWrapMode(sampler.wrapS);
                babylonTexture.wrapV = GLTF2.GLTFUtils.GetTextureWrapMode(sampler.wrapT);
                babylonTexture.name = texture.name || "texture" + texture.index;
                if (this._parent.onTextureLoaded) {
                    this._parent.onTextureLoaded(babylonTexture);
                }
                return babylonTexture;
            };
            GLTFLoader.prototype._loadImage = function (context, image, onSuccess) {
                var _this = this;
                if (image.uri) {
                    if (!GLTF2.GLTFUtils.ValidateUri(image.uri)) {
                        throw new Error(context + ": Uri '" + image.uri + "' is invalid");
                    }
                    if (GLTF2.GLTFUtils.IsBase64(image.uri)) {
                        onSuccess(new Uint8Array(GLTF2.GLTFUtils.DecodeBase64(image.uri)));
                    }
                    else {
                        BABYLON.Tools.LoadFile(this._rootUrl + image.uri, function (data) {
                            _this._tryCatchOnError(function () {
                                onSuccess(data);
                            });
                        }, function (event) {
                            _this._tryCatchOnError(function () {
                                _this._onProgress(event);
                            });
                        }, this._babylonScene.database, true, function (request) {
                            _this._tryCatchOnError(function () {
                                throw new Error(context + ": Failed to load '" + image.uri + "'" + (request ? ": " + request.status + " " + request.statusText : ""));
                            });
                        });
                    }
                }
                else {
                    var bufferView = GLTF2.GLTFUtils.GetArrayItem(this._gltf.bufferViews, image.bufferView);
                    if (!bufferView) {
                        throw new Error(context + ": Failed to find buffer view " + image.bufferView);
                    }
                    this._loadBufferViewAsync("bufferViews[" + bufferView.index + "]", bufferView, onSuccess);
                }
            };
            GLTFLoader.prototype._tryCatchOnError = function (handler) {
                try {
                    handler();
                }
                catch (e) {
                    this._onError(e.message);
                }
            };
            GLTFLoader.Extensions = {};
            return GLTFLoader;
        }());
        GLTF2.GLTFLoader = GLTFLoader;
        BABYLON.GLTFFileLoader.CreateGLTFLoaderV2 = function (parent) { return new GLTFLoader(parent); };
    })(GLTF2 = BABYLON.GLTF2 || (BABYLON.GLTF2 = {}));
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=babylon.glTFLoader.js.map

/// <reference path="../../../../dist/preview release/babylon.d.ts"/>
var BABYLON;
(function (BABYLON) {
    var GLTF2;
    (function (GLTF2) {
        /**
        * Utils functions for GLTF
        */
        var GLTFUtils = (function () {
            function GLTFUtils() {
            }
            /**
            * If the uri is a base64 string
            * @param uri: the uri to test
            */
            GLTFUtils.IsBase64 = function (uri) {
                return uri.length < 5 ? false : uri.substr(0, 5) === "data:";
            };
            /**
            * Decode the base64 uri
            * @param uri: the uri to decode
            */
            GLTFUtils.DecodeBase64 = function (uri) {
                var decodedString = atob(uri.split(",")[1]);
                var bufferLength = decodedString.length;
                var bufferView = new Uint8Array(new ArrayBuffer(bufferLength));
                for (var i = 0; i < bufferLength; i++) {
                    bufferView[i] = decodedString.charCodeAt(i);
                }
                return bufferView.buffer;
            };
            GLTFUtils.ForEach = function (view, func) {
                for (var index = 0; index < view.length; index++) {
                    func(view[index], index);
                }
            };
            GLTFUtils.ValidateUri = function (uri) {
                return (uri.indexOf("..") === -1);
            };
            GLTFUtils.AssignIndices = function (array) {
                if (array) {
                    for (var index = 0; index < array.length; index++) {
                        array[index].index = index;
                    }
                }
            };
            GLTFUtils.GetArrayItem = function (array, index) {
                if (!array || !array[index]) {
                    return null;
                }
                return array[index];
            };
            GLTFUtils.GetTextureWrapMode = function (mode) {
                // Set defaults if undefined
                mode = mode === undefined ? GLTF2.ETextureWrapMode.REPEAT : mode;
                switch (mode) {
                    case GLTF2.ETextureWrapMode.CLAMP_TO_EDGE: return BABYLON.Texture.CLAMP_ADDRESSMODE;
                    case GLTF2.ETextureWrapMode.MIRRORED_REPEAT: return BABYLON.Texture.MIRROR_ADDRESSMODE;
                    case GLTF2.ETextureWrapMode.REPEAT: return BABYLON.Texture.WRAP_ADDRESSMODE;
                    default:
                        BABYLON.Tools.Warn("Invalid texture wrap mode (" + mode + ")");
                        return BABYLON.Texture.WRAP_ADDRESSMODE;
                }
            };
            GLTFUtils.GetTextureSamplingMode = function (magFilter, minFilter) {
                // Set defaults if undefined
                magFilter = magFilter === undefined ? GLTF2.ETextureMagFilter.LINEAR : magFilter;
                minFilter = minFilter === undefined ? GLTF2.ETextureMinFilter.LINEAR_MIPMAP_LINEAR : minFilter;
                if (magFilter === GLTF2.ETextureMagFilter.LINEAR) {
                    switch (minFilter) {
                        case GLTF2.ETextureMinFilter.NEAREST: return BABYLON.Texture.LINEAR_NEAREST;
                        case GLTF2.ETextureMinFilter.LINEAR: return BABYLON.Texture.LINEAR_LINEAR;
                        case GLTF2.ETextureMinFilter.NEAREST_MIPMAP_NEAREST: return BABYLON.Texture.LINEAR_NEAREST_MIPNEAREST;
                        case GLTF2.ETextureMinFilter.LINEAR_MIPMAP_NEAREST: return BABYLON.Texture.LINEAR_LINEAR_MIPNEAREST;
                        case GLTF2.ETextureMinFilter.NEAREST_MIPMAP_LINEAR: return BABYLON.Texture.LINEAR_NEAREST_MIPLINEAR;
                        case GLTF2.ETextureMinFilter.LINEAR_MIPMAP_LINEAR: return BABYLON.Texture.LINEAR_LINEAR_MIPLINEAR;
                        default:
                            BABYLON.Tools.Warn("Invalid texture minification filter (" + minFilter + ")");
                            return BABYLON.Texture.LINEAR_LINEAR_MIPLINEAR;
                    }
                }
                else {
                    if (magFilter !== GLTF2.ETextureMagFilter.NEAREST) {
                        BABYLON.Tools.Warn("Invalid texture magnification filter (" + magFilter + ")");
                    }
                    switch (minFilter) {
                        case GLTF2.ETextureMinFilter.NEAREST: return BABYLON.Texture.NEAREST_NEAREST;
                        case GLTF2.ETextureMinFilter.LINEAR: return BABYLON.Texture.NEAREST_LINEAR;
                        case GLTF2.ETextureMinFilter.NEAREST_MIPMAP_NEAREST: return BABYLON.Texture.NEAREST_NEAREST_MIPNEAREST;
                        case GLTF2.ETextureMinFilter.LINEAR_MIPMAP_NEAREST: return BABYLON.Texture.NEAREST_LINEAR_MIPNEAREST;
                        case GLTF2.ETextureMinFilter.NEAREST_MIPMAP_LINEAR: return BABYLON.Texture.NEAREST_NEAREST_MIPLINEAR;
                        case GLTF2.ETextureMinFilter.LINEAR_MIPMAP_LINEAR: return BABYLON.Texture.NEAREST_LINEAR_MIPLINEAR;
                        default:
                            BABYLON.Tools.Warn("Invalid texture minification filter (" + minFilter + ")");
                            return BABYLON.Texture.NEAREST_NEAREST_MIPNEAREST;
                    }
                }
            };
            /**
             * Decodes a buffer view into a string
             * @param view: the buffer view
             */
            GLTFUtils.DecodeBufferToText = function (view) {
                var result = "";
                var length = view.byteLength;
                for (var i = 0; i < length; ++i) {
                    result += String.fromCharCode(view[i]);
                }
                return result;
            };
            return GLTFUtils;
        }());
        GLTF2.GLTFUtils = GLTFUtils;
    })(GLTF2 = BABYLON.GLTF2 || (BABYLON.GLTF2 = {}));
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=babylon.glTFLoaderUtils.js.map

/// <reference path="../../../../dist/preview release/babylon.d.ts"/>
var BABYLON;
(function (BABYLON) {
    var GLTF2;
    (function (GLTF2) {
        var GLTFLoaderExtension = (function () {
            function GLTFLoaderExtension() {
                this.enabled = true;
            }
            GLTFLoaderExtension.prototype._traverseNode = function (loader, context, node, action, parentNode) { return false; };
            GLTFLoaderExtension.prototype._loadNode = function (loader, context, node) { return false; };
            GLTFLoaderExtension.prototype._loadMaterial = function (loader, context, material, assign) { return false; };
            GLTFLoaderExtension.prototype._loadExtension = function (property, action) {
                var _this = this;
                if (!property.extensions) {
                    return false;
                }
                var extension = property.extensions[this.name];
                if (!extension) {
                    return false;
                }
                // Clear out the extension before executing the action to avoid recursing into the same property.
                property.extensions[this.name] = undefined;
                action(extension, function () {
                    // Restore the extension after completing the action.
                    property.extensions[_this.name] = extension;
                });
                return true;
            };
            GLTFLoaderExtension.TraverseNode = function (loader, context, node, action, parentNode) {
                return this._ApplyExtensions(function (extension) { return extension._traverseNode(loader, context, node, action, parentNode); });
            };
            GLTFLoaderExtension.LoadNode = function (loader, context, node) {
                return this._ApplyExtensions(function (extension) { return extension._loadNode(loader, context, node); });
            };
            GLTFLoaderExtension.LoadMaterial = function (loader, context, material, assign) {
                return this._ApplyExtensions(function (extension) { return extension._loadMaterial(loader, context, material, assign); });
            };
            GLTFLoaderExtension._ApplyExtensions = function (action) {
                var extensions = GLTFLoaderExtension._Extensions;
                if (!extensions) {
                    return;
                }
                for (var i = 0; i < extensions.length; i++) {
                    var extension = extensions[i];
                    if (extension.enabled && action(extension)) {
                        return true;
                    }
                }
                return false;
            };
            //
            // Utilities
            //
            GLTFLoaderExtension._Extensions = [];
            return GLTFLoaderExtension;
        }());
        GLTF2.GLTFLoaderExtension = GLTFLoaderExtension;
    })(GLTF2 = BABYLON.GLTF2 || (BABYLON.GLTF2 = {}));
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=babylon.glTFLoaderExtension.js.map

/// <reference path="../../../../../dist/preview release/babylon.d.ts"/>
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var BABYLON;
(function (BABYLON) {
    var GLTF2;
    (function (GLTF2) {
        var Extensions;
        (function (Extensions) {
            // See https://github.com/sbtron/glTF/tree/MSFT_lod/extensions/Vendor/MSFT_lod for more information about this extension.
            var MSFTLOD = (function (_super) {
                __extends(MSFTLOD, _super);
                function MSFTLOD() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                Object.defineProperty(MSFTLOD.prototype, "name", {
                    get: function () {
                        return "MSFT_lod";
                    },
                    enumerable: true,
                    configurable: true
                });
                MSFTLOD.prototype._traverseNode = function (loader, context, node, action, parentNode) {
                    return this._loadExtension(node, function (extension, onComplete) {
                        for (var i = extension.ids.length - 1; i >= 0; i--) {
                            var lodNode = GLTF2.GLTFUtils.GetArrayItem(loader._gltf.nodes, extension.ids[i]);
                            if (!lodNode) {
                                throw new Error(context + ": Failed to find node " + extension.ids[i]);
                            }
                            loader._traverseNode(context, lodNode, action, parentNode);
                        }
                        loader._traverseNode(context, node, action, parentNode);
                        onComplete();
                    });
                };
                MSFTLOD.prototype._loadNode = function (loader, context, node) {
                    var _this = this;
                    return this._loadExtension(node, function (extension, onComplete) {
                        var nodes = [node.index].concat(extension.ids).map(function (index) { return loader._gltf.nodes[index]; });
                        loader._addLoaderPendingData(node);
                        _this._loadNodeLOD(loader, context, nodes, nodes.length - 1, function () {
                            loader._removeLoaderPendingData(node);
                            onComplete();
                        });
                    });
                };
                MSFTLOD.prototype._loadNodeLOD = function (loader, context, nodes, index, onComplete) {
                    var _this = this;
                    loader._whenAction(function () {
                        loader._loadNode(context, nodes[index]);
                    }, function () {
                        if (index !== nodes.length - 1) {
                            var previousNode = nodes[index + 1];
                            previousNode.babylonMesh.setEnabled(false);
                        }
                        if (index === 0) {
                            onComplete();
                            return;
                        }
                        setTimeout(function () {
                            _this._loadNodeLOD(loader, context, nodes, index - 1, onComplete);
                        }, MSFTLOD.MinimalLODDelay);
                    });
                };
                MSFTLOD.prototype._loadMaterial = function (loader, context, material, assign) {
                    var _this = this;
                    return this._loadExtension(material, function (extension, onComplete) {
                        var materials = [material.index].concat(extension.ids).map(function (index) { return loader._gltf.materials[index]; });
                        loader._addLoaderPendingData(material);
                        _this._loadMaterialLOD(loader, context, materials, materials.length - 1, assign, function () {
                            material.extensions[_this.name] = extension;
                            loader._removeLoaderPendingData(material);
                            onComplete();
                        });
                    });
                };
                MSFTLOD.prototype._loadMaterialLOD = function (loader, context, materials, index, assign, onComplete) {
                    var _this = this;
                    loader._loadMaterial(context, materials[index], function (babylonMaterial, isNew) {
                        assign(babylonMaterial, isNew);
                        if (index === 0) {
                            onComplete();
                            return;
                        }
                        // Load the next LOD when the loader is ready to render and
                        // all active material textures of the current LOD are loaded.
                        loader._executeWhenRenderReady(function () {
                            BABYLON.BaseTexture.WhenAllReady(babylonMaterial.getActiveTextures(), function () {
                                setTimeout(function () {
                                    _this._loadMaterialLOD(loader, context, materials, index - 1, assign, onComplete);
                                }, MSFTLOD.MinimalLODDelay);
                            });
                        });
                    });
                };
                /**
                 * Specify the minimal delay between LODs in ms (default = 250)
                 */
                MSFTLOD.MinimalLODDelay = 250;
                return MSFTLOD;
            }(GLTF2.GLTFLoaderExtension));
            Extensions.MSFTLOD = MSFTLOD;
            GLTF2.GLTFLoader.RegisterExtension(new MSFTLOD());
        })(Extensions = GLTF2.Extensions || (GLTF2.Extensions = {}));
    })(GLTF2 = BABYLON.GLTF2 || (BABYLON.GLTF2 = {}));
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=MSFT_lod.js.map

/// <reference path="../../../../../dist/preview release/babylon.d.ts"/>
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var BABYLON;
(function (BABYLON) {
    var GLTF2;
    (function (GLTF2) {
        var Extensions;
        (function (Extensions) {
            var KHRMaterialsPbrSpecularGlossiness = (function (_super) {
                __extends(KHRMaterialsPbrSpecularGlossiness, _super);
                function KHRMaterialsPbrSpecularGlossiness() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                Object.defineProperty(KHRMaterialsPbrSpecularGlossiness.prototype, "name", {
                    get: function () {
                        return "KHR_materials_pbrSpecularGlossiness";
                    },
                    enumerable: true,
                    configurable: true
                });
                KHRMaterialsPbrSpecularGlossiness.prototype._loadMaterial = function (loader, context, material, assign) {
                    var _this = this;
                    return this._loadExtension(material, function (extension, onComplete) {
                        loader._createPbrMaterial(material);
                        loader._loadMaterialBaseProperties(context, material);
                        _this._loadSpecularGlossinessProperties(loader, context, material, extension);
                        assign(material.babylonMaterial, true);
                    });
                };
                KHRMaterialsPbrSpecularGlossiness.prototype._loadSpecularGlossinessProperties = function (loader, context, material, properties) {
                    var babylonMaterial = material.babylonMaterial;
                    babylonMaterial.albedoColor = properties.diffuseFactor ? BABYLON.Color3.FromArray(properties.diffuseFactor) : new BABYLON.Color3(1, 1, 1);
                    babylonMaterial.reflectivityColor = properties.specularFactor ? BABYLON.Color3.FromArray(properties.specularFactor) : new BABYLON.Color3(1, 1, 1);
                    babylonMaterial.microSurface = properties.glossinessFactor == null ? 1 : properties.glossinessFactor;
                    if (properties.diffuseTexture) {
                        var texture = GLTF2.GLTFUtils.GetArrayItem(loader._gltf.textures, properties.diffuseTexture.index);
                        if (!texture) {
                            throw new Error(context + ": Failed to find diffuse texture " + properties.diffuseTexture.index);
                        }
                        babylonMaterial.albedoTexture = loader._loadTexture("textures[" + texture.index + "]", texture, properties.diffuseTexture.texCoord);
                    }
                    if (properties.specularGlossinessTexture) {
                        var texture = GLTF2.GLTFUtils.GetArrayItem(loader._gltf.textures, properties.specularGlossinessTexture.index);
                        if (!texture) {
                            throw new Error(context + ": Failed to find diffuse texture " + properties.specularGlossinessTexture.index);
                        }
                        babylonMaterial.reflectivityTexture = loader._loadTexture("textures[" + texture.index + "]", texture, properties.specularGlossinessTexture.texCoord);
                        babylonMaterial.reflectivityTexture.hasAlpha = true;
                        babylonMaterial.useMicroSurfaceFromReflectivityMapAlpha = true;
                    }
                    loader._loadMaterialAlphaProperties(context, material, properties.diffuseFactor);
                };
                return KHRMaterialsPbrSpecularGlossiness;
            }(GLTF2.GLTFLoaderExtension));
            Extensions.KHRMaterialsPbrSpecularGlossiness = KHRMaterialsPbrSpecularGlossiness;
            GLTF2.GLTFLoader.RegisterExtension(new KHRMaterialsPbrSpecularGlossiness());
        })(Extensions = GLTF2.Extensions || (GLTF2.Extensions = {}));
    })(GLTF2 = BABYLON.GLTF2 || (BABYLON.GLTF2 = {}));
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=KHR_materials_pbrSpecularGlossiness.js.map
