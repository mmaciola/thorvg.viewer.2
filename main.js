var player;

(function () {
	window.onload = initialize();
	
	var script = document.createElement('script');
	script.type = 'text/javascript';
	script.src = 'thorvg-wasm.js';
	document.head.appendChild(script);

	script.onload = _ => {
		Module.onRuntimeInitialized = _ => {
			player = new Player();
		};
	};
})();

class Player {
	render() {
		this.thorvg.update(this.canvas.width, this.canvas.height);
		
		var buffer = this.thorvg.render();
		var clampedBuffer = Uint8ClampedArray.from(buffer);
		if (clampedBuffer.length == 0) return false;
		
		var imageData = new ImageData(clampedBuffer, this.canvas.width, this.canvas.height);
		var context = this.canvas.getContext('2d');
		context.putImageData(imageData, 0, 0);
		
		document.getElementById("zoom-value").innerHTML = this.canvas.width + " x " + this.canvas.height;
		return true;
	}
	
	load(data) {
		//var arr = new Int8Array(data);
		//var buffer = Module._malloc(arr.length);
		//Module.writeArrayToMemory(arr, buffer);
		//return this.thorvg.load(buffer, arr.length, this.canvas.width, this.canvas.height);
		
		//Module.ccall('mxdepo', 'string', ['number', 'number', 'number', 'number'], args);
		
		//console.log(data);
		//return this.thorvg.load(new Int8Array(data), data.byteLength, this.canvas.width, this.canvas.height);
		return this.thorvg.load(new Int8Array(data), this.canvas.width, this.canvas.height);
	}
	
	loadFile(file) {
		var read = new FileReader();
		read.readAsArrayBuffer(file);
		read.onloadend = _ => {
			if (!this.load(read.result) || !this.render()) {
				alert("Couldn't load an image. Error message: " + this.thorvg.getError());
				return;
			}
			
			this.filename = file.name;
			this.createTabs();
			showImageCanvas();
			enableZoomSlider();
			
			//mockupTabs();
			//showLayers();
		}
	}
	
	createTabs() {
		mockupTabs();
		showLayers();
		
		//layers tab
		var layersMem = this.thorvg.layers();
		var layers = document.getElementById("layers");
		layers.textContent = '';
		var parent = layers;
		var parentDepth = 0;
		for (let i = 0; i < layersMem.length; i += 4) {
			let depth = layersMem[i + 1];
			let type = layersMem[i + 2];
			let compositeMethod = layersMem[i + 3];
			if (depth > parentDepth) {
				var block = layerBlockCreate(depth);
				parent = parent.appendChild(block);
			} else if (depth < parentDepth) {
				if (parent.getAttribute('tvg-depth') > depth)
					parent = parent.parentNode;
			}
			parent.appendChild(layerCreate(depth, type, compositeMethod));
			parentDepth = depth;
		}
		
		//preferences tab
		var properties = document.getElementById("properties");
		properties.textContent = '';
		properties.appendChild(propertiesLayerCreate(Types.Scene, CompositeMethod.None, true));
		properties.appendChild(propertiesLineCreate("Show on layers list"));
		properties.appendChild(propertiesLineCreate("Show this paint only"));
		
		//file tab
		var originalSize = Float32Array.from(this.thorvg.originalSize());
		var originalSizeText = ((originalSize[0] % 1 === 0) && (originalSize[1] % 1 === 0)) ? 
			originalSize[0].toFixed(0) + " x " + originalSize[1].toFixed(0) :
			originalSize[0].toFixed(2) + " x " + originalSize[1].toFixed(2);

		var file = document.getElementById("file");
		file.textContent = '';
		file.appendChild(fileHeaderCreate("Details"));
		file.appendChild(titledLineCreate("Filename", this.filename));
		file.appendChild(titledLineCreate("Canvas size", originalSizeText));
		file.appendChild(fileHeaderCreate("Export"));
		var lineExportTvg = propertiesLineCreate("Export .tvg file");
		lineExportTvg.addEventListener("click", exportCanvasToTvg, false);
		file.appendChild(lineExportTvg);
		var lineExportPng = propertiesLineCreate("Export .png file");
		lineExportPng.addEventListener("click", exportCanvasToPng, false);
		file.appendChild(lineExportPng);
	}
	
	saveTvg() {
		if (this.thorvg.saveTvg()) {
			var data = new Uint8Array(HEAPU8.buffer, this.thorvg.saveGetData(), this.thorvg.saveGetLength());
			var blob = new Blob([data], {type: 'application/octet-stream'});
			
			var link = document.createElement("a");
			link.setAttribute('href', URL.createObjectURL(blob));
			link.setAttribute('download', 'canvas.tvg');
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			
			this.thorvg.saveFree();
		} else {
			alert("Couldn't save canvas. Error message: " + this.thorvg.getError());
		}
	}
	
	constructor() {
		this.thorvg = new Module.ThorvgWasm();
		this.canvas = document.getElementById("image-canvas");
	}
}

function initialize() {
	document.addEventListener('dragenter', fileDropHighlight, false);
	document.addEventListener('dragleave', fileDropUnhighlight, false);
	document.addEventListener('dragover', fileDropHighlight, false);
	document.addEventListener('drop', fileDropUnhighlight, false);
	document.addEventListener('drop', fileDropOrBrowseHandle, false);
	document.getElementById("image-placeholder").addEventListener("click", openFileBrowse, false);
	document.getElementById("image-file-selector").addEventListener("change", fileDropOrBrowseHandle, false);
	
	document.getElementById("nav-toggle-aside").addEventListener("click", toggleAside, false);
	document.getElementById("nav-layers").addEventListener("click", showLayers, false);
	document.getElementById("nav-properties").addEventListener("click", showProperties, false);
	document.getElementById("nav-file").addEventListener("click", showFile, false);
	document.getElementById("nav-dark-mode").addEventListener("change", darkModeToggle, false);
	
	document.getElementById("zoom-slider").addEventListener("input", onZoomSliderSlide, false);
}

//file upload
function allowedFileExtention(filename) {
	var ext = filename.split('.').pop();
	return (ext === "tvg") || (ext === "svg") || (ext === "jpg") || (ext === "png");
}
function fileDropUnhighlight(event) {
	event.preventDefault();
	event.stopPropagation();
	document.getElementById('drop-area').classList.remove("highlight");
}
function fileDropHighlight(event) {
	event.preventDefault();
	event.stopPropagation();
	event.dataTransfer.dropEffect = 'copy';
	document.getElementById('drop-area').classList.add("highlight");
}
function fileDropOrBrowseHandle(event) {
	var files = this.files || event.dataTransfer.files;
	if (files.length != 1 || !allowedFileExtention(files[0].name)) {
		alert("Please drag and drop a single file of supported format.");
		return false;
	}
	if (!player) return false;
	player.loadFile(files[0]);
	return false;
}

function openFileBrowse() {
	document.getElementById('image-file-selector').click();
}

//aside and nav
function toggleAside() {
	var aside = document.getElementsByTagName("aside")[0];
	aside.classList.toggle("hidden");
}
function showAside() {
	var aside = document.getElementsByTagName("aside")[0];
	aside.classList.remove("hidden");
}
function showPage(name) {
	showAside();
	var aside = document.getElementsByTagName("aside")[0];
	var tabs = aside.getElementsByClassName("tab");
	for (let tab of tabs) {
		tab.classList.toggle("active", tab.id === name);
	}
	var nav = aside.getElementsByTagName("nav")[0];
	var navChilds = nav.childNodes;
	for (let child of navChilds) {
		if (child.tagName === "A")
			child.classList.toggle("active", child.id === "nav-" + name);
	}
}

function showLayers() {
	showPage("layers");
}
function showProperties() {
	showPage("properties");
}
function showFile() {
	showPage("file");
}
function darkModeToggle(event) {
	document.body.classList.toggle("dark-mode", event.target.checked);
}

//main image section
function showImageCanvas() {
	var canvas = document.getElementById("image-canvas");
	var placeholder = document.getElementById("image-placeholder");
	canvas.classList.remove("hidden");
	placeholder.classList.add("hidden");
}

//zoom slider
function enableZoomSlider(enable) {
	var slider = document.getElementById("zoom-slider");
	slider.disabled = enable;
}

function onZoomSliderSlide(event) {
	if (!player) return;
	var value = event.target.value;
	
	var size = Math.min(player.canvas.clientWidth, player.canvas.clientHeight);
	size = 512 * (value / 100 + 0.25);
	player.canvas.width = size;
	player.canvas.height = size;
	player.render();
}







const Types = { Shape : 1, Scene : 2, Picture : 3 };
const CompositeMethod = { None : 0, ClipPath : 1, AlphaMask : 2, InvAlphaMask : 3 };

const TypesIcons = [ "", "fa-files-o", "fa-folder", "fa-picture-o" ];
const TypesNames = [ "", "Shape", "Scene", "Picture" ];
const CompositeMethodNames = [ "None", "ClipPath", "AlphaMask", "InvAlphaMask" ];

function toggleSceneChilds() {
	var icon = event.currentTarget.getElementsByTagName("i")[0];
	var block = event.currentTarget.parentElement.nextElementSibling;
	if (!block) return;
	var visible = block.classList.toggle("hidden");
	icon.classList.toggle("fa-caret-right", visible);
	icon.classList.toggle("fa-caret-down", !visible);
}

function togglePaintVisibility() {
	var icon = event.currentTarget.getElementsByTagName("i")[0];
	var visible = icon.classList.contains("fa-square-o");
	icon.classList.toggle("fa-square-o");
	icon.classList.toggle("fa-minus-square-o");
}

function showLayerProperties() {
	showProperties();
}

function layerBlockCreate(depth) {
	var block = document.createElement("div");
	block.setAttribute('class', 'block hidden');
	block.setAttribute('tvg-depth', depth);
	return block;
}

function layerCreate(depth, type, compositeMethod) {
	var layer = document.createElement("div");
	layer.setAttribute('class', 'layer');
	layer.style.paddingLeft = Math.min(64 + 16 * depth, 160) + "px";

	if (type == Types.Scene) {
		var caret = document.createElement("a");
		caret.setAttribute('class', 'caret');
		caret.innerHTML = '<i class="fa fa-caret-right"></i>';
		caret.addEventListener("click", toggleSceneChilds, false);
		layer.appendChild(caret);
	}
	
	var icon = document.createElement("i");
	icon.setAttribute('class', 'icon fa ' + TypesIcons[type]);
	layer.appendChild(icon);
	
	var name = document.createElement("span");
	name.innerHTML = TypesNames[type];
	layer.appendChild(name);
	
	var visibility = document.createElement("a");
	visibility.setAttribute('class', 'visibility');
	visibility.innerHTML = '<i class="fa fa-square-o"></i>';
	visibility.addEventListener("click", togglePaintVisibility, false);
	layer.appendChild(visibility);
	
	if (compositeMethod != CompositeMethod.None) {
		layer.classList.add("composite");
		name.innerHTML += " <small>(" + CompositeMethodNames[compositeMethod] + ")</small>";
	}
	
	layer.addEventListener("dblclick", showLayerProperties, false);
	
	return layer;
}


function propertiesLayerCreate(type, compositeMethod, visible) {
	var layer = document.createElement("div");
	layer.setAttribute('class', 'layer');
	
	var icon = document.createElement("i");
	icon.setAttribute('class', 'icon fa ' + TypesIcons[type]);
	layer.appendChild(icon);
	
	var name = document.createElement("span");
	name.innerHTML = TypesNames[type];
	layer.appendChild(name);
	
	var visibility = document.createElement("a");
	visibility.setAttribute('class', 'visibility');
	visibility.innerHTML = '<i class="fa ' + (visible?'fa-square-o':'fa-minus-square-o') + '"></i>';
	visibility.addEventListener("click", togglePaintVisibility, false);
	layer.appendChild(visibility);
	
	return layer;
}

function propertiesLineCreate(text) {
	var line = document.createElement("a");
	line.setAttribute('class', 'line');
	line.innerHTML = text;
	return line;
}

function titledLineCreate(title, text) {
	var titleLine = document.createElement("span");
	titleLine.setAttribute('class', 'line-title');
	titleLine.innerHTML = title;
	var textLine = document.createElement("span");
	textLine.innerHTML = text;
	var line = document.createElement("div");
	line.setAttribute('class', 'line');
	line.appendChild(titleLine);
	line.appendChild(textLine);
	return line;
}

function fileHeaderCreate(text) {
	var header = document.createElement("div");
	header.setAttribute('class', 'header');
	header.innerHTML = text;
	return header;
}


function clearPlaceholder() {
	var aside = document.getElementsByTagName("aside")[0];
	var placeholders = aside.getElementsByClassName("placeholder");
	for (let placeholder of placeholders) {
		placeholder.classList.add("hidden");
	}
}

function exportCanvasToTvg() {
	player.saveTvg();
}

function exportCanvasToPng() {
	player.canvas.toBlob(function(blob){
		var link = document.createElement("a");
		link.setAttribute('href', URL.createObjectURL(blob));
		link.setAttribute('download', 'canvas.png');
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}, 'image/png');
}

function mockupTabs() {
	//clear placeholders
	clearPlaceholder();
	//mockup layers tab
	var layers = document.getElementById("layers");
	layers.appendChild(layerCreate(0, Types.Scene, CompositeMethod.None));
	var block = layerBlockCreate();
	block.appendChild(layerCreate(1, Types.Shape, CompositeMethod.None));
	block.appendChild(layerCreate(1, Types.Shape, CompositeMethod.ClipPath));
	block.appendChild(layerCreate(1, Types.Scene, CompositeMethod.None));
	var block2 = layerBlockCreate();
	block2.appendChild(layerCreate(2, Types.Shape, CompositeMethod.None));
	block.appendChild(block2);
	block.appendChild(layerCreate(1, Types.Shape, CompositeMethod.AlphaMask));
	block.appendChild(layerCreate(1, Types.Picture, CompositeMethod.None));
	layers.appendChild(block);
	layers.appendChild(layerCreate(0, Types.Shape, CompositeMethod.None));
	layers.appendChild(layerCreate(0, Types.Shape, CompositeMethod.AlphaMask));
	layers.appendChild(layerCreate(0, Types.Picture, CompositeMethod.None));
	//mockup preferences 
	var properties = document.getElementById("properties");
	properties.appendChild(propertiesLayerCreate(Types.Scene, CompositeMethod.None, true));
	properties.appendChild(propertiesLineCreate("Show on layers list"));
	properties.appendChild(propertiesLineCreate("Show this paint only"));
	//mockup file
	var file = document.getElementById("file");
	file.appendChild(fileHeaderCreate("Details"));
	file.appendChild(titledLineCreate("Filename", "Canvas.svg"));
	file.appendChild(titledLineCreate("Canvas size", "512 x 512"));
	file.appendChild(fileHeaderCreate("Export"));
	var lineExportTvg = propertiesLineCreate("Export .tvg file");
	lineExportTvg.addEventListener("click", exportCanvasToTvg, false);
	file.appendChild(lineExportTvg);
	var lineExportPng = propertiesLineCreate("Export .png file");
	lineExportPng.addEventListener("click", exportCanvasToPng, false);
	file.appendChild(lineExportPng);
}
	

