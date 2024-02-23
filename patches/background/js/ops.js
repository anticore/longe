"use strict";

var CABLES=CABLES||{};
CABLES.OPS=CABLES.OPS||{};

var Ops=Ops || {};
Ops.Gl=Ops.Gl || {};
Ops.Ui=Ops.Ui || {};
Ops.Anim=Ops.Anim || {};
Ops.Math=Ops.Math || {};
Ops.User=Ops.User || {};
Ops.Boolean=Ops.Boolean || {};
Ops.Devices=Ops.Devices || {};
Ops.Trigger=Ops.Trigger || {};
Ops.Gl.Meshes=Ops.Gl.Meshes || {};
Ops.Devices.Mouse=Ops.Devices.Mouse || {};
Ops.User.anticore=Ops.User.anticore || {};
Ops.Gl.ImageCompose=Ops.Gl.ImageCompose || {};
Ops.Gl.ImageCompose.Noise=Ops.Gl.ImageCompose.Noise || {};



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




// **************************************************************
// 
// Ops.Trigger.Sequence
// 
// **************************************************************

Ops.Trigger.Sequence = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    exe = op.inTrigger("exe"),
    cleanup = op.inTriggerButton("Clean up connections");

const
    exes = [],
    triggers = [],
    num = 16;

let
    updateTimeout = null,
    connectedOuts = [];

exe.onTriggered = triggerAll;
cleanup.onTriggered = clean;
cleanup.setUiAttribs({ "hideParam": true, "hidePort": true });

for (let i = 0; i < num; i++)
{
    const p = op.outTrigger("trigger " + i);
    triggers.push(p);
    p.onLinkChanged = updateButton;

    if (i < num - 1)
    {
        let newExe = op.inTrigger("exe " + i);
        newExe.onTriggered = triggerAll;
        exes.push(newExe);
    }
}

updateConnected();

function updateConnected()
{
    connectedOuts.length = 0;
    for (let i = 0; i < triggers.length; i++)
        if (triggers[i].links.length > 0) connectedOuts.push(triggers[i]);
}

function updateButton()
{
    updateConnected();
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() =>
    {
        let show = false;
        for (let i = 0; i < triggers.length; i++)
            if (triggers[i].links.length > 1) show = true;

        cleanup.setUiAttribs({ "hideParam": !show });

        if (op.isCurrentUiOp()) op.refreshParams();
    }, 60);
}

function triggerAll()
{
    // for (let i = 0; i < triggers.length; i++) triggers[i].trigger();
    for (let i = 0; i < connectedOuts.length; i++) connectedOuts[i].trigger();
}

function clean()
{
    let count = 0;
    for (let i = 0; i < triggers.length; i++)
    {
        let removeLinks = [];

        if (triggers[i].links.length > 1)
            for (let j = 1; j < triggers[i].links.length; j++)
            {
                while (triggers[count].links.length > 0) count++;

                removeLinks.push(triggers[i].links[j]);
                const otherPort = triggers[i].links[j].getOtherPort(triggers[i]);
                op.patch.link(op, "trigger " + count, otherPort.op, otherPort.name);
                count++;
            }

        for (let j = 0; j < removeLinks.length; j++) removeLinks[j].remove();
    }
    updateButton();
    updateConnected();
}


};

Ops.Trigger.Sequence.prototype = new CABLES.Op();
CABLES.OPS["a466bc1f-06e9-4595-8849-bffb9fe22f99"]={f:Ops.Trigger.Sequence,objName:"Ops.Trigger.Sequence"};




// **************************************************************
// 
// Ops.Gl.ImageCompose.ImageCompose_v3
// 
// **************************************************************

Ops.Gl.ImageCompose.ImageCompose_v3 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"imgcomp_frag":"IN vec2 texCoord;\nUNI vec4 bgColor;\nUNI sampler2D tex;\n#ifdef USE_UVTEX\nUNI sampler2D UVTex;\n#endif\n\nvoid main()\n{\n\n    #ifndef USE_TEX\n        outColor=bgColor;\n    #endif\n    #ifdef USE_TEX\n        #ifndef USE_UVTEX\n        outColor=texture(tex,texCoord);\n        #else\n        outColor=texture(tex,texture(UVTex,texCoord).xy);\n        #endif\n    #endif\n\n\n\n}\n",};
const
    cgl = op.patch.cgl,
    render = op.inTrigger("Render"),
    inTex = op.inTexture("Base Texture"),
    inUVTex = op.inTexture("UV Texture"),
    inSize = op.inSwitch("Size", ["Auto", "Manual"], "Auto"),
    width = op.inValueInt("Width", 640),
    height = op.inValueInt("Height", 480),
    inFilter = op.inSwitch("Filter", ["nearest", "linear", "mipmap"], "linear"),
    inWrap = op.inValueSelect("Wrap", ["clamp to edge", "repeat", "mirrored repeat"], "repeat"),
    inPixel = op.inDropDown("Pixel Format", CGL.Texture.PIXELFORMATS, CGL.Texture.PFORMATSTR_RGBA8UB),

    r = op.inValueSlider("R", 0),
    g = op.inValueSlider("G", 0),
    b = op.inValueSlider("B", 0),
    a = op.inValueSlider("A", 0),

    trigger = op.outTrigger("Next"),
    texOut = op.outTexture("texture_out", CGL.Texture.getEmptyTexture(cgl)),
    outRatio = op.outNumber("Aspect Ratio"),
    outWidth = op.outNumber("Texture Width"),
    outHeight = op.outNumber("Texture Height");

op.setPortGroup("Texture Size", [inSize, width, height]);
op.setPortGroup("Texture Parameters", [inWrap, inFilter, inPixel]);

r.setUiAttribs({ "colorPick": true });
op.setPortGroup("Color", [r, g, b, a]);

op.toWorkPortsNeedToBeLinked(render);

const prevViewPort = [0, 0, 0, 0];
let effect = null;
let tex = null;
let reInitEffect = true;
let isFloatTex = false;
let copyShader = null;
let copyShaderTexUni = null;
let copyShaderUVTexUni = null;
let copyShaderRGBAUni = null;

inWrap.onChange =
    inFilter.onChange =
    inPixel.onChange = reInitLater;

inTex.onLinkChanged =
inSize.onChange =
inUVTex.onChange = updateUi;

render.onTriggered =
    op.preRender = doRender;

updateUi();

function initEffect()
{
    if (effect)effect.delete();
    if (tex)tex.delete();

    effect = new CGL.TextureEffect(cgl, { "isFloatingPointTexture": CGL.Texture.isPixelFormatFloat(inPixel.get()) });

    tex = new CGL.Texture(cgl,
        {
            "name": "image_compose_v2_" + op.id,
            "isFloatingPointTexture": CGL.Texture.isPixelFormatFloat(inPixel.get()),
            "pixelFormat": inPixel.get(),
            "filter": getFilter(),
            "wrap": getWrap(),
            "width": getWidth(),
            "height": getHeight()
        });

    effect.setSourceTexture(tex);

    outWidth.set(getWidth());
    outHeight.set(getHeight());
    outRatio.set(getWidth() / getHeight());

    texOut.set(CGL.Texture.getEmptyTexture(cgl));

    reInitEffect = false;
    updateUi();
}

function getFilter()
{
    if (inFilter.get() == "nearest") return CGL.Texture.FILTER_NEAREST;
    else if (inFilter.get() == "linear") return CGL.Texture.FILTER_LINEAR;
    else if (inFilter.get() == "mipmap") return CGL.Texture.FILTER_MIPMAP;
}

function getWrap()
{
    if (inWrap.get() == "repeat") return CGL.Texture.WRAP_REPEAT;
    else if (inWrap.get() == "mirrored repeat") return CGL.Texture.WRAP_MIRRORED_REPEAT;
    else if (inWrap.get() == "clamp to edge") return CGL.Texture.WRAP_CLAMP_TO_EDGE;
}

function getWidth()
{
    if (inTex.get() && inSize.get() == "Auto") return inTex.get().width;
    if (inSize.get() == "Auto") return cgl.getViewPort()[2];
    return Math.ceil(width.get());
}

function getHeight()
{
    if (inTex.get() && inSize.get() == "Auto") return inTex.get().height;
    else if (inSize.get() == "Auto") return cgl.getViewPort()[3];
    else return Math.ceil(height.get());
}

function reInitLater()
{
    reInitEffect = true;
}

function updateResolution()
{
    if ((
        getWidth() != tex.width ||
        getHeight() != tex.height ||
        // tex.isFloatingPoint() != CGL.Texture.isPixelFormatFloat(inPixel.get()) ||
        tex.pixelFormat != inPixel.get() ||
        tex.filter != getFilter() ||
        tex.wrap != getWrap()
    ) && (getWidth() !== 0 && getHeight() !== 0))
    {
        initEffect();
        effect.setSourceTexture(tex);
        texOut.set(CGL.Texture.getEmptyTexture(cgl));
        texOut.set(tex);
        updateResolutionInfo();
        checkTypes();
    }
}

function updateResolutionInfo()
{
    let info = null;

    if (inSize.get() == "Manual")
    {
        info = null;
    }
    else if (inSize.get() == "Auto")
    {
        if (inTex.get()) info = "Input Texture";
        else info = "Canvas Size";

        info += ": " + getWidth() + " x " + getHeight();
    }

    let changed = false;
    changed = inSize.uiAttribs.info != info;
    inSize.setUiAttribs({ "info": info });
    if (changed)op.refreshParams();
}

function updateDefines()
{
    if (copyShader)copyShader.toggleDefine("USE_TEX", inTex.isLinked());
    if (copyShader)copyShader.toggleDefine("USE_UVTEX", inUVTex.isLinked());
}

function updateUi()
{
    r.setUiAttribs({ "greyout": inTex.isLinked() });
    b.setUiAttribs({ "greyout": inTex.isLinked() });
    g.setUiAttribs({ "greyout": inTex.isLinked() });
    a.setUiAttribs({ "greyout": inTex.isLinked() });

    width.setUiAttribs({ "greyout": inSize.get() == "Auto" });
    height.setUiAttribs({ "greyout": inSize.get() == "Auto" });

    width.setUiAttribs({ "hideParam": inSize.get() != "Manual" });
    height.setUiAttribs({ "hideParam": inSize.get() != "Manual" });

    if (tex)
        if (CGL.Texture.isPixelFormatFloat(inPixel.get()) && getFilter() == CGL.Texture.FILTER_MIPMAP) op.setUiError("fpmipmap", "Don't use mipmap and 32bit at the same time, many systems do not support this.");
        else op.setUiError("fpmipmap", null);

    updateResolutionInfo();
    updateDefines();
    checkTypes();
}

function checkTypes()
{
    if (tex)
        if (inTex.isLinked() && inTex.get() && tex.textureType != inTex.get().textureType && (tex.textureType != CGL.Texture.TYPE_FLOAT || inTex.get().textureType == CGL.Texture.TYPE_FLOAT))
            op.setUiError("textypediff", "Drawing 32bit texture into an 8 bit can result in data/precision loss", 1);
        else
            op.setUiError("textypediff", null);
}

op.preRender = () =>
{
    doRender();
};

function copyTexture()
{
    if (!copyShader)
    {
        copyShader = new CGL.Shader(cgl, "copytextureshader");
        copyShader.setSource(copyShader.getDefaultVertexShader(), attachments.imgcomp_frag);
        copyShaderTexUni = new CGL.Uniform(copyShader, "t", "tex", 0);
        copyShaderUVTexUni = new CGL.Uniform(copyShader, "t", "UVTex", 1);
        copyShaderRGBAUni = new CGL.Uniform(copyShader, "4f", "bgColor", r, g, b, a);
        updateDefines();
    }

    cgl.pushShader(copyShader);
    cgl.currentTextureEffect.bind();

    if (inTex.get()) cgl.setTexture(0, inTex.get().tex);
    if (inUVTex.get()) cgl.setTexture(1, inUVTex.get().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();
}

function doRender()
{
    if (!effect || reInitEffect) initEffect();

    const vp = cgl.getViewPort();
    prevViewPort[0] = vp[0];
    prevViewPort[1] = vp[1];
    prevViewPort[2] = vp[2];
    prevViewPort[3] = vp[3];

    cgl.pushBlend(false);

    updateResolution();

    const oldEffect = cgl.currentTextureEffect;
    cgl.currentTextureEffect = effect;
    cgl.currentTextureEffect.imgCompVer = 3;
    cgl.currentTextureEffect.width = width.get();
    cgl.currentTextureEffect.height = height.get();
    effect.setSourceTexture(tex);

    effect.startEffect(inTex.get() || CGL.Texture.getEmptyTexture(cgl, isFloatTex), true);
    copyTexture();

    trigger.trigger();

    // texOut.set(CGL.Texture.getEmptyTexture(cgl));

    texOut.setRef(effect.getCurrentSourceTexture());

    effect.endEffect();

    cgl.setViewPort(prevViewPort[0], prevViewPort[1], prevViewPort[2], prevViewPort[3]);

    cgl.popBlend(false);
    cgl.currentTextureEffect = oldEffect;
}


};

Ops.Gl.ImageCompose.ImageCompose_v3.prototype = new CABLES.Op();
CABLES.OPS["e890a050-11b7-456e-b09b-d08cd9c1ee41"]={f:Ops.Gl.ImageCompose.ImageCompose_v3,objName:"Ops.Gl.ImageCompose.ImageCompose_v3"};




// **************************************************************
// 
// Ops.Gl.ImageCompose.Noise.FBMNoise_v2
// 
// **************************************************************

Ops.Gl.ImageCompose.Noise.FBMNoise_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"fbmnoise_frag":"UNI sampler2D tex;\nUNI float anim;\n\nUNI float scale;\nUNI float repeat;\n\nUNI float scrollX;\nUNI float scrollY;\n\nUNI float amount;\n\nUNI bool layer1;\nUNI bool layer2;\nUNI bool layer3;\nUNI bool layer4;\nUNI vec3 color;\nUNI float aspect;\n\nIN vec2 texCoord;\n\n\n{{CGL.BLENDMODES3}}\n\n// csdcsdcds\n// adapted from warp shader by inigo quilez/iq\n// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.\n\n// See here for a tutorial on how to make this: http://www.iquilezles.org/www/articles/warp/warp.htm\n\nconst mat2 m = mat2( 0.80,  0.60, -0.60,  0.80 );\n\nfloat noise( in vec2 x )\n{\n\treturn sin(1.5*x.x)*sin(1.5*x.y);\n}\n\nfloat fbm4( vec2 p )\n{\n    float f = 0.0;\n    f += 0.5000*noise( p ); p = m*p*2.02;\n    f += 0.2500*noise( p ); p = m*p*2.03;\n    f += 0.1250*noise( p ); p = m*p*2.01;\n    f += 0.0625*noise( p );\n    return f/0.9375;\n}\n\nfloat fbm6( vec2 p )\n{\n    float f = 0.0;\n    f += 0.500000*(0.5+0.5*noise( p )); p = m*p*2.02;\n    f += 0.250000*(0.5+0.5*noise( p )); p = m*p*2.03;\n    f += 0.125000*(0.5+0.5*noise( p )); p = m*p*2.01;\n    f += 0.062500*(0.5+0.5*noise( p )); p = m*p*2.04;\n    f += 0.031250*(0.5+0.5*noise( p )); p = m*p*2.01;\n    f += 0.015625*(0.5+0.5*noise( p ));\n    return f/0.96875;\n}\n\nvoid main()\n{\n    vec2 tc=texCoord;\n\t#ifdef DO_TILEABLE\n\t    tc=abs(texCoord-0.5);\n\t#endif\n\n    vec2 p=(tc-0.5)*scale;\n\n    p.y/=aspect;\n    vec2 q = vec2( fbm4( p + vec2(0.3+scrollX,0.20+scrollY) ),\n                   fbm4( p + vec2(3.1+scrollX,1.3+scrollY) ) );\n\n    vec2 q2 = vec2( fbm4( p + vec2(2.0+scrollX,1.0+scrollY) ),\n                   fbm4( p + vec2(3.1+scrollX,1.3+scrollY) ) );\n\n    vec2 q3 = vec2( fbm4( p + vec2(9.0+scrollX,4.0+scrollY) ),\n                   fbm4( p + vec2(3.1+scrollX,4.3+scrollY) ) );\n\n    float v= fbm4( ( p + 4.0*q +anim*0.1)*repeat);\n    float v2= fbm4( (p + 4.0*q2 +anim*0.1)*repeat );\n\n    float v3= fbm6( (p + 4.0*q3 +anim*0.1)*repeat );\n    float v4= fbm6( (p + 4.0*q2 +anim*0.1)*repeat );\n\n    vec4 base=texture(tex,texCoord);\n\n    vec4 finalColor;\n    float colVal=0.0;\n    float numLayers=0.0;\n\n    if(layer1)\n    {\n        colVal+=v;\n        numLayers++;\n    }\n\n    if(layer2)\n    {\n        colVal+=v2;\n        numLayers++;\n    }\n\n    if(layer3)\n    {\n        colVal+=v3;\n        numLayers++;\n    }\n\n    if(layer4)\n    {\n        colVal+=v4;\n        numLayers++;\n    }\n\n    finalColor=vec4( color*vec3(colVal/numLayers),1.0);\n\n    outColor = cgl_blendPixel(base,finalColor,amount);\n}\n",};
const
    render = op.inTrigger("render"),
    blendMode = CGL.TextureEffect.AddBlendSelect(op, "Blend Mode", "normal"),
    amount = op.inValueSlider("Amount", 1),
    maskAlpha = CGL.TextureEffect.AddBlendAlphaMask(op),
    r = op.inValueSlider("r", 1.0),
    g = op.inValueSlider("g", 1.0),
    b = op.inValueSlider("b", 1.0),
    trigger = op.outTrigger("trigger");

r.setUiAttribs({ "colorPick": true });

const cgl = op.patch.cgl;
const shader = new CGL.Shader(cgl, "fbmnoise");

shader.setSource(shader.getDefaultVertexShader(), attachments.fbmnoise_frag);

const
    textureUniform = new CGL.Uniform(shader, "t", "tex", 0),
    uniScale = new CGL.Uniform(shader, "f", "scale", op.inValue("scale", 2)),
    uniAnim = new CGL.Uniform(shader, "f", "anim", op.inValue("anim", 0)),
    uniScrollX = new CGL.Uniform(shader, "f", "scrollX", op.inValue("scrollX", 9)),
    uniScrollY = new CGL.Uniform(shader, "f", "scrollY", op.inValue("scrollY", 0)),
    uniRepeat = new CGL.Uniform(shader, "f", "repeat", op.inValue("repeat", 1)),
    uniAspect = new CGL.Uniform(shader, "f", "aspect", op.inValue("aspect", 1)),
    uniLayer1 = new CGL.Uniform(shader, "b", "layer1", op.inValueBool("Layer 1", true)),
    uniLayer2 = new CGL.Uniform(shader, "b", "layer2", op.inValueBool("Layer 2", true)),
    uniLayer3 = new CGL.Uniform(shader, "b", "layer3", op.inValueBool("Layer 3", true)),
    uniLayer4 = new CGL.Uniform(shader, "b", "layer4", op.inValueBool("Layer 4", true)),
    uniColor = new CGL.Uniform(shader, "3f", "color", r, g, b),
    amountUniform = new CGL.Uniform(shader, "f", "amount", amount);

const tile = op.inValueBool("Tileable", false);
tile.onChange = updateTileable;

CGL.TextureEffect.setupBlending(op, shader, blendMode, amount, maskAlpha);

function updateTileable()
{
    shader.toggleDefine("DO_TILEABLE", tile.get());
}

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    uniAspect.set(cgl.currentTextureEffect.getCurrentSourceTexture().width / cgl.currentTextureEffect.getCurrentSourceTexture().height);

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.ImageCompose.Noise.FBMNoise_v2.prototype = new CABLES.Op();
CABLES.OPS["9422eeab-b6c5-47d1-8737-d5c43dc137a3"]={f:Ops.Gl.ImageCompose.Noise.FBMNoise_v2,objName:"Ops.Gl.ImageCompose.Noise.FBMNoise_v2"};




// **************************************************************
// 
// Ops.Ui.VizTexture
// 
// **************************************************************

Ops.Ui.VizTexture = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"viztex_frag":"IN vec2 texCoord;\nUNI sampler2D tex;\nUNI samplerCube cubeMap;\nUNI float width;\nUNI float height;\nUNI float type;\nUNI float time;\n\nfloat LinearizeDepth(float d,float zNear,float zFar)\n{\n    float z_n = 2.0 * d - 1.0;\n    return 2.0 * zNear / (zFar + zNear - z_n * (zFar - zNear));\n}\n\nvoid main()\n{\n    vec4 col=vec4(vec3(0.),0.0);\n\n    vec4 colTex=texture(tex,texCoord);\n\n\n\n    if(type==1.0)\n    {\n        vec4 depth=vec4(0.);\n        vec2 localST=texCoord;\n        localST.y = 1. - localST.y;\n\n        localST.t = mod(localST.t*3.,1.);\n        localST.s = mod(localST.s*4.,1.);\n\n        #ifdef WEBGL2\n            #define texCube texture\n        #endif\n        #ifdef WEBGL1\n            #define texCube textureCube\n        #endif\n\n//         //Due to the way my depth-cubeMap is rendered, objects to the -x,y,z side is projected to the positive x,y,z side\n//         //Inside where top/bottom is to be drawn?\n        if (texCoord.s*4.> 1. && texCoord.s*4.<2.)\n        {\n            //Bottom (-y) quad\n            if (texCoord.t*3. < 1.)\n            {\n                vec3 dir=vec3(localST.s*2.-1.,-1.,-localST.t*2.+1.);//Due to the (arbitrary) way I choose as up in my depth-viewmatrix, i her emultiply the latter coordinate with -1\n                depth = texCube(cubeMap, dir);\n            }\n            //top (+y) quad\n            else if (texCoord.t*3. > 2.)\n            {\n                vec3 dir=vec3(localST.s*2.-1.,1.,localST.t*2.-1.);//Get lower y texture, which is projected to the +y part of my cubeMap\n                depth = texCube(cubeMap, dir);\n            }\n            else//Front (-z) quad\n            {\n                vec3 dir=vec3(localST.s*2.-1.,-localST.t*2.+1.,1.);\n                depth = texCube(cubeMap, dir);\n            }\n        }\n//         //If not, only these ranges should be drawn\n        else if (texCoord.t*3. > 1. && texCoord.t*3. < 2.)\n        {\n            if (texCoord.x*4. < 1.)//left (-x) quad\n            {\n                vec3 dir=vec3(-1.,-localST.t*2.+1.,localST.s*2.-1.);\n                depth = texCube(cubeMap, dir);\n            }\n            else if (texCoord.x*4. < 3.)//right (+x) quad (front was done above)\n            {\n                vec3 dir=vec3(1,-localST.t*2.+1.,-localST.s*2.+1.);\n                depth = texCube(cubeMap, dir);\n            }\n            else //back (+z) quad\n            {\n                vec3 dir=vec3(-localST.s*2.+1.,-localST.t*2.+1.,-1.);\n                depth = texCube(cubeMap, dir);\n            }\n        }\n        // colTex = vec4(vec3(depth),1.);\n        colTex = vec4(depth);\n    }\n\n    if(type==2.0)\n    {\n       float near = 0.1;\n       float far = 50.;\n       float depth = LinearizeDepth(colTex.r, near, far);\n       colTex.rgb = vec3(depth);\n    }\n\n\n    #ifdef ANIM_RANGE\n\n        if(colTex.r>1.0 || colTex.r<0.0)\n            colTex.r=mod(colTex.r,1.0)*0.5+(sin(colTex.r+mod(colTex.r*3.0,1.0)+time*5.0)*0.5+0.5)*0.5;\n        if(colTex.g>1.0 || colTex.g<0.0)\n            colTex.g=mod(colTex.g,1.0)*0.5+(sin(colTex.g+mod(colTex.g*3.0,1.0)+time*5.0)*0.5+0.5)*0.5;\n        if(colTex.b>1.0 || colTex.b<0.0)\n            colTex.b=mod(colTex.b,1.0)*0.5+(sin(colTex.b+mod(colTex.b*3.0,1.0)+time*5.0)*0.5+0.5)*0.5;\n\n    #endif\n\n\n    // #ifdef ANIM_RANGE\n    //     if(colTex.r>1.0 || colTex.r<0.0)\n    //     {\n    //         float r=mod( time+colTex.r,1.0)*0.5+0.5;\n    //         colTex.r=r;\n    //     }\n    //     if(colTex.g>1.0 || colTex.g<0.0)\n    //     {\n    //         float r=mod( time+colTex.g,1.0)*0.5+0.5;\n    //         colTex.g=r;\n    //     }\n    //     if(colTex.b>1.0 || colTex.b<0.0)\n    //     {\n    //         float r=mod( time+colTex.b,1.0)*0.5+0.5;\n    //         colTex.b=r;\n    //     }\n    // #endif\n\n    outColor = mix(col,colTex,colTex.a);\n}\n\n","viztex_vert":"IN vec3 vPosition;\nIN vec2 attrTexCoord;\nOUT vec2 texCoord;\nUNI mat4 projMatrix;\nUNI mat4 modelMatrix;\nUNI mat4 viewMatrix;\n\nvoid main()\n{\n    texCoord=vec2(attrTexCoord.x,1.0-attrTexCoord.y);\n    vec4 pos = vec4( vPosition, 1. );\n    mat4 mvMatrix=viewMatrix * modelMatrix;\n    gl_Position = projMatrix * mvMatrix * pos;\n}",};
const
    inTex = op.inTexture("Texture In"),
    inShowInfo = op.inBool("Show Info", false),
    inVizRange = op.inSwitch("Visualize outside 0-1", ["Off", "Anim"], "Anim"),

    inPickColor = op.inBool("Show Color", false),
    inX = op.inFloatSlider("X", 0.5),
    inY = op.inFloatSlider("Y", 0.5),

    outTex = op.outTexture("Texture Out"),
    outInfo = op.outString("Info");

op.setUiAttrib({ "height": 150, "resizable": true });

const timer = new CABLES.Timer();
timer.play();

let shader = null;
let fb = null;
let pixelReader = null;
let colorString = "";

inVizRange.onChange = updateDefines;

inPickColor.onChange = updateUi;
updateUi();

op.checkMainloopExists();

function updateUi()
{
    inX.setUiAttribs({ "greyout": !inPickColor.get() });
    inY.setUiAttribs({ "greyout": !inPickColor.get() });
}

inTex.onChange = () =>
{
    const t = inTex.get();

    outTex.setRef(t);

    let title = "";

    if (inTex.get() && inTex.links[0]) title = inTex.links[0].getOtherPort(inTex).name;

    op.setUiAttrib({ "extendTitle": title });
};

function updateDefines()
{
    if (!shader) return;
    shader.toggleDefine("ANIM_RANGE", inVizRange.get() == "Anim");
    op.checkMainloopExists();
}

op.renderVizLayer = (ctx, layer) =>
{
    const port = inTex;
    const texSlot = 5;
    const texSlotCubemap = texSlot + 1;

    const perf = CABLES.UI.uiProfiler.start("previewlayer texture");
    const cgl = port.op.patch.cgl;

    if (!layer.useGl) return;

    if (!this._emptyCubemap) this._emptyCubemap = CGL.Texture.getEmptyCubemapTexture(cgl);
    port.op.patch.cgl.profileData.profileTexPreviews++;

    const portTex = port.get() || CGL.Texture.getEmptyTexture(cgl);

    if (!this._mesh)
    {
        const geom = new CGL.Geometry("vizTexture rect");
        geom.vertices = [1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0, -1.0, 0.0];
        geom.texCoords = [
            1.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            0.0, 0.0];
        geom.verticesIndices = [0, 1, 2, 3, 1, 2];
        this._mesh = new CGL.Mesh(cgl, geom);
    }
    if (!this._shader)
    {
        this._shader = new CGL.Shader(cgl, "glpreviewtex");
        this._shader.setModules(["MODULE_VERTEX_POSITION", "MODULE_COLOR", "MODULE_BEGIN_FRAG"]);
        this._shader.setSource(attachments.viztex_vert, attachments.viztex_frag);
        this._shaderTexUniform = new CGL.Uniform(this._shader, "t", "tex", texSlot);
        this._shaderTexCubemapUniform = new CGL.Uniform(this._shader, "tc", "cubeMap", texSlotCubemap);
        shader = this._shader;
        updateDefines();

        this._shaderTexUniformW = new CGL.Uniform(this._shader, "f", "width", portTex.width);
        this._shaderTexUniformH = new CGL.Uniform(this._shader, "f", "height", portTex.height);
        this._shaderTypeUniform = new CGL.Uniform(this._shader, "f", "type", 0);
        this._shaderTimeUniform = new CGL.Uniform(this._shader, "f", "time", 0);
    }

    cgl.pushPMatrix();
    const sizeTex = [portTex.width, portTex.height];
    const small = port.op.patch.cgl.canvasWidth > sizeTex[0] && port.op.patch.cgl.canvasHeight > sizeTex[1];

    if (small)
    {
        mat4.ortho(cgl.pMatrix, 0, port.op.patch.cgl.canvasWidth, port.op.patch.cgl.canvasHeight, 0, 0.001, 11);
    }
    else mat4.ortho(cgl.pMatrix, -1, 1, 1, -1, 0.001, 11);

    const oldTex = cgl.getTexture(texSlot);
    const oldTexCubemap = cgl.getTexture(texSlotCubemap);

    let texType = 0;
    if (!portTex) return;
    if (portTex.cubemap) texType = 1;
    if (portTex.textureType == CGL.Texture.TYPE_DEPTH) texType = 2;

    if (texType == 0 || texType == 2)
    {
        cgl.setTexture(texSlot, portTex.tex);
        cgl.setTexture(texSlotCubemap, this._emptyCubemap.cubemap, cgl.gl.TEXTURE_CUBE_MAP);
    }
    else if (texType == 1)
    {
        cgl.setTexture(texSlotCubemap, portTex.cubemap, cgl.gl.TEXTURE_CUBE_MAP);
    }

    timer.update();
    this._shaderTimeUniform.setValue(timer.get());

    this._shaderTypeUniform.setValue(texType);
    let s = [port.op.patch.cgl.canvasWidth, port.op.patch.cgl.canvasHeight];

    cgl.gl.clearColor(0, 0, 0, 0);
    cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);

    cgl.pushModelMatrix();
    if (small)
    {
        s = sizeTex;
        mat4.translate(cgl.mMatrix, cgl.mMatrix, [sizeTex[0] / 2, sizeTex[1] / 2, 0]);
        mat4.scale(cgl.mMatrix, cgl.mMatrix, [sizeTex[0] / 2, sizeTex[1] / 2, 0]);
    }
    this._mesh.render(this._shader);
    cgl.popModelMatrix();

    if (texType == 0) cgl.setTexture(texSlot, oldTex);
    if (texType == 1) cgl.setTexture(texSlotCubemap, oldTexCubemap);

    cgl.popPMatrix();
    cgl.resetViewPort();

    const sizeImg = [layer.width, layer.height];

    const stretch = false;
    if (!stretch)
    {
        if (portTex.width > portTex.height) sizeImg[1] = layer.width * sizeTex[1] / sizeTex[0];
        else
        {
            sizeImg[1] = layer.width * (sizeTex[1] / sizeTex[0]);

            if (sizeImg[1] > layer.height)
            {
                const r = layer.height / sizeImg[1];
                sizeImg[0] *= r;
                sizeImg[1] *= r;
            }
        }
    }

    const scaledDown = sizeImg[0] > sizeTex[0] && sizeImg[1] > sizeTex[1];

    ctx.imageSmoothingEnabled = !small || !scaledDown;

    if (!ctx.imageSmoothingEnabled)
    {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(layer.x, layer.y - 10, 10, 10);
        ctx.fillStyle = "#000000";
        ctx.fillRect(layer.x, layer.y - 10, 5, 5);
        ctx.fillRect(layer.x + 5, layer.y - 10 + 5, 5, 5);
    }

    let layerHeight = layer.height;
    let numX = (10 * layer.width / layerHeight);
    let stepY = (layerHeight / 10);
    let stepX = (layer.width / numX);
    for (let x = 0; x < numX; x++)
        for (let y = 0; y < 10; y++)
        {
            if ((x + y) % 2 == 0)ctx.fillStyle = "#333333";
            else ctx.fillStyle = "#393939";
            ctx.fillRect(layer.x + stepX * x, layer.y + stepY * y, stepX, stepY);
        }

    ctx.fillStyle = "#222";
    const borderLeft = (layer.width - sizeImg[0]) / 2;
    const borderTop = (layerHeight - sizeImg[1]) / 2;

    let imgPosX = layer.x + (layer.width - sizeImg[0]) / 2;
    let imgPosY = layer.y + (layerHeight - sizeImg[1]) / 2;
    let imgSizeW = sizeImg[0];
    let imgSizeH = sizeImg[1];

    if (layerHeight - sizeImg[1] < 0)
    {
        imgPosX = layer.x + (layer.width - sizeImg[0] * layerHeight / sizeImg[1]) / 2;
        imgPosY = layer.y;
        imgSizeW = sizeImg[0] * layerHeight / sizeImg[1];
        imgSizeH = layerHeight;
    }

    ctx.fillRect(layer.x, layer.y, imgPosX - layer.x, layerHeight);
    ctx.fillRect(layer.x + imgSizeW + imgPosX - layer.x, layer.y, layer.x + imgSizeW, layerHeight);
    ctx.fillRect(layer.x, layer.y, layer.width, borderTop);
    ctx.fillRect(layer.x, layer.y + sizeImg[1] + borderTop, layer.width, borderTop);

    if (cgl.canvasWidth > 0 && cgl.canvasHeight > 0)
    {
        if (sizeTex[1] == 1)
            ctx.drawImage(cgl.canvas,
                0,
                0,
                s[0],
                s[1],
                layer.x,
                layer.y,
                layer.width,
                layerHeight * 5);// workaround filtering problems
        if (sizeTex[0] == 1)
            ctx.drawImage(cgl.canvas,
                0,
                0,
                s[0],
                s[1],
                layer.x,
                layer.y,
                layer.width * 5,
                layerHeight); // workaround filtering problems
        else
            try
            {
                if (sizeImg[0] != 0 && sizeImg[1] != 0 && layer.width != 0 && layerHeight != 0 && imgSizeW != 0 && imgSizeH != 0)
                // if(layerHeight - sizeImg[1]>=0)
                    ctx.drawImage(cgl.canvas,
                        0,
                        0,
                        s[0],
                        s[1],
                        imgPosX,
                        imgPosY,
                        imgSizeW,
                        imgSizeH);
            // else
            //     ctx.drawImage(cgl.canvas,
            //         0,
            //         0,
            //         s[0],
            //         s[1],
            //         layer.x + (layer.width - sizeImg[0]*layerHeight/sizeImg[1]) / 2,
            //         layer.y ,
            //         sizeImg[0]*layerHeight/sizeImg[1],
            //         layerHeight);
            }
            catch (e)
            {
                console.error("canvas drawimage exception...", e);
            }
    }

    let info = "";

    if (inShowInfo.get())
    {
        if (port.get() && port.get().getInfoOneLine) info += port.get().getInfoOneLine() + "\n";

        // ctx.save();
        // ctx.scale(layer.scale, layer.scale);
        // ctx.font = "normal 10px sourceCodePro";
        // ctx.fillStyle = "#000";
        // ctx.fillText(info, layer.x / layer.scale + 5 + 0.5, (layer.y + layer.height) / layer.scale - 5 + 0.5);
        // ctx.fillStyle = "#aaa";
        // ctx.fillText(info, layer.x / layer.scale + 5, (layer.y + layer.height) / layer.scale - 5);
        // ctx.restore();
    }

    if (inPickColor.get())
    {
        info += colorString + "\n";

        // ctx.save();
        // ctx.scale(layer.scale, layer.scale);
        // ctx.font = "normal 10px sourceCodePro";
        // ctx.fillStyle = "#000";
        // ctx.fillText("RGBA " + colorString, layer.x / layer.scale + 10 + 0.5, layer.y / layer.scale + 10 + 0.5);
        // ctx.fillStyle = "#aaa";
        // ctx.fillText("RGBA " + colorString, layer.x / layer.scale + 10, layer.y / layer.scale + 10);

        // ctx.restore();

        const x = imgPosX + imgSizeW * inX.get();
        const y = imgPosY + imgSizeH * inY.get();

        ctx.fillStyle = "#000";
        ctx.fillRect(
            x - 1,
            y - 10,
            3,
            20);

        ctx.fillRect(
            x - 10,
            y - 1,
            20,
            3);

        ctx.fillStyle = "#fff";
        ctx.fillRect(
            x - 1,
            y - 10,
            1,
            20);

        ctx.fillRect(
            x - 10,
            y - 1,
            20,
            1);
    }

    op.setUiAttrib({ "comment": info });
    outInfo.set(info);

    if (inPickColor.get())
    {
        const gl = cgl.gl;

        const realTexture = inTex.get();
        if (!realTexture)
        {
            colorString = "";
            return;
        }
        if (!fb) fb = gl.createFramebuffer();
        if (!pixelReader) pixelReader = new CGL.PixelReader();

        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, realTexture.tex, 0
        );

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        pixelReader.read(cgl, fb, realTexture.pixelFormat, inX.get() * realTexture.width, realTexture.height - inY.get() * realTexture.height, 1, 1, (pixel) =>
        {
            if (!CGL.Texture.isPixelFormatFloat(realTexture.pixelFormat))
            {
                colorString = "Pixel Float: " + Math.floor(pixel[0] / 255 * 100) / 100;
                if (!isNaN(pixel[1]))colorString += ", " + Math.floor(pixel[1] / 255 * 100) / 100;
                if (!isNaN(pixel[2]))colorString += ", " + Math.floor(pixel[2] / 255 * 100) / 100;
                if (!isNaN(pixel[3]))colorString += ", " + Math.floor(pixel[3] / 255 * 100) / 100;
                colorString += "\n";

                if (
                    realTexture.pixelFormat.indexOf("ubyte") > 0)
                {
                    colorString += "Pixel UByte: ";
                    colorString += Math.round(pixel[0]);
                    if (!isNaN(pixel[1]))colorString += ", " + Math.round(pixel[1]);
                    if (!isNaN(pixel[2]))colorString += ", " + Math.round(pixel[2]);
                    if (!isNaN(pixel[3]))colorString += ", " + Math.round(pixel[3]);

                    colorString += "\n";
                }
            }
            else
            {
                colorString = "Pixel Float: " + Math.round(pixel[0] * 100) / 100 + ", " + Math.round(pixel[1] * 100) / 100 + ", " + Math.round(pixel[2] * 100) / 100 + ", " + Math.round(pixel[3] * 100) / 100;
                colorString += "\n";
            }
        });
    }

    cgl.gl.clearColor(0, 0, 0, 0);
    cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);

    perf.finish();
};


};

Ops.Ui.VizTexture.prototype = new CABLES.Op();
CABLES.OPS["4ea2d7b0-ca74-45db-962b-4d1965ac20c0"]={f:Ops.Ui.VizTexture,objName:"Ops.Ui.VizTexture"};




// **************************************************************
// 
// Ops.Gl.ImageCompose.Plasma_v2
// 
// **************************************************************

Ops.Gl.ImageCompose.Plasma_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"plasma_frag":"#define PI 3.1415926535897932384626433832795\n\nIN vec2 texCoord;\n\nUNI sampler2D tex;\nUNI vec2 size;\nUNI vec2 pos;\nUNI float mul;\nUNI float amount;\nUNI float time;\nUNI float aspect;\n\n#ifdef HAS_TEX_OFFSETMAP\n    UNI sampler2D texOffsetZ;\n    UNI float offMul;\n#endif\n\n#ifdef HAS_TEX_MASK\n    UNI sampler2D texMask;\n#endif\n\n\n{{CGL.BLENDMODES3}}\n\nvoid main()\n{\n    float v = 0.0;\n\n    vec2 s=size;\n    #ifdef FIXASPECT\n        s.y=size.x/aspect;\n    #endif\n\n    vec2 c = texCoord * s - s/2.0;\n\n    c+=pos;\n\n    vec3 offset;\n    #ifdef HAS_TEX_OFFSETMAP\n        vec4 offMap=texture(texOffsetZ,texCoord);\n\n        #ifdef OFFSET_X_R\n            offset.x=offMap.r;\n        #endif\n        #ifdef OFFSET_X_G\n            offset.x=offMap.g;\n        #endif\n        #ifdef OFFSET_X_B\n            offset.x=offMap.b;\n        #endif\n\n        #ifdef OFFSET_Y_R\n            offset.y=offMap.r;\n        #endif\n        #ifdef OFFSET_Y_G\n            offset.y=offMap.g;\n        #endif\n        #ifdef OFFSET_Y_B\n            offset.y=offMap.b;\n        #endif\n\n        #ifdef OFFSET_Z_R\n            offset.z=offMap.r;\n        #endif\n        #ifdef OFFSET_Z_G\n            offset.z=offMap.g;\n        #endif\n        #ifdef OFFSET_Z_B\n            offset.z=offMap.b;\n        #endif\n        offset*=offMul;\n    #endif\n\n    c+=offset.xy;\n    float t=time+offset.z;\n\n    v += sin((c.x+t));\n    v += sin((c.y+t)/2.0);\n    v += sin((c.x+c.y+t)/2.0);\n    c += size/2.0 * vec2(sin(t/3.0), cos(t/2.0));\n\n    v += sin(sqrt(c.x*c.x+c.y*c.y+1.0)+t);\n    v = v/2.0;\n\n    vec3 newColor = vec3(sin(PI*v*mul/4.0), sin(PI*v*mul), cos(PI*v*mul))*.5 + .5;\n    vec4 base=texture(tex,texCoord);\n\n    #ifndef GREY\n       vec4 col=vec4( _blend(base.rgb,newColor) ,1.0);\n    #endif\n    #ifdef GREY\n       vec4 col=vec4( _blend(base.rgb,vec3(newColor.g)) ,1.0);\n    #endif\n\n    float str=1.0;\n    #ifdef HAS_TEX_MASK\n        str=texture(texMask,texCoord).r;\n    #endif\n\n    outColor=cgl_blendPixel(base,col,amount*str);\n}\n\n",};
const
    render = op.inTrigger("render"),
    blendMode = CGL.TextureEffect.AddBlendSelect(op, "Blend Mode", "normal"),
    maskAlpha = CGL.TextureEffect.AddBlendAlphaMask(op),
    amount = op.inValueSlider("Amount", 1),
    w = op.inValue("Width", 20),
    h = op.inValue("Height", 20),
    inAspect = op.inBool("Aspect", true),
    mul = op.inValue("Mul", 1),
    x = op.inValue("X", 0),
    y = op.inValue("Y", 0),
    time = op.inValue("Time", 1),
    greyscale = op.inValueBool("Greyscale", true),

    inTexOffsetZ = op.inTexture("Offset"),
    inOffsetMul = op.inFloat("Offset Multiply", 1),
    offsetX = op.inSwitch("Offset X", ["None", "R", "G", "B"], "None"),
    offsetY = op.inSwitch("Offset Y", ["None", "R", "G", "B"], "None"),
    offsetZ = op.inSwitch("Offset Time", ["None", "R", "G", "B"], "R"),

    inTexMask = op.inTexture("Mask"),

    trigger = op.outTrigger("trigger");

op.setPortGroup("Offset Map", [inTexOffsetZ, offsetZ, offsetY, offsetX, inOffsetMul]);

const cgl = op.patch.cgl;
const shader = new CGL.Shader(cgl, op.name, op);

shader.setSource(shader.getDefaultVertexShader(), attachments.plasma_frag);
CGL.TextureEffect.setupBlending(op, shader, blendMode, amount, maskAlpha);

const
    uniPos = new CGL.Uniform(shader, "2f", "pos", x, y),
    uniSize = new CGL.Uniform(shader, "2f", "size", w, h),
    uniTime = new CGL.Uniform(shader, "f", "time", time),
    uniMul = new CGL.Uniform(shader, "f", "mul", mul),
    uniAspect = new CGL.Uniform(shader, "f", "aspect", 1),
    uniOffMul = new CGL.Uniform(shader, "f", "offMul", inOffsetMul),
    textureUniform = new CGL.Uniform(shader, "t", "tex", 0),
    textureUniformOffZ = new CGL.Uniform(shader, "t", "texOffsetZ", 1),
    textureUniformMask = new CGL.Uniform(shader, "t", "texMask", 2),
    amountUniform = new CGL.Uniform(shader, "f", "amount", amount);

offsetX.onChange =
    inAspect.onChange =
    offsetY.onChange =
    offsetZ.onChange =
    inTexMask.onChange =
    greyscale.onChange =
    inTexOffsetZ.onLinkChanged = updateDefines;

updateDefines();

function updateDefines()
{
    shader.toggleDefine("GREY", greyscale.get());

    shader.toggleDefine("HAS_TEX_OFFSETMAP", inTexOffsetZ.isLinked());
    shader.toggleDefine("HAS_TEX_MASK", inTexMask.isLinked());

    shader.toggleDefine("OFFSET_X_R", offsetX.get() == "R");
    shader.toggleDefine("OFFSET_X_G", offsetX.get() == "G");
    shader.toggleDefine("OFFSET_X_B", offsetX.get() == "B");

    shader.toggleDefine("OFFSET_Y_R", offsetY.get() == "R");
    shader.toggleDefine("OFFSET_Y_G", offsetY.get() == "G");
    shader.toggleDefine("OFFSET_Y_B", offsetY.get() == "B");

    shader.toggleDefine("OFFSET_Z_R", offsetZ.get() == "R");
    shader.toggleDefine("OFFSET_Z_G", offsetZ.get() == "G");
    shader.toggleDefine("OFFSET_Z_B", offsetZ.get() == "B");

    offsetX.setUiAttribs({ "greyout": !inTexOffsetZ.isLinked() });
    offsetY.setUiAttribs({ "greyout": !inTexOffsetZ.isLinked() });
    offsetZ.setUiAttribs({ "greyout": !inTexOffsetZ.isLinked() });
    inOffsetMul.setUiAttribs({ "greyout": !inTexOffsetZ.isLinked() });

    h.setUiAttribs({ "greyout": inAspect.get() });
    shader.toggleDefine("FIXASPECT", inAspect.get());
}

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op, 3)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    if (inAspect.get()) uniAspect.setValue(cgl.currentTextureEffect.aspectRatio);
    else uniAspect.setValue(1);

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);
    if (inTexOffsetZ.get()) cgl.setTexture(1, inTexOffsetZ.get().tex);
    if (inTexMask.get()) cgl.setTexture(2, inTexMask.get().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.ImageCompose.Plasma_v2.prototype = new CABLES.Op();
CABLES.OPS["89b3bf34-a9a8-4dcf-a304-9dee597fcf48"]={f:Ops.Gl.ImageCompose.Plasma_v2,objName:"Ops.Gl.ImageCompose.Plasma_v2"};




// **************************************************************
// 
// Ops.Gl.ImageCompose.Noise.ValueNoise_v2
// 
// **************************************************************

Ops.Gl.ImageCompose.Noise.ValueNoise_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"valuenoise3d_frag":"UNI float z;\nUNI float x;\nUNI float y;\nUNI float scale;\nUNI float amount;\nIN vec2 texCoord;\nUNI sampler2D tex;\nUNI float aspect;\n\n{{CGL.BLENDMODES3}}\n\n//\n//\tValue Noise 3D\n//\tReturn value range of 0.0->1.0\n//\thttp://briansharpe.files.wordpress.com/2011/11/valuesample1.jpg\n//\n\nfloat Interpolation_C2( float x ) { return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }   //  6x^5-15x^4+10x^3\t( Quintic Curve.  As used by Perlin in Improved Noise.  http://mrl.nyu.edu/~perlin/paper445.pdf )\nvec2 Interpolation_C2( vec2 x ) { return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }\nvec3 Interpolation_C2( vec3 x ) { return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }\nvec4 Interpolation_C2( vec4 x ) { return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }\nvec4 Interpolation_C2_InterpAndDeriv( vec2 x ) { return x.xyxy * x.xyxy * ( x.xyxy * ( x.xyxy * ( x.xyxy * vec2( 6.0, 0.0 ).xxyy + vec2( -15.0, 30.0 ).xxyy ) + vec2( 10.0, -60.0 ).xxyy ) + vec2( 0.0, 30.0 ).xxyy ); }\nvec3 Interpolation_C2_Deriv( vec3 x ) { return x * x * (x * (x * 30.0 - 60.0) + 30.0); }\n\nvoid FAST32_hash_3D( vec3 gridcell, out vec4 lowz_hash, out vec4 highz_hash )\t//\tgenerates a random number for each of the 8 cell corners\n{\n    //    gridcell is assumed to be an integer coordinate\n\n    //\tTODO: \tthese constants need tweaked to find the best possible noise.\n    //\t\t\tprobably requires some kind of brute force computational searching or something....\n    const vec2 OFFSET = vec2( 50.0, 161.0 );\n    const float DOMAIN = 69.0;\n    const float SOMELARGEFLOAT = 635.298681;\n    const float ZINC = 48.500388;\n\n    //\ttruncate the domain\n    gridcell.xyz = gridcell.xyz - floor(gridcell.xyz * ( 1.0 / DOMAIN )) * DOMAIN;\n    vec3 gridcell_inc1 = step( gridcell, vec3( DOMAIN - 1.5 ) ) * ( gridcell + 1.0 );\n\n    //\tcalculate the noise\n    vec4 P = vec4( gridcell.xy, gridcell_inc1.xy ) + OFFSET.xyxy;\n    P *= P;\n    P = P.xzxz * P.yyww;\n    highz_hash.xy = vec2( 1.0 / ( SOMELARGEFLOAT + vec2( gridcell.z, gridcell_inc1.z ) * ZINC ) );\n    lowz_hash = fract( P * highz_hash.xxxx );\n    highz_hash = fract( P * highz_hash.yyyy );\n}\n\n\nfloat Value3D( vec3 P )\n{\n    //\testablish our grid cell and unit position\n    vec3 Pi = floor(P);\n    vec3 Pf = P - Pi;\n\n    //\tcalculate the hash.\n    //\t( various hashing methods listed in order of speed )\n    vec4 hash_lowz, hash_highz;\n    FAST32_hash_3D( Pi, hash_lowz, hash_highz );\n    //FAST32_2_hash_3D( Pi, hash_lowz, hash_highz );\n    //BBS_hash_3D( Pi, hash_lowz, hash_highz );\n    //SGPP_hash_3D( Pi, hash_lowz, hash_highz );\n\n    //\tblend the results and return\n    vec3 blend = Interpolation_C2( Pf );\n    vec4 res0 = mix( hash_lowz, hash_highz, blend.z );\n    vec4 blend2 = vec4( blend.xy, vec2( 1.0 - blend.xy ) );\n    return dot( res0, blend2.zxzx * blend2.wwyy );\n}\n\nvoid main()\n{\n    vec2 tc=texCoord;\n    tc.y/=aspect;\n    vec4 base=texture(tex,tc);\n\n    vec2 p=vec2(tc.x-0.5,tc.y-0.5);\n    p=p*scale;\n\n    p=vec2(p.x+0.5-x,p.y+0.5-y);\n\n    float v=Value3D(vec3(p.x,p.y,z));\n    vec4 col=vec4(v,v,v,1.0);\n\n    outColor=cgl_blendPixel(base,col,amount);\n\n}\n",};
const
    render = op.inTrigger("render"),
    blendMode = CGL.TextureEffect.AddBlendSelect(op, "Blend Mode", "normal"),
    amount = op.inValueSlider("Amount", 1),
    scale = op.inValue("Scale", 25),
    x = op.inValue("X", 0),
    y = op.inValue("Y", 0),
    z = op.inValue("Z", 0),
    trigger = op.outTrigger("trigger");

op.setPortGroup("Position", [x, y, z]);
op.setPortGroup("Look", [scale]);

const cgl = op.patch.cgl;
const shader = new CGL.Shader(cgl, op.name, op);

shader.setSource(CGL.Shader.getDefaultVertexShader(), attachments.valuenoise3d_frag);

const
    textureUniform = new CGL.Uniform(shader, "t", "tex", 0),
    uniZ = new CGL.Uniform(shader, "f", "z", z),
    uniX = new CGL.Uniform(shader, "f", "x", x),
    uniY = new CGL.Uniform(shader, "f", "y", y),
    uniScale = new CGL.Uniform(shader, "f", "scale", scale),
    uniAspect = new CGL.Uniform(shader, "f", "aspect", 1),
    amountUniform = new CGL.Uniform(shader, "f", "amount", amount);

CGL.TextureEffect.setupBlending(op, shader, blendMode, amount);

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op, 3)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);

    uniAspect.setValue(cgl.currentTextureEffect.aspectRatio);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.ImageCompose.Noise.ValueNoise_v2.prototype = new CABLES.Op();
CABLES.OPS["d2748c53-9ac1-4cd7-8176-66d3eb5d1bb6"]={f:Ops.Gl.ImageCompose.Noise.ValueNoise_v2,objName:"Ops.Gl.ImageCompose.Noise.ValueNoise_v2"};




// **************************************************************
// 
// Ops.Gl.Meshes.FullscreenRectangle
// 
// **************************************************************

Ops.Gl.Meshes.FullscreenRectangle = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"shader_frag":"UNI sampler2D tex;\nIN vec2 texCoord;\n\nvoid main()\n{\n    outColor= texture(tex,texCoord);\n}\n\n","shader_vert":"{{MODULES_HEAD}}\n\nIN vec3 vPosition;\nUNI mat4 projMatrix;\nUNI mat4 mvMatrix;\n\nOUT vec2 texCoord;\nIN vec2 attrTexCoord;\n\nvoid main()\n{\n   vec4 pos=vec4(vPosition,  1.0);\n\n   texCoord=vec2(attrTexCoord.x,(1.0-attrTexCoord.y));\n\n   gl_Position = projMatrix * mvMatrix * pos;\n}\n",};
const
    render = op.inTrigger("render"),
    inScale = op.inSwitch("Scale", ["Stretch", "Fit"], "Fit"),
    flipY = op.inValueBool("Flip Y"),
    flipX = op.inValueBool("Flip X"),
    inTexture = op.inTexture("Texture"),
    trigger = op.outTrigger("trigger");

const cgl = op.patch.cgl;
let mesh = null;
let geom = new CGL.Geometry("fullscreen rectangle");
let x = 0, y = 0, z = 0, w = 0, h = 0;

op.toWorkShouldNotBeChild("Ops.Gl.TextureEffects.ImageCompose", CABLES.OP_PORT_TYPE_FUNCTION);
op.toWorkPortsNeedToBeLinked(render);

flipX.onChange = rebuildFlip;
flipY.onChange = rebuildFlip;
render.onTriggered = doRender;
inTexture.onLinkChanged = updateUi;
inScale.onChange = updateScale;

const shader = new CGL.Shader(cgl, "fullscreenrectangle", this);
shader.setModules(["MODULE_VERTEX_POSITION", "MODULE_COLOR", "MODULE_BEGIN_FRAG"]);

shader.setSource(attachments.shader_vert, attachments.shader_frag);
shader.fullscreenRectUniform = new CGL.Uniform(shader, "t", "tex", 0);
shader.aspectUni = new CGL.Uniform(shader, "f", "aspectTex", 0);

let useShader = false;
let updateShaderLater = true;
let fitImageAspect = false;
let oldVp = [];

updateUi();
updateScale();

inTexture.onChange = function ()
{
    updateShaderLater = true;
};

function updateUi()
{
    if (!CABLES.UI) return;
    flipY.setUiAttribs({ "greyout": !inTexture.isLinked() });
    flipX.setUiAttribs({ "greyout": !inTexture.isLinked() });
    inScale.setUiAttribs({ "greyout": !inTexture.isLinked() });
}

function updateShader()
{
    let tex = inTexture.get();
    if (tex) useShader = true;
    else useShader = false;
}

op.preRender = function ()
{
    updateShader();
    shader.bind();
    if (mesh)mesh.render(shader);
    doRender();
};

function updateScale()
{
    fitImageAspect = inScale.get() == "Fit";
}

function doRender()
{
    if (cgl.getViewPort()[2] != w || cgl.getViewPort()[3] != h || !mesh) rebuild();

    if (updateShaderLater) updateShader();

    cgl.pushPMatrix();
    mat4.identity(cgl.pMatrix);
    mat4.ortho(cgl.pMatrix, 0, w, h, 0, -10.0, 1000);

    cgl.pushModelMatrix();
    mat4.identity(cgl.mMatrix);

    cgl.pushViewMatrix();
    mat4.identity(cgl.vMatrix);

    if (fitImageAspect && inTexture.get())
    {
        const rat = inTexture.get().width / inTexture.get().height;

        let _h = h;
        let _w = h * rat;

        if (_w > w)
        {
            _h = w * 1 / rat;
            _w = w;
        }

        oldVp[0] = cgl.getViewPort()[0];
        oldVp[1] = cgl.getViewPort()[1];
        oldVp[2] = cgl.getViewPort()[2];
        oldVp[3] = cgl.getViewPort()[3];

        cgl.setViewPort((w - _w) / 2, (h - _h) / 2, _w, _h);
    }

    if (useShader)
    {
        if (inTexture.get())
            cgl.setTexture(0, inTexture.get().tex);

        mesh.render(shader);
    }
    else
    {
        mesh.render(cgl.getShader());
    }

    // if (trigger.isLinked())
    cgl.gl.clear(cgl.gl.DEPTH_BUFFER_BIT);

    cgl.popPMatrix();
    cgl.popModelMatrix();
    cgl.popViewMatrix();

    if (fitImageAspect && inTexture.get())
        cgl.setViewPort(oldVp[0], oldVp[1], oldVp[2], oldVp[3]);

    trigger.trigger();
}

function rebuildFlip()
{
    mesh = null;
}

function rebuild()
{
    const currentViewPort = cgl.getViewPort();

    if (currentViewPort[2] == w && currentViewPort[3] == h && mesh) return;

    let xx = 0, xy = 0;

    w = currentViewPort[2];
    h = currentViewPort[3];

    geom.vertices = new Float32Array([
        xx + w, xy + h, 0.0,
        xx, xy + h, 0.0,
        xx + w, xy, 0.0,
        xx, xy, 0.0
    ]);

    let tc = null;

    if (flipY.get())
        tc = new Float32Array([
            1.0, 0.0,
            0.0, 0.0,
            1.0, 1.0,
            0.0, 1.0
        ]);
    else
        tc = new Float32Array([
            1.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            0.0, 0.0
        ]);

    if (flipX.get())
    {
        tc[0] = 0.0;
        tc[2] = 1.0;
        tc[4] = 0.0;
        tc[6] = 1.0;
    }

    geom.setTexCoords(tc);

    geom.verticesIndices = new Uint16Array([
        2, 1, 0,
        3, 1, 2
    ]);

    geom.vertexNormals = new Float32Array([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
    ]);
    geom.tangents = new Float32Array([
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0]);
    geom.biTangents == new Float32Array([
        0, -1, 0,
        0, -1, 0,
        0, -1, 0,
        0, -1, 0]);

    if (!mesh) mesh = new CGL.Mesh(cgl, geom);
    else mesh.setGeom(geom);
}


};

Ops.Gl.Meshes.FullscreenRectangle.prototype = new CABLES.Op();
CABLES.OPS["255bd15b-cc91-4a12-9b4e-53c710cbb282"]={f:Ops.Gl.Meshes.FullscreenRectangle,objName:"Ops.Gl.Meshes.FullscreenRectangle"};




// **************************************************************
// 
// Ops.Math.Multiply
// 
// **************************************************************

Ops.Math.Multiply = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    number1 = op.inValueFloat("number1", 1),
    number2 = op.inValueFloat("number2", 1),
    result = op.outNumber("result");

op.setTitle("*");

number1.onChange = number2.onChange = update;
update();

function update()
{
    const n1 = number1.get();
    const n2 = number2.get();

    result.set(n1 * n2);
}


};

Ops.Math.Multiply.prototype = new CABLES.Op();
CABLES.OPS["1bbdae06-fbb2-489b-9bcc-36c9d65bd441"]={f:Ops.Math.Multiply,objName:"Ops.Math.Multiply"};




// **************************************************************
// 
// Ops.Gl.ImageCompose.ChromaticAberration_v2
// 
// **************************************************************

Ops.Gl.ImageCompose.ChromaticAberration_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"chromatic_frag":"IN vec2 texCoord;\nUNI sampler2D tex;\nUNI float pixel;\nUNI float onePixel;\nUNI float amount;\nUNI float lensDistort;\n\n#ifdef MASK\nUNI sampler2D texMask;\n#endif\n\n{{CGL.BLENDMODES3}}\n\nvoid main()\n{\n   vec4 base=texture(tex,texCoord);\n   vec4 col=texture(tex,texCoord);\n\n   vec2 tc=texCoord;;\n   float pix = pixel;\n   if(lensDistort>0.0)\n   {\n       float dist = distance(texCoord, vec2(0.5,0.5));\n       tc-=0.5;\n       tc *=smoothstep(-0.9,1.0*lensDistort,1.0-dist);\n       tc+=0.5;\n   }\n\n    #ifdef MASK\n        vec4 m=texture(texMask,texCoord);\n        pix*=m.r*m.a;\n    #endif\n\n    #ifdef SMOOTH\n    #ifdef WEBGL2\n        float numSamples=round(pix/onePixel/4.0+1.0);\n        col.r=0.0;\n        col.b=0.0;\n\n        for(float off=0.0;off<numSamples;off++)\n        {\n            float diff=(pix/numSamples)*off;\n            col.r+=texture(tex,vec2(tc.x+diff,tc.y)).r/numSamples;\n            col.b+=texture(tex,vec2(tc.x-diff,tc.y)).b/numSamples;\n        }\n    #endif\n    #endif\n\n    #ifndef SMOOTH\n        col.r=texture(tex,vec2(tc.x+pix,tc.y)).r;\n        col.b=texture(tex,vec2(tc.x-pix,tc.y)).b;\n    #endif\n\n   outColor= cgl_blendPixel(base,col,amount);\n\n}\n",};
const
    render = op.inTrigger("render"),
    blendMode = CGL.TextureEffect.AddBlendSelect(op, "Blend Mode", "normal"),
    amount = op.inValueSlider("Amount", 1),
    pixel = op.inValue("Pixel", 5),
    lensDistort = op.inValueSlider("Lens Distort", 0),
    doSmooth = op.inValueBool("Smooth", false),
    textureMask = op.inTexture("Mask"),
    trigger = op.outTrigger("trigger");

const cgl = op.patch.cgl;
const shader = new CGL.Shader(cgl, "chromatic");

CGL.TextureEffect.setupBlending(op, shader, blendMode, amount);

shader.setSource(shader.getDefaultVertexShader(), attachments.chromatic_frag);
const textureUniform = new CGL.Uniform(shader, "t", "tex", 0),
    uniPixel = new CGL.Uniform(shader, "f", "pixel", 0),
    uniOnePixel = new CGL.Uniform(shader, "f", "onePixel", 0),
    unitexMask = new CGL.Uniform(shader, "t", "texMask", 1),
    uniAmount = new CGL.Uniform(shader, "f", "amount", amount),
    unilensDistort = new CGL.Uniform(shader, "f", "lensDistort", lensDistort);

doSmooth.onChange = function ()
{
    if (doSmooth.get())shader.define("SMOOTH");
    else shader.removeDefine("SMOOTH");
};

textureMask.onChange = function ()
{
    if (textureMask.get())shader.define("MASK");
    else shader.removeDefine("MASK");
};

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op, 3)) return;

    let texture = cgl.currentTextureEffect.getCurrentSourceTexture();

    uniPixel.setValue(pixel.get() * (1 / texture.width));
    uniOnePixel.setValue(1 / texture.width);

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    cgl.setTexture(0, texture.tex);

    if (textureMask.get()) cgl.setTexture(1, textureMask.get().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.ImageCompose.ChromaticAberration_v2.prototype = new CABLES.Op();
CABLES.OPS["07701f81-1a98-44c0-b1ef-592db3cbb5d3"]={f:Ops.Gl.ImageCompose.ChromaticAberration_v2,objName:"Ops.Gl.ImageCompose.ChromaticAberration_v2"};




// **************************************************************
// 
// Ops.Gl.ImageCompose.Dither_v2
// 
// **************************************************************

Ops.Gl.ImageCompose.Dither_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"dither_frag":"IN vec2 texCoord;\nUNI sampler2D tex;\nUNI float strength;\nUNI float amount;\nUNI float width;\nUNI float height;\nUNI float threshold;\n\nfloat lumi( vec4 col ) {\n    return (0.2126*col.r + 0.7152*col.g + 0.0722*col.b);\n}\n\n{{CGL.BLENDMODES3}}\n\nfloat adjustFrag( mat4 adjustments,float val, vec2 coord )\n{\n    vec2 coordMod = mod(vec2(coord.x*width,coord.y*height), 4.0);\n    int xMod = int(coordMod.x);\n    int yMod = int(coordMod.y);\n\n    vec4 col;\n    if (xMod == 0) col = adjustments[0];\n    else if (xMod == 1) col = adjustments[1];\n    else if (xMod == 2) col = adjustments[2];\n    else if (xMod == 3) col = adjustments[3];\n\n    float adjustment;\n    if (yMod == 0) adjustment = col.x;\n    else if (yMod == 1) adjustment = col.y;\n    else if (yMod == 2) adjustment = col.z;\n    else if (yMod == 3) adjustment = col.w;\n\n    return val + (val * adjustment);\n}\n\nvoid main()\n{\n    mat4 adjustments = ((mat4(\n        1, 13, 4, 16,\n        9, 5, 12, 8,\n        3, 15, 2, 14,\n        11, 7, 10, 6\n    ) - 8.) *  1.0 / strength);\n\n    vec4 base=texture(tex,texCoord);\n    vec4 color;\n\n    float lum = lumi(base);\n    lum = adjustFrag(adjustments,lum, texCoord.xy);\n\n    if (lum > threshold) color = vec4(1, 1, 1, base.a);\n    else color = vec4(0, 0, 0, base.a);\n\n    outColor=cgl_blendPixel(base,color,amount);\n}",};
const
    render = op.inTrigger("Render"),
    blendMode = CGL.TextureEffect.AddBlendSelect(op, "Blend Mode", "normal"),
    amount = op.inValueSlider("Amount", 1),
    trigger = op.outTrigger("Trigger"),
    strength = op.inValue("strength", 2),
    threshold = op.inValueSlider("threshold", 0.35);

const
    cgl = op.patch.cgl,
    shader = new CGL.Shader(cgl, op.name, op);

shader.setSource(shader.getDefaultVertexShader(), attachments.dither_frag);

const textureUniform = new CGL.Uniform(shader, "t", "tex", 0),
    amountUniform = new CGL.Uniform(shader, "f", "amount", amount),
    strengthUniform = new CGL.Uniform(shader, "f", "strength", strength),
    uniWidth = new CGL.Uniform(shader, "f", "width", 0),
    uniHeight = new CGL.Uniform(shader, "f", "height", 0),
    unithreshold = new CGL.Uniform(shader, "f", "threshold", threshold);

CGL.TextureEffect.setupBlending(op, shader, blendMode, amount);

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op, 3)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    uniWidth.setValue(cgl.currentTextureEffect.getCurrentSourceTexture().width);
    uniHeight.setValue(cgl.currentTextureEffect.getCurrentSourceTexture().height);

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.ImageCompose.Dither_v2.prototype = new CABLES.Op();
CABLES.OPS["686ae373-2d2d-44cc-b45f-2ccb782dea26"]={f:Ops.Gl.ImageCompose.Dither_v2,objName:"Ops.Gl.ImageCompose.Dither_v2"};




// **************************************************************
// 
// Ops.Gl.ImageCompose.Hue
// 
// **************************************************************

Ops.Gl.ImageCompose.Hue = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"hue_frag":"UNI float hue;\n\n#ifdef HAS_TEXTURES\n  IN vec2 texCoord;\n  UNI sampler2D tex;\n#endif\n\n#ifdef TEX_MASK\n    UNI sampler2D texMask;\n#endif\n#ifdef TEX_OFFSET\n    UNI sampler2D texOffset;\n#endif\n\nvec3 rgb2hsv(vec3 c)\n{\n    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);\n    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));\n    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));\n\n    float d = q.x - min(q.w, q.y);\n    float e = 1.0e-10;\n    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);\n}\n\nvec3 hsv2rgb(vec3 c)\n{\n    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);\n    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);\n    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);\n}\n\nvoid main()\n{\n   vec4 col=vec4(1.0,0.0,0.0,1.0);\n    #ifdef HAS_TEXTURES\n        col=texture(tex,texCoord);\n        float h=hue;\n\n        #ifdef TEX_OFFSET\n            h += texture(texOffset,texCoord).r;\n        #endif\n\n\n        vec3 hsv = rgb2hsv(col.rgb);\n        hsv.x=hsv.x+h;\n\n        #ifndef TEX_MASK\n            col.rgb = hsv2rgb(hsv);\n        #endif\n\n        #ifdef TEX_MASK\n            col.rgb = mix(col.rgb,hsv2rgb(hsv),texture(texMask,texCoord).r);\n        #endif\n\n   #endif\n   outColor= col;\n}",};
const
    render = op.inTrigger("render"),
    hue = op.inValueSlider("hue", 1),
    texMask = op.inTexture("Mask"),
    texOffset = op.inTexture("Offset"),
    trigger = op.outTrigger("trigger");

const cgl = op.patch.cgl;
const shader = new CGL.Shader(cgl, op.name, op);

shader.setSource(shader.getDefaultVertexShader(), attachments.hue_frag);
const textureUniform = new CGL.Uniform(shader, "t", "tex", 0);

const textureMaskUniform = new CGL.Uniform(shader, "t", "texMask", 1);
const textureOffsetUniform = new CGL.Uniform(shader, "t", "texOffset", 2);

const uniformHue = new CGL.Uniform(shader, "f", "hue", 1.0);

hue.onChange = function () { uniformHue.setValue(hue.get()); };

texMask.onChange =
texOffset.onChange = () =>
{
    shader.toggleDefine("TEX_MASK", texMask.get());
    shader.toggleDefine("TEX_OFFSET", texOffset.get());
};

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);

    if (texMask.get()) cgl.setTexture(1, texMask.get().tex);
    if (texOffset.get()) cgl.setTexture(2, texOffset.get().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.ImageCompose.Hue.prototype = new CABLES.Op();
CABLES.OPS["94ef0da0-c920-415c-81b0-fecbd437991d"]={f:Ops.Gl.ImageCompose.Hue,objName:"Ops.Gl.ImageCompose.Hue"};




// **************************************************************
// 
// Ops.Devices.Mouse.Mouse_v3
// 
// **************************************************************

Ops.Devices.Mouse.Mouse_v3 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    inCoords = op.inSwitch("Coordinates", ["-1 to 1", "Pixel Display", "Pixel", "0 to 1"], "-1 to 1"),
    area = op.inValueSelect("Area", ["Canvas", "Document", "Parent Element", "Canvas Area"], "Canvas"),
    flipY = op.inValueBool("flip y", true),
    rightClickPrevDef = op.inBool("right click prevent default", true),
    touchscreen = op.inValueBool("Touch support", true),
    active = op.inValueBool("Active", true),
    outMouseX = op.outNumber("x", 0),
    outMouseY = op.outNumber("y", 0),
    mouseClick = op.outTrigger("click"),
    mouseClickRight = op.outTrigger("click right"),
    mouseDown = op.outBoolNum("Button is down"),
    mouseOver = op.outBoolNum("Mouse is hovering"),
    outMovementX = op.outNumber("Movement X", 0),
    outMovementY = op.outNumber("Movement Y", 0);

const cgl = op.patch.cgl;
let normalize = 1;
let listenerElement = null;
let sizeElement = null;
area.onChange = addListeners;

inCoords.onChange = updateCoordNormalizing;
op.onDelete = removeListeners;

addListeners();

op.on("loadedValueSet",
    () =>
    {
        if (normalize == 0)
        {
            outMouseX.set(sizeElement.clientWidth / 2);
            outMouseY.set(sizeElement.clientHeight / 2);
        }
        if (normalize == 1)
        {
            outMouseX.set(0);
            outMouseY.set(0);
        }
        if (normalize == 2)
        {
            outMouseX.set(0.5);
            outMouseY.set(0.5);
        }
    });

function setValue(x, y)
{
    x = x || 0;
    y = y || 0;

    if (normalize == 0) // pixel
    {
        outMouseX.set(x);
        outMouseY.set(y);
    }
    else
    if (normalize == 3) // pixel css
    {
        outMouseX.set(x * cgl.pixelDensity);
        outMouseY.set(y * cgl.pixelDensity);
    }
    else
    {
        let w = sizeElement.clientWidth / cgl.pixelDensity;
        let h = sizeElement.clientHeight / cgl.pixelDensity;

        w = w || 1;
        h = h || 1;

        if (normalize == 1) // -1 to 1
        {
            let xx = (x / w * 2.0 - 1.0);
            let yy = (y / h * 2.0 - 1.0);
            xx = CABLES.clamp(xx, -1, 1);
            yy = CABLES.clamp(yy, -1, 1);

            outMouseX.set(xx);
            outMouseY.set(yy);
        }
        else if (normalize == 2) // 0 to 1
        {
            let xx = x / w;
            let yy = y / h;

            xx = CABLES.clamp(xx, 0, 1);
            yy = CABLES.clamp(yy, 0, 1);

            outMouseX.set(xx);
            outMouseY.set(yy);
        }
    }
}

function checkHovering(e)
{
    const r = sizeElement.getBoundingClientRect();

    return (
        e.clientX > r.left &&
        e.clientX < r.left + r.width &&
        e.clientY > r.top &&
        e.clientY < r.top + r.height
    );
}

touchscreen.onChange = function ()
{
    removeListeners();
    addListeners();
};

active.onChange = function ()
{
    if (listenerElement)removeListeners();
    if (active.get())addListeners();
};

function updateCoordNormalizing()
{
    if (inCoords.get() == "Pixel") normalize = 0;
    else if (inCoords.get() == "-1 to 1") normalize = 1;
    else if (inCoords.get() == "0 to 1") normalize = 2;
    else if (inCoords.get() == "Pixel Display") normalize = 3;
}

function onMouseEnter(e)
{
    mouseDown.set(false);
    mouseOver.set(checkHovering(e));
}

function onMouseDown(e)
{
    if (!checkHovering(e)) return;
    mouseDown.set(true);
}

function onMouseUp(e)
{
    mouseDown.set(false);
}

function onClickRight(e)
{
    if (!checkHovering(e)) return;
    mouseClickRight.trigger();
    if (rightClickPrevDef.get()) e.preventDefault();
}

function onmouseclick(e)
{
    if (!checkHovering(e)) return;
    mouseClick.trigger();
}

function onMouseLeave(e)
{
    mouseDown.set(false);
    mouseOver.set(checkHovering(e));
}

function setCoords(e)
{
    let x = e.clientX;
    let y = e.clientY;

    if (area.get() != "Document")
    {
        x = e.offsetX;
        y = e.offsetY;
    }
    if (area.get() === "Canvas Area")
    {
        const r = sizeElement.getBoundingClientRect();
        x = e.clientX - r.left;
        y = e.clientY - r.top;
    }

    if (flipY.get()) y = sizeElement.clientHeight - y;

    setValue(x / cgl.pixelDensity, y / cgl.pixelDensity);
}

function onmousemove(e)
{
    mouseOver.set(checkHovering(e));
    setCoords(e);

    outMovementX.set(e.movementX / cgl.pixelDensity);
    outMovementY.set(e.movementY / cgl.pixelDensity);
}

function ontouchmove(e)
{
    if (event.touches && event.touches.length > 0) setCoords(e.touches[0]);
}

function ontouchstart(event)
{
    mouseDown.set(true);

    if (event.touches && event.touches.length > 0) onMouseDown(event.touches[0]);
}

function ontouchend(event)
{
    mouseDown.set(false);
    onMouseUp();
}

function removeListeners()
{
    if (!listenerElement) return;
    listenerElement.removeEventListener("touchend", ontouchend);
    listenerElement.removeEventListener("touchstart", ontouchstart);
    listenerElement.removeEventListener("touchmove", ontouchmove);

    listenerElement.removeEventListener("click", onmouseclick);
    listenerElement.removeEventListener("mousemove", onmousemove);
    listenerElement.removeEventListener("mouseleave", onMouseLeave);
    listenerElement.removeEventListener("mousedown", onMouseDown);
    listenerElement.removeEventListener("mouseup", onMouseUp);
    listenerElement.removeEventListener("mouseenter", onMouseEnter);
    listenerElement.removeEventListener("contextmenu", onClickRight);
    listenerElement = null;
}

function addListeners()
{
    if (listenerElement || !active.get())removeListeners();
    if (!active.get()) return;

    listenerElement = sizeElement = cgl.canvas;
    if (area.get() == "Canvas Area")
    {
        sizeElement = cgl.canvas.parentElement;
        listenerElement = document.body;
    }
    if (area.get() == "Document") sizeElement = listenerElement = document.body;
    if (area.get() == "Parent Element") listenerElement = sizeElement = cgl.canvas.parentElement;

    if (touchscreen.get())
    {
        listenerElement.addEventListener("touchend", ontouchend, false);
        listenerElement.addEventListener("touchstart", ontouchstart, false);
        listenerElement.addEventListener("touchmove", ontouchmove, false);
    }

    listenerElement.addEventListener("mousemove", onmousemove, false);
    listenerElement.addEventListener("mouseleave", onMouseLeave, false);
    listenerElement.addEventListener("mousedown", onMouseDown, false);
    listenerElement.addEventListener("mouseup", onMouseUp, false);
    listenerElement.addEventListener("mouseenter", onMouseEnter, false);
    listenerElement.addEventListener("contextmenu", onClickRight, false);
    listenerElement.addEventListener("click", onmouseclick, false);
}

//


};

Ops.Devices.Mouse.Mouse_v3.prototype = new CABLES.Op();
CABLES.OPS["6d1edbc0-088a-43d7-9156-918fb3d7f24b"]={f:Ops.Devices.Mouse.Mouse_v3,objName:"Ops.Devices.Mouse.Mouse_v3"};




// **************************************************************
// 
// Ops.Math.Sum
// 
// **************************************************************

Ops.Math.Sum = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    number1 = op.inValueFloat("number1", 0),
    number2 = op.inValueFloat("number2", 0),
    result = op.outNumber("result");

op.setTitle("+");

number1.onChange =
number2.onChange = exec;
exec();

function exec()
{
    const v = number1.get() + number2.get();
    if (!isNaN(v))
        result.set(v);
}


};

Ops.Math.Sum.prototype = new CABLES.Op();
CABLES.OPS["c8fb181e-0b03-4b41-9e55-06b6267bc634"]={f:Ops.Math.Sum,objName:"Ops.Math.Sum"};




// **************************************************************
// 
// Ops.Anim.Smooth
// 
// **************************************************************

Ops.Anim.Smooth = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    exec = op.inTrigger("Update"),
    inMode = op.inBool("Separate inc/dec", false),
    inVal = op.inValue("Value"),
    next = op.outTrigger("Next"),
    inDivisorUp = op.inValue("Inc factor", 4),
    inDivisorDown = op.inValue("Dec factor", 4),
    result = op.outNumber("Result", 0);

let val = 0;
let goal = 0;
let oldVal = 0;
let lastTrigger = 0;

op.toWorkPortsNeedToBeLinked(exec);

let divisorUp;
let divisorDown;
let divisor = 4;
let finished = true;

let selectIndex = 0;
const MODE_SINGLE = 0;
const MODE_UP_DOWN = 1;

onFilterChange();
getDivisors();

inMode.setUiAttribs({ "hidePort": true });

inDivisorUp.onChange = inDivisorDown.onChange = getDivisors;
inMode.onChange = onFilterChange;
update();

function onFilterChange()
{
    const selectedMode = inMode.get();
    if (!selectedMode) selectIndex = MODE_SINGLE;
    else selectIndex = MODE_UP_DOWN;

    if (selectIndex == MODE_SINGLE)
    {
        inDivisorDown.setUiAttribs({ "greyout": true });
        inDivisorUp.setUiAttribs({ "title": "Inc/Dec factor" });
    }
    else if (selectIndex == MODE_UP_DOWN)
    {
        inDivisorDown.setUiAttribs({ "greyout": false });
        inDivisorUp.setUiAttribs({ "title": "Inc factor" });
    }

    getDivisors();
    update();
}

function getDivisors()
{
    if (selectIndex == MODE_SINGLE)
    {
        divisorUp = inDivisorUp.get();
        divisorDown = inDivisorUp.get();
    }
    else if (selectIndex == MODE_UP_DOWN)
    {
        divisorUp = inDivisorUp.get();
        divisorDown = inDivisorDown.get();
    }

    if (divisorUp <= 0.2 || divisorUp != divisorUp)divisorUp = 0.2;
    if (divisorDown <= 0.2 || divisorDown != divisorDown)divisorDown = 0.2;
}

inVal.onChange = function ()
{
    finished = false;
    let oldGoal = goal;
    goal = inVal.get();
};

inDivisorUp.onChange = function ()
{
    getDivisors();
};

function update()
{
    let tm = 1;
    if (performance.now() - lastTrigger > 500 || lastTrigger === 0) val = inVal.get() || 0;
    else tm = (performance.now() - lastTrigger) / (performance.now() - lastTrigger);
    lastTrigger = performance.now();

    if (val != val)val = 0;

    if (divisor <= 0)divisor = 0.0001;

    const diff = goal - val;

    if (diff >= 0) val += (diff) / (divisorDown * tm);
    else val += (diff) / (divisorUp * tm);

    if (Math.abs(diff) < 0.00001)val = goal;

    if (divisor != divisor)val = 0;
    if (val != val || val == -Infinity || val == Infinity)val = inVal.get();

    if (oldVal != val)
    {
        result.set(val);
        oldVal = val;
    }

    if (val == goal && !finished)
    {
        finished = true;
        result.set(val);
    }

    next.trigger();
}

exec.onTriggered = function ()
{
    update();
};


};

Ops.Anim.Smooth.prototype = new CABLES.Op();
CABLES.OPS["5677b5b5-753a-4fbf-9e91-64c81ec68a2f"]={f:Ops.Anim.Smooth,objName:"Ops.Anim.Smooth"};




// **************************************************************
// 
// Ops.Anim.Bang
// 
// **************************************************************

Ops.Anim.Bang = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    inUpdate = op.inTrigger("update"),
    inBang = op.inTriggerButton("Bang"),
    inDuration = op.inValue("Duration", 0.1),
    invert = op.inBool("Invert", false),
    outTrigger = op.outTrigger("Trigger Out"),
    outValue = op.outNumber("Value");

const anim = new CABLES.Anim();
let startTime = CABLES.now();
op.toWorkPortsNeedToBeLinked(inUpdate);

let needsReset = false;

inBang.onTriggered = function ()
{
    needsReset = true;
};

inUpdate.onTriggered = function ()
{
    if (needsReset)
    {
        startTime = CABLES.now();
        anim.clear();
        anim.setValue(0, 1);
        anim.setValue(inDuration.get(), 0);
        needsReset = false;
    }

    const elapsed = (CABLES.now() - startTime) / 1000;
    if (elapsed <= inDuration.get())
    {
        const v = anim.getValue(elapsed);
        if (invert.get()) outValue.set(1.0 - v);
        else outValue.set(v);
    }
    else
    {
        if (invert.get())
        {
            outValue.set(1.0);
        }
        else
        {
            outValue.set(0);
        }
    }

    outTrigger.trigger();
};


};

Ops.Anim.Bang.prototype = new CABLES.Op();
CABLES.OPS["92ca45a7-5b4b-4238-956e-23d79bdc659f"]={f:Ops.Anim.Bang,objName:"Ops.Anim.Bang"};




// **************************************************************
// 
// Ops.Math.MapRange
// 
// **************************************************************

Ops.Math.MapRange = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    v = op.inValueFloat("value", 0),
    old_min = op.inValueFloat("old min", 0),
    old_max = op.inValueFloat("old max", 1),
    new_min = op.inValueFloat("new min", 0),
    new_max = op.inValueFloat("new max", 1),
    easing = op.inValueSelect("Easing", ["Linear", "Smoothstep", "Smootherstep"], "Linear"),
    inClamp = op.inBool("Clamp", true),
    result = op.outNumber("result", 0);

op.setPortGroup("Input Range", [old_min, old_max]);
op.setPortGroup("Output Range", [new_min, new_max]);

let doClamp = true;
let ease = 0;
let r = 0;

v.onChange =
    old_min.onChange =
    old_max.onChange =
    new_min.onChange =
    new_max.onChange = exec;

exec();

inClamp.onChange =
() =>
{
    doClamp = inClamp.get();
    exec();
};

easing.onChange = function ()
{
    if (easing.get() == "Smoothstep") ease = 1;
    else if (easing.get() == "Smootherstep") ease = 2;
    else ease = 0;
};

function exec()
{
    const nMin = new_min.get();
    const nMax = new_max.get();
    const oMin = old_min.get();
    const oMax = old_max.get();
    let x = v.get();

    if (doClamp)
    {
        if (x >= Math.max(oMax, oMin))
        {
            result.set(nMax);
            return;
        }
        else
        if (x <= Math.min(oMax, oMin))
        {
            result.set(nMin);
            return;
        }
    }

    let reverseInput = false;
    const oldMin = Math.min(oMin, oMax);
    const oldMax = Math.max(oMin, oMax);
    if (oldMin != oMin) reverseInput = true;

    let reverseOutput = false;
    const newMin = Math.min(nMin, nMax);
    const newMax = Math.max(nMin, nMax);
    if (newMin != nMin) reverseOutput = true;

    let portion = 0;

    if (reverseInput) portion = (oldMax - x) * (newMax - newMin) / (oldMax - oldMin);
    else portion = (x - oldMin) * (newMax - newMin) / (oldMax - oldMin);

    if (reverseOutput) r = newMax - portion;
    else r = portion + newMin;

    if (ease === 0)
    {
        result.set(r);
    }
    else
    if (ease == 1)
    {
        x = Math.max(0, Math.min(1, (r - nMin) / (nMax - nMin)));
        result.set(nMin + x * x * (3 - 2 * x) * (nMax - nMin)); // smoothstep
    }
    else
    if (ease == 2)
    {
        x = Math.max(0, Math.min(1, (r - nMin) / (nMax - nMin)));
        result.set(nMin + x * x * x * (x * (x * 6 - 15) + 10) * (nMax - nMin)); // smootherstep
    }
}


};

Ops.Math.MapRange.prototype = new CABLES.Op();
CABLES.OPS["2617b407-60a0-4ff6-b4a7-18136cfa7817"]={f:Ops.Math.MapRange,objName:"Ops.Math.MapRange"};




// **************************************************************
// 
// Ops.Ui.VizNumber
// 
// **************************************************************

Ops.Ui.VizNumber = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const inNum = op.inFloat("Number", 0);
const outNum = op.outNumber("Result");

op.setUiAttrib({ "widthOnlyGrow": true });

inNum.onChange = update;

update();

function update()
{
    let n = inNum.get();
    if (op.patch.isEditorMode())
    {
        let str = "";
        if (n === null)str = "null";
        else if (n === undefined)str = "undefined";
        else
        {
            str = "" + Math.round(n * 10000) / 10000;

            if (str[0] != "-")str = " " + str;
        }

        op.setUiAttribs({ "extendTitle": str });
    }

    outNum.set(n);
}


};

Ops.Ui.VizNumber.prototype = new CABLES.Op();
CABLES.OPS["2b60d12d-2884-4ad0-bda4-0caeb6882f5c"]={f:Ops.Ui.VizNumber,objName:"Ops.Ui.VizNumber"};




// **************************************************************
// 
// Ops.Anim.Timer_v2
// 
// **************************************************************

Ops.Anim.Timer_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    inSpeed = op.inValue("Speed", 1),
    playPause = op.inValueBool("Play", true),
    reset = op.inTriggerButton("Reset"),
    inSyncTimeline = op.inValueBool("Sync to timeline", false),
    outTime = op.outNumber("Time");

op.setPortGroup("Controls", [playPause, reset, inSpeed]);

const timer = new CABLES.Timer();
let lastTime = null;
let time = 0;
let syncTimeline = false;

playPause.onChange = setState;
setState();

function setState()
{
    if (playPause.get())
    {
        timer.play();
        op.patch.addOnAnimFrame(op);
    }
    else
    {
        timer.pause();
        op.patch.removeOnAnimFrame(op);
    }
}

reset.onTriggered = doReset;

function doReset()
{
    time = 0;
    lastTime = null;
    timer.setTime(0);
    outTime.set(0);
}

inSyncTimeline.onChange = function ()
{
    syncTimeline = inSyncTimeline.get();
    playPause.setUiAttribs({ "greyout": syncTimeline });
    reset.setUiAttribs({ "greyout": syncTimeline });
};

op.onAnimFrame = function (tt, frameNum, deltaMs)
{
    if (timer.isPlaying())
    {
        if (CABLES.overwriteTime !== undefined)
        {
            outTime.set(CABLES.overwriteTime * inSpeed.get());
        }
        else

        if (syncTimeline)
        {
            outTime.set(tt * inSpeed.get());
        }
        else
        {
            timer.update();
            const timerVal = timer.get();

            if (lastTime === null)
            {
                lastTime = timerVal;
                return;
            }

            const t = Math.abs(timerVal - lastTime);
            lastTime = timerVal;

            time += t * inSpeed.get();
            if (time != time)time = 0;
            outTime.set(time);
        }
    }
};


};

Ops.Anim.Timer_v2.prototype = new CABLES.Op();
CABLES.OPS["aac7f721-208f-411a-adb3-79adae2e471a"]={f:Ops.Anim.Timer_v2,objName:"Ops.Anim.Timer_v2"};




// **************************************************************
// 
// Ops.Math.Sine
// 
// **************************************************************

Ops.Math.Sine = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    value = op.inValue("value"),
    phase = op.inValue("phase", 0.0),
    mul = op.inValue("frequency", 1.0),
    amplitude = op.inValue("amplitude", 1.0),
    invert = op.inValueBool("asine", false),
    result = op.outNumber("result");

let calculate = Math.sin;

mul.onChange =
amplitude.onChange =
phase.onChange =
value.onChange = function ()
{
    result.set(
        amplitude.get() * calculate((value.get() * mul.get()) + phase.get())
    );
};

invert.onChange = function ()
{
    if (invert.get()) calculate = Math.asin;
    else calculate = Math.sin;
};


};

Ops.Math.Sine.prototype = new CABLES.Op();
CABLES.OPS["d24da018-9f3d-428b-85c9-6ff14d77548b"]={f:Ops.Math.Sine,objName:"Ops.Math.Sine"};




// **************************************************************
// 
// Ops.Gl.ImageCompose.BrightnessContrast
// 
// **************************************************************

Ops.Gl.ImageCompose.BrightnessContrast = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"brightness_contrast_frag":"IN vec2 texCoord;\nUNI sampler2D tex;\nUNI float amount;\nUNI float amountbright;\n\nvoid main()\n{\n    vec4 col=vec4(1.0,0.0,0.0,1.0);\n    col=texture(tex,texCoord);\n\n    // apply contrast\n    col.rgb = ((col.rgb - 0.5) * max(amount*2.0, 0.0))+0.5;\n\n    // apply brightness\n    col.rgb *= amountbright*2.0;\n\n    outColor = col;\n}",};
const
    render = op.inTrigger("render"),
    amount = op.inValueSlider("contrast", 0.5),
    amountBright = op.inValueSlider("brightness", 0.5),
    trigger = op.outTrigger("trigger");

const cgl = op.patch.cgl;

const shader = new CGL.Shader(cgl, "brightnesscontrast");
shader.setSource(shader.getDefaultVertexShader(), attachments.brightness_contrast_frag);
const textureUniform = new CGL.Uniform(shader, "t", "tex", 0);
const amountUniform = new CGL.Uniform(shader, "f", "amount", amount);
const amountBrightUniform = new CGL.Uniform(shader, "f", "amountbright", amountBright);

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op)) return;

    if (!cgl.currentTextureEffect.getCurrentSourceTexture()) return;
    if (!CGL.TextureEffect.checkOpInEffect(op)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.ImageCompose.BrightnessContrast.prototype = new CABLES.Op();
CABLES.OPS["54b89199-c594-4dff-bc48-82d6c7a55e8a"]={f:Ops.Gl.ImageCompose.BrightnessContrast,objName:"Ops.Gl.ImageCompose.BrightnessContrast"};




// **************************************************************
// 
// Ops.User.anticore.CustomNoise
// 
// **************************************************************

Ops.User.anticore.CustomNoise = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={"noise_frag":"IN vec2 texCoord;\nUNI sampler2D tex;\nUNI float amount;\nUNI float time;\n\nfloat nrand( vec2 n )\n{\n\treturn fract(sin(dot(n.xy, vec2(12.9898, 78.233)))* 43758.5453);\n}\n\n// Thanks to Dave Hoskins\nvec3 hash32(vec2 p)\n{\n\tp  = fract(p * vec2(5.3983, 5.4427));\n    p += dot(p.yx, p.xy +  vec2(21.5351, 14.3137));\n\treturn fract(vec3(p.x * p.y * 95.4337, p.x * p.y * 97.597, p.x * p.y * 93.8365));\n}\n\nfloat n1rand( vec2 n )\n{\n\tfloat t = fract( time );\n\tfloat nrnd0 = nrand( n + 0.07*t );\n\treturn nrnd0;\n}\n\n#ifdef HAS_MULMASK\n    UNI sampler2D texMul;\n#endif\n\n{{CGL.BLENDMODES3}}\n{{MODULES_HEAD}}\n\n{{CGL.RANDOM_TEX}}\n\nvoid main()\n{\n    vec4 rnd;\n\n    #ifdef RGB\n        rnd=vec4(n1rand(texCoord.xy+vec2(time)),1.0);\n    #else\n        float r=n1rand(texCoord.xy+vec2(time));\n        rnd=vec4( hash32(texCoord.xy + time * 1.),1.0 );\n    #endif\n\n    vec4 base=texture(tex,texCoord);\n    vec4 col=rnd;//( _blend(base.rgb,rnd.rgb) ,1.0);\n\n    #ifdef NORMALIZE\n        col.rgb=(col.rgb-0.5)*2.0;\n    #endif\n\n    #ifdef HAS_MULMASK\n        col.rgb*=texture(texMul,texCoord).rgb;\n    #endif\n\n    outColor=cgl_blendPixel(base,col,amount);\n    // outColor=vec4( mix( col.rgb, base.rgb ,1.0-base.a*amount),1.0);\n}",};
const
    render = op.inTrigger("Render"),
    blendMode = CGL.TextureEffect.AddBlendSelect(op, "Blend Mode", "normal"),
    maskAlpha = CGL.TextureEffect.AddBlendAlphaMask(op),
    amount = op.inValueSlider("Amount", 1),
    animated = op.inValueBool("Animated", true),
    inRGB = op.inValueBool("RGB", false),
    normalize = op.inValueBool("Normalize", false),
    inTexMul = op.inTexture("Multiply"),
    trigger = op.outTrigger("Next");

const
    cgl = op.patch.cgl,
    shader = new CGL.Shader(cgl, op.name),
    amountUniform = new CGL.Uniform(shader, "f", "amount", amount),
    timeUniform = new CGL.Uniform(shader, "f", "time", 1.0),
    textureUniform = new CGL.Uniform(shader, "t", "tex", 0),
    mulUniform = new CGL.Uniform(shader, "t", "texMul", 1);

shader.setSource(shader.getDefaultVertexShader(), attachments.noise_frag);

CGL.TextureEffect.setupBlending(op, shader, blendMode, amount,maskAlpha);

op.toWorkPortsNeedToBeLinked(render);

inTexMul.onChange =
normalize.onChange =
inRGB.onChange = function ()
{
    shader.toggleDefine("HAS_MULMASK", inTexMul.get());
    shader.toggleDefine("RGB", inRGB.get());
    shader.toggleDefine("NORMALIZE", normalize.get());
};

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op,3)) return;

    if (animated.get()) timeUniform.setValue(op.patch.freeTimer.get() / 1000 % 100);
    else timeUniform.setValue(0);

    cgl.pushShader(shader);

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);
    if (inTexMul.get())cgl.setTexture(1, inTexMul.get().tex);

    cgl.currentTextureEffect.bind();

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.User.anticore.CustomNoise.prototype = new CABLES.Op();
CABLES.OPS["15cd2bdc-bffd-495d-ac0b-8e1ae541702f"]={f:Ops.User.anticore.CustomNoise,objName:"Ops.User.anticore.CustomNoise"};




// **************************************************************
// 
// Ops.Boolean.IfTrueThen_v2
// 
// **************************************************************

Ops.Boolean.IfTrueThen_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    exe = op.inTrigger("exe"),
    boolean = op.inValueBool("boolean", false),
    triggerThen = op.outTrigger("then"),
    triggerElse = op.outTrigger("else");

exe.onTriggered = exec;

// let b = false;

// boolean.onChange = () =>
// {
//     b = boolean.get();
// };

function exec()
{
    if (boolean.get()) triggerThen.trigger();
    else triggerElse.trigger();
}


};

Ops.Boolean.IfTrueThen_v2.prototype = new CABLES.Op();
CABLES.OPS["9549e2ed-a544-4d33-a672-05c7854ccf5d"]={f:Ops.Boolean.IfTrueThen_v2,objName:"Ops.Boolean.IfTrueThen_v2"};




// **************************************************************
// 
// Ops.Math.AddUp
// 
// **************************************************************

Ops.Math.AddUp = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    number = op.inValue("Number"),
    doAdd = op.inTriggerButton("Add"),
    doReset = op.inTriggerButton("Reset"),
    result = op.outNumber("Result");

let value = 0;

doAdd.onTriggered = function ()
{
    value += number.get();
    result.set(value);
};

doReset.onTriggered = function ()
{
    value = 0;
    result.set(value);
};


};

Ops.Math.AddUp.prototype = new CABLES.Op();
CABLES.OPS["f1c76976-4c8f-43a5-a9c7-6e4c7d21c749"]={f:Ops.Math.AddUp,objName:"Ops.Math.AddUp"};




// **************************************************************
// 
// Ops.Ui.VizGraph
// 
// **************************************************************

Ops.Ui.VizGraph = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments=op.attachments={};
const
    inNum1 = op.inFloat("Number 1"),
    inNum2 = op.inFloat("Number 2"),
    inNum3 = op.inFloat("Number 3"),
    inNum4 = op.inFloat("Number 4"),
    inNum5 = op.inFloat("Number 5"),
    inNum6 = op.inFloat("Number 6"),
    inNum7 = op.inFloat("Number 7"),
    inNum8 = op.inFloat("Number 8"),
    inReset = op.inTriggerButton("Reset");

op.setUiAttrib({ "height": 150, "resizable": true, "vizLayerMaxZoom": 2500 });

let buff = [];

let max = -Number.MAX_VALUE;
let min = Number.MAX_VALUE;

inNum1.onLinkChanged =
    inNum2.onLinkChanged =
    inNum3.onLinkChanged =
    inNum4.onLinkChanged =
    inNum5.onLinkChanged =
    inNum6.onLinkChanged =
    inNum7.onLinkChanged =
    inNum8.onLinkChanged =
    inReset.onTriggered = () =>
    {
        max = -Number.MAX_VALUE;
        min = Number.MAX_VALUE;
        buff = [];
    };

op.renderVizLayer = (ctx, layer) =>
{
    const perf = CABLES.UI.uiProfiler.start("previewlayer graph");

    const colors = [
        "#00ffff",
        "#ffff00",
        "#ff00ff",
        "#0000ff",
        "#00ff00",
        "#ff0000",
        "#ffffff",
        "#888888",
    ];

    ctx.fillStyle = "#222";
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);

    for (let p = 0; p < op.portsIn.length; p++)
    {
        if (!op.portsIn[p].isLinked()) continue;
        const newVal = op.portsIn[p].get();

        max = Math.max(op.portsIn[p].get(), max);
        min = Math.min(op.portsIn[p].get(), min);

        if (!buff[p]) buff[p] = [];
        buff[p].push(newVal);
        if (buff[p].length > 60) buff[p].shift();

        const texSlot = 5;
        const mulX = layer.width / 60;

        ctx.lineWidth = 2;
        ctx.strokeStyle = "#555555";

        ctx.beginPath();
        ctx.moveTo(layer.x, CABLES.map(0, min, max, layer.height, 0) + layer.y);
        ctx.lineTo(layer.x + layer.width, CABLES.map(0, min, max, layer.height, 0) + layer.y);
        ctx.stroke();

        ctx.strokeStyle = colors[p];

        ctx.beginPath();

        for (let i = 0; i < buff[p].length; i++)
        {
            let y = buff[p][i];

            y = CABLES.map(y, min, max, layer.height, 0);
            y += layer.y;
            if (i === 0)ctx.moveTo(layer.x, y);
            else ctx.lineTo(layer.x + i * mulX, y);
        }

        ctx.stroke();
    }

    ctx.fillStyle = "#888";
    ctx.fillText("max:" + Math.round(max * 100) / 100, layer.x + 10, layer.y + layer.height - 10);
    ctx.fillText("min:" + Math.round(min * 100) / 100, layer.x + 10, layer.y + layer.height - 30);

    perf.finish();
};


};

Ops.Ui.VizGraph.prototype = new CABLES.Op();
CABLES.OPS["13c54eb4-60ef-4b9c-8425-d52a431f5c87"]={f:Ops.Ui.VizGraph,objName:"Ops.Ui.VizGraph"};



window.addEventListener('load', function(event) {
CABLES.jsLoaded=new Event('CABLES.jsLoaded');
document.dispatchEvent(CABLES.jsLoaded);
});
