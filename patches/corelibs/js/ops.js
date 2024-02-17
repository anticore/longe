"use strict";

var CABLES=CABLES||{};
CABLES.OPS=CABLES.OPS||{};


window.addEventListener('load', function(event) {
CABLES.jsLoaded=new Event('CABLES.jsLoaded');
document.dispatchEvent(CABLES.jsLoaded);
});
