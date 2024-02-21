"use strict";

var CABLES=CABLES||{};
CABLES.OPS=CABLES.OPS||{};

var Ops=Ops || {};
Ops.Gl=Ops.Gl || {};
Ops.Gl.Pbr=Ops.Gl.Pbr || {};
Ops.Gl.GLTF=Ops.Gl.GLTF || {};
Ops.Gl.Phong=Ops.Gl.Phong || {};
Ops.Gl.Meshes=Ops.Gl.Meshes || {};



// **************************************************************
// 
// Ops.Gl.GLTF.GltfDracoCompression
// 
// **************************************************************

Ops.Gl.GLTF.GltfDracoCompression = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
class DracoDecoderClass
{
    constructor()
    {
        this.workerLimit = 4;
        this.workerPool = [];
        this.workerNextTaskID = 1;
        this.workerSourceURL = "";

        this.config = {
            "wasm": Uint8Array.from(atob(DracoDecoderWASM), (c) => { return c.charCodeAt(0); }),
            "wrapper": DracoWASMWrapperCode,
            "decoderSettings": {},
        };

        const dracoWorker = this._DracoWorker.toString();
        const workerCode = dracoWorker.substring(dracoWorker.indexOf("{") + 1, dracoWorker.lastIndexOf("}"));

        const jsContent = this.config.wrapper;
        const body = [
            "/* draco decoder */",
            jsContent,
            "",
            "/* worker */",
            workerCode
        ].join("\n");

        this.workerSourceURL = URL.createObjectURL(new Blob([body]));
    }

    _getWorker(taskID, taskCost)
    {
        if (this.workerPool.length < this.workerLimit)
        {
            const worker = new Worker(this.workerSourceURL);
            worker._callbacks = {};
            worker._taskCosts = {};
            worker._taskLoad = 0;
            worker.postMessage({ "type": "init", "decoderConfig": this.config });
            worker.onmessage = (e) =>
            {
                const message = e.data;

                switch (message.type)
                {
                case "done":
                    worker._callbacks[message.taskID].finishedCallback(message.geometry);
                    break;

                case "error":
                    worker._callbacks[message.taskID].errorCallback(message);
                    break;

                default:
                    op.error("THREE.DRACOLoader: Unexpected message, \"" + message.type + "\"");
                }
                this._releaseTask(worker, message.taskID);
            };
            this.workerPool.push(worker);
        }
        else
        {
            this.workerPool.sort(function (a, b)
            {
                return a._taskLoad > b._taskLoad ? -1 : 1;
            });
        }

        const worker = this.workerPool[this.workerPool.length - 1];
        worker._taskCosts[taskID] = taskCost;
        worker._taskLoad += taskCost;
        return worker;
    }

    decodeGeometry(buffer, finishedCallback, errorCallback = null)
    {
        const taskID = this.workerNextTaskID++;
        const taskCost = buffer.byteLength;

        const worker = this._getWorker(taskID, taskCost);
        worker._callbacks[taskID] = { finishedCallback, errorCallback };
        worker.postMessage({ "type": "decode", "taskID": taskID, buffer }, [buffer]);
    }

    _releaseTask(worker, taskID)
    {
        worker._taskLoad -= worker._taskCosts[taskID];
        delete worker._callbacks[taskID];
        delete worker._taskCosts[taskID];
    }

    _DracoWorker()
    {
        let pendingDecoder;

        onmessage = function (e)
        {
            const message = e.data;
            switch (message.type)
            {
            case "init":
                const decoderConfig = message.decoderConfig;
                const moduleConfig = decoderConfig.decoderSettings;
                pendingDecoder = new Promise(function (resolve)
                {
                    moduleConfig.onModuleLoaded = function (draco)
                    {
                        // Module is Promise-like. Wrap before resolving to avoid loop.
                        resolve({ "draco": draco });
                    };
                    moduleConfig.wasmBinary = decoderConfig.wasm;
                    DracoDecoderModule(moduleConfig); // eslint-disable-line no-undef
                });
                break;
            case "decode":
                pendingDecoder.then((module) =>
                {
                    const draco = module.draco;

                    const f = new draco.Decoder();
                    const dataBuff = new Int8Array(message.buffer);

                    const geometryType = f.GetEncodedGeometryType(dataBuff);
                    const buffer = new draco.DecoderBuffer();
                    buffer.Init(dataBuff, dataBuff.byteLength);

                    let outputGeometry = new draco.Mesh();
                    const status = f.DecodeBufferToMesh(buffer, outputGeometry);
                    const attribute = f.GetAttributeByUniqueId(outputGeometry, 1);
                    const geometry = dracoAttributes(draco, f, outputGeometry, geometryType, name);

                    this.postMessage({ "type": "done", "taskID": message.taskID, "geometry": geometry });

                    draco.destroy(f);
                    draco.destroy(buffer);
                });
                break;
            }
        };

        let dracoAttributes = function (draco, decoder, dracoGeometry, geometryType, name)
        {
            const attributeIDs = {
                "position": draco.POSITION,
                "normal": draco.NORMAL,
                "color": draco.COLOR,
                "uv": draco.TEX_COORD,
                "joints": draco.GENERIC,
                "weights": draco.GENERIC,
            };
            const attributeTypes = {
                "position": "Float32Array",
                "normal": "Float32Array",
                "color": "Float32Array",
                "weights": "Float32Array",
                "joints": "Uint8Array",
                "uv": "Float32Array"
            };

            const geometry = {
                "index": null,
                "attributes": []
            };

            let count = 0;
            for (const attributeName in attributeIDs)
            {
                const attributeType = attributeTypes[attributeName];
                let attributeID = decoder.GetAttributeId(dracoGeometry, attributeIDs[attributeName]);

                count++;
                if (attributeID != -1)
                {
                    let attribute = decoder.GetAttribute(dracoGeometry, attributeID);
                    geometry.attributes.push(decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute));
                }
            }

            if (geometryType === draco.TRIANGULAR_MESH) geometry.index = decodeIndex(draco, decoder, dracoGeometry);
            else op.warn("unknown draco geometryType", geometryType);

            draco.destroy(dracoGeometry);
            return geometry;
        };

        let decodeIndex = function (draco, decoder, dracoGeometry)
        {
            const numFaces = dracoGeometry.num_faces();
            const numIndices = numFaces * 3;
            const byteLength = numIndices * 4;
            const ptr = draco._malloc(byteLength);

            decoder.GetTrianglesUInt32Array(dracoGeometry, byteLength, ptr);
            const index = new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice();

            draco._free(ptr);

            return {
                "array": index,
                "itemSize": 1
            };
        };

        let decodeAttribute = function (draco, decoder, dracoGeometry, attributeName, attributeType, attribute)
        {
            let bytesPerElement = 4;
            if (attributeType === "Float32Array") bytesPerElement = 4;
            else if (attributeType === "Uint8Array") bytesPerElement = 1;
            else op.warn("unknown attrtype bytesPerElement", attributeType);

            const numComponents = attribute.num_components();
            const numPoints = dracoGeometry.num_points();
            const numValues = numPoints * numComponents;
            const byteLength = numValues * bytesPerElement;
            const dataType = getDracoDataType(draco, attributeType);
            const ptr = draco._malloc(byteLength);
            let array = null;

            decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, dataType, byteLength, ptr);

            if (attributeType === "Float32Array") array = new Float32Array(draco.HEAPF32.buffer, ptr, numValues).slice();
            else if (attributeType === "Uint8Array") array = new Uint8Array(draco.HEAPF32.buffer, ptr, numValues).slice();
            else op.warn("unknown attrtype", attributeType);

            draco._free(ptr);

            return {
                "name": attributeName,
                "array": array,
                "itemSize": numComponents
            };
        };

        let getDracoDataType = function (draco, attributeType)
        {
            switch (attributeType)
            {
            case "Float32Array": return draco.DT_FLOAT32;
            case "Int8Array": return draco.DT_INT8;
            case "Int16Array": return draco.DT_INT16;
            case "Int32Array": return draco.DT_INT32;
            case "Uint8Array": return draco.DT_UINT8;
            case "Uint16Array": return draco.DT_UINT16;
            case "Uint32Array": return draco.DT_UINT32;
            }
        };
    }
}

window.DracoDecoder = new DracoDecoderClass();


};

Ops.Gl.GLTF.GltfDracoCompression.prototype = new CABLES.Op();
CABLES.OPS["4ecdc2ef-a242-4548-ad74-13f617119a64"]={f:Ops.Gl.GLTF.GltfDracoCompression,objName:"Ops.Gl.GLTF.GltfDracoCompression"};




// **************************************************************
// 
// Ops.Gl.Pbr.PbrMaterial
// 
// **************************************************************

Ops.Gl.Pbr.PbrMaterial = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"BasicPBR_frag":"precision highp float;\nprecision highp int;\n{{MODULES_HEAD}}\n\n#ifndef PI\n#define PI 3.14159265358\n#endif\n\n// set by cables\nUNI vec3 camPos;\n// utility maps\n#ifdef USE_ENVIRONMENT_LIGHTING\n    UNI sampler2D IBL_BRDF_LUT;\n#endif\n// mesh maps\n#ifdef USE_ALBEDO_TEX\n    UNI sampler2D _AlbedoMap;\n#else\n    UNI vec4 _Albedo;\n#endif\n#ifdef USE_NORMAL_TEX\n    UNI sampler2D _NormalMap;\n#endif\n#ifdef USE_EMISSION\n    UNI sampler2D _EmissionMap;\n#endif\n#ifdef USE_HEIGHT_TEX\n    UNI sampler2D _HeightMap;\n#endif\n#ifdef USE_THIN_FILM_MAP\n    UNI sampler2D _ThinFilmMap;\n    UNI float _TFThicknessTexMin;\n    UNI float _TFThicknessTexMax;\n#endif\n#ifdef USE_AORM_TEX\n    UNI sampler2D _AORMMap;\n#else\n    UNI float _Roughness;\n    UNI float _Metalness;\n#endif\n#ifdef USE_LIGHTMAP\n    #ifndef VERTEX_COLORS\n        UNI sampler2D _Lightmap;\n    #else\n        #ifndef VCOL_LIGHTMAP\n            UNI sampler2D _Lightmap;\n        #endif\n    #endif\n#endif\n#ifdef USE_CLEAR_COAT\n    UNI float _ClearCoatIntensity;\n    UNI float _ClearCoatRoughness;\n    #ifdef USE_CC_NORMAL_MAP\n        #ifndef USE_NORMAL_MAP_FOR_CC\n            UNI sampler2D _CCNormalMap;\n        #endif\n    #endif\n#endif\n#ifdef USE_THIN_FILM\n    UNI float _ThinFilmIntensity;\n    UNI float _ThinFilmIOR;\n    UNI float _ThinFilmThickness;\n#endif\n// IBL inputs\n#ifdef USE_ENVIRONMENT_LIGHTING\n    UNI samplerCube _irradiance;\n    UNI samplerCube _prefilteredEnvironmentColour;\n    UNI float MAX_REFLECTION_LOD;\n    UNI float diffuseIntensity;\n    UNI float specularIntensity;\n    UNI float envIntensity;\n#endif\n#ifdef USE_LIGHTMAP\n    UNI float lightmapIntensity;\n#endif\nUNI float tonemappingExposure;\n#ifdef USE_HEIGHT_TEX\n    UNI float _HeightDepth;\n    #ifndef USE_OPTIMIZED_HEIGHT\n        UNI mat4 modelMatrix;\n    #endif\n#endif\n#ifdef USE_PARALLAX_CORRECTION\n    UNI vec3 _PCOrigin;\n    UNI vec3 _PCboxMin;\n    UNI vec3 _PCboxMax;\n#endif\n#ifdef USE_EMISSION\n    UNI float _EmissionIntensity;\n#endif\nIN vec2 texCoord;\n#ifdef USE_LIGHTMAP\n    #ifndef ATTRIB_texCoord1\n    #ifndef VERTEX_COLORS\n        IN vec2 texCoord1;\n    #else\n        #ifndef VCOL_LIGHTMAP\n            IN vec2 texCoord1;\n        #endif\n    #endif\n    #endif\n#endif\nIN vec4 FragPos;\nIN mat3 TBN;\nIN vec3 norm;\nIN vec3 normM;\n#ifdef VERTEX_COLORS\n    IN vec4 vertCol;\n#endif\n#ifdef USE_HEIGHT_TEX\n    #ifdef USE_OPTIMIZED_HEIGHT\n        IN vec3 fragTangentViewDir;\n    #else\n        IN mat3 invTBN;\n    #endif\n#endif\n\n\n// structs\nstruct Light {\n    vec3 color;\n    vec3 position;\n    vec3 specular;\n\n    #define INTENSITY x\n    #define ATTENUATION y\n    #define FALLOFF z\n    #define RADIUS w\n    vec4 lightProperties;\n\n    int castLight;\n\n    vec3 conePointAt;\n    #define COSCONEANGLE x\n    #define COSCONEANGLEINNER y\n    #define SPOTEXPONENT z\n    vec3 spotProperties;\n};\n\n\n#ifdef WEBGL1\n    #ifdef GL_EXT_shader_texture_lod\n        #define textureLod textureCubeLodEXT\n    #endif\n#endif\n#define SAMPLETEX textureLod\n\n// https://community.khronos.org/t/addition-of-two-hdr-rgbe-values/55669\nhighp vec4 EncodeRGBE8(highp vec3 rgb)\n{\n    highp vec4 vEncoded;\n    float maxComponent = max(max(rgb.r, rgb.g), rgb.b);\n    float fExp = ceil(log2(maxComponent));\n    vEncoded.rgb = rgb / exp2(fExp);\n    vEncoded.a = (fExp + 128.0) / 255.0;\n    return vEncoded;\n}\n// https://enkimute.github.io/hdrpng.js/\nhighp vec3 DecodeRGBE8(highp vec4 rgbe)\n{\n    highp vec3 vDecoded = rgbe.rgb * pow(2.0, rgbe.a * 255.0-128.0);\n    return vDecoded;\n}\n\n// from https://github.com/BabylonJS/Babylon.js/blob/master/src/Shaders/ShadersInclude/pbrIBLFunctions.fx\nfloat environmentRadianceOcclusion(float ambientOcclusion, float NdotVUnclamped) {\n    // Best balanced (implementation time vs result vs perf) analytical environment specular occlusion found.\n    // http://research.tri-ace.com/Data/cedec2011_RealtimePBR_Implementation_e.pptx\n    float temp = NdotVUnclamped + ambientOcclusion;\n    return clamp(temp * temp - 1.0 + ambientOcclusion, 0.0, 1.0);\n}\nfloat environmentHorizonOcclusion(vec3 view, vec3 normal, vec3 geometricNormal) {\n    // http://marmosetco.tumblr.com/post/81245981087\n    vec3 reflection = reflect(view, normal);\n    float temp = clamp(1.0 + 1.1 * dot(reflection, geometricNormal), 0.0, 1.0);\n    return temp * temp;\n}\n#ifdef ALPHA_DITHERED\n// from https://github.com/google/filament/blob/main/shaders/src/dithering.fs\n// modified to use this to discard based on factor instead of dithering\nfloat interleavedGradientNoise(highp vec2 n) {\n    return fract(52.982919 * fract(dot(vec2(0.06711, 0.00584), n)));\n}\nfloat Dither_InterleavedGradientNoise(float a) {\n    // Jimenez 2014, \"Next Generation Post-Processing in Call of Duty\"\n    highp vec2 uv = gl_FragCoord.xy;\n\n    // The noise variable must be highp to workaround Adreno bug #1096.\n    highp float noise = interleavedGradientNoise(uv);\n\n    return step(noise, a);\n}\n#endif\n\n#ifdef USE_HEIGHT_TEX\n#ifndef WEBGL1\n// based on Jasper Flicks great tutorials (:\nfloat getSurfaceHeight(sampler2D surfaceHeightMap, vec2 UV)\n{\n\treturn texture(surfaceHeightMap, UV).r;\n}\n\nvec2 RaymarchedParallax(vec2 UV, sampler2D surfaceHeightMap, float strength, vec3 viewDir)\n{\n    #ifndef USE_OPTIMIZED_HEIGHT\n\t#define PARALLAX_RAYMARCHING_STEPS 50\n    #else\n    #define PARALLAX_RAYMARCHING_STEPS 20\n    #endif\n\tvec2 uvOffset = vec2(0.0);\n\tfloat stepSize = 1.0 / float(PARALLAX_RAYMARCHING_STEPS);\n\tvec2 uvDelta = vec2(viewDir * (stepSize * strength));\n\tfloat stepHeight = 1.0;\n\tfloat surfaceHeight = getSurfaceHeight(surfaceHeightMap, UV);\n\n\tvec2 prevUVOffset = uvOffset;\n\tfloat prevStepHeight = stepHeight;\n\tfloat prevSurfaceHeight = surfaceHeight;\n\n    // doesnt work with webgl 1.0 as the && condition is not fixed length for loop\n\tfor (int i = 1; i < PARALLAX_RAYMARCHING_STEPS && stepHeight > surfaceHeight; ++i)\n\t{\n\t\tprevUVOffset = uvOffset;\n\t\tprevStepHeight = stepHeight;\n\t\tprevSurfaceHeight = surfaceHeight;\n\n\t\tuvOffset -= uvDelta;\n\t\tstepHeight -= stepSize;\n\t\tsurfaceHeight = getSurfaceHeight(surfaceHeightMap, UV + uvOffset);\n\t}\n\n\tfloat prevDifference = prevStepHeight - prevSurfaceHeight;\n\tfloat difference = surfaceHeight - stepHeight;\n\tfloat t = prevDifference / (prevDifference + difference);\n\tuvOffset = mix(prevUVOffset, uvOffset, t);\n\treturn uvOffset;\n}\n#endif // TODO: use non raymarched parallax mapping here if webgl 1.0?\n#endif\n\n#ifdef USE_PARALLAX_CORRECTION\nvec3 BoxProjection(vec3 direction, vec3 position, vec3 cubemapPosition, vec3 boxMin, vec3 boxMax)\n{\n\tboxMin -= position;\n\tboxMax -= position;\n\tfloat x = (direction.x > 0.0 ? boxMax.x : boxMin.x) / direction.x;\n\tfloat y = (direction.y > 0.0 ? boxMax.y : boxMin.y) / direction.y;\n\tfloat z = (direction.z > 0.0 ? boxMax.z : boxMin.z) / direction.z;\n\tfloat scalar = min(min(x, y), z);\n\n\treturn direction * scalar + (position - cubemapPosition);\n}\n#endif\n\n#ifdef USE_THIN_FILM\n// section from https://github.com/BabylonJS/Babylon.js/blob/8a5077e0efb4ba471d16f7cd010fe6124ea8d005/packages/dev/core/src/Shaders/ShadersInclude/pbrBRDFFunctions.fx\n// helper functions from https://github.com/BabylonJS/Babylon.js/blob/8a5077e0efb4ba471d16f7cd010fe6124ea8d005/packages/dev/core/src/Shaders/ShadersInclude/helperFunctions.fx\nfloat square(float value)\n{\n    return value * value;\n}\nvec3 square(vec3 value)\n{\n    return value * value;\n}\nfloat pow5(float value) {\n    float sq = value * value;\n    return sq * sq * value;\n}\nconst mat3 XYZ_TO_REC709 = mat3(\n     3.2404542, -0.9692660,  0.0556434,\n    -1.5371385,  1.8760108, -0.2040259,\n    -0.4985314,  0.0415560,  1.0572252\n);\n// Assume air interface for top\n// Note: We don't handle the case fresnel0 == 1\nvec3 getIORTfromAirToSurfaceR0(vec3 f0) {\n    vec3 sqrtF0 = sqrt(f0);\n    return (1. + sqrtF0) / (1. - sqrtF0);\n}\n\n// Conversion FO/IOR\nvec3 getR0fromIORs(vec3 iorT, float iorI) {\n    return square((iorT - vec3(iorI)) / (iorT + vec3(iorI)));\n}\n\nfloat getR0fromIORs(float iorT, float iorI) {\n    return square((iorT - iorI) / (iorT + iorI));\n}\n\n// Fresnel equations for dielectric/dielectric interfaces.\n// Ref: https://belcour.github.io/blog/research/publication/2017/05/01/brdf-thin-film.html\n// Evaluation XYZ sensitivity curves in Fourier space\nvec3 evalSensitivity(float opd, vec3 shift) {\n    float phase = 2.0 * PI * opd * 1.0e-9;\n\n    const vec3 val = vec3(5.4856e-13, 4.4201e-13, 5.2481e-13);\n    const vec3 pos = vec3(1.6810e+06, 1.7953e+06, 2.2084e+06);\n    const vec3 var = vec3(4.3278e+09, 9.3046e+09, 6.6121e+09);\n\n    vec3 xyz = val * sqrt(2.0 * PI * var) * cos(pos * phase + shift) * exp(-square(phase) * var);\n    xyz.x += 9.7470e-14 * sqrt(2.0 * PI * 4.5282e+09) * cos(2.2399e+06 * phase + shift[0]) * exp(-4.5282e+09 * square(phase));\n    xyz /= 1.0685e-7;\n\n    vec3 srgb = XYZ_TO_REC709 * xyz;\n    return srgb;\n}\n// from https://github.com/BabylonJS/Babylon.js/blob/8a5077e0efb4ba471d16f7cd010fe6124ea8d005/packages/dev/core/src/Shaders/ShadersInclude/pbrBRDFFunctions.fx\nvec3 fresnelSchlickGGX(float VdotH, vec3 reflectance0, vec3 reflectance90)\n{\n    return reflectance0 + (reflectance90 - reflectance0) * pow5(1.0 - VdotH);\n}\nfloat fresnelSchlickGGX(float VdotH, float reflectance0, float reflectance90)\n{\n    return reflectance0 + (reflectance90 - reflectance0) * pow5(1.0 - VdotH);\n}\nvec3 evalIridescence(float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0) {\n    vec3 I = vec3(1.0);\n\n    // Force iridescenceIOR -> outsideIOR when thinFilmThickness -> 0.0\n    float iridescenceIOR = mix(outsideIOR, eta2, smoothstep(0.0, 0.03, thinFilmThickness));\n    // Evaluate the cosTheta on the base layer (Snell law)\n    float sinTheta2Sq = square(outsideIOR / iridescenceIOR) * (1.0 - square(cosTheta1));\n\n    // Handle TIR:\n    float cosTheta2Sq = 1.0 - sinTheta2Sq;\n    if (cosTheta2Sq < 0.0) {\n        return I;\n    }\n\n    float cosTheta2 = sqrt(cosTheta2Sq);\n\n    // First interface\n    float R0 = getR0fromIORs(iridescenceIOR, outsideIOR);\n    float R12 = fresnelSchlickGGX(cosTheta1, R0, 1.);\n    float R21 = R12;\n    float T121 = 1.0 - R12;\n    float phi12 = 0.0;\n    if (iridescenceIOR < outsideIOR) phi12 = PI;\n    float phi21 = PI - phi12;\n\n    // Second interface\n    vec3 baseIOR = getIORTfromAirToSurfaceR0(clamp(baseF0, 0.0, 0.9999)); // guard against 1.0\n    vec3 R1 = getR0fromIORs(baseIOR, iridescenceIOR);\n    vec3 R23 = fresnelSchlickGGX(cosTheta2, R1, vec3(1.));\n    vec3 phi23 = vec3(0.0);\n    if (baseIOR[0] < iridescenceIOR) phi23[0] = PI;\n    if (baseIOR[1] < iridescenceIOR) phi23[1] = PI;\n    if (baseIOR[2] < iridescenceIOR) phi23[2] = PI;\n\n    // Phase shift\n    float opd = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;\n    vec3 phi = vec3(phi21) + phi23;\n\n    // Compound terms\n    vec3 R123 = clamp(R12 * R23, 1e-5, 0.9999);\n    vec3 r123 = sqrt(R123);\n    vec3 Rs = square(T121) * R23 / (vec3(1.0) - R123);\n\n    // Reflectance term for m = 0 (DC term amplitude)\n    vec3 C0 = R12 + Rs;\n    I = C0;\n\n    // Reflectance term for m > 0 (pairs of diracs)\n    vec3 Cm = Rs - T121;\n    for (int m = 1; m <= 2; ++m)\n    {\n        Cm *= r123;\n        vec3 Sm = 2.0 * evalSensitivity(float(m) * opd, float(m) * phi);\n        I += Cm * Sm;\n    }\n\n    // Since out of gamut colors might be produced, negative color values are clamped to 0.\n    return max(I, vec3(0.0));\n}\n#endif\n\n{{PBR_FRAGMENT_HEAD}}\nvoid main()\n{\n    vec4 col;\n\n    // set up interpolated vertex data\n    vec2 UV0             = texCoord;\n    #ifdef USE_LIGHTMAP\n        #ifndef VERTEX_COLORS\n            vec2 UV1             = texCoord1;\n        #else\n            #ifndef VCOL_LIGHTMAP\n                vec2 UV1             = texCoord1;\n            #endif\n        #endif\n    #endif\n    vec3 V               = normalize(camPos - FragPos.xyz);\n\n    #ifdef USE_HEIGHT_TEX\n        #ifndef USE_OPTIMIZED_HEIGHT\n            vec3 fragTangentViewDir = normalize(invTBN * (camPos - FragPos.xyz));\n        #endif\n        #ifndef WEBGL1\n            UV0 += RaymarchedParallax(UV0, _HeightMap, _HeightDepth * 0.1, fragTangentViewDir);\n        #endif\n    #endif\n\n    // load relevant mesh maps\n    #ifdef USE_ALBEDO_TEX\n        vec4 AlbedoMap   = texture(_AlbedoMap, UV0);\n    #else\n        vec4 AlbedoMap   = _Albedo;\n    #endif\n    #ifdef ALPHA_MASKED\n\tif ( AlbedoMap.a <= 0.5 )\n\t    discard;\n\t#endif\n\n\t#ifdef ALPHA_DITHERED\n\tif ( Dither_InterleavedGradientNoise(AlbedoMap.a) <= 0.5 )\n\t    discard;\n\t#endif\n\n    #ifdef USE_AORM_TEX\n        vec4 AORM        = texture(_AORMMap, UV0);\n    #else\n        vec4 AORM        = vec4(1.0, _Roughness, _Metalness, 1.0);\n    #endif\n    #ifdef USE_NORMAL_TEX\n        vec3 internalNormals = texture(_NormalMap, UV0).rgb;\n        internalNormals      = internalNormals * 2.0 - 1.0;\n        internalNormals      = normalize(TBN * internalNormals);\n    #else\n        vec3 internalNormals = normM;\n    #endif\n\t#ifdef USE_LIGHTMAP\n    \t#ifndef VERTEX_COLORS\n\t        #ifndef LIGHTMAP_IS_RGBE\n                vec3 Lightmap = texture(_Lightmap, UV1).rgb;\n            #else\n                vec3 Lightmap = DecodeRGBE8(texture(_Lightmap, UV1));\n            #endif\n        #else\n            #ifdef VCOL_LIGHTMAP\n                vec3 Lightmap = pow(vertCol.rgb, vec3(2.2));\n            #else\n  \t            #ifndef LIGHTMAP_IS_RGBE\n                    vec3 Lightmap = texture(_Lightmap, UV1).rgb;\n                #else\n                    vec3 Lightmap = DecodeRGBE8(texture(_Lightmap, UV1));\n                #endif\n            #endif\n        #endif\n    #endif\n    // initialize texture values\n    float AO             = AORM.r;\n    float specK          = AORM.g;\n    float metalness      = AORM.b;\n    vec3  N              = normalize(internalNormals);\n    vec3  albedo         = pow(AlbedoMap.rgb, vec3(2.2));\n\n    #ifdef VERTEX_COLORS\n        #ifdef VCOL_COLOUR\n            albedo.rgb *= pow(vertCol.rgb, vec3(2.2));\n            AlbedoMap.rgb *= pow(vertCol.rgb, vec3(2.2));\n        #endif\n        #ifdef VCOL_AORM\n            AO = vertCol.r;\n            specK = vertCol.g;\n            metalness = vertCol.b;\n        #endif\n        #ifdef VCOL_AO\n            AO = vertCol.r;\n        #endif\n        #ifdef VCOL_R\n            specK = vertCol.g;\n        #endif\n        #ifdef VCOL_M\n            metalness = vertCol.b;\n        #endif\n    #endif\n\n    // set up values for later calculations\n    float NdotV          = abs(dot(N, V));\n    vec3  F0             = mix(vec3(0.04), AlbedoMap.rgb, metalness);\n\n    #ifdef USE_THIN_FILM\n        #ifndef USE_THIN_FILM_MAP\n            vec3 iridescenceFresnel = evalIridescence(1.0, _ThinFilmIOR, NdotV, _ThinFilmThickness, F0);\n            F0 = mix(F0, iridescenceFresnel, _ThinFilmIntensity);\n        #else\n            vec3 ThinFilmParameters = texture(_ThinFilmMap, UV0).rgb;\n            vec3 iridescenceFresnel = evalIridescence(1.0, 1.0 / ThinFilmParameters.b, NdotV, mix(_TFThicknessTexMin, _TFThicknessTexMax, ThinFilmParameters.g), F0);\n            F0 = mix(F0, iridescenceFresnel, ThinFilmParameters.r);\n        #endif\n    #endif\n\n    #ifndef WEBGL1\n        #ifndef DONT_USE_GR\n            // from https://github.com/BabylonJS/Babylon.js/blob/5e6321d887637877d8b28b417410abbbeb651c6e/src/Shaders/ShadersInclude/pbrHelperFunctions.fx\n            // modified to fit variable names\n            #ifndef DONT_USE_NMGR\n                vec3 nDfdx = dFdx(normM.xyz);\n                vec3 nDfdy = dFdy(normM.xyz);\n            #else\n                vec3 nDfdx = dFdx(N.xyz) + dFdx(normM.xyz);\n                vec3 nDfdy = dFdy(N.xyz) + dFdy(normM.xyz);\n            #endif\n            float slopeSquare = max(dot(nDfdx, nDfdx), dot(nDfdy, nDfdy));\n\n            // Vive analytical lights roughness factor.\n            float geometricRoughnessFactor = pow(clamp(slopeSquare, 0.0, 1.0), 0.333);\n\n            specK = max(specK, geometricRoughnessFactor);\n            #endif\n        #endif\n\n    \t// IBL\n    \t// from https://github.com/google/filament/blob/df6a100fcba66d9c99328a49d41fe3adecc0165d/shaders/src/light_indirect.fs\n    \t// and https://github.com/google/filament/blob/df6a100fcba66d9c99328a49d41fe3adecc0165d/shaders/src/shading_lit.fs\n    \t// modified to fit structure/variable names\n    \t#ifdef USE_ENVIRONMENT_LIGHTING\n        \tvec2 envBRDF = texture(IBL_BRDF_LUT, vec2(NdotV, specK)).xy;\n        \tvec3 E = mix(envBRDF.xxx, envBRDF.yyy, F0);\n        #endif\n\n        float specOcclusion    = environmentRadianceOcclusion(AO, NdotV);\n        float horizonOcclusion = environmentHorizonOcclusion(-V, N, normM);\n\n        #ifdef USE_ENVIRONMENT_LIGHTING\n            float envSampleSpecK = specK * MAX_REFLECTION_LOD;\n            vec3  R = reflect(-V, N);\n\n            #ifdef USE_PARALLAX_CORRECTION\n                R = BoxProjection(R, FragPos.xyz, _PCOrigin, _PCboxMin, _PCboxMax);\n            #endif\n\n    \t    vec3 prefilteredEnvColour = DecodeRGBE8(SAMPLETEX(_prefilteredEnvironmentColour, R, envSampleSpecK)) * specularIntensity*envIntensity;\n\n        \tvec3 Fr = E * prefilteredEnvColour;\n        \tFr *= specOcclusion * horizonOcclusion * (1.0 + F0 * (1.0 / envBRDF.y - 1.0));\n        \tFr *= 1.0 + F0; // TODO: this might be wrong, figure this out\n\n        \t#ifdef USE_LIGHTMAP\n                vec3 IBLIrradiance = Lightmap * lightmapIntensity;\n            #else\n                vec3 IBLIrradiance = DecodeRGBE8(SAMPLETEX(_irradiance, N, 0.0)) * diffuseIntensity*envIntensity;\n        #endif\n\n\t    vec3 Fd = (1.0 - metalness) * albedo * IBLIrradiance * (1.0 - E) * AO;\n    #endif\n    vec3 directLighting = vec3(0.0);\n\n    {{PBR_FRAGMENT_BODY}}\n\n    // combine IBL\n    col.rgb = directLighting;\n    #ifdef USE_ENVIRONMENT_LIGHTING\n\n        col.rgb += Fr + Fd;\n\n        #ifdef USE_CLEAR_COAT\n            float CCEnvSampleSpecK = _ClearCoatRoughness * MAX_REFLECTION_LOD;\n            #ifndef USE_NORMAL_MAP_FOR_CC\n                #ifndef USE_CC_NORMAL_MAP\n                    vec3 CCR = reflect(-V, normM);\n                #else\n                    vec3 CCN = texture(_CCNormalMap, UV0).rgb;\n                    CCN      = CCN * 2.0 - 1.0;\n                    CCN      = normalize(TBN * CCN);\n                    vec3 CCR = reflect(-V, CCN);\n                #endif\n                #ifdef USE_PARALLAX_CORRECTION\n                    CCR = BoxProjection(CCR, FragPos.xyz, _PCOrigin, _PCboxMin, _PCboxMax);\n                #endif\n            #endif\n            #ifndef USE_NORMAL_MAP_FOR_CC\n        \t    vec3 CCPrefilteredEnvColour = DecodeRGBE8(SAMPLETEX(_prefilteredEnvironmentColour, CCR, CCEnvSampleSpecK));\n        \t#else\n        \t    vec3 CCPrefilteredEnvColour = DecodeRGBE8(SAMPLETEX(_prefilteredEnvironmentColour, R, CCEnvSampleSpecK));\n        \t#endif\n        \tvec3 CCFr = E * CCPrefilteredEnvColour;\n        \tCCFr *= specOcclusion * horizonOcclusion * (0.96 + (0.04 / envBRDF.y));\n        \tCCFr *= 1.04;\n        \tcol.rgb += CCFr * _ClearCoatIntensity*envIntensity;\n        #endif\n    #else\n        #ifdef USE_LIGHTMAP\n            col.rgb += (1.0 - metalness) * albedo * Lightmap * lightmapIntensity;\n        #endif\n    #endif\n    #ifdef USE_EMISSION\n    col.rgb += texture(_EmissionMap, UV0).rgb * _EmissionIntensity;\n    #endif\n    col.a   = 1.0;\n\n    #ifdef ALPHA_BLEND\n        col.a = AlbedoMap.a;\n    #endif\n\n    // from https://github.com/BabylonJS/Babylon.js/blob/5e6321d887637877d8b28b417410abbbeb651c6e/src/Shaders/tonemap.fragment.fx\n    // modified to fit variable names\n    #ifdef TONEMAP_HejiDawson\n        col.rgb *= tonemappingExposure;\n\n        vec3 X = max(vec3(0.0, 0.0, 0.0), col.rgb - 0.004);\n        vec3 retColor = (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);\n\n        col.rgb = retColor * retColor;\n    #elif defined(TONEMAP_Photographic)\n        col.rgb =  vec3(1.0, 1.0, 1.0) - exp2(-tonemappingExposure * col.rgb);\n    #else\n        col.rgb *= tonemappingExposure;\n        //col.rgb = clamp(col.rgb, vec3(0.0), vec3(1.0));\n    #endif\n\n    col.rgb = pow(col.rgb, vec3(1.0/2.2));\n    {{MODULE_COLOR}}\n\n    outColor = col;\n}\n","BasicPBR_vert":"precision highp float;\nprecision highp int;\n\nUNI vec3 camPos;\n\nIN vec3  vPosition;\nIN vec2  attrTexCoord;\n#ifdef USE_LIGHTMAP\n    #ifndef ATTRIB_attrTexCoord1\n        IN vec2 attrTexCoord1;\n        OUT vec2 texCoord1;\n        #define ATTRIB_attrTexCoord1\n        #define ATTRIB_texCoord1\n    #endif\n#endif\nIN vec3  attrVertNormal;\nIN vec3  attrTangent;\nIN vec3  attrBiTangent;\nIN float attrVertIndex;\n#ifdef VERTEX_COLORS\nIN vec4 attrVertColor;\n#endif\n\n{{MODULES_HEAD}}\n\nOUT vec2 texCoord;\n\nOUT vec4 FragPos;\nOUT mat3 TBN;\nOUT vec3 norm;\nOUT vec3 normM;\n#ifdef VERTEX_COLORS\nOUT vec4 vertCol;\n#endif\n#ifdef USE_HEIGHT_TEX\n#ifdef USE_OPTIMIZED_HEIGHT\nOUT vec3 fragTangentViewDir;\n#else\nOUT mat3 invTBN;\n#endif\n#endif\nUNI mat4 projMatrix;\nUNI mat4 viewMatrix;\nUNI mat4 modelMatrix;\n\nvoid main()\n{\n    mat4 mMatrix = modelMatrix; // needed to make vertex effects work\n    #ifdef USE_LIGHTMAP\n        texCoord1 = attrTexCoord1;\n    #endif\n    texCoord = attrTexCoord;\n    texCoord.y = 1.0 - texCoord.y;\n    vec4 pos = vec4(vPosition,  1.0);\n    norm = attrVertNormal;\n    vec3 tangent = attrTangent;\n    vec3 bitangent = attrBiTangent;\n\n    {{MODULE_VERTEX_POSITION}}\n\n\n    mat4 theMMat=mMatrix;\n    #ifdef INSTANCING\n        #ifdef TEXINSTMAT\n            theMMat = texInstMat;\n        #endif\n        #ifndef TEXINSTMAT\n            theMMat = instMat;\n        #endif\n    #endif\n\n    FragPos = theMMat * pos;\n\n    tangent = normalize(vec3(theMMat * vec4(tangent,    0.0)));\n    vec3 N = normalize(vec3(theMMat * vec4(norm, 0.0)));\n    bitangent = normalize(vec3(theMMat * vec4(bitangent,  0.0)));\n\n    #ifdef VERTEX_COLORS\n        vertCol = attrVertColor;\n    #endif\n\n    TBN = mat3(tangent, bitangent, N);\n\n    #ifdef USE_HEIGHT_TEX\n    #ifndef WEBGL1\n    #ifdef USE_OPTIMIZED_HEIGHT\n    fragTangentViewDir = normalize(transpose(TBN) * (camPos - FragPos.xyz));\n    #else\n    invTBN = transpose(TBN);\n    #endif\n    #endif\n    #endif\n\n    normM = N;\n    gl_Position = projMatrix * (viewMatrix*mMatrix) * pos;\n}\n","light_body_directional_frag":"\nvec3 L{{LIGHT_INDEX}} = normalize(lightOP{{LIGHT_INDEX}}.position);\n#ifdef USE_ENVIRONMENT_LIGHTING\ndirectLighting += evaluateLighting(lightOP{{LIGHT_INDEX}}, L{{LIGHT_INDEX}}, FragPos, V, N, albedo, specK, NdotV, F0, envBRDF.y, AO, false);\n#else\ndirectLighting += evaluateLighting(lightOP{{LIGHT_INDEX}}, L{{LIGHT_INDEX}}, FragPos, V, N, albedo, specK, NdotV, F0, AO, false);\n#endif\n","light_body_point_frag":"\nvec3 L{{LIGHT_INDEX}} = normalize(lightOP{{LIGHT_INDEX}}.position - FragPos.xyz);\n#ifdef USE_ENVIRONMENT_LIGHTING\ndirectLighting += evaluateLighting(lightOP{{LIGHT_INDEX}}, L{{LIGHT_INDEX}}, FragPos, V, N, albedo, specK, NdotV, F0, envBRDF.y, AO, true);\n#else\ndirectLighting += evaluateLighting(lightOP{{LIGHT_INDEX}}, L{{LIGHT_INDEX}}, FragPos, V, N, albedo, specK, NdotV, F0, AO, true);\n#endif\n","light_body_spot_frag":"\nvec3 L{{LIGHT_INDEX}} = normalize(lightOP{{LIGHT_INDEX}}.position - FragPos.xyz);\nfloat spotIntensity{{LIGHT_INDEX}} = CalculateSpotLightEffect(\n    lightOP{{LIGHT_INDEX}}.position, lightOP{{LIGHT_INDEX}}.conePointAt, lightOP{{LIGHT_INDEX}}.spotProperties.COSCONEANGLE,\n    lightOP{{LIGHT_INDEX}}.spotProperties.COSCONEANGLEINNER, lightOP{{LIGHT_INDEX}}.spotProperties.SPOTEXPONENT,\n    L{{LIGHT_INDEX}}\n);\n#ifdef USE_ENVIRONMENT_LIGHTING\ndirectLighting += evaluateLighting(lightOP{{LIGHT_INDEX}}, L{{LIGHT_INDEX}}, FragPos, V, N, albedo, specK, NdotV, F0, envBRDF.y, AO * spotIntensity{{LIGHT_INDEX}}, true);\n#else\ndirectLighting += evaluateLighting(lightOP{{LIGHT_INDEX}}, L{{LIGHT_INDEX}}, FragPos, V, N, albedo, specK, NdotV, F0, AO * spotIntensity{{LIGHT_INDEX}}, true);\n#endif\n","light_head_frag":"UNI Light lightOP{{LIGHT_INDEX}};\n","light_includes_frag":"#ifndef PI\n#define PI 3.14159265359\n#endif\n\n// from https://github.com/google/filament/blob/036bfa9b20d730bb8e5852ed449b024570167648/shaders/src/brdf.fs\n// modified to fit variable names / structure\nfloat F_Schlick(float f0, float f90, float VoH)\n{\n    return f0 + (f90 - f0) * pow(1.0 - VoH, 5.0);\n}\nvec3 F_Schlick(const vec3 f0, float VoH)\n{\n    float f = pow(1.0 - VoH, 5.0);\n    return f + f0 * (1.0 - f);\n}\nfloat Fd_Burley(float roughness, float NoV, float NoL, float LoH)\n{\n    // Burley 2012, \"Physically-Based Shading at Disney\"\n    float f90 = 0.5 + 2.0 * roughness * LoH * LoH;\n    float lightScatter = F_Schlick(1.0, f90, NoL);\n    float viewScatter  = F_Schlick(1.0, f90, NoV);\n    return lightScatter * viewScatter * (1.0 / PI);\n}\nfloat D_GGX(float roughness, float NoH, const vec3 h)\n{\n    float oneMinusNoHSquared = 1.0 - NoH * NoH;\n\n    float a = NoH * roughness;\n    float k = roughness / (oneMinusNoHSquared + a * a);\n    float d = k * k * (1.0 / PI);\n    return clamp(d, 0.0, 1.0);\n}\nfloat V_SmithGGXCorrelated(float roughness, float NoV, float NoL)\n{\n    // Heitz 2014, \"Understanding the Masking-Shadowing Function in Microfacet-Based BRDFs\"\n    float a2 = roughness * roughness;\n    // TODO: lambdaV can be pre-computed for all the lights, it should be moved out of this function\n    float lambdaV = NoL * sqrt((NoV - a2 * NoV) * NoV + a2);\n    float lambdaL = NoV * sqrt((NoL - a2 * NoL) * NoL + a2);\n    float v = 0.5 / (lambdaV + lambdaL);\n    // a2=0 => v = 1 / 4*NoL*NoV   => min=1/4, max=+inf\n    // a2=1 => v = 1 / 2*(NoL+NoV) => min=1/4, max=+inf\n    // clamp to the maximum value representable in mediump\n    return clamp(v, 0.0, 1.0);\n}\n// from https://github.com/google/filament/blob/73e339b05d67749e3b1d1d243650441162c10f8a/shaders/src/light_punctual.fs\n// modified to fit variable names\nfloat getSquareFalloffAttenuation(float distanceSquare, float falloff)\n{\n    float factor = distanceSquare * falloff;\n    float smoothFactor = clamp(1.0 - factor * factor, 0.0, 1.0);\n    // We would normally divide by the square distance here\n    // but we do it at the call site\n    return smoothFactor * smoothFactor;\n}\n\nfloat getDistanceAttenuation(vec3 posToLight, float falloff, vec3 V, float volume)\n{\n    float distanceSquare = dot(posToLight, posToLight);\n    float attenuation = getSquareFalloffAttenuation(distanceSquare, falloff);\n    // light far attenuation\n    float d = dot(V, V);\n    float f = 100.0; // CONFIG_Z_LIGHT_FAR, ttps://github.com/google/filament/blob/df6a100fcba66d9c99328a49d41fe3adecc0165d/filament/src/details/Engine.h\n    vec2 lightFarAttenuationParams = 0.5 * vec2(10.0, 10.0 / (f * f));\n    attenuation *= clamp(lightFarAttenuationParams.x - d * lightFarAttenuationParams.y, 0.0, 1.0);\n    // Assume a punctual light occupies a min volume of 1cm to avoid a division by 0\n    return attenuation / max(distanceSquare, max(1e-4, volume));\n}\n\n#ifdef USE_CLEAR_COAT\n// from https://github.com/google/filament/blob/73e339b05d67749e3b1d1d243650441162c10f8a/shaders/src/shading_model_standard.fs\n// modified to fit variable names / structure\nfloat clearCoatLobe(vec3 shading_clearCoatNormal, vec3 h, float LoH, float CCSpecK)\n{\n    float clearCoatNoH = clamp(dot(shading_clearCoatNormal, h), 0.0, 1.0);\n\n    // clear coat specular lobe\n    float D = D_GGX(CCSpecK, clearCoatNoH, h);\n    // from https://github.com/google/filament/blob/036bfa9b20d730bb8e5852ed449b024570167648/shaders/src/brdf.fs\n    float V = clamp(0.25 / (LoH * LoH), 0.0, 1.0);\n    float F = F_Schlick(0.04, 1.0, LoH); // fix IOR to 1.5\n\n    return D * V * F;\n}\n#endif\n\n#ifdef USE_ENVIRONMENT_LIGHTING\nvec3 evaluateLighting(Light light, vec3 L, vec4 FragPos, vec3 V, vec3 N, vec3 albedo, float specK, float NdotV, vec3 F0, float envBRDFY, float AO, bool hasFalloff)\n#else\nvec3 evaluateLighting(Light light, vec3 L, vec4 FragPos, vec3 V, vec3 N, vec3 albedo, float specK, float NdotV, vec3 F0, float AO, bool hasFalloff)\n#endif\n{\n    vec3 directLightingResult = vec3(0.0);\n    if (light.castLight == 1)\n    {\n        specK = max(0.08, specK);\n        // from https://github.com/google/filament/blob/73e339b05d67749e3b1d1d243650441162c10f8a/shaders/src/shading_model_standard.fs\n        // modified to fit variable names / structure\n        vec3 H = normalize(V + L);\n\n        float NdotL = clamp(dot(N, L), 0.0, 1.0);\n        float NdotH = clamp(dot(N, H), 0.0, 1.0);\n        float LdotH = clamp(dot(L, H), 0.0, 1.0);\n\n        vec3 Fd = albedo * Fd_Burley(specK, NdotV, NdotL, LdotH);\n\n        float D  = D_GGX(specK, NdotH, H);\n        float V2 = V_SmithGGXCorrelated(specK, NdotV, NdotL);\n        vec3  F  = F_Schlick(F0, LdotH);\n\n        // TODO: modify this with the radius\n        vec3 Fr = (D * V2) * F;\n\n        #ifdef USE_ENVIRONMENT_LIGHTING\n        vec3 directLighting = Fd + Fr * (1.0 + F0 * (1.0 / envBRDFY - 1.0));\n        #else\n        vec3 directLighting = Fd + Fr;\n        #endif\n\n        float attenuation = getDistanceAttenuation(L, hasFalloff ? light.lightProperties.FALLOFF : 0.0, V, light.lightProperties.RADIUS);\n\n        directLightingResult = (directLighting * light.color) *\n                          (light.lightProperties.INTENSITY * attenuation * NdotL * AO);\n\n        #ifdef USE_CLEAR_COAT\n        directLightingResult += clearCoatLobe(normM, H, LdotH, _ClearCoatRoughness);\n        #endif\n    }\n    return directLightingResult;\n}\n\n// from phong OP to make sure the light parameters change lighting similar to what people are used to\nfloat CalculateSpotLightEffect(vec3 lightPosition, vec3 conePointAt, float cosConeAngle, float cosConeAngleInner, float spotExponent, vec3 lightDirection) {\n    vec3 spotLightDirection = normalize(lightPosition-conePointAt);\n    float spotAngle = dot(-lightDirection, spotLightDirection);\n    float epsilon = cosConeAngle - cosConeAngleInner;\n\n    float spotIntensity = clamp((spotAngle - cosConeAngle)/epsilon, 0.0, 1.0);\n    spotIntensity = pow(spotIntensity, max(0.01, spotExponent));\n\n    return max(0., spotIntensity);\n}\n",};
// utility
const cgl = op.patch.cgl;
// inputs
const inTrigger = op.inTrigger("render");

const inDiffuseR = op.inFloat("R", Math.random());
const inDiffuseG = op.inFloat("G", Math.random());
const inDiffuseB = op.inFloat("B", Math.random());
const inDiffuseA = op.inFloatSlider("A", 1);
const diffuseColors = [inDiffuseR, inDiffuseG, inDiffuseB, inDiffuseA];
op.setPortGroup("Diffuse Color", diffuseColors);

const inRoughness = op.inFloatSlider("Roughness", 0.5);
const inMetalness = op.inFloatSlider("Metalness", 0.0);
const inAlphaMode = op.inSwitch("Alpha Mode", ["Opaque", "Masked", "Dithered", "Blend"], "Blend");

const inUseClearCoat = op.inValueBool("Use Clear Coat", false);
const inClearCoatIntensity = op.inFloatSlider("Clear Coat Intensity", 1.0);
const inClearCoatRoughness = op.inFloatSlider("Clear Coat Roughness", 0.5);
const inUseNormalMapForCC = op.inValueBool("Use Normal map for Clear Coat", false);
const inTexClearCoatNormal = op.inTexture("Clear Coat Normal map");

const inUseThinFilm = op.inValueBool("Use Thin Film", false);
const inThinFilmIntensity = op.inFloatSlider("Thin Film Intensity", 1.0);
const inThinFilmIOR = op.inFloat("Thin Film IOR", 1.3);
const inThinFilmThickness = op.inFloat("Thin Film Thickness (nm)", 600.0);

const inTFThicknessTexMin = op.inFloat("Thickness Tex Min", 300.0);
const inTFThicknessTexMax = op.inFloat("Thickness Tex Max", 600.0);

const inTonemapping = op.inSwitch("Tonemapping", ["sRGB", "HejiDawson", "Photographic"], "sRGB");
const inTonemappingExposure = op.inFloat("Exposure", 1.0);

const inEmissionIntensity = op.inFloat("Emission Intensity", 1.0);
const inToggleGR = op.inBool("Disable geometric roughness", false);
const inToggleNMGR = op.inBool("Use roughness from normal map", false);
const inUseVertexColours = op.inValueBool("Use Vertex Colours", false);
const inVertexColourMode = op.inSwitch("Vertex Colour Mode", ["colour", "AORM", "AO", "R", "M", "lightmap"], "colour");
const inHeightDepth = op.inFloat("Height Intensity", 1.0);
const inUseOptimizedHeight = op.inValueBool("Faster heightmapping", false);

// texture inputs
const inTexIBLLUT = op.inTexture("IBL LUT");
const inTexIrradiance = op.inTexture("Diffuse Irradiance");
const inTexPrefiltered = op.inTexture("Pre-filtered envmap");
const inMipLevels = op.inInt("Num mip levels");

const inTexAlbedo = op.inTexture("Albedo");
const inTexAORM = op.inTexture("AORM");
const inTexNormal = op.inTexture("Normal map");
const inTexEmission = op.inTexture("Emission");
const inTexHeight = op.inTexture("Height");
const inLightmap = op.inTexture("Lightmap");
const inTexThinFilm = op.inTexture("Thin Film");

const inDiffuseIntensity = op.inFloat("Diffuse Intensity", 1.0);
const inSpecularIntensity = op.inFloat("Specular Intensity", 1.0);
const inLightmapRGBE = op.inBool("Lightmap is RGBE", false);
const inLightmapIntensity = op.inFloat("Lightmap Intensity", 1.0);

inTrigger.onTriggered = doRender;

// outputs
const outTrigger = op.outTrigger("Next");
const shaderOut = op.outObject("Shader");
shaderOut.ignoreValueSerialize = true;
// UI stuff
op.toWorkPortsNeedToBeLinked(inTrigger);
op.toWorkShouldNotBeChild("Ops.Gl.TextureEffects.ImageCompose", CABLES.OP_PORT_TYPE_FUNCTION);

inDiffuseR.setUiAttribs({ "colorPick": true });
op.setPortGroup("Shader Parameters", [inRoughness, inMetalness, inAlphaMode]);
op.setPortGroup("Advanced Shader Parameters", [inEmissionIntensity, inToggleGR, inToggleNMGR, inUseVertexColours, inVertexColourMode, inHeightDepth, inUseOptimizedHeight]);
op.setPortGroup("Textures", [inTexAlbedo, inTexAORM, inTexNormal, inTexEmission, inTexHeight, inLightmap, inTexThinFilm]);
op.setPortGroup("Lighting", [inDiffuseIntensity, inSpecularIntensity, inLightmapIntensity, inLightmapRGBE, inTexIBLLUT, inTexIrradiance, inTexPrefiltered, inMipLevels]);
op.setPortGroup("Tonemapping", [inTonemapping, inTonemappingExposure]);
op.setPortGroup("Clear Coat", [inUseClearCoat, inClearCoatIntensity, inClearCoatRoughness, inUseNormalMapForCC, inTexClearCoatNormal]);
op.setPortGroup("Thin Film Iridescence", [inUseThinFilm, inThinFilmIntensity, inThinFilmIOR, inThinFilmThickness, inTFThicknessTexMin, inTFThicknessTexMax]);
// globals
const PBRShader = new CGL.Shader(cgl, "PBRShader", this);
PBRShader.setModules(["MODULE_VERTEX_POSITION", "MODULE_COLOR", "MODULE_BEGIN_FRAG"]);
// light sources (except IBL)
let PBRLightStack = [];
const lightUniforms = [];
const LIGHT_INDEX_REGEX = new RegExp("{{LIGHT_INDEX}}", "g");
const FRAGMENT_HEAD_REGEX = new RegExp("{{PBR_FRAGMENT_HEAD}}", "g");
const FRAGMENT_BODY_REGEX = new RegExp("{{PBR_FRAGMENT_BODY}}", "g");
const lightFragmentHead = attachments.light_head_frag;
const lightFragmentBodies = {
    "point": attachments.light_body_point_frag,
    "directional": attachments.light_body_directional_frag,
    "spot": attachments.light_body_spot_frag,
};
const createLightFragmentHead = (n) => { return lightFragmentHead.replace("{{LIGHT_INDEX}}", n); };
const createLightFragmentBody = (n, type) =>
{ return (lightFragmentBodies[type] || "").replace(LIGHT_INDEX_REGEX, n); };
let currentLightCount = -1;
const defaultLightStack = [{
    "type": "point",
    "position": [5, 5, 5],
    "color": [1, 1, 1],
    "specular": [1, 1, 1],
    "intensity": 120,
    "attenuation": 0,
    "falloff": 0.5,
    "radius": 60,
    "castLight": 1,
}];

if (cgl.glVersion == 1)
{
    if (!cgl.gl.getExtension("EXT_shader_texture_lod"))
    {
        op.log("no EXT_shader_texture_lod texture extension");
        throw "no EXT_shader_texture_lod texture extension";
    }
    else
    {
        PBRShader.enableExtension("GL_EXT_shader_texture_lod");
        cgl.gl.getExtension("OES_texture_float");
        cgl.gl.getExtension("OES_texture_float_linear");
        cgl.gl.getExtension("OES_texture_half_float");
        cgl.gl.getExtension("OES_texture_half_float_linear");

        PBRShader.enableExtension("GL_OES_standard_derivatives");
        PBRShader.enableExtension("GL_OES_texture_float");
        PBRShader.enableExtension("GL_OES_texture_float_linear");
        PBRShader.enableExtension("GL_OES_texture_half_float");
        PBRShader.enableExtension("GL_OES_texture_half_float_linear");
    }
}

buildShader();
// uniforms

const inAlbedoUniform = new CGL.Uniform(PBRShader, "t", "_AlbedoMap", 0);
const inAORMUniform = new CGL.Uniform(PBRShader, "t", "_AORMMap", 0);
const inNormalUniform = new CGL.Uniform(PBRShader, "t", "_NormalMap", 0);
const inEmissionUniform = new CGL.Uniform(PBRShader, "t", "_EmissionMap", 0);
const inCCNormalUniform = new CGL.Uniform(PBRShader, "t", "_CCNormalMap", 0);
const inIBLLUTUniform = new CGL.Uniform(PBRShader, "t", "IBL_BRDF_LUT", 0);
const inIrradianceUniform = new CGL.Uniform(PBRShader, "tc", "_irradiance", 1);
const inPrefilteredUniform = new CGL.Uniform(PBRShader, "tc", "_prefilteredEnvironmentColour", 1);
const inMipLevelsUniform = new CGL.Uniform(PBRShader, "f", "MAX_REFLECTION_LOD", 0);

const inTonemappingExposureUniform = new CGL.Uniform(PBRShader, "f", "tonemappingExposure", inTonemappingExposure);
const inDiffuseIntensityUniform = new CGL.Uniform(PBRShader, "f", "diffuseIntensity", inDiffuseIntensity);
const inSpecularIntensityUniform = new CGL.Uniform(PBRShader, "f", "specularIntensity", inSpecularIntensity);
const inIntensity = new CGL.Uniform(PBRShader, "f", "envIntensity", 1);

const inHeightUniform = new CGL.Uniform(PBRShader, "t", "_HeightMap", 0);
const inLightmapUniform = new CGL.Uniform(PBRShader, "t", "_Lightmap", 0);
const inLightmapIntensityUniform = new CGL.Uniform(PBRShader, "f", "lightmapIntensity", inLightmapIntensity);
const inTexThinFilmUniform = new CGL.Uniform(PBRShader, "t", "_ThinFilmMap", 0);

const inDiffuseColor = new CGL.Uniform(PBRShader, "4f", "_Albedo", inDiffuseR, inDiffuseG, inDiffuseB, inDiffuseA);
const inRoughnessUniform = new CGL.Uniform(PBRShader, "f", "_Roughness", inRoughness);
const inMetalnessUniform = new CGL.Uniform(PBRShader, "f", "_Metalness", inMetalness);
const inHeightDepthUniform = new CGL.Uniform(PBRShader, "f", "_HeightDepth", inHeightDepth);
const inClearCoatIntensityUniform = new CGL.Uniform(PBRShader, "f", "_ClearCoatIntensity", inClearCoatIntensity);
const inClearCoatRoughnessUniform = new CGL.Uniform(PBRShader, "f", "_ClearCoatRoughness", inClearCoatRoughness);
const inEmissionIntensityUniform = new CGL.Uniform(PBRShader, "f", "_EmissionIntensity", inEmissionIntensity);

const inThinFilmIntensityUniform = new CGL.Uniform(PBRShader, "f", "_ThinFilmIntensity", inThinFilmIntensity);
const inThinFilmIORUniform = new CGL.Uniform(PBRShader, "f", "_ThinFilmIOR", inThinFilmIOR);
const inThinFilmThicknessUniform = new CGL.Uniform(PBRShader, "f", "_ThinFilmThickness", inThinFilmThickness);

const inTFThicknessTexMinUniform = new CGL.Uniform(PBRShader, "f", "_TFThicknessTexMin", inTFThicknessTexMin);
const inTFThicknessTexMaxUniform = new CGL.Uniform(PBRShader, "f", "_TFThicknessTexMax", inTFThicknessTexMax);

const inPCOrigin = new CGL.Uniform(PBRShader, "3f", "_PCOrigin", [0, 0, 0]);
const inPCboxMin = new CGL.Uniform(PBRShader, "3f", "_PCboxMin", [-1, -1, -1]);
const inPCboxMax = new CGL.Uniform(PBRShader, "3f", "_PCboxMax", [1, 1, 1]);

PBRShader.uniformColorDiffuse = inDiffuseColor;
PBRShader.uniformPbrMetalness = inMetalnessUniform;
PBRShader.uniformPbrRoughness = inRoughnessUniform;

inTexPrefiltered.onChange = updateIBLTexDefines;

inTexAORM.onChange =
    inLightmapRGBE.onChange =
    inUseNormalMapForCC.onChange =
    inUseClearCoat.onChange =
    inTexClearCoatNormal.onChange =
    inTexAlbedo.onChange =
    inTexNormal.onChange =
    inTexEmission.onChange =
    inTexHeight.onChange =
    inAlphaMode.onChange =
    inToggleNMGR.onChange =
    inTonemapping.onChange =
    inLightmap.onChange =
    inTexThinFilm.onChange =
    inUseOptimizedHeight.onChange =
    inUseVertexColours.onChange =
    inToggleGR.onChange =
    inUseThinFilm.onChange =
    inVertexColourMode.onChange = updateDefines;

function updateDefines()
{
    PBRShader.toggleDefine("USE_OPTIMIZED_HEIGHT", inUseOptimizedHeight.get());
    PBRShader.toggleDefine("USE_CLEAR_COAT", inUseClearCoat.get());
    PBRShader.toggleDefine("USE_NORMAL_MAP_FOR_CC", inUseNormalMapForCC.get());
    PBRShader.toggleDefine("USE_CC_NORMAL_MAP", inTexClearCoatNormal.isLinked());
    PBRShader.toggleDefine("LIGHTMAP_IS_RGBE", inLightmapRGBE.get());
    PBRShader.toggleDefine("USE_LIGHTMAP", inLightmap.isLinked() || inVertexColourMode.get() === "lightmap");
    PBRShader.toggleDefine("USE_NORMAL_TEX", inTexNormal.isLinked());
    PBRShader.toggleDefine("USE_HEIGHT_TEX", inTexHeight.isLinked());
    PBRShader.toggleDefine("DONT_USE_NMGR", inToggleNMGR.get());
    PBRShader.toggleDefine("DONT_USE_GR", inToggleGR.get());
    PBRShader.toggleDefine("USE_THIN_FILM", inUseThinFilm.get());
    PBRShader.toggleDefine("USE_EMISSION", inTexEmission.get());
    PBRShader.toggleDefine("USE_THIN_FILM_MAP", inTexThinFilm.get());

    // VERTEX_COLORS
    PBRShader.toggleDefine("VCOL_COLOUR", inVertexColourMode.get() === "colour");
    PBRShader.toggleDefine("VCOL_AORM", inVertexColourMode.get() === "AORM");
    PBRShader.toggleDefine("VCOL_AO", inVertexColourMode.get() === "AO");
    PBRShader.toggleDefine("VCOL_R", inVertexColourMode.get() === "R");
    PBRShader.toggleDefine("VCOL_M", inVertexColourMode.get() === "M");
    PBRShader.toggleDefine("VCOL_LIGHTMAP", inVertexColourMode.get() === "lightmap");

    // ALBEDO TEX
    PBRShader.toggleDefine("USE_ALBEDO_TEX", inTexAlbedo.get());
    inDiffuseR.setUiAttribs({ "greyout": inTexAlbedo.isLinked() });
    inDiffuseG.setUiAttribs({ "greyout": inTexAlbedo.isLinked() });
    inDiffuseB.setUiAttribs({ "greyout": inTexAlbedo.isLinked() });
    inDiffuseA.setUiAttribs({ "greyout": inTexAlbedo.isLinked() });

    // AORM
    PBRShader.toggleDefine("USE_AORM_TEX", inTexAORM.get());
    inRoughness.setUiAttribs({ "greyout": inTexAORM.isLinked() });
    inMetalness.setUiAttribs({ "greyout": inTexAORM.isLinked() });

    // lightmaps
    PBRShader.toggleDefine("VERTEX_COLORS", inUseVertexColours.get());

    if (!inUseVertexColours.get())
    {
        PBRShader.toggleDefine("USE_LIGHTMAP", inLightmap.get());
    }
    else
    {
        if (inVertexColourMode.get() === "lightmap")
        {
            PBRShader.define("USE_LIGHTMAP");
        }
    }

    // alpha mode
    PBRShader.toggleDefine("ALPHA_MASKED", inAlphaMode.get() === "Masked");
    PBRShader.toggleDefine("ALPHA_DITHERED", inAlphaMode.get() === "Dithered");
    PBRShader.toggleDefine("ALPHA_BLEND", inAlphaMode.get() === "Blend");

    // tonemapping
    PBRShader.toggleDefine("TONEMAP_sRGB", inTonemapping.get() === "sRGB");
    PBRShader.toggleDefine("TONEMAP_HejiDawson", inTonemapping.get() === "HejiDawson");
    PBRShader.toggleDefine("TONEMAP_Photographic", inTonemapping.get() === "Photographic");
}

updateDefines();

function setEnvironmentLighting(enabled)
{
    PBRShader.toggleDefine("USE_ENVIRONMENT_LIGHTING", enabled);
}

op.preRender = function ()
{
    // PBRShader.bind();
    // doRender();
};

function updateIBLTexDefines()
{
    inMipLevels.setUiAttribs({ "greyout": !inTexPrefiltered.get() });
}

function updateLightUniforms()
{
    for (let i = 0; i < PBRLightStack.length; i += 1)
    {
        const light = PBRLightStack[i];
        light.isUsed = true;

        lightUniforms[i].position.setValue(light.position);
        lightUniforms[i].color.setValue(light.color);
        lightUniforms[i].specular.setValue(light.specular);

        lightUniforms[i].lightProperties.setValue([
            light.intensity,
            light.attenuation,
            light.falloff,
            light.radius,
        ]);

        lightUniforms[i].conePointAt.setValue(light.conePointAt);
        lightUniforms[i].spotProperties.setValue([
            light.cosConeAngle,
            light.cosConeAngleInner,
            light.spotExponent,
        ]);

        lightUniforms[i].castLight.setValue(light.castLight);
    }
}

function buildShader()
{
    const vertexShader = attachments.BasicPBR_vert;
    const lightIncludes = attachments.light_includes_frag;
    let fragmentShader = attachments.BasicPBR_frag;

    let fragmentHead = "";
    let fragmentBody = "";

    if (PBRLightStack.length > 0)
    {
        fragmentHead = fragmentHead.concat(lightIncludes);
    }

    for (let i = 0; i < PBRLightStack.length; i += 1)
    {
        const light = PBRLightStack[i];
        const type = light.type;

        fragmentHead = fragmentHead.concat(createLightFragmentHead(i) || "");
        fragmentBody = fragmentBody.concat(createLightFragmentBody(i, light.type) || "");
    }

    fragmentShader = fragmentShader.replace(FRAGMENT_HEAD_REGEX, fragmentHead || "");
    fragmentShader = fragmentShader.replace(FRAGMENT_BODY_REGEX, fragmentBody || "");

    PBRShader.setSource(vertexShader, fragmentShader);
    shaderOut.set(PBRShader);

    for (let i = 0; i < PBRLightStack.length; i += 1)
    {
        lightUniforms[i] = null;
        if (!lightUniforms[i])
        {
            lightUniforms[i] = {
                "color": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".color", [1, 1, 1]),
                "position": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".position", [0, 11, 0]),
                "specular": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".specular", [1, 1, 1]),
                "lightProperties": new CGL.Uniform(PBRShader, "4f", "lightOP" + i + ".lightProperties", [1, 1, 1, 1]),

                "conePointAt": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".conePointAt", vec3.create()),
                "spotProperties": new CGL.Uniform(PBRShader, "3f", "lightOP" + i + ".spotProperties", [0, 0, 0, 0]),
                "castLight": new CGL.Uniform(PBRShader, "i", "lightOP" + i + ".castLight", 1),

            };
        }
    }
}

function updateLights()
{
    if (cgl.frameStore.lightStack)
    {
        let changed = currentLightCount !== cgl.frameStore.lightStack.length;

        if (!changed)
        {
            for (let i = 0; i < cgl.frameStore.lightStack.length; i++)
            {
                if (PBRLightStack[i] != cgl.frameStore.lightStack[i])
                {
                    changed = true;
                    break;
                }
            }
        }

        if (changed)
        {
            PBRLightStack.length = 0;
            for (let i = 0; i < cgl.frameStore.lightStack.length; i++)

                PBRLightStack[i] = cgl.frameStore.lightStack[i];
            buildShader();

            currentLightCount = cgl.frameStore.lightStack.length;
        }
    }
}

function doRender()
{
    cgl.pushShader(PBRShader);
    let useDefaultLight = false;

    PBRShader.popTextures();

    let numLights = 0;
    if (cgl.frameStore.lightStack)numLights = cgl.frameStore.lightStack.length;

    if ((!cgl.frameStore.pbrEnvStack || cgl.frameStore.pbrEnvStack.length == 0) &&
        !inLightmap.isLinked() && numLights == 0)

    {
        useDefaultLight = true;
        op.setUiError("deflight", "Default light is enabled. Please add lights or PBREnvironmentLights to your patch to make this warning disappear.", 1);
    }
    else op.setUiError("deflight", null);

    if (cgl.frameStore.pbrEnvStack && cgl.frameStore.pbrEnvStack.length > 0 &&
        cgl.frameStore.pbrEnvStack[cgl.frameStore.pbrEnvStack.length - 1].texIBLLUT.tex && cgl.frameStore.pbrEnvStack[cgl.frameStore.pbrEnvStack.length - 1].texDiffIrr.tex && cgl.frameStore.pbrEnvStack[cgl.frameStore.pbrEnvStack.length - 1].texPreFiltered.tex)
    {
        const pbrEnv = cgl.frameStore.pbrEnvStack[cgl.frameStore.pbrEnvStack.length - 1];

        inIntensity.setValue(pbrEnv.intensity);

        PBRShader.pushTexture(inIBLLUTUniform, pbrEnv.texIBLLUT.tex);
        PBRShader.pushTexture(inIrradianceUniform, pbrEnv.texDiffIrr.tex, cgl.gl.TEXTURE_CUBE_MAP);
        PBRShader.pushTexture(inPrefilteredUniform, pbrEnv.texPreFiltered.tex, cgl.gl.TEXTURE_CUBE_MAP);
        inMipLevelsUniform.setValue(pbrEnv.texPreFilteredMipLevels || 7);

        PBRShader.toggleDefine("USE_PARALLAX_CORRECTION", pbrEnv.UseParallaxCorrection);
        if (pbrEnv.UseParallaxCorrection)
        {
            inPCOrigin.setValue(pbrEnv.PCOrigin);
            inPCboxMin.setValue(pbrEnv.PCboxMin);
            inPCboxMax.setValue(pbrEnv.PCboxMax);
        }

        setEnvironmentLighting(true);
    }
    else
    {
        setEnvironmentLighting(false);
    }

    if (useDefaultLight)
    {
        const iViewMatrix = mat4.create();
        mat4.invert(iViewMatrix, cgl.vMatrix);

        defaultLightStack[0].position = [iViewMatrix[12], iViewMatrix[13], iViewMatrix[14]];
        cgl.frameStore.lightStack = defaultLightStack;
    }

    if (inTexIBLLUT.get())
    {
        setEnvironmentLighting(true);
        PBRShader.pushTexture(inIBLLUTUniform, inTexIBLLUT.get().tex);
        inMipLevelsUniform.setValue(inMipLevels.get());
        if (inTexIrradiance.get()) PBRShader.pushTexture(inIrradianceUniform, inTexIrradiance.get().cubemap, cgl.gl.TEXTURE_CUBE_MAP);
        if (inTexPrefiltered.get()) PBRShader.pushTexture(inPrefilteredUniform, inTexPrefiltered.get().cubemap, cgl.gl.TEXTURE_CUBE_MAP);
    }

    if (inTexAlbedo.get()) PBRShader.pushTexture(inAlbedoUniform, inTexAlbedo.get().tex);
    if (inTexAORM.get()) PBRShader.pushTexture(inAORMUniform, inTexAORM.get().tex);
    if (inTexNormal.get()) PBRShader.pushTexture(inNormalUniform, inTexNormal.get().tex);
    if (inTexEmission.get()) PBRShader.pushTexture(inEmissionUniform, inTexEmission.get().tex);
    if (inTexHeight.get()) PBRShader.pushTexture(inHeightUniform, inTexHeight.get().tex);
    if (inLightmap.get()) PBRShader.pushTexture(inLightmapUniform, inLightmap.get().tex);
    if (inTexClearCoatNormal.get()) PBRShader.pushTexture(inCCNormalUniform, inTexClearCoatNormal.get().tex);
    if (inTexThinFilm.get()) PBRShader.pushTexture(inTexThinFilmUniform, inTexThinFilm.get().tex);

    updateLights();
    updateLightUniforms();

    outTrigger.trigger();
    cgl.popShader();

    if (useDefaultLight) cgl.frameStore.lightStack = [];
}


};

Ops.Gl.Pbr.PbrMaterial.prototype = new CABLES.Op();
CABLES.OPS["a5234947-f65a-41e2-a691-b81382903a71"]={f:Ops.Gl.Pbr.PbrMaterial,objName:"Ops.Gl.Pbr.PbrMaterial"};




// **************************************************************
// 
// Ops.Gl.Meshes.Cube_v2
// 
// **************************************************************

Ops.Gl.Meshes.Cube_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    render = op.inTrigger("Render"),
    active = op.inValueBool("Render Mesh", true),
    width = op.inValue("Width", 1),
    len = op.inValue("Length", 1),
    height = op.inValue("Height", 1),
    center = op.inValueBool("Center", true),
    mapping = op.inSwitch("Mapping", ["Side", "Cube +-", "SideWrap"], "Side"),
    mappingBias = op.inValue("Bias", 0),
    inFlipX = op.inValueBool("Flip X", true),
    sideTop = op.inValueBool("Top", true),
    sideBottom = op.inValueBool("Bottom", true),
    sideLeft = op.inValueBool("Left", true),
    sideRight = op.inValueBool("Right", true),
    sideFront = op.inValueBool("Front", true),
    sideBack = op.inValueBool("Back", true),
    trigger = op.outTrigger("Next"),
    geomOut = op.outObject("geometry", null, "geometry");

const cgl = op.patch.cgl;
op.toWorkPortsNeedToBeLinked(render);
op.toWorkShouldNotBeChild("Ops.Gl.TextureEffects.ImageCompose", CABLES.OP_PORT_TYPE_FUNCTION);

op.setPortGroup("Mapping", [mapping, mappingBias, inFlipX]);
op.setPortGroup("Geometry", [width, height, len, center]);
op.setPortGroup("Sides", [sideTop, sideBottom, sideLeft, sideRight, sideFront, sideBack]);

let geom = null,
    mesh = null,
    meshvalid = true,
    needsRebuild = true;

mappingBias.onChange =
    inFlipX.onChange =
    sideTop.onChange =
    sideBottom.onChange =
    sideLeft.onChange =
    sideRight.onChange =
    sideFront.onChange =
    sideBack.onChange =
    mapping.onChange =
    width.onChange =
    height.onChange =
    len.onChange =
    center.onChange = buildMeshLater;

function buildMeshLater()
{
    needsRebuild = true;
}

render.onLinkChanged = function ()
{
    if (!render.isLinked()) geomOut.set(null);
    else geomOut.setRef(geom);
};

render.onTriggered = function ()
{
    if (needsRebuild)buildMesh();
    if (active.get() && mesh && meshvalid) mesh.render(cgl.getShader());
    trigger.trigger();
};

op.preRender = function ()
{
    buildMesh();
    mesh.render(cgl.getShader());
};

function buildMesh()
{
    if (!geom)geom = new CGL.Geometry("cubemesh");
    geom.clear();

    let x = width.get();
    let nx = -1 * width.get();
    let y = height.get();
    let ny = -1 * height.get();
    let z = len.get();
    let nz = -1 * len.get();

    if (!center.get())
    {
        nx = 0;
        ny = 0;
        nz = 0;
    }
    else
    {
        x *= 0.5;
        nx *= 0.5;
        y *= 0.5;
        ny *= 0.5;
        z *= 0.5;
        nz *= 0.5;
    }

    addAttribs(geom, x, y, z, nx, ny, nz);
    if (mapping.get() == "Side") sideMappedCube(geom, 1, 1, 1);
    else if (mapping.get() == "SideWrap") sideMappedCube(geom, x, y, z);
    else cubeMappedCube(geom);

    geom.verticesIndices = [];
    if (sideTop.get()) geom.verticesIndices.push(8, 9, 10, 8, 10, 11); // Top face
    if (sideBottom.get()) geom.verticesIndices.push(12, 13, 14, 12, 14, 15); // Bottom face
    if (sideLeft.get()) geom.verticesIndices.push(20, 21, 22, 20, 22, 23); // Left face
    if (sideRight.get()) geom.verticesIndices.push(16, 17, 18, 16, 18, 19); // Right face
    if (sideBack.get()) geom.verticesIndices.push(4, 5, 6, 4, 6, 7); // Back face
    if (sideFront.get()) geom.verticesIndices.push(0, 1, 2, 0, 2, 3); // Front face

    if (geom.verticesIndices.length === 0) meshvalid = false;
    else meshvalid = true;

    if (mesh)mesh.dispose();
    mesh = op.patch.cg.createMesh(geom, { "opId": op.id });

    geomOut.setRef(geom);

    needsRebuild = false;
}

op.onDelete = function ()
{
    if (mesh)mesh.dispose();
};

function sideMappedCube(geom, x, y, z)
{
    const bias = mappingBias.get();

    let u1 = 1.0 - bias;
    let u0 = 0.0 + bias;
    if (inFlipX.get())
    {
        [u1, u0] = [u0, u1];
    }

    let v1 = 1.0 - bias;
    let v0 = 0.0 + bias;

    geom.setTexCoords([
        // Front face
        x * u0, y * v1,
        x * u1, y * v1,
        x * u1, y * v0,
        x * u0, y * v0,
        // Back face
        x * u1, y * v1,
        x * u1, y * v0,
        x * u0, y * v0,
        x * u0, y * v1,
        // Top face
        x * u0, z * v0,
        x * u0, z * v1,
        x * u1, z * v1,
        x * u1, z * v0,
        // Bottom face
        x * u1, y * v0,
        x * u0, y * v0,
        x * u0, y * v1,
        x * u1, y * v1,
        // Right face
        z * u1, y * v1,
        z * u1, y * v0,
        z * u0, y * v0,
        z * u0, y * v1,
        // Left face
        z * u0, y * v1,
        z * u1, y * v1,
        z * u1, y * v0,
        z * u0, y * v0,
    ]);
}

function cubeMappedCube(geom, x, y, z, nx, ny, nz)
{
    const sx = 0.25;
    const sy = 1 / 3;
    const bias = mappingBias.get();

    let flipx = 0.0;
    if (inFlipX.get()) flipx = 1.0;

    const tc = [];
    tc.push(
        // Front face   Z+
        flipx + sx + bias, sy * 2 - bias, flipx + sx * 2 - bias, sy * 2 - bias, flipx + sx * 2 - bias, sy + bias, flipx + sx + bias, sy + bias,
        // Back face Z-
        flipx + sx * 4 - bias, sy * 2 - bias, flipx + sx * 4 - bias, sy + bias, flipx + sx * 3 + bias, sy + bias, flipx + sx * 3 + bias, sy * 2 - bias);

    if (inFlipX.get())
        tc.push(
            // Top face
            sx + bias, 0 - bias, sx * 2 - bias, 0 - bias, sx * 2 - bias, sy * 1 + bias, sx + bias, sy * 1 + bias,
            // Bottom face
            sx + bias, sy * 3 + bias, sx + bias, sy * 2 - bias, sx * 2 - bias, sy * 2 - bias, sx * 2 - bias, sy * 3 + bias
        );

    else
        tc.push(
            // Top face
            sx + bias, 0 + bias, sx + bias, sy * 1 - bias, sx * 2 - bias, sy * 1 - bias, sx * 2 - bias, 0 + bias,
            // Bottom face
            sx + bias, sy * 3 - bias, sx * 2 - bias, sy * 3 - bias, sx * 2 - bias, sy * 2 + bias, sx + bias, sy * 2 + bias);

    tc.push(
        // Right face
        flipx + sx * 3 - bias, 1.0 - sy - bias, flipx + sx * 3 - bias, 1.0 - sy * 2 + bias, flipx + sx * 2 + bias, 1.0 - sy * 2 + bias, flipx + sx * 2 + bias, 1.0 - sy - bias,
        // Left face
        flipx + sx * 0 + bias, 1.0 - sy - bias, flipx + sx * 1 - bias, 1.0 - sy - bias, flipx + sx * 1 - bias, 1.0 - sy * 2 + bias, flipx + sx * 0 + bias, 1.0 - sy * 2 + bias);

    geom.setTexCoords(tc);
}

function addAttribs(geom, x, y, z, nx, ny, nz)
{
    geom.vertices = [
        // Front face
        nx, ny, z,
        x, ny, z,
        x, y, z,
        nx, y, z,
        // Back face
        nx, ny, nz,
        nx, y, nz,
        x, y, nz,
        x, ny, nz,
        // Top face
        nx, y, nz,
        nx, y, z,
        x, y, z,
        x, y, nz,
        // Bottom face
        nx, ny, nz,
        x, ny, nz,
        x, ny, z,
        nx, ny, z,
        // Right face
        x, ny, nz,
        x, y, nz,
        x, y, z,
        x, ny, z,
        // zeft face
        nx, ny, nz,
        nx, ny, z,
        nx, y, z,
        nx, y, nz
    ];

    geom.vertexNormals = new Float32Array([
        // Front face
        0.0, 0.0, 1.0,
        0.0, 0.0, 1.0,
        0.0, 0.0, 1.0,
        0.0, 0.0, 1.0,

        // Back face
        0.0, 0.0, -1.0,
        0.0, 0.0, -1.0,
        0.0, 0.0, -1.0,
        0.0, 0.0, -1.0,

        // Top face
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,
        0.0, 1.0, 0.0,

        // Bottom face
        0.0, -1.0, 0.0,
        0.0, -1.0, 0.0,
        0.0, -1.0, 0.0,
        0.0, -1.0, 0.0,

        // Right face
        1.0, 0.0, 0.0,
        1.0, 0.0, 0.0,
        1.0, 0.0, 0.0,
        1.0, 0.0, 0.0,

        // Left face
        -1.0, 0.0, 0.0,
        -1.0, 0.0, 0.0,
        -1.0, 0.0, 0.0,
        -1.0, 0.0, 0.0
    ]);
    geom.tangents = new Float32Array([
        // front face
        0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
        // back face
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        // top face
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        // bottom face
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        // right face
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        // left face
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1
    ]);
    geom.biTangents = new Float32Array([
        // front face
        -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
        // back face
        1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
        // top face
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        // bottom face
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
        // right face
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        // left face
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1
    ]);
}


};

Ops.Gl.Meshes.Cube_v2.prototype = new CABLES.Op();
CABLES.OPS["37b92ba4-cea5-42ae-bf28-a513ca28549c"]={f:Ops.Gl.Meshes.Cube_v2,objName:"Ops.Gl.Meshes.Cube_v2"};




// **************************************************************
// 
// Ops.Gl.Phong.DirectionalLight_v5
// 
// **************************************************************

Ops.Gl.Phong.DirectionalLight_v5 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const cgl = op.patch.cgl;

// * OP START *
const inTrigger = op.inTrigger("Trigger In");

const inCastLight = op.inBool("Cast Light", true);
const inIntensity = op.inFloat("Intensity", 1);
const attribIns = [inCastLight, inIntensity];
op.setPortGroup("Light Attributes", attribIns);

const inPosX = op.inFloat("X", 0);
const inPosY = op.inFloat("Y", 3);
const inPosZ = op.inFloat("Z", 5);

const positionIn = [inPosX, inPosY, inPosZ];
op.setPortGroup("Direction", positionIn);

const inR = op.inFloat("R", 1);
const inG = op.inFloat("G", 1);
const inB = op.inFloat("B", 1);

inR.setUiAttribs({ "colorPick": true });
const colorIn = [inR, inG, inB];
op.setPortGroup("Color", colorIn);

const inSpecularR = op.inFloat("Specular R", 0.2);
const inSpecularG = op.inFloat("Specular G", 0.2);
const inSpecularB = op.inFloat("Specular B", 0.2);

inSpecularR.setUiAttribs({ "colorPick": true });
const colorSpecularIn = [inSpecularR, inSpecularG, inSpecularB];
op.setPortGroup("Specular Color", colorSpecularIn);

const inCastShadow = op.inBool("Cast Shadow", false);
const inRenderMapActive = op.inBool("Rendering Active", true);
const inMapSize = op.inSwitch("Map Size", [256, 512, 1024, 2048], 512);
const inShadowStrength = op.inFloatSlider("Shadow Strength", 1);
const inLRBT = op.inFloat("LR-BottomTop", 8);
const inNear = op.inFloat("Near", 0.1);
const inFar = op.inFloat("Far", 30);
const inBias = op.inFloatSlider("Bias", 0.004);
const inPolygonOffset = op.inInt("Polygon Offset", 0);
const inNormalOffset = op.inFloatSlider("Normal Offset", 0);
const inBlur = op.inFloatSlider("Blur Amount", 0);
op.setPortGroup("", [inCastShadow]);
op.setPortGroup("Shadow Map Settings", [inMapSize, inRenderMapActive, inShadowStrength, inLRBT, inNear, inFar, inBias, inPolygonOffset, inNormalOffset, inBlur]);

inMapSize.setUiAttribs({ "greyout": true });
inRenderMapActive.setUiAttribs({ "greyout": true });
inShadowStrength.setUiAttribs({ "greyout": true });
inLRBT.setUiAttribs({ "greyout": true, "hidePort": true });
inNear.setUiAttribs({ "greyout": true, "hidePort": true });
inFar.setUiAttribs({ "greyout": true, "hidePort": true });
inBias.setUiAttribs({ "greyout": true, "hidePort": true });
inNormalOffset.setUiAttribs({ "greyout": true, "hidePort": true });
inPolygonOffset.setUiAttribs({ "greyout": true, "hidePort": true });
inBlur.setUiAttribs({ "greyout": true });

const inAdvanced = op.inBool("Enable Advanced", false);
const inMSAA = op.inSwitch("MSAA", ["none", "2x", "4x", "8x"], "none");
const inFilterType = op.inSwitch("Texture Filter", ["Linear", "Nearest", "Mip Map"], "Linear");
const inAnisotropic = op.inSwitch("Anisotropic", [0, 1, 2, 4, 8, 16], "0");
inMSAA.setUiAttribs({ "greyout": true, "hidePort": true });
inFilterType.setUiAttribs({ "greyout": true, "hidePort": true });
inAnisotropic.setUiAttribs({ "greyout": true, "hidePort": true });
op.setPortGroup("Advanced Options", [inAdvanced, inMSAA, inFilterType, inAnisotropic]);

inAdvanced.onChange = function ()
{
    inMSAA.setUiAttribs({ "greyout": !inAdvanced.get() });
    inFilterType.setUiAttribs({ "greyout": !inAdvanced.get() });
    inAnisotropic.setUiAttribs({ "greyout": !inAdvanced.get() });
};

const outTrigger = op.outTrigger("Trigger Out");
const outTexture = op.outTexture("Shadow Map");

let texelSize = 1 / Number(inMapSize.get());

const newLight = new CGL.Light(cgl, {
    "type": "directional",
    "position": [0, 1, 2].map(function (i) { return positionIn[i].get(); }),
    "color": [0, 1, 2].map(function (i) { return colorIn[i].get(); }),
    "specular": [0, 1, 2].map(function (i) { return colorSpecularIn[i].get(); }),
    "intensity": inIntensity.get(),
    "castShadow": false,
    "shadowStrength": inShadowStrength.get(),
});
newLight.castLight = inCastLight.get();

let updating = false;

function updateBuffers()
{
    updating = true;
    const MSAA = Number(inMSAA.get().charAt(0));

    let filterType = null;
    const anisotropyFactor = Number(inAnisotropic.get());

    if (inFilterType.get() == "Linear")
    {
        filterType = CGL.Texture.FILTER_LINEAR;
    }
    else if (inFilterType.get() == "Nearest")
    {
        filterType = CGL.Texture.FILTER_NEAREST;
    }
    else if (inFilterType.get() == "Mip Map")
    {
        filterType = CGL.Texture.FILTER_MIPMAP;
    }

    const mapSize = Number(inMapSize.get());
    const textureOptions = {
        "isFloatingPointTexture": true,
        "filter": filterType,
    };

    if (MSAA) Object.assign(textureOptions, { "multisampling": true, "multisamplingSamples": MSAA });
    Object.assign(textureOptions, { "anisotropic": anisotropyFactor });

    newLight.createFramebuffer(mapSize, mapSize, textureOptions);
    newLight.createBlurEffect(textureOptions);
    updating = false;
}

function updateShadowMapFramebuffer()
{
    const size = Number(inMapSize.get());
    texelSize = 1 / size;

    if (inCastShadow.get())
    {
        newLight.createFramebuffer(Number(inMapSize.get()), Number(inMapSize.get()), {});
        newLight.createShadowMapShader();
        newLight.createBlurEffect({});
        newLight.createBlurShader();
        newLight.updateProjectionMatrix(inLRBT.get(), inNear.get(), inFar.get(), null);
    }

    if (inAdvanced.get()) updateBuffers();

    updating = false;
    updateLight = true;
}

inMSAA.onChange = inAnisotropic.onChange = inFilterType.onChange = inMapSize.onChange = function ()
{
    updating = true;
};

inR.onChange = inG.onChange = inB.onChange = inSpecularR.onChange = inSpecularG.onChange = inSpecularB.onChange
= inPosX.onChange = inPosY.onChange = inPosZ.onChange
= inBias.onChange = inIntensity.onChange = inCastLight.onChange = inShadowStrength.onChange = inNormalOffset.onChange = updateLightParameters;

let updateLight = false;
function updateLightParameters(param)
{
    updateLight = true;
}

inCastShadow.onChange = function ()
{
    updating = true;
    updateLight = true;

    const castShadow = inCastShadow.get();

    inMapSize.setUiAttribs({ "greyout": !castShadow });
    inRenderMapActive.setUiAttribs({ "greyout": !castShadow });
    inShadowStrength.setUiAttribs({ "greyout": !castShadow });
    inLRBT.setUiAttribs({ "greyout": !castShadow });
    inNear.setUiAttribs({ "greyout": !castShadow });
    inFar.setUiAttribs({ "greyout": !castShadow });
    inBlur.setUiAttribs({ "greyout": !castShadow });
    inBias.setUiAttribs({ "greyout": !castShadow });
    inNormalOffset.setUiAttribs({ "greyout": !castShadow });
    inPolygonOffset.setUiAttribs({ "greyout": !castShadow });
};

inLRBT.onChange = inNear.onChange = inFar.onChange = function ()
{
    updateLight = true;
};

function drawHelpers()
{
    if (cgl.shouldDrawHelpers(op))
    {
        gui.setTransformGizmo({
            "posX": inPosX,
            "posY": inPosY,
            "posZ": inPosZ,
        });
        CABLES.GL_MARKER.drawLineSourceDest(
            op,
            -200 * newLight.position[0],
            -200 * newLight.position[1],
            -200 * newLight.position[2],
            200 * newLight.position[0],
            200 * newLight.position[1],
            200 * newLight.position[2],
        );
    }
}

let errorActive = false;
inTrigger.onTriggered = function ()
{
    if (updating)
    {
        if (cgl.frameStore.shadowPass) return;
        updateShadowMapFramebuffer();
    }

    if (!cgl.frameStore.shadowPass)
    {
        if (!newLight.isUsed && !errorActive)
        {
            op.setUiError("lightUsed", "No operator is using this light. Make sure this op is positioned before an operator that uses lights. Also make sure there is an operator that uses lights after this.", 1); // newLight.isUsed = false;
            errorActive = true;
        }
        else if (!newLight.isUsed && errorActive) {}
        else if (newLight.isUsed && errorActive)
        {
            op.setUiError("lightUsed", null);
            errorActive = false;
        }
        else if (newLight.isUsed && !errorActive) {}
        newLight.isUsed = false;
    }

    if (updateLight)
    {
        newLight.color = [inR.get(), inG.get(), inB.get()];
        newLight.specular = [inSpecularR.get(), inSpecularG.get(), inSpecularB.get()];
        newLight.intensity = inIntensity.get();
        newLight.castLight = inCastLight.get();
        newLight.position = [inPosX.get(), inPosY.get(), inPosZ.get()];
        newLight.updateProjectionMatrix(inLRBT.get(), inNear.get(), inFar.get(), null);
        newLight.castShadow = inCastShadow.get();

        newLight.normalOffset = inNormalOffset.get();
        newLight.shadowBias = inBias.get();
        newLight.shadowStrength = inShadowStrength.get();
        updateLight = false;
    }

    if (!cgl.frameStore.lightStack) cgl.frameStore.lightStack = [];

    if (!cgl.frameStore.shadowPass) drawHelpers();

    cgl.frameStore.lightStack.push(newLight);

    if (inCastShadow.get())
    {
        const blurAmount = 1.5 * inBlur.get() * texelSize;
        if (inRenderMapActive.get()) newLight.renderPasses(inPolygonOffset.get(), blurAmount, function () { outTrigger.trigger(); });
        newLight.blurAmount = inBlur.get();
        outTexture.set(null);
        outTexture.set(newLight.getShadowMapDepth());
        // remove light from stack and readd it with shadow map & mvp matrix
        cgl.frameStore.lightStack.pop();

        cgl.frameStore.lightStack.push(newLight);
    }
    else
    {
        outTexture.set(null);
    }

    outTrigger.trigger();

    cgl.frameStore.lightStack.pop();
};


};

Ops.Gl.Phong.DirectionalLight_v5.prototype = new CABLES.Op();
CABLES.OPS["9f41bf91-f4e0-4ce4-89d8-72627b76261e"]={f:Ops.Gl.Phong.DirectionalLight_v5,objName:"Ops.Gl.Phong.DirectionalLight_v5"};




// **************************************************************
// 
// Ops.Gl.MainLoop
// 
// **************************************************************

Ops.Gl.MainLoop = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    fpsLimit = op.inValue("FPS Limit", 0),
    trigger = op.outTrigger("trigger"),
    width = op.outNumber("width"),
    height = op.outNumber("height"),
    reduceFocusFPS = op.inValueBool("Reduce FPS not focussed", true),
    reduceLoadingFPS = op.inValueBool("Reduce FPS loading"),
    clear = op.inValueBool("Clear", true),
    clearAlpha = op.inValueBool("ClearAlpha", true),
    fullscreen = op.inValueBool("Fullscreen Button", false),
    active = op.inValueBool("Active", true),
    hdpi = op.inValueBool("Hires Displays", false),
    inUnit = op.inSwitch("Pixel Unit", ["Display", "CSS"], "Display");

op.onAnimFrame = render;
hdpi.onChange = function ()
{
    if (hdpi.get()) op.patch.cgl.pixelDensity = window.devicePixelRatio;
    else op.patch.cgl.pixelDensity = 1;

    op.patch.cgl.updateSize();
    if (CABLES.UI) gui.setLayout();
};

active.onChange = function ()
{
    op.patch.removeOnAnimFrame(op);

    if (active.get())
    {
        op.setUiAttrib({ "extendTitle": "" });
        op.onAnimFrame = render;
        op.patch.addOnAnimFrame(op);
        op.log("adding again!");
    }
    else
    {
        op.setUiAttrib({ "extendTitle": "Inactive" });
    }
};

const cgl = op.patch.cgl;
let rframes = 0;
let rframeStart = 0;
let timeOutTest = null;
let addedListener = false;

if (!op.patch.cgl) op.uiAttr({ "error": "No webgl cgl context" });

const identTranslate = vec3.create();
vec3.set(identTranslate, 0, 0, 0);
const identTranslateView = vec3.create();
vec3.set(identTranslateView, 0, 0, -2);

fullscreen.onChange = updateFullscreenButton;
setTimeout(updateFullscreenButton, 100);
let fsElement = null;

let winhasFocus = true;
let winVisible = true;

window.addEventListener("blur", () => { winhasFocus = false; });
window.addEventListener("focus", () => { winhasFocus = true; });
document.addEventListener("visibilitychange", () => { winVisible = !document.hidden; });
testMultiMainloop();

cgl.mainloopOp = this;

inUnit.onChange = () =>
{
    width.set(0);
    height.set(0);
};

function getFpsLimit()
{
    if (reduceLoadingFPS.get() && op.patch.loading.getProgress() < 1.0) return 5;

    if (reduceFocusFPS.get())
    {
        if (!winVisible) return 10;
        if (!winhasFocus) return 30;
    }

    return fpsLimit.get();
}

function updateFullscreenButton()
{
    function onMouseEnter()
    {
        if (fsElement)fsElement.style.display = "block";
    }

    function onMouseLeave()
    {
        if (fsElement)fsElement.style.display = "none";
    }

    op.patch.cgl.canvas.addEventListener("mouseleave", onMouseLeave);
    op.patch.cgl.canvas.addEventListener("mouseenter", onMouseEnter);

    if (fullscreen.get())
    {
        if (!fsElement)
        {
            fsElement = document.createElement("div");

            const container = op.patch.cgl.canvas.parentElement;
            if (container)container.appendChild(fsElement);

            fsElement.addEventListener("mouseenter", onMouseEnter);
            fsElement.addEventListener("click", function (e)
            {
                if (CABLES.UI && !e.shiftKey) gui.cycleFullscreen();
                else cgl.fullScreen();
            });
        }

        fsElement.style.padding = "10px";
        fsElement.style.position = "absolute";
        fsElement.style.right = "5px";
        fsElement.style.top = "5px";
        fsElement.style.width = "20px";
        fsElement.style.height = "20px";
        fsElement.style.cursor = "pointer";
        fsElement.style["border-radius"] = "40px";
        fsElement.style.background = "#444";
        fsElement.style["z-index"] = "9999";
        fsElement.style.display = "none";
        fsElement.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" id=\"Capa_1\" x=\"0px\" y=\"0px\" viewBox=\"0 0 490 490\" style=\"width:20px;height:20px;\" xml:space=\"preserve\" width=\"512px\" height=\"512px\"><g><path d=\"M173.792,301.792L21.333,454.251v-80.917c0-5.891-4.776-10.667-10.667-10.667C4.776,362.667,0,367.442,0,373.333V480     c0,5.891,4.776,10.667,10.667,10.667h106.667c5.891,0,10.667-4.776,10.667-10.667s-4.776-10.667-10.667-10.667H36.416     l152.459-152.459c4.093-4.237,3.975-10.99-0.262-15.083C184.479,297.799,177.926,297.799,173.792,301.792z\" fill=\"#FFFFFF\"/><path d=\"M480,0H373.333c-5.891,0-10.667,4.776-10.667,10.667c0,5.891,4.776,10.667,10.667,10.667h80.917L301.792,173.792     c-4.237,4.093-4.354,10.845-0.262,15.083c4.093,4.237,10.845,4.354,15.083,0.262c0.089-0.086,0.176-0.173,0.262-0.262     L469.333,36.416v80.917c0,5.891,4.776,10.667,10.667,10.667s10.667-4.776,10.667-10.667V10.667C490.667,4.776,485.891,0,480,0z\" fill=\"#FFFFFF\"/><path d=\"M36.416,21.333h80.917c5.891,0,10.667-4.776,10.667-10.667C128,4.776,123.224,0,117.333,0H10.667     C4.776,0,0,4.776,0,10.667v106.667C0,123.224,4.776,128,10.667,128c5.891,0,10.667-4.776,10.667-10.667V36.416l152.459,152.459     c4.237,4.093,10.99,3.975,15.083-0.262c3.992-4.134,3.992-10.687,0-14.82L36.416,21.333z\" fill=\"#FFFFFF\"/><path d=\"M480,362.667c-5.891,0-10.667,4.776-10.667,10.667v80.917L316.875,301.792c-4.237-4.093-10.99-3.976-15.083,0.261     c-3.993,4.134-3.993,10.688,0,14.821l152.459,152.459h-80.917c-5.891,0-10.667,4.776-10.667,10.667s4.776,10.667,10.667,10.667     H480c5.891,0,10.667-4.776,10.667-10.667V373.333C490.667,367.442,485.891,362.667,480,362.667z\" fill=\"#FFFFFF\"/></g></svg>";
    }
    else
    {
        if (fsElement)
        {
            fsElement.style.display = "none";
            fsElement.remove();
            fsElement = null;
        }
    }
}

op.onDelete = function ()
{
    cgl.gl.clearColor(0, 0, 0, 0);
    cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);
};

function render(time)
{
    if (!active.get()) return;
    if (cgl.aborted || cgl.canvas.clientWidth === 0 || cgl.canvas.clientHeight === 0) return;

    op.patch.cg = cgl;

    if (hdpi.get())op.patch.cgl.pixelDensity = window.devicePixelRatio;

    const startTime = performance.now();

    op.patch.config.fpsLimit = getFpsLimit();

    if (cgl.canvasWidth == -1)
    {
        cgl.setCanvas(op.patch.config.glCanvasId);
        return;
    }

    if (cgl.canvasWidth != width.get() || cgl.canvasHeight != height.get())
    {
        let div = 1;
        if (inUnit.get() == "CSS")div = op.patch.cgl.pixelDensity;

        width.set(cgl.canvasWidth / div);
        height.set(cgl.canvasHeight / div);
    }

    if (CABLES.now() - rframeStart > 1000)
    {
        CGL.fpsReport = CGL.fpsReport || [];
        if (op.patch.loading.getProgress() >= 1.0 && rframeStart !== 0)CGL.fpsReport.push(rframes);
        rframes = 0;
        rframeStart = CABLES.now();
    }
    CGL.MESH.lastShader = null;
    CGL.MESH.lastMesh = null;

    cgl.renderStart(cgl, identTranslate, identTranslateView);

    if (clear.get())
    {
        cgl.gl.clearColor(0, 0, 0, 1);
        cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);
    }

    trigger.trigger();

    if (CGL.MESH.lastMesh)CGL.MESH.lastMesh.unBind();

    if (CGL.Texture.previewTexture)
    {
        if (!CGL.Texture.texturePreviewer) CGL.Texture.texturePreviewer = new CGL.Texture.texturePreview(cgl);
        CGL.Texture.texturePreviewer.render(CGL.Texture.previewTexture);
    }
    cgl.renderEnd(cgl);

    op.patch.cg = null;

    if (clearAlpha.get())
    {
        cgl.gl.clearColor(1, 1, 1, 1);
        cgl.gl.colorMask(false, false, false, true);
        cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT);
        cgl.gl.colorMask(true, true, true, true);
    }

    if (!cgl.frameStore.phong)cgl.frameStore.phong = {};
    rframes++;

    op.patch.cgl.profileData.profileMainloopMs = performance.now() - startTime;
}

function testMultiMainloop()
{
    clearTimeout(timeOutTest);
    timeOutTest = setTimeout(
        () =>
        {
            if (op.patch.getOpsByObjName(op.name).length > 1)
            {
                op.setUiError("multimainloop", "there should only be one mainloop op!");
                if (!addedListener)addedListener = op.patch.addEventListener("onOpDelete", testMultiMainloop);
            }
            else op.setUiError("multimainloop", null, 1);
        }, 500);
}


};

Ops.Gl.MainLoop.prototype = new CABLES.Op();
CABLES.OPS["b0472a1d-db16-4ba6-8787-f300fbdc77bb"]={f:Ops.Gl.MainLoop,objName:"Ops.Gl.MainLoop"};



window.addEventListener('load', function(event) {
CABLES.jsLoaded=new Event('CABLES.jsLoaded');
document.dispatchEvent(CABLES.jsLoaded);
});
